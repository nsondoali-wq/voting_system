// config/db.js
const mysql = require('mysql2');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'voting_user',        // same as in server.js
    password: 'MySecurePassword123',
    database: 'voting_system'
});

db.connect((err) => {
    if (err) {
        console.error('DB connection failed:', err.stack);
        return;
    }
    console.log('Connected to database from db.js.');
});

module.exports = db;
