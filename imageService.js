const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRemoteUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function getSpotImageFilename(spotId) {
  return `spot_img_${spotId}.jpg`;
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

const placeholderTheme = {
  Temple: { start: '#d97706', end: '#f59e0b', icon: 'Temple' },
  Nature: { start: '#166534', end: '#22c55e', icon: 'Nature' },
  Beach: { start: '#0369a1', end: '#38bdf8', icon: 'Beach' },
  Historical: { start: '#7c2d12', end: '#f97316', icon: 'Historic' },
  Landmark: { start: '#7f1d1d', end: '#ef4444', icon: 'Landmark' },
  General: { start: '#312e81', end: '#8b5cf6', icon: 'Travel' },
};

function escapeSvgText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function createPlaceholderImage(spot, filename) {
  const filePath = path.join(UPLOADS_DIR, filename);
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 10000) {
    return filename;
  }

  const theme = placeholderTheme[spot.category] || placeholderTheme.General;
  const title = escapeSvgText(spot.name);
  const subtitle = escapeSvgText(spot.city ? `${spot.city}, ${spot.country || ''}` : spot.category || 'Tourist spot');
  const badge = escapeSvgText(theme.icon);
  const svg = `
    <svg width="1200" height="900" viewBox="0 0 1200 900" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${theme.start}"/>
          <stop offset="100%" stop-color="${theme.end}"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="900" fill="url(#bg)"/>
      <circle cx="980" cy="160" r="180" fill="rgba(255,255,255,0.10)"/>
      <circle cx="170" cy="760" r="220" fill="rgba(0,0,0,0.10)"/>
      <rect x="72" y="620" width="220" height="56" rx="28" fill="rgba(15,23,42,0.28)"/>
      <text x="182" y="657" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="#ffffff">${badge}</text>
      <text x="72" y="754" font-family="Arial, sans-serif" font-size="74" font-weight="800" fill="#ffffff">${title}</text>
      <text x="72" y="812" font-family="Arial, sans-serif" font-size="34" font-weight="500" fill="rgba(255,255,255,0.88)">${subtitle}</text>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .jpeg({ quality: 92, progressive: true })
    .toFile(filePath);

  return filename;
}

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
        const redirectUrl = new URL(response.headers.location, url).toString();
        return downloadImage(redirectUrl, filename).then(resolve).catch(reject);
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
      const contentType = String(response.headers['content-type'] || '').toLowerCase();
      if (!contentType.startsWith('image/')) {
        file.close();
        try { fs.unlinkSync(filePath); } catch(e) {}
        response.resume();
        return reject(new Error(`Invalid content-type: ${contentType || 'unknown'}`));
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

async function ensureLocalSpotImage(spot) {
  if (!spot?.id || !spot?.name) {
    throw new Error('Spot id and name are required');
  }

  const filename = getSpotImageFilename(spot.id);
  try {
    await downloadImageWithRetry(spot.name, spot.category, filename);
    return filename;
  } catch (error) {
    const remoteImageUrl = await searchWikimediaImage(spot.name);
    if (remoteImageUrl) {
      return remoteImageUrl;
    }

    if (fallbackImages[spot.category]) {
      return fallbackImages[spot.category];
    }

    await createPlaceholderImage(spot, filename);
    return filename;
  }
}

// Legacy function kept for compatibility
function getImageUrl(spotName, category) {
  return fallbackImages[category] || fallbackImages['General'];
}

// module.exports = { getImageUrl, downloadImage, downloadImageWithRetry, fallbackImages };
module.exports = {
  getImageUrl,
  downloadImage,
  downloadImageWithRetry,
  searchWikimediaImage,
  fallbackImages,
  isRemoteUrl,
  getSpotImageFilename,
  ensureLocalSpotImage,
  createPlaceholderImage,
};
