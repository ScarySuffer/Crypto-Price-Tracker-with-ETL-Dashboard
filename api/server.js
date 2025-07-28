require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http'); // Import http module
const WebSocket = require('ws'); // Import ws module
const { Pool } = require('pg'); // NEW: Import Pool from pg

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// --- NEW: PostgreSQL Database Configuration ---
// IMPORTANT: For real-world applications, store these credentials in environment variables!
const PG_CONFIG = {
    user: process.env.PG_DB_USER,
    host: process.env.PG_DB_HOST,
    database: process.env.PG_DB_NAME,
    password: process.env.PG_DB_PASSWORD,
    port: parseInt(process.env.PG_DB_PORT, 10), // Ensure port is parsed as an integer
};

// Add a check to ensure essential variables are loaded
if (!PG_CONFIG.password || !PG_CONFIG.user || !PG_CONFIG.database || !PG_CONFIG.host || isNaN(PG_CONFIG.port)) {
    console.error("❌ Error: One or more PostgreSQL environment variables are missing or invalid. Please check your .env file.");
    process.exit(1); // Exit if critical variables are missing
}
// NEW: Create a PostgreSQL connection pool
// Connection pooling is crucial for Node.js applications to manage database connections efficiently.
const pool = new Pool(PG_CONFIG);

// Connect to PostgreSQL and log status
pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('❌ Unexpected error on idle client', err);
    process.exit(-1); // Exit process if critical database error
});

// Helper function to execute queries
async function executeQuery(query, params = []) {
    const client = await pool.connect();
    try {
        const result = await client.query(query, params);
        // NEW: Map rows to convert numeric strings to numbers
        return result.rows.map(row => {
            return {
                ...row,
                current_price: parseFloat(row.current_price),
                market_cap: row.market_cap ? parseFloat(row.market_cap) : null, // Handle potential nulls
                total_volume: row.total_volume ? parseFloat(row.total_volume) : null, // Handle potential nulls
                // timestamp does not need parsing, as it's a date string
            };
        });
    } finally {
        client.release();
    }
}


// API route to get the LATEST data for all cryptocurrencies
app.get('/api/crypto', async (req, res) => {
    const query = `
        SELECT t1.symbol, t1.name, t1.current_price, t1.market_cap, t1.total_volume, t1.timestamp
        FROM prices t1
        INNER JOIN (
            SELECT symbol, MAX(timestamp) AS max_timestamp
            FROM prices
            GROUP BY symbol
        ) t2
        ON t1.symbol = t2.symbol AND t1.timestamp = t2.max_timestamp
        ORDER BY t1.market_cap DESC;
    `;

    try {
        const rows = await executeQuery(query);
        res.json(rows);
    } catch (err) {
        console.error('DB Query Error (latest crypto):', err);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

// API route to get historical data for a specific crypto symbol with optional date range
// Example usage: /api/crypto/history/BTC?startDate=2024-01-01&endDate=2024-01-31
app.get('/api/crypto/history/:symbol', async (req, res) => {
    const { symbol } = req.params;
    const { startDate, endDate } = req.query; // Extract startDate and endDate from query parameters

    console.log(`Backend received historical data request for: ${symbol}`);
    console.log(`Backend startDate: ${startDate}, endDate: ${endDate}`);

    let query = `
        SELECT symbol, name, current_price, market_cap, total_volume, timestamp
        FROM prices
        WHERE symbol = $1
    `;
    const params = [symbol.toLowerCase()]; // Always convert symbol to lowercase for DB lookup

    // PostgreSQL's TIMESTAMPTZ can directly compare ISO 8601 strings
    // like 'YYYY-MM-DDTHH:MM:SS.SSSZ' or 'YYYY-MM-DDTHH:MM:SS.SSS'
    let paramIndex = 2; // Start from $2 for date parameters

    if (startDate) {
        query += ` AND timestamp >= $${paramIndex}`;
        params.push(`${startDate}T00:00:00.000Z`); // Assuming ETL saves with Z for UTC
        paramIndex++;
    }
    if (endDate) {
        // For the end date, to ensure we include all data up to the very last millisecond
        // of the `endDate`, it's more robust to query for timestamps strictly *less than*
        // the beginning of the *next* day.
        const nextDay = new Date(endDate);
        nextDay.setDate(nextDay.getDate() + 1); // Increment day to get the next day
        const nextDayFormatted = nextDay.toISOString().split('T')[0];

        query += ` AND timestamp < $${paramIndex}`; // Use '<' (strictly less than)
        params.push(`${nextDayFormatted}T00:00:00.000Z`); // Again, assuming Z for UTC
        paramIndex++;
    }

    query += ` ORDER BY timestamp ASC;`; // Always order by timestamp for charting

    console.log('SQL Query:', query);
    console.log('SQL Params:', params);

    try {
        const rows = await executeQuery(query, params);
        console.log(`Backend sent ${rows.length} historical data rows for ${symbol} between ${startDate} and ${endDate}.`);
        if (rows.length > 0) {
            console.log('First row timestamp in response:', rows[0].timestamp);
            console.log('Last row timestamp in response:', rows[rows.length - 1].timestamp);
        }
        res.json(rows);
    } catch (err) {
        console.error(`DB Query Error for history of ${symbol} with range ${startDate}-${endDate}:`, err);
        res.status(500).json({ error: 'Failed to fetch historical data' });
    }
});

// --- WebSocket Server Setup ---
const server = http.createServer(app); // Create an HTTP server using your Express app
const wss = new WebSocket.Server({ server }); // Attach WebSocket server to the HTTP server

wss.on('connection', ws => {
    console.log('WebSocket client connected!');

    ws.on('message', message => {
        console.log(`Received message from client: ${message}`);
    });

    ws.on('close', () => {
        console.log('WebSocket client disconnected.');
    });

    ws.on('error', error => {
        console.error('WebSocket error:', error);
    });
});

// Function to fetch latest data and broadcast it (DRY principle)
const broadcastLatestCryptoData = async () => {
    const queryLatest = `
        SELECT t1.symbol, t1.name, t1.current_price, t1.market_cap, t1.total_volume, t1.timestamp
        FROM prices t1
        INNER JOIN (
            SELECT symbol, MAX(timestamp) AS max_timestamp
            FROM prices
            GROUP BY symbol
        ) t2
        ON t1.symbol = t2.symbol AND t1.timestamp = t2.max_timestamp
        ORDER BY t1.market_cap DESC;
    `;
    try {
        const rows = await executeQuery(queryLatest);
        if (rows.length > 0) {
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'latest_crypto_update', data: rows }));
                }
            });
            console.log('Broadcasted latest crypto data to WebSocket clients.');
        } else {
            console.warn('No data fetched for broadcast (database might be empty or query failed).');
        }
    } catch (err) {
        console.error('Error fetching data for broadcast:', err.message);
    }
};

// API endpoint for ETL script to trigger a broadcast
app.post('/api/notify-update', (req, res) => {
    console.log('Received notification from ETL script. Broadcasting latest data...');
    broadcastLatestCryptoData(); // Call the function to fetch and broadcast
    res.status(200).json({ message: 'Broadcast triggered successfully' });
});

// Start server (listen on the HTTP server, which also handles WebSockets)
server.listen(PORT, () => {
    console.log(`🚀 Server is running at http://localhost:${PORT}`);
    console.log(`WebSocket server also running on ws://localhost:${PORT}`);
});