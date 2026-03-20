require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./database');

const app = express();
const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';

function parseAllowedOrigins() {
  const configured = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  if (configured.length > 0) {
    return configured;
  }

  if (!isProduction) {
    return [
      'http://localhost:3000',
      'http://localhost:8081',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:8081',
    ];
  }

  return [];
}

function corsOriginValidator(origin, callback) {
  if (!origin) {
    callback(null, true);
    return;
  }

  const allowedOrigins = parseAllowedOrigins();
  if (allowedOrigins.includes(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error('CORS origin denied'));
}

function setSecurityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  next();
}

function validateSecurityConfig() {
  const jwtSecret = String(process.env.JWT_SECRET || '');
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required');
  }

  if (isProduction && jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }
}

app.disable('x-powered-by');
validateSecurityConfig();
app.use(setSecurityHeaders);
app.use(cors({
  origin: corsOriginValidator,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '30d',
  immutable: true,
  index: false,
  fallthrough: false,
}));

initializeDatabase();

app.use('/api/auth', require('./routes/auth'));
app.use('/api/spots', require('./routes/spots'));
app.use('/api/photos', require('./routes/photos'));
app.use('/api/favorites', require('./routes/favorites'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/groups', require('./routes/groups'));

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'TouristSpot API running 🌍' });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  if (err.message === 'CORS origin denied') {
    return res.status(403).json({ success: false, message: 'Request origin is not allowed' });
  }

  const message = isProduction ? 'Internal server error' : (err.message || 'Internal server error');
  res.status(500).json({ success: false, message });
});

app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
  console.log(`📱 OTP Mode: ${process.env.MOCK_OTP === 'true' ? 'MOCK' : 'Twilio'}`);
});

module.exports = app;
