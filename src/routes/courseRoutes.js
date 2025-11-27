//C:\Ebook\src\routes\courseRoutes.js
import express from "express";
import multer from "multer";
import Course from "../models/course.js";
import adminAuth from "../middleware/authAdmin.js";
import { fileTypeFromFile } from 'file-type';
import fs from 'fs/promises';

const router = express.Router();

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, "uploads/"); },
  filename: (req, file, cb) => { cb(null, Date.now() + "-" + file.originalname); }
});

// ADD THIS FILTER
const fileFilter = (req, file, cb) => {
  // Accept images only
  if (!file.originalname.match(/\.(jpg|jpeg|png|webp)$/)) {
    return cb(new Error('Only image files are allowed!'), false);
  }
  cb(null, true);
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter, // Apply filter
  limits: { fileSize: 2 * 1024 * 1024 } // Limit size to 2MB to prevent DoS
});

// POST /api/courses
router.post("/", adminAuth, upload.single("thumbnail"), async (req, res) => {
  try {
    // 1. Check if file exists
    if (!req.file) return res.status(400).json({ success: false, message: "Thumbnail required" });

    // 2. SECURITY: Check Magic Numbers (Real content type)
    const meta = await fileTypeFromFile(req.file.path);
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];

    if (!meta || !allowedMimes.includes(meta.mime)) {
      // Delete the malicious file immediately
      await fs.unlink(req.file.path);
      return res.status(400).json({ success: false, message: "Invalid file type detected (Magic Numbers mismatch)" });
    }

    // ... (Proceed with your existing logic: create Course, save to DB) ...

  } catch (err) {
    // Cleanup file if error occurs
    if (req.file) await fs.unlink(req.file.path).catch(() => { });
    console.error("Course create error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET all courses
router.get("/", async (req, res) => {
  try {
    const courses = await Course.find();
    res.json({ success: true, courses });
  } catch (err) {
    console.error("Fetch courses error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// UPDATE course
router.put("/:id", adminAuth, upload.single("thumbnail"), async (req, res) => {
  try {
    const { title, price, description, googleDriveLink } = req.body;

    const updateData = {
      title,
      description,
      price: Number(price),
      googleDriveLink
    };

    if (req.file) {
      updateData.thumbnail = `/uploads/${req.file.filename}`;
    }

    const updatedCourse = await Course.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!updatedCourse) {
      return res.status(404).json({ success: false, message: "Course not found" });
    }

    res.json({ success: true, course: updatedCourse });
  } catch (err) {
    console.error("Course update error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// DELETE course
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const deletedCourse = await Course.findByIdAndDelete(req.params.id);
    if (!deletedCourse) {
      return res.status(404).json({ success: false, message: "Course not found" });
    }
    res.json({ success: true, message: "Course deleted" });
  } catch (err) {
    console.error("Course delete error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
// GET single course by ID
router.get("/:id", async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found" });
    }
    res.json({ success: true, course });
  } catch (err) {
    console.error("Get course error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});



export default router;
