const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Search Wikimedia API for image URL by spot name
async function searchWikimediaImage(spotName) {
  return new Promise((resolve) => {
    const query = encodeURIComponent(spotName);
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${query}`;

    https.get(url, {
      headers: {
        'User-Agent': 'TouristSpotApp/1.0 (educational project)',
        'Accept': 'application/json',
      },
      timeout: 10000,
    }, response => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.thumbnail && json.thumbnail.source) {
            // Get higher resolution version
            // const imgUrl = json.thumbnail.source.replace(/\/\d+px-/, '/800px-');
            const imgUrl = json.thumbnail.source
            .replace(/\/\d+px-/, '/800px-')
             .replace(/ /g, '_');
              resolve(imgUrl);
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null))
      .on('timeout', () => resolve(null));
  });
}

// Fallback images by category
const fallbackImages = {
  'Temple': 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/Golden_Temple%2C_Amritsar%2C_India_-_Aug_2019.jpg/800px-Golden_Temple%2C_Amritsar%2C_India_-_Aug_2019.jpg',
  'Nature': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Athirappilly_Waterfalls.jpg/800px-Athirappilly_Waterfalls.jpg',
  'Beach': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Calangute_beach_Goa.jpg/800px-Calangute_beach_Goa.jpg',
  'Historical': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Taj_Mahal_%28Edited%29.jpeg/800px-Taj_Mahal_%28Edited%29.jpeg',
  'Landmark': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Taj_Mahal_%28Edited%29.jpeg/800px-Taj_Mahal_%28Edited%29.jpeg',
  'General': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/Varanasi_Ghats.jpg/800px-Varanasi_Ghats.jpg',
};

// Download image from URL to local file
function downloadImage(url, filename) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 10000) {
      return resolve(filename);
    }
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filePath);
    const request = protocol.get(url, {
      headers: {
        'User-Agent': 'TouristSpotApp/1.0',
        'Accept': 'image/jpeg,image/*',
      },
      timeout: 30000,
    }, response => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        try { fs.unlinkSync(filePath); } catch(e) {}
        return downloadImage(response.headers.location, filename).then(resolve).catch(reject);
      }
      if (response.statusCode === 429) {
        file.close();
        try { fs.unlinkSync(filePath); } catch(e) {}
        return reject(new Error('HTTP 429'));
      }
      if (response.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(filePath); } catch(e) {}
        return reject(new Error(`HTTP ${response.statusCode}`));
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        const size = fs.statSync(filePath).size;
        if (size < 5000) {
          fs.unlinkSync(filePath);
          return reject(new Error('File too small'));
        }
        resolve(filename);
      });
    });
    request.on('error', err => {
      try { fs.unlinkSync(filePath); } catch(e) {}
      reject(err);
    });
    request.on('timeout', () => {
      request.destroy();
      try { fs.unlinkSync(filePath); } catch(e) {}
      reject(new Error('Timeout'));
    });
  });
}

// Main function - search Wikimedia API then download
async function downloadImageWithRetry(spotName, category, filename, retries = 2) {
  const filePath = path.join(UPLOADS_DIR, filename);

  // Already downloaded
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 10000) {
    return filename;
  }

  // Try Wikipedia API first
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`🔍 Searching Wikipedia image for: ${spotName}`);
      const imageUrl = await searchWikimediaImage(spotName);

      if (imageUrl) {
        console.log(`📥 Downloading: ${imageUrl}`);
        await downloadImage(imageUrl, filename);
        console.log(`✅ Downloaded: ${spotName}`);
        return filename;
      }
      break;
    } catch (err) {
      if (err.message.includes('429') && i < retries - 1) {
        const wait = (i + 1) * 3000;
        console.log(`⏳ Rate limited, waiting ${wait/1000}s...`);
        await sleep(wait);
      }
    }
  }

  // Try fallback category image
  try {
    const fallbackUrl = fallbackImages[category] || fallbackImages['General'];
    console.log(`⚠️ Using fallback for: ${spotName}`);
    await downloadImage(fallbackUrl, filename);
    return filename;
  } catch (e) {
    throw new Error(`All attempts failed for ${spotName}`);
  }
}

// Legacy function kept for compatibility
function getImageUrl(spotName, category) {
  return fallbackImages[category] || fallbackImages['General'];
}

// module.exports = { getImageUrl, downloadImage, downloadImageWithRetry, fallbackImages };
module.exports = { getImageUrl, downloadImage, downloadImageWithRetry, searchWikimediaImage, fallbackImages };