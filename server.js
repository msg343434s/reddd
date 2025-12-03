require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_strong_secret_key';

app.use(express.static('public'));
app.use(express.json());

const limiter = rateLimit({
    windowMs: 60000,
    max: 10,
    message: 'Too many requests. Please try again later.'
});
app.use(limiter);

function generateUniqueKey() {
    return crypto.randomBytes(8).toString('hex');
}

function generateToken(key) {
    return jwt.sign({ key }, JWT_SECRET);
}

app.post('/add-redirect', async (req, res) => {
    const { destination } = req.body;
    if (!destination || !/^https?:\/\//.test(destination)) {
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
            pathRedirectUrl: `${baseUrl}/${key}/${token}`
        });
    } catch {
        res.status(500).json({ message: 'Failed to save redirect.' });
    }
});

app.get('/:key/:token', async (req, res) => {
    const { key, token } = req.params;
    const email = req.query.email || null;

    const ua = req.headers['user-agent'] || '';
    if (/bot|crawl|spider|preview/i.test(ua)) {
        return res.status(403).send('Access denied.');
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).send('Invalid email format.');
    }

    try {
        jwt.verify(token, JWT_SECRET);
        const row = await db.getRedirect(key);

        if (!row) return res.status(404).send('Redirect not found.');
        if (row.token !== token) return res.status(403).send('Invalid token.');

        let destination = row.destination;
        if (email) {
            destination = destination.endsWith('/')
                ? destination + email
                : `${destination}/${email}`;
        }

        res.redirect(destination);
    } catch {
        res.status(403).send('Invalid or expired token.');
    }
});

app.get('/redirects', async (req, res) => {
    try {
        res.json(await db.getAllRedirects());
    } catch {
        res.status(500).json({ message: 'Failed to fetch redirects' });
    }
});

app.put('/redirects/:key', async (req, res) => {
    const { destination } = req.body;
    if (!destination || !/^https?:\/\//.test(destination)) {
        return res.status(400).json({ message: 'Invalid destination URL.' });
    }

    try {
        await db.updateRedirect(req.params.key, destination);
        res.json({ message: 'Redirect updated.' });
    } catch {
        res.status(500).json({ message: 'Failed to update redirect.' });
    }
});

app.delete('/redirects/:key', async (req, res) => {
    try {
        await db.deleteRedirect(req.params.key);
        res.json({ message: 'Redirect deleted.' });
    } catch {
        res.status(500).json({ message: 'Failed to delete redirect.' });
    }
});

app.listen(PORT, () => console.log(`Server running on https://localhost:${PORT}`));