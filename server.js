require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
const port = process.env.PORT || 3000;

// -------------------------------
// Middleware & Static
// -------------------------------
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, 'public')));

// Ensure uploads dir exists
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));

// -------------------------------
// Session setup
// -------------------------------
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change_this_secret_in_prod',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 2 * 60 * 60 * 1000 } // 2 hours
  })
);

// -------------------------------
// MySQL connection (production-ready with env variables)
// -------------------------------
let db;
async function initDb() {
  try {
    db = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT || 3306,
      multipleStatements: false
    });
    console.log('✅ Connected to MySQL database.');
  } catch (err) {
    console.error('DB connection failed:', err);
    process.exit(1); // exit process if DB fails
  }
}
initDb();

// attach db to req for convenience
app.use((req, res, next) => {
  req.db = db;
  next();
});

// -------------------------------
// Multer setup for uploads
// -------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '-');
    cb(null, `${Date.now()}-${safe}`);
  }
});
const upload = multer({ storage });

// -------------------------------
// Auth middlewares
// -------------------------------
const requireAuth = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
  next();
};
const requireAdmin = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};
const requireVoter = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'voter') {
    return res.status(403).json({ success: false, message: 'Voter access required' });
  }
  next();
};

// -------------------------------
// Utility for JSON or HTML responses
// -------------------------------
function respondOrRedirect(req, res, jsonPayload, redirectUrl) {
  const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');
  if (acceptsHtml && redirectUrl) return res.redirect(redirectUrl);
  return res.json(jsonPayload);
}

// -------------------------------
// AUTH ROUTES
// -------------------------------
app.post('/register', async (req, res) => {
  const { full_name, identity, password, role, campus, study_mode, gender } = req.body;
  if (!full_name || !identity || !password || !role) {
    return res.status(400).json({ success: false, message: 'Required fields missing' });
  }
  try {
    const [existing] = await db.query('SELECT user_id FROM users WHERE identity = ?', [identity]);
    if (existing.length > 0) return res.status(400).json({ success: false, message: 'User already exists' });

    const hashed = await bcrypt.hash(password, 10);
    await db.query(
      `INSERT INTO users (full_name, identity, password, role, campus, study_mode, gender)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [full_name, identity, hashed, role, campus || null, study_mode || null, gender || null]
    );
    res.status(201).json({ success: true, message: 'Registration successful' });
  } catch (err) {
    console.error('register error', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/login', async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, message: 'username and password required' });

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE identity = ?', [username]);
    if (rows.length === 0) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    if (role && user.role.toLowerCase() !== role.toLowerCase()) {
      return res.status(403).json({ success: false, message: 'Role mismatch' });
    }

    req.session.user = {
      id: user.user_id,
      username: user.full_name,
      role: user.role.toLowerCase()
    };

    const redirectUrl = (user.role.toLowerCase() === 'admin')
      ? '/admin/admin_dashboard.html'
      : '/voter_dashboard.html';

    return respondOrRedirect(req, res, { success: true, redirect: redirectUrl }, redirectUrl);
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      res.json({ success: true, message: 'Logged out' });
    } else {
      res.redirect('/login.html');
    }
  });
});

// -------------------------------
// Sample Public API Route
// -------------------------------
app.get('/api/positions', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT position_id, position_key, description FROM positions ORDER BY position_id');
    res.json({ success: true, positions: rows });
  } catch (err) {
    console.error('positions error', err);
    res.status(500).json({ success: false, message: 'Failed to fetch positions' });
  }
});

// -------------------------------
// Fallback 404
// -------------------------------
app.use((req, res) => {
  if (req.headers.accept && req.headers.accept.includes('text/html')) {
    return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'), err => {
      if (err) return res.status(404).json({ success: false, message: 'Page not found.' });
    });
  }
  res.status(404).json({ success: false, message: 'Page not found.' });
});

// -------------------------------
// Start server
// -------------------------------
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
