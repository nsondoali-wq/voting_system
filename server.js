// server.js (Full Voting System - Cleaned & Updated)
require("dotenv").config();
const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');

const app = express();
const port = 3000;

// -------------------------------
// Middleware & Static
// -------------------------------
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());


// Serve public folder (expects public/admin/admin_dashboard.html etc.)
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
    secret: 'voting_secret_key_change_this', // change in prod
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 2 * 60 * 60 * 1000 } // 2 hours
  })
);

// -------------------------------
// MySQL connection (single connection)
// -------------------------------
let db;
async function initDb() {
  try {
    db = await mysql.createConnection({
      host: 'localhost',
      user: 'voting_user',
      password: 'MySecurePassword123',
      database: 'voting_system',
      multipleStatements: false
    });
    console.log('✅ Connected to database.');
  } catch (err) {
    console.error('DB connection failed:', err);
    process.exit(1);
  }
}
initDb();

// attach db to req for convenience
app.use((req, res, next) => {
  req.db = db;
  next();
});

// -------------------------------
// Multer setup for photo uploads
// -------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // sanitize filename minimally
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '-');
    cb(null, `${Date.now()}-${safe}`);
  }
});
const upload = multer({ storage });

// -------------------------------
// Auth helpers & middlewares
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

// Utility to respond with JSON or redirect (for forms)
function respondOrRedirect(req, res, jsonPayload, redirectUrl) {
  const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');
  if (acceptsHtml && redirectUrl) {
    return res.redirect(redirectUrl);
  }
  return res.json(jsonPayload);
}

// -------------------------------
// AUTH ROUTES
// -------------------------------

// Register (creates user with a role: 'admin' or 'voter' or other)
app.post('/register', async (req, res) => {
  const { full_name, identity, password, role, campus, study_mode, gender } = req.body;
  if (!full_name || !identity || !password || !role) {
    return res.status(400).json({ success: false, message: 'Required fields: full_name, identity, password, role' });
  }
  try {
    const [existing] = await db.query('SELECT user_id FROM users WHERE identity = ?', [identity]);
    if (existing.length > 0) return res.status(400).json({ success: false, message: 'User with this identity already exists' });

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

// Login
// Accepts: { username, password, role } or simple { username, password }
// If request expects HTML and login succeeds -> redirect to appropriate page
// Else -> returns JSON { success, redirect }
app.post('/login', async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, message: 'username and password required' });

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE identity = ?', [username]);
    if (rows.length === 0) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    // If role is provided, enforce it
    if (role && user.role.toLowerCase() !== role.toLowerCase()) {
      return res.status(403).json({ success: false, message: 'Role mismatch' });
    }

    // create session
    req.session.user = {
      id: user.user_id,
      username: user.full_name,
      role: user.role.toLowerCase()
    };

    // for HTML form submit redirect, else JSON redirect to let frontend handle
    const adminUrl = '/admin/admin_dashboard.html';
    const voterUrl = '/voter_dashboard.html';

    const redirectUrl = (user.role.toLowerCase() === 'admin') ? adminUrl : voterUrl;

    return respondOrRedirect(req, res, { success: true, redirect: redirectUrl }, redirectUrl);
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    // if request is AJAX, return JSON, else redirect to login page
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      res.json({ success: true, message: 'Logged out' });
    } else {
      res.redirect('/login.html');
    }
  });
});

// Fetch current user info
app.get('/api/user', (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false, message: 'Not logged in' });
  res.json({ success: true, user: req.session.user });
});

// -------------------------------
// Public APIs (used by frontend & voters)
// -------------------------------

// API: stats for admin dashboard cards
app.get('/api/stats', async (req, res) => {
  try {
    const [[{ candidateCount }]] = await db.query('SELECT COUNT(*) AS candidateCount FROM candidates');
    const [[{ voteCount }]] = await db.query('SELECT COUNT(*) AS voteCount FROM votes');
    const [[{ activeElections }]] = await db.query('SELECT COUNT(*) AS activeElections FROM elections WHERE status="active"');
    const [[{ pendingCandidates }]] = await db.query("SELECT COUNT(*) AS pendingCandidates FROM candidates WHERE status='pending'");

    res.json({
      success: true,
      totalCandidates: candidateCount || 0,
      totalVotes: voteCount || 0,
      pendingCandidates: pendingCandidates || 0,
      activeElections: activeElections || 0
    });
  } catch (err) {
    console.error('stats error', err);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});

// API: positions (public)
app.get('/api/positions', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT position_id, position_key, description FROM positions ORDER BY position_id');
    res.json({ success: true, positions: rows });
  } catch (err) {
    console.error('positions error', err);
    res.status(500).json({ success: false, message: 'Failed to fetch positions' });
  }
});

