const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to SQLite database
const dbPath = path.join(__dirname, '..', 'etl', 'crypto.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Failed to connect to database:', err.message);
  } else {
    console.log('✅ Connected to crypto.db');
  }
});

// API route to get all crypto data
app.get('/api/crypto', (req, res) => {
  const query = `SELECT * FROM crypto_prices ORDER BY timestamp DESC`;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error(err.message);
      res.status(500).json({ error: 'Failed to fetch data' });
    } else {
      res.json(rows);
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running at http://localhost:${PORT}`);
});
