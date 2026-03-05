const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const cron = require('cron');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurations
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DB_FILE = path.join(__dirname, 'database.json');
const SPAM_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

// In-memory store for rate limiting IP addresses
const ipUploadTracker = new Map();

// Ensure directories exist
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({}));

// Setup Multer Storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueId = uuidv4();
        const ext = path.extname(file.originalname);
        cb(null, `${uniqueId}${ext}`);
    }
});

const upload = multer({ storage: storage });

// Middleware
app.use(express.static(PUBLIC_DIR));
app.use(express.json());
// Trust proxy if you are behind a load balancer/reverse proxy
app.set('trust proxy', true);

// Database Helper Functions
const readDB = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// API Routes
app.post('/api/upload', upload.single('file'), (req, res) => {
    // Basic Rate Limiting
    const clientIp = req.ip || req.connection.remoteAddress;
    const now = Date.now();

    if (ipUploadTracker.has(clientIp)) {
        const lastUploadTime = ipUploadTracker.get(clientIp);
        const timeSinceLastUpload = now - lastUploadTime;

        if (timeSinceLastUpload < SPAM_COOLDOWN_MS) {
            // Remove the uploaded file if we block the request
            if (req.file) {
                const tempFilePath = path.join(UPLOADS_DIR, req.file.filename);
                if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            }

            const remainingTimeSeconds = Math.ceil((SPAM_COOLDOWN_MS - timeSinceLastUpload) / 1000);
            return res.status(429).json({
                error: `الرجاء الانتظار ${remainingTimeSeconds} ثانية قبل رفع ملف آخر (حماية من السبام).`
            });
        }
    }

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Update Tracker
    ipUploadTracker.set(clientIp, now);

    const fileId = path.parse(req.file.filename).name; // UUID without extension
    const uploadTime = new Date();

    // Parse duration logic
    const duration = req.body.duration || '7'; // Default to 7 days
    let expiresAt = null; // null means permanent

    if (duration !== 'permanent') {
        const days = parseInt(duration, 10);
        if (!isNaN(days) && days > 0) {
            expiresAt = new Date(uploadTime.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
        } else {
            expiresAt = new Date(uploadTime.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
        }
    }

    const fileData = {
        id: fileId,
        originalName: req.file.originalname,
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size,
        uploadedAt: uploadTime.toISOString(),
        expiresAt: expiresAt
    };

    const db = readDB();
    db[fileId] = fileData;
    writeDB(db);

    const downloadLink = `${req.protocol}://${req.get('host')}/download/${fileId}`;
    res.json({ success: true, link: downloadLink, expiresAt: expiresAt });
});

app.get('/download/:id', (req, res) => {
    const fileId = req.params.id;
    const db = readDB();
    const fileData = db[fileId];

    if (!fileData) {
        return res.status(404).send('File not found.');
    }

    if (fileData.expiresAt !== null) {
        const now = new Date();
        const expiresAt = new Date(fileData.expiresAt);

        if (now > expiresAt) {
            // Cleanup expired file on access
            const filePath = path.join(UPLOADS_DIR, fileData.filename);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            delete db[fileId];
            writeDB(db);
            return res.status(410).send('This file link has expired.');
        }
    }

    const filePath = path.join(UPLOADS_DIR, fileData.filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File missing from server.');
    }

    res.download(filePath, fileData.originalName);
});

// Cleanup Cron Job - Runs every hour to delete expired files
const cleanupJob = new cron.CronJob('0 * * * *', () => {
    console.log('[Cron] Running cleanup job...');
    const db = readDB();
    const now = new Date();
    let updated = false;

    // Clean up memory tracker too
    for (const [ip, time] of ipUploadTracker.entries()) {
        if (now.getTime() - time > SPAM_COOLDOWN_MS) {
            ipUploadTracker.delete(ip);
        }
    }

    for (const [id, fileData] of Object.entries(db)) {
        if (fileData.expiresAt !== null && now > new Date(fileData.expiresAt)) {
            const filePath = path.join(UPLOADS_DIR, fileData.filename);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            delete db[id];
            updated = true;
            console.log(`[Cron] Deleted expired file: ${fileData.originalName} (${id})`);
        }
    }

    if (updated) {
        writeDB(db);
    }
});
cleanupJob.start();

// Start Server
app.listen(PORT, () => {
    console.log(`MR TEAM Upload Server running at http://localhost:${PORT}`);
});