// API: elections (public)
app.get('/api/elections', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT election_id, election_name, election_type, status FROM elections ORDER BY election_id');
    res.json({ success: true, elections: rows });
  } catch (err) {
    console.error('elections error', err);
    res.status(500).json({ success: false, message: 'Failed to fetch elections' });
  }
});

// API: candidates (public/admin - all candidates)
app.get('/api/candidates', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT c.candidate_id AS candidate_id,
             c.full_name,
             c.position_id,
             p.position_key AS position_name,
             c.election_id,
             e.election_name,
             c.party,
             c.tagline,
             c.bio,
             c.platform_points,
             c.photo,
             c.status,
             c.is_winner
      FROM candidates c
      LEFT JOIN positions p ON c.position_id = p.position_id
      LEFT JOIN elections e ON c.election_id = e.election_id
      ORDER BY c.position_id, c.full_name
    `);
    res.json({ success: true, candidates: rows });
  } catch (err) {
    console.error('candidates error', err);
    res.status(500).json({ success: false, message: 'Failed to fetch candidates' });
  }
});


// Public API: candidates grouped by position (for vote page)
app.get('/api/candidates-public', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT c.candidate_id AS id,
             c.full_name AS name,
             c.party,
             c.position_id AS position,
             p.position_key,
             c.photo,
             c.tagline,
             c.bio AS background,
             c.experience,
             c.platform_points AS platform
      FROM candidates c
      LEFT JOIN positions p ON c.position_id = p.position_id
      WHERE c.status = 'approved'
      ORDER BY c.position_id, c.full_name
    `);

    const grouped = {};
    rows.forEach(c => {
      if (!grouped[c.position]) grouped[c.position] = [];
      let platformData = [];
      if (c.platform) {
        try {
          const parsed = JSON.parse(c.platform);
          platformData = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          platformData = [c.platform];
        }
      }
      grouped[c.position].push({
        id: c.id,
        name: c.name,
        party: c.party,
        photo: c.photo,
        tagline: c.tagline,
        background: c.background,
        experience: c.experience,
        platform: platformData,
        position_key: c.position_key
      });
    });

    res.json({ success: true, data: grouped });
  } catch (err) {
    console.error('candidates-public error', err);
    res.status(500).json({ success: false, message: 'Could not load candidates' });
  }
});

// API: voter statistics (cards & dashboard)
app.get('/api/voter-stats', async (req, res) => {
  try {
    const [[{ voters }]] = await db.query("SELECT COUNT(*) AS voters FROM users WHERE role='voter'");
    const [[{ voted }]] = await db.query("SELECT COUNT(*) AS voted FROM votes");
    res.json({
      success: true,
      totalVoters: voters || 0,
      votesCast: voted || 0,
      turnoutRate: voters ? Math.round((voted / voters) * 100) + '%' : '0%',
      pendingVerification: 0
    });
  } catch (err) {
    console.error('voter-stats error', err);
    res.status(500).json({ success: false, message: 'Failed to fetch voter stats' });
  }
});

