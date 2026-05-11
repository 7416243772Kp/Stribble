// src/models/order.js
import mongoose from "mongoose";

const OrderSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  couponId: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon", required: false, default: null },

  buyerEmail: { type: String, required: true },

  // Commission split (₹)
  influencerCommission: { type: Number, required: true, default: 0 },
  ebookCreatorCommission: { type: Number, required: true, default: 0 },
  ownerAmount: { type: Number, required: true, default: 0 },

  // Payment provider details
  paymentProvider: { type: String, enum: ["cashfree", "razorpay", "manual"], default: "cashfree", index: true },
  paymentOrderId: { type: String, index: true },

  // Cashfree details
  cashfreeOrderId: { type: String, index: true },
  cashfreeCfOrderId: { type: String },
  cashfreePaymentSessionId: { type: String },
  cashfreePaymentId: { type: String },
  cashfreeOrderStatus: { type: String },
  cashfreePaymentStatus: { type: String },
  cashfreeBankReference: { type: String },
  cashfreePaymentGroup: { type: String },

  // Legacy Razorpay details retained for historical orders
  razorpayOrderId: { type: String, index: true },
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
  emailSentAt: { type: Date }, // <--- NEW: Tracks exactly when the email went out

  createdAt: { type: Date, default: Date.now, index: true },
  paidAt: { type: Date },

  // Download History for Disputes
  downloadHistory: [{
    timestamp: { type: Date, default: Date.now },
    ip: String,
    userAgent: String
  }],

  referrer: { type: String, default: null, index: true }, 
  promoterCommission: { type: Number, default: 0 },
  promoterPaid: { type: Boolean, default: false },

  // Refund Tracking
  refundStatus: { 
    type: String, 
    enum: ["none", "pending", "processed", "failed"], 
    default: "none" 
  },
  refundId: { type: String },
  refundedAt: { type: Date },

  influencerPayoutStatus: { 
    type: String, 
    enum: ["pending", "completed", "failed", "not_applicable"], 
    default: "pending" 
  },
  creatorPayoutStatus: { 
    type: String, 
    enum: ["pending", "completed", "failed", "not_applicable"], 
    default: "pending" 
  },
  influencerTransferId: { type: String },
  creatorTransferId: { type: String },
});

// Indexes for analytics
OrderSchema.index({ couponId: 1 });
OrderSchema.index({ courseId: 1 });

export default mongoose.model("Order", OrderSchema);
