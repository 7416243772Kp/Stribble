//C:\Ebook\src\routes\couponRoutes.js
import express from "express";
import Coupon from "../models/coupon.js";
import Course from "../models/course.js";
import adminAuth from "../middleware/authAdmin.js";

const router = express.Router();

// Middleware: protect all coupon routes
router.use(adminAuth);


router.post("/", async (req, res) => {
  try {
    const {
      code,
      courseId,
      discount = 0,
      influencerUPI,
      influencerUpi,
      ebookCreatorUPI,
      ebookCreatorUpi,
      influencerCommission = 0,
      ebookCreatorCommission = 0,
      isDefault = false,
    } = req.body;

    // Validate course
    const course = await Course.findById(courseId);
    if (!course)
      return res.status(404).json({ success: false, message: "Course not found" });

    const coupon = await Coupon.create({
      code: String(code).trim().toUpperCase(),
      courseId,
      discount: Number(discount) || 0,
      influencerUPI: influencerUPI || influencerUpi || "",
      ebookCreatorUPI: ebookCreatorUPI || ebookCreatorUpi || "",
      influencerCommission: Number(influencerCommission) || 0,
      ebookCreatorCommission: Number(ebookCreatorCommission) || 0,
      isDefault: Boolean(isDefault),
    });

    res.json({ success: true, coupon });
  } catch (err) {
    console.error("Coupon create error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ===============================
// Edit Coupon
// ===============================
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const coupon = await Coupon.findByIdAndUpdate(id, updates, { new: true });
    if (!coupon)
      return res.status(404).json({ success: false, message: "Coupon not found" });

    res.json({ success: true, coupon });
  } catch (err) {
    console.error("Coupon update error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ===============================
// Delete Coupon
// ===============================
router.delete("/:id", async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon)
      return res.status(404).json({ success: false, message: "Coupon not found" });
    res.json({ success: true, message: "Coupon deleted" });
  } catch (err) {
    console.error("Coupon delete error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ===============================
// Get All Coupons
// ===============================
router.get("/", async (req, res) => {
  try {
    const coupons = await Coupon.find()
      .populate("courseId", "title price")
      .sort({ createdAt: -1 });
    res.json({ success: true, coupons });
  } catch (err) {
    console.error("Fetch coupons error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ===============================
// Validate Coupon (used in checkout)
// ===============================
router.post("/validate", async (req, res) => {
  try {
    const { code, courseId } = req.body;
    if (!courseId) return res.status(400).json({ success: false, message: "courseId required" });

    if (!code || String(code).trim() === "") {
      // No code: return success with null coupon (no discount)
      return res.json({ success: true, coupon: null });
    }

    const coupon = await Coupon.findOne({ code: code.trim().toUpperCase(), courseId, active: true });
    if (!coupon) return res.status(400).json({ success: false, message: "Invalid coupon" });
    res.json({ success: true, coupon });
  } catch (err) {
    console.error("Coupon validate error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


export default router;
