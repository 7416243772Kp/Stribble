// src/models/promoterPayout.js
import mongoose from "mongoose";

const promoterPayoutSchema = new mongoose.Schema({
  promoterRefId: { type: String, required: true, index: true },
  promoterId: { type: mongoose.Schema.Types.ObjectId, ref: "Promoter", default: null },
  amount: { type: Number, required: true }, // rupees
  currency: { type: String, default: "INR" },
  method: { type: String, default: "manual" }, // manual | cashfree | bank
  notes: { type: String, default: "" },
  paidBy: { type: String, default: "" }, // admin email or id that executed payout
  paidAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("PromoterPayout", promoterPayoutSchema);