// -------------------------------
// VOTING (for voters)
// -------------------------------
app.post('/api/submit-vote', requireVoter, async (req, res) => {
  try {
    const voterId = req.session.user.id;
    const { votes } = req.body; // expect { president: id, vice_president: id, ... }

    // check existing vote for voter
    const [existing] = await db.query('SELECT * FROM votes WHERE voter_id = ?', [voterId]);
    if (existing.length > 0) return res.status(400).json({ success: false, message: 'You have already voted.' });

    const columns = [
      'president',
      'vice_president',
      'secretary',
      'treasurer',
      'pro',
      'academic',
      'welfare',
      'sports'
    ];

    const values = columns.map(col => (votes && votes[col]) ? votes[col] : null);
    const sql = `
      INSERT INTO votes (voter_id, president, vice_president, secretary, treasurer, pro, academic, welfare, sports)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await db.query(sql, [voterId, ...values]);
    res.json({ success: true, message: 'Your vote has been recorded successfully.' });
  } catch (err) {
    console.error('submit-vote error', err);
    res.status(500).json({ success: false, message: 'Failed to record your vote.' });
  }
});

// -------------------------------
// ADMIN ROUTES (protected)
// -------------------------------

// Admin: list positions
app.get('/admin/positions', requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT position_id, position_key, description FROM positions ORDER BY position_id');
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('admin/positions error', err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// Admin: list elections
app.get('/admin/elections', requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT election_id, election_name, election_type, status FROM elections ORDER BY election_id');
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('admin/elections error', err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// Admin: list all candidates (including pending)
app.get('/admin/candidates', requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT c.*, p.position_key AS position_name, e.election_name
      FROM candidates c
      LEFT JOIN positions p ON c.position_id = p.position_id
      LEFT JOIN elections e ON c.election_id = e.election_id
      ORDER BY c.position_id, c.full_name
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('admin/candidates error', err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// Admin: add candidate (multipart/form-data expected)
app.post('/admin/candidates', requireAdmin, upload.single('photo'), async (req, res) => {
  try {
    const {
      full_name, email, phone, student_id, position_id,
      election_id, party, tagline, bio, platform_points
    } = req.body;

    if (!full_name || !position_id || !election_id || !party) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const photo = req.file ? `/uploads/${req.file.filename}` : '/uploads/default.jpg';

    const [result] = await db.query(
      `INSERT INTO candidates
      (full_name, email, phone, student_id, position_id, election_id, party, status, tagline, bio, platform_points, photo)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      [full_name, email || null, phone || null, student_id || null, position_id, election_id, party, tagline || null, bio || null, platform_points || null, photo]
    );

    res.json({ success: true, message: 'Candidate added', candidate_id: result.insertId });
  } catch (err) {
    console.error('admin add candidate error', err);
    res.status(500).json({ success: false, message: 'Failed to save candidate' });
  }
});

// Admin: confirm winner (body: { candidate_id, position_id })
app.post('/admin/confirm-winner', requireAdmin, async (req, res) => {
  const { candidate_id, position_id } = req.body;
  if (!candidate_id || !position_id) return res.status(400).json({ success: false, message: 'candidate_id and position_id required' });
  try {
    await db.query('UPDATE candidates SET is_winner = 0 WHERE position_id = ?', [position_id]);
    await db.query('UPDATE candidates SET is_winner = 1 WHERE candidate_id = ?', [candidate_id]);
    res.json({ success: true, message: 'Winner confirmed' });
  } catch (err) {
    console.error('confirm-winner error', err);
    res.status(500).json({ success: false, message: 'Failed to confirm winner' });
  }
});

