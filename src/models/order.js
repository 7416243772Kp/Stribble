// src/models/order.js
import mongoose from "mongoose";

const OrderSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  couponId: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon", required: true },

  buyerEmail: { type: String, required: true },

  // Commission split (₹)
  influencerCommission: { type: Number, required: true, default: 0 },
  ebookCreatorCommission: { type: Number, required: true, default: 0 },
  ownerAmount: { type: Number, required: true, default: 0 },

  // Razorpay details
  razorpayOrderId: { type: String, required: true, index: true },
  razorpayPaymentId: { type: String },
  razorpaySignature: { type: String },

  status: {
    type: String,
    enum: ["pending", "completed", "failed"],
    default: "pending",
    index: true,
  },

  // Email delivery tracking
  emailSent: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now, index: true },
  paidAt: { type: Date },
});

// Indexes for analytics
OrderSchema.index({ couponId: 1 });
OrderSchema.index({ courseId: 1 });

export default mongoose.model("Order", OrderSchema);