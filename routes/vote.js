// routes/vote.js
const express = require('express');
const router = express.Router();
const db = require('../db'); // your MySQL connection

router.post('/submit-vote', async (req, res) => {
    const { president, vice_president, secretary, treasurer, pro, academic, welfare, sports } = req.body;
    const voterId = req.session.user_id; // assuming session stores voter_id

    if (!voterId) return res.status(401).json({ error: 'Unauthorized' });

    try {
        // Insert votes
        const query = `
            INSERT INTO votes
            (voter_id, president, vice_president, secretary, treasurer, pro, academic, welfare, sports)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await db.execute(query, [voterId, president, vice_president, secretary, treasurer, pro, academic, welfare, sports]);

        res.json({ success: true, message: 'Vote submitted successfully!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error submitting vote' });
    }
});

module.exports = router;
