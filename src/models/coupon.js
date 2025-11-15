// src/models/coupon.js
import mongoose from "mongoose";

const CouponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },

  // Discount shown to buyer (₹)
  discount: { type: Number, default: 0, min: 0 },

  // Payout details (optional)
  influencerUPI: { type: String, default: "" },
  ebookCreatorUPI: { type: String, default: "" },

  // Fixed commissions (₹)
  influencerCommission: { type: Number, default: 0, min: 0 },
  ebookCreatorCommission: { type: Number, default: 0, min: 0 },

  isDefault: { type: Boolean, default: false },
  active: { type: Boolean, default: true },

  maxUses: { type: Number, default: 0 }, // 0 = unlimited
  uses: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now },
});

// Ensure the same code can’t be reused across different courses unexpectedly
CouponSchema.index({ code: 1, courseId: 1 }, { unique: true });

export default mongoose.model("Coupon", CouponSchema);