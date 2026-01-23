// C:\Ebook\src\routes\courseRoutes.js
import express from "express";
import multer from "multer";
import Course from "../models/course.js";
import adminAuth from "../middleware/authAdmin.js";
import { fileTypeFromFile } from 'file-type';
import fs from 'fs/promises';
import fsSync from 'fs';

const router = express.Router();

// Ensure uploads folder exists
const uploadDir = 'uploads/';
if (!fsSync.existsSync(uploadDir)){
    fsSync.mkdirSync(uploadDir, { recursive: true });
}

// Multer Config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => { 
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.]/g, "_");
    cb(null, Date.now() + "-" + cleanName); 
  }
});

const fileFilter = (req, file, cb) => {
  if (!file.originalname.match(/\.(jpg|jpeg|png|webp)$/i)) {
    return cb(new Error('Only image files are allowed!'), false);
  }
  cb(null, true);
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Helper: Wrap upload to catch errors
const uploadMiddleware = (req, res, next) => {
  const uploadSingle = upload.single("thumbnail");
  uploadSingle(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
};

// CREATE Course
router.post("/", adminAuth, uploadMiddleware, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Thumbnail required" });

    // Magic Number Check
    try {
        const meta = await fileTypeFromFile(req.file.path);
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (!meta || !allowed.includes(meta.mime)) {
            await fs.unlink(req.file.path);
            return res.status(400).json({ success: false, message: "Invalid file type" });
        }
    } catch (e) { /* ignore if check fails */ }

    const { title, price, description, googleDriveLink } = req.body;

    const newCourse = new Course({
      title,
      description,
      price: Number(price),
      thumbnail: `/uploads/${req.file.filename}`,
      googleDriveLink
    });

    await newCourse.save();
    res.status(201).json({ success: true, course: newCourse });
  } catch (err) {
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET All
router.get("/", async (req, res) => {
  try {
    const courses = await Course.find();
    res.json({ success: true, courses });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET Single
router.get("/:id", async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: "Course not found" });
    res.json({ success: true, course });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// UPDATE Course (Handles both JSON and Multipart)
router.put("/:id", adminAuth, uploadMiddleware, async (req, res) => {
  try {
    const { title, price, description, googleDriveLink } = req.body;
    
    const updateData = {};
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (price) updateData.price = Number(price);
    if (googleDriveLink) updateData.googleDriveLink = googleDriveLink;

    if (req.file) {
      updateData.thumbnail = `/uploads/${req.file.filename}`;
    }

    const updatedCourse = await Course.findByIdAndUpdate(req.params.id, updateData, { new: true });
    
    if (!updatedCourse) return res.status(404).json({ success: false, message: "Course not found" });

    res.json({ success: true, course: updatedCourse });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// DELETE Course
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const course = await Course.findByIdAndDelete(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: "Course not found" });
    
    // Optional: Delete image file
    // if (course.thumbnail) { ... code to delete file ... }

    res.json({ success: true, message: "Course deleted" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;