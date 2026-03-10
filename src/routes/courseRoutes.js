import express from "express";
import multer from "multer";
import Course from "../models/course.js";
import User from "../models/User.js"; // Import User Model
import adminAuth from "../middleware/authAdmin.js";
import protectUser from "../middleware/authUser.js"; // Import Auth Middleware
import Order from "../models/order.js";
import CourseProgress from "../models/CourseProgress.js";
import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// 1. Setup Folders
const publicDir = 'public/uploads/'; // For Thumbnails (Public)
const privateDir = 'private_courses/'; // For PDFs (SECURE - Not accessible via URL)

if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
if (!fs.existsSync(privateDir)) fs.mkdirSync(privateDir, { recursive: true });

// Helper: Extract page count from a PDF using pdf-lib
async function getPdfPageCount(pdfFilePath) {
  const fileBuffer = fs.readFileSync(pdfFilePath);
  const pdfDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
  return pdfDoc.getPageCount();
}

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

// 🔴 CREATE COURSE (Simplified — stores PDF directly, extracts page count)
router.post("/", adminAuth, uploadFields, async (req, res) => {
  try {
    // Validate Files
    if (!req.files || !req.files.thumbnail || !req.files.coursePdf) {
      return res.status(400).json({ success: false, message: "Both Thumbnail and PDF are required" });
    }

    const { title, price, description } = req.body;
    const pdfFilename = req.files.coursePdf[0].filename;

    // Extract page count from the PDF
    const pdfPath = path.resolve(privateDir, pdfFilename);
    let totalPages = 0;
    try {
      totalPages = await getPdfPageCount(pdfPath);
    } catch (countErr) {
      console.error("[Course] PDF page count extraction failed:", countErr);
    }

    const newCourse = new Course({
      title,
      description,
      price: Number(price),
      thumbnail: `/uploads/${req.files.thumbnail[0].filename}`, // Public path
      pdfFile: pdfFilename, // Private filename only
      totalPages
    });

    await newCourse.save();

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

// 🔴 UPDATE COURSE (Simplified — re-extracts page count if PDF changed)
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

      // Re-extract page count from new PDF
      try {
        const pdfPath = path.resolve(privateDir, req.files.coursePdf[0].filename);
        updateData.totalPages = await getPdfPageCount(pdfPath);
      } catch (countErr) {
        console.error("[Course] PDF page count extraction failed:", countErr);
      }
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
    
    // Cleanup Files
    try {
        // 1. Delete Thumbnail
        const thumbPath = path.join(publicDir, path.basename(course.thumbnail));
        if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
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

// 🔒 SAVE COURSE PROGRESS
router.post("/progress/:courseId", protectUser, async (req, res) => {
  try {
    const { visitedPagesArray } = req.body;
    if (!visitedPagesArray || !Array.isArray(visitedPagesArray)) {
      return res.status(400).json({ success: false, message: "visitedPagesArray required" });
    }

    // Validate access (must have ordered or own it)
    const hasPurchased = await Order.findOne({ 
      buyerEmail: req.user.email, 
      courseId: req.params.courseId, 
      status: 'completed' 
    });
    const isOwner = req.user.purchasedCourses.includes(req.params.courseId);
    if (!hasPurchased && !isOwner) {
      return res.status(403).json({ success: false, message: "Access Denied" });
    }

    // Find course to know total pages
    const course = await Course.findById(req.params.courseId);
    if (!course) return res.status(404).json({ success: false, message: "Course not found" });

    // Upsert the progress document manually to allow logical checks
    let progress = await CourseProgress.findOne({ userId: req.user._id, courseId: req.params.courseId });
    if (!progress) {
      progress = new CourseProgress({
        userId: req.user._id,
        courseId: req.params.courseId,
        visitedPages: [],
        isCompleted: false
      });
    }

    // Add new pages uniquely
    const uniqueVisited = new Set([...progress.visitedPages, ...visitedPagesArray]);
    progress.visitedPages = Array.from(uniqueVisited);
    progress.lastAccessed = new Date();

    // Check completion (Only if not already completed and pages exceed or equal total)
    if (!progress.isCompleted && progress.visitedPages.length >= course.totalPages && course.totalPages > 0) {
      progress.isCompleted = true;
      progress.completedAt = new Date();
    }

    await progress.save();

    res.json({ success: true, isCompleted: progress.isCompleted });
  } catch (err) {
    console.error("Progress save error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// 🎓 GET CERTIFICATE OF COMPLETION
router.get("/:courseId/certificate", protectUser, async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) return res.status(404).json({ success: false, message: "Course not found" });

    const progress = await CourseProgress.findOne({ userId: req.user._id, courseId: req.params.courseId });
    if (!progress || !progress.isCompleted) {
      return res.status(403).json({ success: false, message: "You have not completed this course yet." });
    }

    // Generate Certificate PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([842, 595]); // Standard A4 Landscape
    const { width, height } = page.getSize();

    // Load Fonts
    const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const timesItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Color Palette
    const navyBlue = rgb(0.04, 0.12, 0.25);
    const gold = rgb(0.85, 0.70, 0.30);
    const darkGold = rgb(0.65, 0.50, 0.15);
    const lightGray = rgb(0.45, 0.50, 0.55);
    const bgColor = rgb(0.98, 0.985, 0.99); // Subtle off-white/gray

    // Draw Background
    page.drawRectangle({
      x: 0, y: 0,
      width: width, height: height,
      color: bgColor,
    });

    // Premium Border Setup
    // 1. Thick Outer Navy Border
    page.drawRectangle({
      x: 18, y: 18,
      width: width - 36, height: height - 36,
      borderColor: navyBlue,
      borderWidth: 12,
    });
    
    // 2. Thick Inner Gold Border
    page.drawRectangle({
      x: 34, y: 34,
      width: width - 68, height: height - 68,
      borderColor: gold,
      borderWidth: 3,
    });
    
    // 3. Thin Inner Gold Border
    page.drawRectangle({
      x: 40, y: 40,
      width: width - 80, height: height - 80,
      borderColor: gold,
      borderWidth: 1,
    });

    // Decorative Top Accent Lines
    page.drawLine({
      start: { x: width / 2 - 120, y: height - 70 },
      end: { x: width / 2 + 120, y: height - 70 },
      thickness: 1.5,
      color: darkGold,
    });
    page.drawLine({
      start: { x: width / 2 - 80, y: height - 76 },
      end: { x: width / 2 + 80, y: height - 76 },
      thickness: 0.5,
      color: gold,
    });

    // Main Header / Title
    const titleText = 'CERTIFICATE OF COMPLETION';
    const titleWidth = helveticaBold.widthOfTextAtSize(titleText, 40);
    page.drawText(titleText, {
      x: width / 2 - titleWidth / 2,
      y: height - 135,
      size: 40,
      font: helveticaBold,
      color: navyBlue,
    });

    // Subtitle
    const subtitleText = 'This proudly acknowledges that';
    const subtitleWidth = timesItalic.widthOfTextAtSize(subtitleText, 24);
    page.drawText(subtitleText, {
      x: width / 2 - subtitleWidth / 2,
      y: height - 200,
      size: 24,
      font: timesItalic,
      color: lightGray,
    });

    // User Name (Stand-out element)
    const userName = req.user.name || "Esteemed Student";
    const nameWidth = helveticaBold.widthOfTextAtSize(userName.toUpperCase(), 50);
    page.drawText(userName.toUpperCase(), {
      x: width / 2 - nameWidth / 2,
      y: height - 265,
      size: 50,
      font: helveticaBold,
      color: navyBlue,
    });

    // Ornate Underline for Name
    page.drawRectangle({
      x: width / 2 - nameWidth / 2 - 30, 
      y: height - 285,
      width: nameWidth + 60, 
      height: 2,
      color: gold,
    });
    page.drawRectangle({
      x: width / 2 - 20, 
      y: height - 287,
      width: 40, 
      height: 6,
      color: navyBlue,
    });

    // Connective Text
    const text2Text = 'has successfully completed the comprehensive program in';
    const text2Width = timesItalic.widthOfTextAtSize(text2Text, 20);
    page.drawText(text2Text, {
      x: width / 2 - text2Width / 2,
      y: height - 340,
      size: 20,
      font: timesItalic,
      color: lightGray,
    });

    // Course Title
    const courseTitle = course.title;
    let titleFontSize = 36;
    let courseTitleWidth = timesRoman.widthOfTextAtSize(courseTitle, titleFontSize);
    if (courseTitleWidth > width - 160) {
       titleFontSize = 26;
       courseTitleWidth = timesRoman.widthOfTextAtSize(courseTitle, titleFontSize);
    }
    page.drawText(courseTitle, {
      x: width / 2 - courseTitleWidth / 2,
      y: height - 400,
      size: titleFontSize,
      font: timesRoman,
      color: navyBlue,
    });

    // ---------------------------------------------------------------- //
    // FOOTER: Signatures and Authentic Seal
    // ---------------------------------------------------------------- //
    
    // Gold Seal (Center Bottom)
    const sealX = width / 2;
    const sealY = 110;
    
    // Outer seal circle
    page.drawEllipse({
      x: sealX, y: sealY,
      xScale: 35, yScale: 35,
      color: gold,
      borderWidth: 2,
      borderColor: darkGold,
    });
    // Inner seal circle
    page.drawEllipse({
      x: sealX, y: sealY,
      xScale: 28, yScale: 28,
      color: bgColor,
      borderWidth: 1,
      borderColor: darkGold,
    });
    
    // Star/Text inside seal
    const sealText1 = 'AWARD';
    const sealText2 = 'OF EXCELLENCE';
    const st1W = helveticaBold.widthOfTextAtSize(sealText1, 8);
    const st2W = helveticaBold.widthOfTextAtSize(sealText2, 6);
    page.drawText(sealText1, {
      x: sealX - st1W / 2, y: sealY + 2, size: 8, font: helveticaBold, color: navyBlue
    });
    page.drawText(sealText2, {
      x: sealX - st2W / 2, y: sealY - 8, size: 6, font: helveticaBold, color: darkGold
    });


    // Left side: Date Signature Area
    const bottomY = 115;
    const completionDate = progress.completedAt 
      ? new Date(progress.completedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) 
      : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      
    page.drawLine({
      start: { x: 100, y: bottomY },
      end: { x: 300, y: bottomY },
      thickness: 1,
      color: navyBlue,
    });
    
    const dateLabelText = 'Date of Completion';
    const dateLabelWidth = helvetica.widthOfTextAtSize(dateLabelText, 12);
    page.drawText(dateLabelText, {
      x: 200 - (dateLabelWidth / 2),
      y: bottomY - 20,
      size: 12,
      font: helvetica,
      color: lightGray,
    });
    
    const dateValWidth = timesRoman.widthOfTextAtSize(completionDate, 18);
    page.drawText(completionDate, {
      x: 200 - (dateValWidth / 2),
      y: bottomY + 5,
      size: 18,
      font: timesRoman,
      color: navyBlue,
    });

    // Right side: Platform Signature Area
    page.drawLine({
      start: { x: width - 300, y: bottomY },
      end: { x: width - 100, y: bottomY },
      thickness: 1,
      color: navyBlue,
    });
    
    // The Signature (Cursive/Italic text ON the line)
    const signatureText = 'Stribble';
    const sigTextWidth = timesItalic.widthOfTextAtSize(signatureText, 32);
    page.drawText(signatureText, {
      x: (width - 200) - (sigTextWidth / 2),
      y: bottomY + 5,
      size: 32,
      font: timesItalic,
      color: navyBlue,
    });

    // The Label directly below the line
    const issuerLabel = 'Authorized Signature';
    const issuerLabelWidth = helvetica.widthOfTextAtSize(issuerLabel, 12);
    page.drawText(issuerLabel, {
      x: (width - 200) - (issuerLabelWidth / 2),
      y: bottomY - 20,
      size: 12,
      font: helvetica,
      color: lightGray,
    });

    // Custom domain site
    const siteLabel = 'stribble.site';
    const siteLabelWidth = helveticaBold.widthOfTextAtSize(siteLabel, 10);
    page.drawText(siteLabel, {
      x: (width - 200) - (siteLabelWidth / 2),
      y: bottomY - 35,
      size: 10,
      font: helveticaBold,
      color: darkGold,
    });

    const pdfBytes = await pdfDoc.save();

    res.setHeader('Content-Type', 'application/pdf');
    // We serve it inline so they can preview it before saving
    res.setHeader('Content-Disposition', `inline; filename="${userName.replace(/\s+/g, '_')}_Certificate.pdf"`);
    res.end(Buffer.from(pdfBytes));

  } catch (err) {
    console.error("Certificate generation error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// 🔒 SECURE STREAM ROUTE — serves the raw PDF (authenticated, purchase-verified)
router.get("/stream/:courseId", protectUser, async (req, res) => {
  try {
    const userId = req.user._id; 
    
    // 1. Verify Purchase
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
router.get("/info/:courseId", protectUser, async (req, res) => {
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

    const course = await Course.findById(req.params.courseId).select('+totalPages');
    if (!course) return res.status(404).json({ success: false, message: "Course not found" });

    res.json({ success: true, totalPages: course.totalPages });
  } catch (err) {
    console.error("Course info error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});


export default router;