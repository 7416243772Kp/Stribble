// src/controllers/couponController.js
import Coupon from "../models/coupon.js";

// Create coupon
export const createCoupon = async (req, res) => {
  try {
    const { code, course, influencerUPI, creatorUPI, influencerCommission, creatorCommission, isDefault } = req.body;

    // Ensure only one default coupon exists
    if (isDefault) {
      await Coupon.updateMany({ isDefault: true }, { isDefault: false });
    }

    const newCoupon = new Coupon({
      code,
      course,
      influencerUPI,
      creatorUPI,
      
      influencerCommission,
      creatorCommission,
      isDefault,
    });

    await newCoupon.save();
    res.status(201).json(newCoupon);
  } catch (error) {
    res.status(500).json({ message: "Error creating coupon" });
  }
};

// Get all coupons
export const getCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find().populate("course");
    res.json(coupons);
  } catch (error) {
    res.status(500).json({ message: "Error fetching coupons" });
  }
};

// Get coupon by code
export const getCouponByCode = async (req, res) => {
  try {
    const coupon = await Coupon.findOne({ code: req.params.code }).populate("course");
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });
    res.json(coupon);
  } catch (error) {
    res.status(500).json({ message: "Error fetching coupon" });
  }
};

// Update coupon
export const updateCoupon = async (req, res) => {
  try {
    const updated = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ message: "Coupon not found" });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: "Error updating coupon" });
  }
};

// Delete coupon
export const deleteCoupon = async (req, res) => {
  try {
    const deleted = await Coupon.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Coupon not found" });
    res.json({ message: "Coupon deleted" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting coupon" });
  }
};
