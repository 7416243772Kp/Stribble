import express from "express";
import multer from "multer";
import Course from "../models/course.js";
import User from "../models/User.js"; // Import User Model
import adminAuth from "../middleware/authAdmin.js";
import protectUser from "../middleware/authUser.js"; // Import Auth Middleware
import Order from "../models/order.js";
import fs from 'fs';
import path from 'path';
import { convertPdfToImages, deletePageImages } from '../utils/pdfToImages.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// 1. Setup Folders
const publicDir = 'public/uploads/'; // For Thumbnails (Public)
const privateDir = 'private_courses/'; // For PDFs (SECURE - Not accessible via URL)

if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
if (!fs.existsSync(privateDir)) fs.mkdirSync(privateDir, { recursive: true });

// 2. Multer Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Store thumbnails in public, PDFs in private
    if (file.fieldname === "coursePdf") {
      cb(null, privateDir);
    } else {
      cb(null, publicDir);
    }
  },
  filename: (req, file, cb) => { 
    // Secure filename generation
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.]/g, "_");
    cb(null, Date.now() + "-" + cleanName); 
  }
});

const fileFilter = (req, file, cb) => {
  if (file.fieldname === "thumbnail") {
    if (!file.originalname.match(/\.(jpg|jpeg|png|webp)$/i)) {
      return cb(new Error('Thumbnail must be an image file!'), false);
    }
  } else if (file.fieldname === "coursePdf") {
    if (!file.originalname.match(/\.pdf$/i)) {
      return cb(new Error('Course file must be a PDF!'), false);
    }
  }
  cb(null, true);
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// 3. Upload Middleware (Accepts 2 files)
const uploadFields = upload.fields([
  { name: 'thumbnail', maxCount: 1 }, 
  { name: 'coursePdf', maxCount: 1 }
]);

// 🔴 CREATE COURSE (Updated — now converts PDF to images)
router.post("/", adminAuth, uploadFields, async (req, res) => {
  try {
    // Validate Files
    if (!req.files || !req.files.thumbnail || !req.files.coursePdf) {
      return res.status(400).json({ success: false, message: "Both Thumbnail and PDF are required" });
    }

    const { title, price, description } = req.body;
    const pdfFilename = req.files.coursePdf[0].filename;

    const newCourse = new Course({
      title,
      description,
      price: Number(price),
      thumbnail: `/uploads/${req.files.thumbnail[0].filename}`, // Public path
      pdfFile: pdfFilename // Private filename only
    });

    await newCourse.save();

    // Convert PDF pages to images
    try {
      const pdfPath = path.resolve(privateDir, pdfFilename);
      const imageDir = path.resolve(privateDir, 'images', newCourse._id.toString());
      const { pageImages, totalPages } = await convertPdfToImages(pdfPath, imageDir);

      newCourse.pageImages = pageImages;
      newCourse.totalPages = totalPages;
      await newCourse.save();

    } catch (convErr) {
      console.error("[Course] PDF→Image conversion failed:", convErr);
      // Course is still created with the PDF — images can be regenerated later
    }

    res.status(201).json({ success: true, course: newCourse });

  } catch (err) {
    console.error("Create Error:", err);
    res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
});

// GET All (Public)
router.get("/", async (req, res) => {
  try {
    // Exclude pdfFile from result automatically via Model 'select: false'
    const courses = await Course.find();
    res.json({ success: true, courses });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET Single (Public)
router.get("/:id", async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: "Course not found" });
    res.json({ success: true, course });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// 🔴 UPDATE COURSE (Updated — re-converts PDF to images if PDF changed)
router.put("/:id", adminAuth, uploadFields, async (req, res) => {
  try {
    const { title, price, description } = req.body;
    const updateData = {};

    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (price) updateData.price = Number(price);

    // Update files only if new ones are uploaded
    if (req.files?.thumbnail) {
      updateData.thumbnail = `/uploads/${req.files.thumbnail[0].filename}`;
    }
    if (req.files?.coursePdf) {
      updateData.pdfFile = req.files.coursePdf[0].filename;
    }

    const updatedCourse = await Course.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!updatedCourse) return res.status(404).json({ success: false, message: "Course not found" });

    // Re-convert PDF to images if a new PDF was uploaded
    if (req.files?.coursePdf) {
      try {
        const courseId = req.params.id;
        const imageDir = path.resolve(privateDir, 'images', courseId);

        // Delete old images first
        deletePageImages(imageDir);

        // Convert new PDF
        const pdfPath = path.resolve(privateDir, req.files.coursePdf[0].filename);
        const { pageImages, totalPages } = await convertPdfToImages(pdfPath, imageDir);

        updatedCourse.pageImages = pageImages;
        updatedCourse.totalPages = totalPages;
        await updatedCourse.save();

      } catch (convErr) {
        console.error("[Course] PDF→Image re-conversion failed:", convErr);
      }
    }

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
    
    // Cleanup Files
    try {
        // 1. Delete Thumbnail
        const thumbPath = path.join(publicDir, path.basename(course.thumbnail));
        if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);

        // 2. Delete generated page images
        const imageDir = path.resolve(privateDir, 'images', req.params.id);
        deletePageImages(imageDir);
    } catch(e) { console.log("File cleanup error", e); }

    res.json({ success: true, message: "Course deleted" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// 🔒 CHECK ACCESS & GET WATERMARK DATA
router.get("/access/:courseId", protectUser, async (req, res) => {
  try {
    // 1. Check if user is logged in
    if (!req.user || !req.user.email) {
      return res.status(401).json({ success: false, message: "Please login to view this course." });
    }

    // 2. Find the COMPLETED order for this user & course
    const order = await Order.findOne({
      buyerEmail: req.user.email,
      courseId: req.params.courseId,
      status: "completed"
    }).select("buyerEmail razorpayOrderId createdAt");

    if (!order) {
        // Fallback: Check if they have the course in their profile
        const user = await User.findById(req.user._id);
        if (user && user.purchasedCourses.includes(req.params.courseId)) {
             return res.json({
                success: true,
                userEmail: req.user.email,
                purchaseDate: new Date() // Fallback since we don't have exact date for manual adds
            });
        }
        return res.status(403).json({ success: false, message: "You have not purchased this course." });
    }

    // 3. Return success with Watermark Data
    res.json({
      success: true,
      userEmail: req.user.email,
      purchaseDate: order.createdAt
    });

  } catch (err) {
    console.error("Access Check Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// 🔒 SECURE STREAM ROUTE
router.get("/stream/:courseId", protectUser, async (req, res) => {
  try {
    const userId = req.user._id; 
    
    // 1. Verify Purchase
    // Check if user has purchased this course via Order or User.purchasedCourses
    // Ideally User.purchasedCourses is populated on successful payment
    // For now, let's check Order table or User field.
    const hasPurchased = await Order.findOne({ 
      buyerEmail: req.user.email, 
      courseId: req.params.courseId, 
      status: 'completed' 
    });

    // Also check the user array (if we sync it)
    const isOwner = req.user.purchasedCourses.includes(req.params.courseId);

    if (!hasPurchased && !isOwner) {
        return res.status(403).send("Access Denied: You have not purchased this course.");
    }

    // 2. Get Course Details (Explicitly select pdfFile)
    const course = await Course.findById(req.params.courseId).select('+pdfFile');
    if (!course || !course.pdfFile) return res.status(404).send("Course file not found.");

    // 3. Stream the File
    const filePath = path.join(privateDir, course.pdfFile);
    console.log(`[Stream] Serving file: ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
        console.error(`[Stream] File MISSING: ${filePath}`);
        return res.status(404).send("File missing from server filesystem.");
    }

    // Set Headers to force "Inline" view (not download)
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="course-content.pdf"');

    // Pipe the read stream to the response
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

  } catch (err) {
    console.error("Stream Error:", err);
    res.status(500).send("Server Error");
  }
});

// 🖼️ GET PAGE COUNT (for reader initialization)
router.get("/pages/:courseId", protectUser, async (req, res) => {
  try {
    // Verify purchase
    const hasPurchased = await Order.findOne({
      buyerEmail: req.user.email,
      courseId: req.params.courseId,
      status: 'completed'
    });
    const isOwner = req.user.purchasedCourses.includes(req.params.courseId);
    if (!hasPurchased && !isOwner) {
      return res.status(403).json({ success: false, message: "Access Denied" });
    }

    const course = await Course.findById(req.params.courseId).select('+totalPages +pageImages');
    if (!course) return res.status(404).json({ success: false, message: "Course not found" });

    res.json({ success: true, totalPages: course.totalPages });
  } catch (err) {
    console.error("Pages count error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// 🖼️ SERVE INDIVIDUAL PAGE IMAGE (authenticated)
router.get("/page-image/:courseId/:pageNum", protectUser, async (req, res) => {
  try {
    const { courseId, pageNum } = req.params;
    const page = parseInt(pageNum, 10);

    // Verify purchase
    const hasPurchased = await Order.findOne({
      buyerEmail: req.user.email,
      courseId,
      status: 'completed'
    });
    const isOwner = req.user.purchasedCourses.includes(courseId);
    if (!hasPurchased && !isOwner) {
      return res.status(403).send("Access Denied: You have not purchased this course.");
    }

    // Validate page number
    const course = await Course.findById(courseId).select('+totalPages +pageImages');
    if (!course) return res.status(404).send("Course not found.");
    if (page < 1 || page > course.totalPages) {
      return res.status(404).send("Page not found.");
    }

    // Serve the image file
    const imagePath = path.resolve(privateDir, 'images', courseId, `page-${page}.png`);
    if (!fs.existsSync(imagePath)) {
      console.error(`[PageImage] File MISSING: ${imagePath}`);
      return res.status(404).send("Page image file missing from server.");
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=3600'); // Cache for 1 hour (auth-gated)
    res.setHeader('Content-Disposition', 'inline');

    const fileStream = fs.createReadStream(imagePath);
    fileStream.pipe(res);

  } catch (err) {
    console.error("Page Image Error:", err);
    res.status(500).send("Server Error");
  }
});


export default router;