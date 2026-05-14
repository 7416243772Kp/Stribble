import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

// Recreate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../../public/uploads/tickets');
fs.mkdir(uploadDir, { recursive: true }).catch(console.error);

// 1. STRICT VALIDATION: Multer Configuration
const multerStorage = multer.memoryStorage(); // Keep file in memory

const multerFilter = (req, file, cb) => {
    // Check Mime Type
    if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('Invalid file type! Only images are allowed.'), false);
    }
    
    // Check Extension
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
    if (!allowedExts.includes(ext)) {
        return cb(new Error('Invalid extension! Only JPG, PNG, and WEBP are allowed.'), false);
    }

    cb(null, true);
};

const upload = multer({
    storage: multerStorage,
    fileFilter: multerFilter,
    limits: { 
        fileSize: 2 * 1024 * 1024, // 2 MB limit
        files: 3 // Max 3 attachments
    }
});

// Export the multer middleware
export const uploadTicketImages = upload.array('attachments', 3);

// 2. STRICT SANITIZATION: Sharp Re-encoding
export const sanitizeImages = async (req, res, next) => {
    if (!req.files || req.files.length === 0) return next();

    req.body.attachments = [];

    try {
        await Promise.all(
            req.files.map(async (file) => {
                const filename = `ticket-${Date.now()}-${Math.round(Math.random() * 1E9)}.webp`;
                const filepath = path.join(uploadDir, filename);

                // Re-encode, strip EXIF, save as webp
                await sharp(file.buffer)
                    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
                    .toFormat('webp')
                    .webp({ quality: 80 })
                    .toFile(filepath); 

                req.body.attachments.push(`/uploads/tickets/${filename}`);
            })
        );
        next();
    } catch (error) {
        console.error("Image Processing Error:", error);
        return res.status(400).json({ 
            success: false, 
            message: "File processing failed. The image might be corrupted or malicious." 
        });
    }
};