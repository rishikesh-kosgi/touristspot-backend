const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'tourist_app.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeDatabase() {
  // db.exec(`
  //   CREATE TABLE IF NOT EXISTS users (
  //     id TEXT PRIMARY KEY,
  //     phone TEXT UNIQUE NOT NULL,
  //     name TEXT,
  //     is_admin INTEGER DEFAULT 0,
  //     otp TEXT,
  //     otp_expires INTEGER,
  //     created_at INTEGER DEFAULT (strftime('%s', 'now'))
  //   );

  //   CREATE TABLE IF NOT EXISTS spots (
  //     id TEXT PRIMARY KEY,
  //     name TEXT NOT NULL,
  //     description TEXT,
  //     category TEXT DEFAULT 'General',
  //     city TEXT,
  //     country TEXT,
  //     latitude REAL NOT NULL,
  //     longitude REAL NOT NULL,
  //     address TEXT,
  //     is_remote INTEGER DEFAULT 0,
  //     remote_votes INTEGER DEFAULT 0,
  //     created_at INTEGER DEFAULT (strftime('%s', 'now'))
  //   );

  //   CREATE TABLE IF NOT EXISTS remote_votes (
  //     id TEXT PRIMARY KEY,
  //     spot_id TEXT NOT NULL,
  //     user_id TEXT NOT NULL,
  //     UNIQUE(spot_id, user_id),
  //     FOREIGN KEY (spot_id) REFERENCES spots(id) ON DELETE CASCADE,
  //     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  //   );

  //   CREATE TABLE IF NOT EXISTS photos (
  //     id TEXT PRIMARY KEY,
  //     spot_id TEXT NOT NULL,
  //     user_id TEXT NOT NULL,
  //     filename TEXT NOT NULL,
  //     status TEXT DEFAULT 'pending',
  //     flag_count INTEGER DEFAULT 0,
  //     user_latitude REAL,
  //     user_longitude REAL,
  //     distance_metres REAL,
  //     uploaded_at INTEGER DEFAULT (strftime('%s', 'now')),
  //     FOREIGN KEY (spot_id) REFERENCES spots(id) ON DELETE CASCADE,
  //     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  //   );

  //   CREATE TABLE IF NOT EXISTS photo_flags (
  //     id TEXT PRIMARY KEY,
  //     photo_id TEXT NOT NULL,
  //     user_id TEXT NOT NULL,
  //     reason TEXT NOT NULL,
  //     created_at INTEGER DEFAULT (strftime('%s', 'now')),
  //     UNIQUE(photo_id, user_id),
  //     FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE,
  //     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  //   );

  //   CREATE TABLE IF NOT EXISTS favorites (
  //     id TEXT PRIMARY KEY,
  //     user_id TEXT NOT NULL,
  //     spot_id TEXT NOT NULL,
  //     created_at INTEGER DEFAULT (strftime('%s', 'now')),
  //     UNIQUE(user_id, spot_id),
  //     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  //     FOREIGN KEY (spot_id) REFERENCES spots(id) ON DELETE CASCADE
  //   );

  //   CREATE INDEX IF NOT EXISTS idx_photos_spot_id ON photos(spot_id);
  //   CREATE INDEX IF NOT EXISTS idx_photos_user_id ON photos(user_id);
  //   CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
  //   CREATE INDEX IF NOT EXISTS idx_spots_category ON spots(category);
  // `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT UNIQUE NOT NULL,
      name TEXT,
      is_admin INTEGER DEFAULT 0,
      points INTEGER DEFAULT 0,
      otp TEXT,
      otp_expires INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS spots (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'General',
      city TEXT,
      country TEXT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      address TEXT,
      is_remote INTEGER DEFAULT 0,
      remote_votes INTEGER DEFAULT 0,
      status TEXT DEFAULT 'approved',
      submitted_by TEXT,
      approval_votes INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS spot_approval_votes (
      id TEXT PRIMARY KEY,
      spot_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      UNIQUE(spot_id, user_id),
      FOREIGN KEY (spot_id) REFERENCES spots(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS remote_votes (
      id TEXT PRIMARY KEY,
      spot_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      UNIQUE(spot_id, user_id),
      FOREIGN KEY (spot_id) REFERENCES spots(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS spot_views (
      id TEXT PRIMARY KEY,
      spot_id TEXT NOT NULL,
      user_id TEXT,
      viewed_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (spot_id) REFERENCES spots(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      spot_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      flag_count INTEGER DEFAULT 0,
      user_latitude REAL,
      user_longitude REAL,
      distance_metres REAL,
      uploaded_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (spot_id) REFERENCES spots(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS photo_flags (
      id TEXT PRIMARY KEY,
      photo_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(photo_id, user_id),
      FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS favorites (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      spot_id TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(user_id, spot_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (spot_id) REFERENCES spots(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_photos_spot_id ON photos(spot_id);
    CREATE INDEX IF NOT EXISTS idx_photos_user_id ON photos(user_id);
    CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
    CREATE INDEX IF NOT EXISTS idx_spots_category ON spots(category);
    CREATE INDEX IF NOT EXISTS idx_spot_views_spot_id ON spot_views(spot_id);
    CREATE INDEX IF NOT EXISTS idx_spot_views_viewed_at ON spot_views(viewed_at);
  `);

  seedSpots();
  console.log('✅ Database initialized');
}

function seedSpots() {
  const count = db.prepare('SELECT COUNT(*) as c FROM spots').get();
  if (count.c > 0) return;

  const insert = db.prepare(`
    INSERT INTO spots (id, name, description, category, city, country, latitude, longitude, address, is_remote)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // const spots = [
  //   ['spot_1', 'Eiffel Tower', 'Iconic iron lattice tower in Paris.', 'Landmark', 'Paris', 'France', 48.8584, 2.2945, 'Champ de Mars, Paris', 0],
  //   ['spot_2', 'Colosseum', 'Ancient amphitheater in Rome.', 'Historical', 'Rome', 'Italy', 41.8902, 12.4922, 'Piazza del Colosseo, Rome', 0],
  //   ['spot_3', 'Rohtang Pass', 'High mountain pass near Manali with heavy snowfall.', 'Nature', 'Manali', 'India', 32.3726, 77.2375, 'Rohtang Pass, Himachal Pradesh', 1],
  //   ['spot_4', 'Solang Valley', 'Snow valley near Manali known for skiing.', 'Nature', 'Manali', 'India', 32.3195, 77.1518, 'Solang Valley, Himachal Pradesh', 1],
  //   ['spot_5', 'Athirappilly Falls', 'Largest waterfall in Kerala, India.', 'Nature', 'Thrissur', 'India', 10.2867, 76.5694, 'Athirappilly, Kerala', 0],
  //   ['spot_6', 'Dudhsagar Falls', 'Four-tiered waterfall on Goa-Karnataka border.', 'Nature', 'Goa', 'India', 15.3147, 74.3144, 'Dudhsagar, Goa', 1],
  //   ['spot_7', 'Taj Mahal', 'Ivory-white marble mausoleum in Agra.', 'Landmark', 'Agra', 'India', 27.1751, 78.0421, 'Dharmapuri, Agra', 0],
  //   ['spot_8', 'Spiti Valley', 'Cold desert mountain valley in Himachal Pradesh.', 'Nature', 'Spiti', 'India', 32.2432, 78.0358, 'Spiti Valley, Himachal Pradesh', 1],
  //   ['spot_9', 'Pangong Lake', 'High altitude lake in Ladakh.', 'Nature', 'Ladakh', 'India', 33.7640, 78.6796, 'Pangong Tso, Ladakh', 1],
  //   ['spot_10', 'Niagara Falls', 'Large waterfalls on Canada-USA border.', 'Nature', 'Niagara Falls', 'Canada', 43.0962, -79.0377, 'Niagara Falls, Ontario', 0],
  // ];

  const spots = [
    // Existing spots
    ['spot_1', 'Eiffel Tower', 'Iconic iron lattice tower in Paris.', 'Landmark', 'Paris', 'France', 48.8584, 2.2945, 'Champ de Mars, Paris', 0],
    ['spot_2', 'Colosseum', 'Ancient amphitheater in Rome.', 'Historical', 'Rome', 'Italy', 41.8902, 12.4922, 'Piazza del Colosseo, Rome', 0],
    ['spot_3', 'Rohtang Pass', 'High mountain pass near Manali with heavy snowfall.', 'Nature', 'Manali', 'India', 32.3726, 77.2375, 'Rohtang Pass, Himachal Pradesh', 1],
    ['spot_4', 'Solang Valley', 'Snow valley near Manali known for skiing.', 'Nature', 'Manali', 'India', 32.3195, 77.1518, 'Solang Valley, Himachal Pradesh', 1],
    ['spot_5', 'Athirappilly Falls', 'Largest waterfall in Kerala, India.', 'Nature', 'Thrissur', 'India', 10.2867, 76.5694, 'Athirappilly, Kerala', 0],
    ['spot_6', 'Dudhsagar Falls', 'Four-tiered waterfall on Goa-Karnataka border.', 'Nature', 'Goa', 'India', 15.3147, 74.3144, 'Dudhsagar, Goa', 1],
    ['spot_7', 'Taj Mahal', 'Ivory-white marble mausoleum in Agra.', 'Landmark', 'Agra', 'India', 27.1751, 78.0421, 'Dharmapuri, Agra', 0],
    ['spot_8', 'Spiti Valley', 'Cold desert mountain valley in Himachal Pradesh.', 'Nature', 'Spiti', 'India', 32.2432, 78.0358, 'Spiti Valley, Himachal Pradesh', 1],
    ['spot_9', 'Pangong Lake', 'High altitude lake in Ladakh.', 'Nature', 'Ladakh', 'India', 33.7640, 78.6796, 'Pangong Tso, Ladakh', 1],
    ['spot_10', 'Niagara Falls', 'Large waterfalls on Canada-USA border.', 'Nature', 'Niagara Falls', 'Canada', 43.0962, -79.0377, 'Niagara Falls, Ontario', 0],

    // Karnataka
    ['spot_11', 'Mysore Palace', 'Magnificent royal palace and major tourist attraction in Mysore.', 'Landmark', 'Mysuru', 'India', 12.3052, 76.6552, 'Sayyaji Rao Rd, Mysuru, Karnataka', 0],
    ['spot_12', 'Coorg Coffee Estates', 'Lush green coffee plantations in the hills of Coorg.', 'Nature', 'Coorg', 'India', 12.3375, 75.8069, 'Madikeri, Coorg, Karnataka', 0],
    ['spot_13', 'Jog Falls', 'Second highest plunge waterfall in India.', 'Nature', 'Shimoga', 'India', 14.2269, 74.7921, 'Jog Falls, Shimoga, Karnataka', 0],
    ['spot_14', 'Netravati Peak', 'Stunning trekking peak in the Western Ghats of Karnataka.', 'Nature', 'Mangalore', 'India', 12.9762, 75.3998, 'Netravati Peak, Karnataka', 1],
    ['spot_15', 'Hampi', 'UNESCO World Heritage Site with ancient Vijayanagara ruins.', 'Historical', 'Hampi', 'India', 15.3350, 76.4600, 'Hampi, Ballari District, Karnataka', 0],
    ['spot_16', 'Badami Caves', 'Ancient rock-cut cave temples carved in 6th century.', 'Historical', 'Badami', 'India', 15.9149, 75.6760, 'Badami, Bagalkot, Karnataka', 0],
    ['spot_17', 'Shivanasamudra Falls', 'Twin waterfalls on the Kaveri river in Karnataka.', 'Nature', 'Mandya', 'India', 12.2700, 77.1600, 'Shivanasamudra, Mandya, Karnataka', 0],

    // Kerala
    ['spot_18', 'Varkala Beach', 'Stunning cliffside beach with mineral springs in Kerala.', 'Beach', 'Varkala', 'India', 8.7379, 76.7163, 'Varkala, Thiruvananthapuram, Kerala', 0],
    ['spot_19', 'Kovalam Beach', 'Famous crescent shaped beach near Thiruvananthapuram.', 'Beach', 'Kovalam', 'India', 8.4004, 76.9787, 'Kovalam, Thiruvananthapuram, Kerala', 0],
    ['spot_20', 'Munnar Tea Gardens', 'Rolling hills covered with lush green tea plantations.', 'Nature', 'Munnar', 'India', 10.0889, 77.0595, 'Munnar, Idukki, Kerala', 0],
    ['spot_21', 'Alleppey Backwaters', 'Venice of the East - famous houseboat rides through backwaters.', 'Nature', 'Alappuzha', 'India', 9.4981, 76.3388, 'Alappuzha, Kerala', 0],
    ['spot_22', 'Wayanad Wildlife Sanctuary', 'Dense forest sanctuary home to elephants and tigers.', 'Nature', 'Wayanad', 'India', 11.6854, 76.1320, 'Wayanad, Kerala', 1],

    // Goa
    ['spot_23', 'Calangute Beach', 'Queen of beaches in North Goa, popular tourist destination.', 'Beach', 'Goa', 'India', 15.5440, 73.7528, 'Calangute, North Goa', 0],
    ['spot_24', 'Palolem Beach', 'Crescent shaped peaceful beach in South Goa.', 'Beach', 'Goa', 'India', 15.0100, 74.0232, 'Palolem, South Goa', 0],
    ['spot_25', 'Baga Beach', 'Famous beach known for nightlife and water sports.', 'Beach', 'Goa', 'India', 15.5569, 73.7520, 'Baga, North Goa', 0],
    ['spot_26', 'Dudhsagar Beach', 'Remote beach accessible only by boat in South Goa.', 'Beach', 'Goa', 'India', 15.3147, 74.0134, 'Canacona, South Goa', 1],

    // Telangana / Andhra Pradesh
    ['spot_27', 'Charminar', 'Iconic 16th century mosque and monument in Hyderabad.', 'Historical', 'Hyderabad', 'India', 17.3616, 78.4747, 'Charminar, Hyderabad, Telangana', 0],
    ['spot_28', 'Golconda Fort', 'Magnificent medieval fort and former diamond trading centre.', 'Historical', 'Hyderabad', 'India', 17.3833, 78.4011, 'Golconda, Hyderabad, Telangana', 0],
    ['spot_29', 'Araku Valley', 'Scenic valley with coffee plantations and tribal culture.', 'Nature', 'Visakhapatnam', 'India', 18.3273, 82.8757, 'Araku Valley, Andhra Pradesh', 1],

    // Rajasthan
    ['spot_30', 'Hawa Mahal', 'Palace of Winds - iconic pink sandstone palace in Jaipur.', 'Landmark', 'Jaipur', 'India', 26.9239, 75.8267, 'Hawa Mahal Rd, Jaipur, Rajasthan', 0],
    ['spot_31', 'Jaisalmer Fort', 'Living fort rising from the Thar Desert in golden sandstone.', 'Historical', 'Jaisalmer', 'India', 26.9157, 70.9083, 'Jaisalmer, Rajasthan', 0],
    ['spot_32', 'Pushkar Lake', 'Sacred lake surrounded by 52 ghats and Hindu temples.', 'Historical', 'Pushkar', 'India', 26.4897, 74.5511, 'Pushkar, Ajmer, Rajasthan', 0],

    // Himalayas
    ['spot_33', 'Kedarnath Temple', 'Ancient Hindu temple in the Himalayas at 3583m altitude.', 'Historical', 'Rudraprayag', 'India', 30.7346, 79.0669, 'Kedarnath, Uttarakhand', 1],
    ['spot_34', 'Valley of Flowers', 'UNESCO World Heritage alpine valley with stunning wildflowers.', 'Nature', 'Chamoli', 'India', 30.7283, 79.6050, 'Valley of Flowers, Uttarakhand', 1],
    ['spot_35', 'Nainital Lake', 'Beautiful pear shaped lake surrounded by hills in Uttarakhand.', 'Nature', 'Nainital', 'India', 29.3919, 79.4542, 'Nainital, Uttarakhand', 0],
    ['spot_36', 'Sanjeevini Circle Test Spot', 'Test location for photo validation - Lokanayakanagar, Mysore.', 'General', 'Mysuru', 'India', 12.350731, 76.627249, '9th Cross, Lokanayakanagar, Sanjeevini Circle, Mysuru 570016', 0],
  ];

  const insertAll = db.transaction(() => {
    for (const spot of spots) insert.run(...spot);
  });
  insertAll();
  console.log('✅ Sample spots seeded');
}

// Haversine formula - calculates distance between two GPS points in metres
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in metres
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = { db, initializeDatabase, calculateDistance };