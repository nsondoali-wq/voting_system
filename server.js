require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const bodyParser = require("body-parser");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const app = express();
const port = process.env.PORT || 3000;

// -------------------- Middleware --------------------
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, "public")));

// Ensure uploads folder exists
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use("/uploads", express.static(UPLOAD_DIR));

// -------------------- Session --------------------
app.use(
  session({
    secret: process.env.SESSION_SECRET || "voting_secret_key_change_this",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 2 * 60 * 60 * 1000 },
  })
);

// -------------------- PostgreSQL Pool --------------------
const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
});

// Test connection
pool.connect()
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch((err) => {
    console.error("❌ DB connection failed:", err);
    process.exit(1);
  });

// Attach pool to req
app.use((req, res, next) => {
  req.db = pool;
  next();
});

// -------------------- Multer for uploads --------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "-");
    cb(null, `${Date.now()}-${safe}`);
  },
});
const upload = multer({ storage });

// -------------------- Auth Middlewares --------------------
const requireAuth = (req, res, next) => {
  if (!req.session.user)
    return res.status(401).json({ success: false, message: "Not authenticated" });
  next();
};
const requireAdmin = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== "admin")
    return res.status(403).json({ success: false, message: "Admin access required" });
  next();
};
const requireVoter = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== "voter")
    return res.status(403).json({ success: false, message: "Voter access required" });
  next();
};

// Utility to respond JSON or redirect
function respondOrRedirect(req, res, jsonPayload, redirectUrl) {
  const acceptsHtml = req.headers.accept && req.headers.accept.includes("text/html");
  if (acceptsHtml && redirectUrl) return res.redirect(redirectUrl);
  return res.json(jsonPayload);
}

// -------------------- Auth Routes --------------------

// Register
app.post("/register", async (req, res) => {
  const { full_name, identity, password, role } = req.body;
  if (!full_name || !identity || !password || !role)
    return res.status(400).json({ success: false, message: "Required fields missing" });

  try {
    const existing = await pool.query("SELECT user_id FROM users WHERE identity=$1", [identity]);
    if (existing.rows.length > 0)
      return res.status(400).json({ success: false, message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO users (full_name, identity, password_hash, role)
       VALUES ($1, $2, $3, $4)`,
      [full_name, identity, hashed, role]
    );

    res.status(201).json({ success: true, message: "Registration successful" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Login
app.post("/login", async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password)
    return res.status(400).json({ success: false, message: "username and password required" });

  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE identity=$1", [username]);
    if (rows.length === 0) return res.status(401).json({ success: false, message: "Invalid credentials" });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ success: false, message: "Invalid credentials" });

    if (role && user.role.toLowerCase() !== role.toLowerCase())
      return res.status(403).json({ success: false, message: "Role mismatch" });

    req.session.user = {
      id: user.user_id,
      username: user.full_name,
      role: user.role.toLowerCase(),
    };

    const redirectUrl = user.role.toLowerCase() === "admin" ? "/admin/admin_dashboard.html" : "/voter_dashboard.html";
    respondOrRedirect(req, res, { success: true, redirect: redirectUrl }, redirectUrl);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      res.json({ success: true, message: "Logged out" });
    } else {
      res.redirect("/login.html");
    }
  });
});

// -------------------- Candidate Upload (Admin) --------------------
app.post("/admin/candidates", requireAdmin, upload.single("photo"), async (req, res) => {
  try {
    const { full_name, position_id, election_id, party } = req.body;
    if (!full_name || !position_id || !election_id || !party)
      return res.status(400).json({ success: false, message: "Missing required fields" });

    const photo = req.file ? `/uploads/${req.file.filename}` : "/uploads/default.jpg";

    const result = await pool.query(
      `INSERT INTO candidates
       (full_name, position_id, election_id, party, status, photo)
       VALUES ($1,$2,$3,$4,'pending',$5) RETURNING candidate_id`,
      [full_name, position_id, election_id, party, photo]
    );

    res.json({ success: true, candidate_id: result.rows[0].candidate_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to save candidate" });
  }
});

// -------------------- Start Server --------------------
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
