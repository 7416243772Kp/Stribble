//C:\Ebook\src\routes\couponRoutes.js
import express from "express";
import Coupon from "../models/coupon.js";
import Course from "../models/course.js";
import adminAuth from "../middleware/authAdmin.js";
import mongoose from "mongoose";

const router = express.Router();

// Middleware: protect all coupon routes
router.use(adminAuth);

// ===============================
// Create Coupon
// ===============================
router.post("/", async (req, res) => {
  try {
    const {
      code,
      courseId,
      discount,
      influencerUPI,
      ebookCreatorUPI,
      influencerCommission,
      ebookCreatorCommission,
      isDefault,
    } = req.body;

    // Validate course
    const course = await Course.findById(courseId);
    if (!course)
      return res.status(404).json({ success: false, message: "Course not found" });

    // FIX: Map frontend names to Schema names
    // Frontend sends: discount, influencerUPI, ebookCreatorUPI
    // Schema expects: discountValue, influencerUpi, creatorUpi
    const coupon = await Coupon.create({
      code: String(code).trim().toUpperCase(),
      courseId,
      
      // MAPPING FIXES:
      discountValue: Number(discount) || 0, 
      influencerUpi: influencerUPI || "N/A", 
      creatorUpi: ebookCreatorUPI || "N/A",
      influencerCommission: Number(influencerCommission) || 0,
      creatorCommission: Number(ebookCreatorCommission) || 0,
      
      isActive: true, // Schema uses isActive, not active
      isDefault: Boolean(isDefault),
    });

    res.json({ success: true, coupon });
  } catch (err) {
    console.error("Coupon create error:", err);
    // Send a clearer error message if it's a validation error
    if (err.name === "ValidationError") {
      return res.status(400).json({ success: false, message: err.message });
    }
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ===============================
// Edit Coupon
// ===============================
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      code,
      discount,
      influencerUPI,
      ebookCreatorUPI,
      influencerCommission,
      ebookCreatorCommission
    } = req.body;

    // Manually build update object to ensure mapping is correct
    const updateData = {};
    if (code) updateData.code = code;
    
    // Check if fields are present before updating (handle 0 correctly)
    if (discount !== undefined) updateData.discountValue = Number(discount);
    if (influencerCommission !== undefined) updateData.influencerCommission = Number(influencerCommission);
    if (ebookCreatorCommission !== undefined) updateData.creatorCommission = Number(ebookCreatorCommission);
    
    if (influencerUPI) updateData.influencerUpi = influencerUPI;
    if (ebookCreatorUPI) updateData.creatorUpi = ebookCreatorUPI;

    const coupon = await Coupon.findByIdAndUpdate(id, updateData, { new: true });
    
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
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid ID format" });
    }

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
// Validate Coupon (Checkout)
// ===============================
router.post("/validate", async (req, res) => {
  try {
    const { code, courseId } = req.body;
    if (!courseId) return res.status(400).json({ success: false, message: "courseId required" });

    if (!code || String(code).trim() === "") {
      return res.json({ success: true, coupon: null });
    }

    // Check isActive: true (matches Schema default)
    const coupon = await Coupon.findOne({ 
      code: code.trim().toUpperCase(), 
      courseId, 
      isActive: true 
    });

    if (!coupon) return res.status(400).json({ success: false, message: "Invalid coupon" });

    // Map back to frontend-friendly structure for checkout
    const responseCoupon = {
      id: coupon._id,
      code: coupon.code,
      discount: coupon.discountValue, // Send discountValue as discount
      influencerCommission: coupon.influencerCommission,
      ebookCreatorCommission: coupon.creatorCommission,
    };

    res.json({ success: true, coupon: responseCoupon });
  } catch (err) {
    console.error("Coupon validate error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET Single Coupon (For Editing)
router.get("/:id", async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });
    res.json({ success: true, coupon });
  } catch (err) {
    console.error("Fetch single coupon error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;