const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendOTP(phone, otp) {
  if (process.env.MOCK_OTP === 'true') {
    console.log(`📱 [MOCK OTP] Phone: ${phone} | OTP: ${otp}`);
    return true;
  }
  const twilio = require('twilio')(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
  await twilio.messages.create({
    body: `Your TouristSpot code is: ${otp}. Valid for 10 minutes.`,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: phone,
  });
  return true;
}

// POST /api/auth/send-otp
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone number required' });

    const phoneRegex = /^\+[1-9]\d{6,14}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ success: false, message: 'Invalid phone format. Use +CountryCodeNumber' });
    }

    const otp = process.env.MOCK_OTP === 'true' ? process.env.MOCK_OTP_CODE : generateOTP();
    const otpExpires = Date.now() + 10 * 60 * 1000;

    const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
    if (existing) {
      db.prepare('UPDATE users SET otp = ?, otp_expires = ? WHERE phone = ?')
        .run(otp, otpExpires, phone);
    } else {
      db.prepare('INSERT INTO users (id, phone, otp, otp_expires) VALUES (?, ?, ?, ?)')
        .run(uuidv4(), phone, otp, otpExpires);
    }

    await sendOTP(phone, otp);
    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: 'Phone and OTP required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.otp !== otp) return res.status(400).json({ success: false, message: 'Invalid OTP' });
    if (Date.now() > user.otp_expires) {
      return res.status(400).json({ success: false, message: 'OTP expired. Request a new one.' });
    }

    db.prepare('UPDATE users SET otp = NULL, otp_expires = NULL WHERE id = ?').run(user.id);

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: { id: user.id, phone: user.phone, name: user.name, is_admin: user.is_admin, points: user.points || 0 },
      isNewUser: !user.name,
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ success: false, message: 'Verification failed' });
  }
});

// PUT /api/auth/profile
router.put('/profile', authMiddleware, (req, res) => {
  const { name } = req.body;
  if (!name || name.trim().length < 2) {
    return res.status(400).json({ success: false, message: 'Name must be at least 2 characters' });
  }
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name.trim(), req.user.id);
  res.json({ success: true, message: 'Profile updated' });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  res.json({ success: true, user: req.user });
});

module.exports = router;
