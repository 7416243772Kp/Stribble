//C:\Ebook\src\routes\courseRoutes.js
import express from "express";
import multer from "multer";
import path from "path";
import Course from "../models/course.js";
import adminAuth from "../middleware/authAdmin.js";

const router = express.Router();

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({ storage });

// POST /api/courses
router.post("/", adminAuth, upload.single("thumbnail"), async (req, res) => {
  try {
    const { title, description, price, googleDriveLink } = req.body;

    const newCourse = new Course({
      title,
      description,
      price: Number(price),
      googleDriveLink,
      thumbnail: req.file ? `/uploads/${req.file.filename}` : ""
    });

    await newCourse.save();
    res.json({ success: true, course: newCourse });
  } catch (err) {
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