// Admin: results (aggregated)
app.get('/admin/results', requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        c.candidate_id,
        c.full_name,
        c.party,
        c.photo,
        p.position_key AS position,
        e.election_name,
        IFNULL(SUM(
          CASE c.position_id
            WHEN 1 THEN (v.president = c.candidate_id)
            WHEN 2 THEN (v.vice_president = c.candidate_id)
            WHEN 3 THEN (v.secretary = c.candidate_id)
            WHEN 4 THEN (v.treasurer = c.candidate_id)
            WHEN 5 THEN (v.pro = c.candidate_id)
            WHEN 6 THEN (v.academic = c.candidate_id)
            WHEN 7 THEN (v.welfare = c.candidate_id)
            WHEN 8 THEN (v.sports = c.candidate_id)
            ELSE 0
          END
        ), 0) AS votes,
        CASE WHEN c.is_winner = 1 THEN 'Yes' ELSE 'No' END AS winner
      FROM candidates c
      LEFT JOIN positions p ON c.position_id = p.position_id
      LEFT JOIN elections e ON c.election_id = e.election_id
      LEFT JOIN votes v ON 1=1
      GROUP BY c.candidate_id
      ORDER BY p.position_id, votes DESC;
    `);

    res.json({ success: true, results: rows });

  } catch (err) {
    console.error('admin/results error', err);
    res.status(500).json({ success: false, message: 'Failed to fetch results' });
  }
});



// Admin: list winners
app.get('/admin/winners', requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT c.candidate_id, c.full_name, c.party, c.photo, p.position_key, e.election_name
      FROM candidates c
      LEFT JOIN positions p ON c.position_id = p.position_id
      LEFT JOIN elections e ON c.election_id = e.election_id
      WHERE c.is_winner = 1
      ORDER BY p.position_key
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('admin winners error', err);
    res.status(500).json({ success: false, message: 'Error loading winners' });
  }
});

// -------------------------------
// Live results (public)
app.get('/api/live-results', async (req, res) => {
  try {
    // get candidates for mapping
    const [candidates] = await db.query('SELECT candidate_id, full_name, position_id FROM candidates');
    const candidateMap = {}; // id -> name
    candidates.forEach(c => { candidateMap[c.candidate_id] = c.full_name; });

    const [votes] = await db.query('SELECT president, vice_president, secretary, treasurer, pro, academic, welfare, sports FROM votes');

    const counts = {};
    votes.forEach(vote => {
      for (const [position, candId] of Object.entries(vote)) {
        if (!candId) continue;
        counts[position] = counts[position] || {};
        counts[position][candId] = (counts[position][candId] || 0) + 1;
      }
    });

    // map IDs to names
    const named = {};
    for (const [pos, obj] of Object.entries(counts)) {
      named[pos] = {};
      for (const [id, c] of Object.entries(obj)) {
        named[pos][candidateMap[id] || id] = c;
      }
    }

    res.json({ success: true, data: named });
  } catch (err) {
    console.error('live-results error', err);
    res.status(500).json({ success: false, message: 'Failed to load live results' });
  }
});


// Admin: update candidate status
app.patch('/admin/candidate-status', requireAdmin, async (req, res) => {
  try {
    const { candidate_id, status } = req.body;
    const validStatuses = ['pending', 'approved', 'rejected'];

    if (!candidate_id || !status) {
      return res.status(400).json({ success: false, message: 'candidate_id and status required' });
    }
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const candidate_id_num = parseInt(candidate_id);
    if (isNaN(candidate_id_num)) return res.status(400).json({ success: false, message: 'Invalid candidate_id' });

    const [result] = await db.query('UPDATE candidates SET status = ? WHERE candidate_id = ?', [status, candidate_id_num]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Candidate not found' });

    res.json({ success: true, message: `Candidate status updated to "${status}"` });
  } catch (err) {
    console.error('update candidate status error', err);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
});



// Get all results
app.get('/api/results', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM candidates'); // or proper results query
    res.json({ results: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch results' });
  }
});

// -------------------------------
// Password Reset Endpoints
// -------------------------------
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Configure Gmail transporter using your account and App Password
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'nsondoali@gmail.com',         // your Gmail address
    pass: 'hpraubtayyblazop'             // your Gmail App Password (16 chars, no spaces)
  }
});

// POST /forgot-password
app.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

  try {
    const [users] = await db.query('SELECT user_id, full_name FROM users WHERE identity = ?', [email]);
    if (users.length === 0) return res.status(404).json({ success: false, message: 'No account found with that email' });

    const user = users[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = Date.now() + 3600 * 1000; // 1 hour expiry

    // Save token in db
    await db.query('UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE user_id = ?', [token, expiry, user.user_id]);

    const resetUrl = `http://localhost:${port}/reset-password.html?token=${token}`;

    // Send email
    await transporter.sendMail({
      from: '"Voting System" <nsondoali@gmail.com>',
      to: email,
      subject: 'Voting System - Password Reset',
      html: `<p>Hello ${user.full_name},</p>
             <p>You requested a password reset. Click the link below to reset your password:</p>
             <p><a href="${resetUrl}">${resetUrl}</a></p>
             <p>This link will expire in 1 hour.</p>`
    });

    res.json({ success: true, message: 'Reset link sent to your email' });
  } catch (err) {
    console.error('forgot-password error', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /reset-password
app.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ success: false, message: 'Token and new password are required' });

  try {
    const [users] = await db.query(
      'SELECT user_id, reset_token_expiry FROM users WHERE reset_token = ?',
      [token]
    );

    if (users.length === 0) return res.status(400).json({ success: false, message: 'Invalid or expired token' });

    const user = users[0];
    if (Date.now() > user.reset_token_expiry) {
      return res.status(400).json({ success: false, message: 'Token has expired' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await db.query(
      'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE user_id = ?',
      [hashed, user.user_id]
    );

    res.json({ success: true, message: 'Password has been reset successfully' });
  } catch (err) {
    console.error('reset-password error', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});





// -------------------------------
// Fallback 404 (last)
app.use((req, res) => {
  // if client expects HTML, serve a simple page or redirect to root
  if (req.headers.accept && req.headers.accept.includes('text/html')) {
    return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'), err => {
      // if no custom 404 page, fallback to JSON
      if (err) return res.status(404).json({ success: false, message: 'Page not found.' });
    });
  }
  res.status(404).json({ success: false, message: 'Page not found.' });
});

// -------------------------------
// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
  // helpful quick-note: admin dashboard (local file installed in your repo)
  // If you need to test with the uploaded file in the environment, your local path was:
  // /mnt/data/admin_dashboard.html
});
