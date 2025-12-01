// config/db.js
const { Pool } = require('pg');
require("dotenv").config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false // using internal Render DB
});

// Test connection
pool.connect((err, client, release) => {
    if (err) {
        console.error("PostgreSQL connection error:", err.stack);
    } else {
        console.log("Connected to PostgreSQL (Render internal).");
        release();
    }
});

module.exports = pool;
