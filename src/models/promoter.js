// src/models/promoter.js
import mongoose from "mongoose";
import crypto from "crypto";

const promoterSchema = new mongoose.Schema({
  refId: { type: String, required: true, unique: true, index: true }, // The Coupon Code
  name: { type: String, required: true },
  email: { type: String, required: true },
  
  // Commission logic pulled from Admin Panel setup
  promoterUpi: { type: String, required: true }, 
  creatorUpi: { type: String, required: true }, 
  promoterCommission: { type: Number, default: 0 }, // Amount in Rupees per sale
  creatorCommission: { type: Number, default: 0 },  // Amount in Rupees per sale

  active: { type: Boolean, default: true },
  totalEarned: { type: Number, default: 0 },
  totalSales: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

promoterSchema.statics.generateRefId = function(prefix = "SAVE") {
  return `${prefix}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
};

promoterSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model("Promoter", promoterSchema);