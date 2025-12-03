const mongoose = require('mongoose');

const mongoURI = process.env.MONGO_URI;

mongoose.connect(mongoURI)
    .then(() => console.log("MongoDB Connected"))
    .catch(err => {
        console.error("MongoDB Error:", err.message);
        process.exit(1);
    });

const redirectSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    destination: { type: String, required: true },
    token: { type: String, required: true },
}, { timestamps: true });

const Redirect = mongoose.model('Redirect', redirectSchema);

// Add redirect
async function addRedirect(key, destination, token) {
    const newRedirect = new Redirect({ key, destination, token });
    await newRedirect.save();
}

// Get redirect by key
async function getRedirect(key) {
    return await Redirect.findOne({ key }).lean();
}

// Get all
async function getAllRedirects() {
    return await Redirect.find().lean();
}

// Update
async function updateRedirect(key, newDestination) {
    return await Redirect.findOneAndUpdate(
        { key },
        { destination: newDestination },
        { new: true, lean: true }
    );
}

// Delete
async function deleteRedirect(key) {
    return await Redirect.findOneAndDelete({ key });
}

module.exports = {
    addRedirect,
    getRedirect,
    getAllRedirects,
    updateRedirect,
    deleteRedirect,
};
