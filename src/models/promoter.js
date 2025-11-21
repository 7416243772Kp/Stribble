// src/models/promoter.js
import mongoose from "mongoose";
import crypto from "crypto";

const promoterSchema = new mongoose.Schema({
  // unique short ref id used in ?ref=...
  refId: { type: String, required: true, unique: true, index: true },

  // human friendly
  name: { type: String, required: true },
  email: { type: String, default: "" },

  // UPI or payout details (store securely)
  upi: { type: String, default: "" },

  // optional coupon code assigned to promoter
  defaultCoupon: { type: String, default: "" },

  // status flags
  active: { type: Boolean, default: true },

  // tracking payouts/earnings
  payoutBalance: { type: Number, default: 0 },     // in rupees
  totalEarned: { type: Number, default: 0 },       // in rupees
  totalSales: { type: Number, default: 0 },        // count

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// helper: generate a short unique ref id
promoterSchema.statics.generateRefId = function(prefix = "prom") {
  // 6 hex chars -> fairly short but collision-resistant
  return `${prefix}_${crypto.randomBytes(3).toString("hex")}`;
};

// pre-save update timestamp
promoterSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model("Promoter", promoterSchema);
