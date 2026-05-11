//C:\Ebook\src\models\payment.js
import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  email: { type: String, required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  amount: { type: Number, required: true },
  provider: { type: String, enum: ["cashfree", "razorpay", "manual"], default: "cashfree", index: true },
  provider_order_id: { type: String, index: true },
  provider_payment_id: { type: String },

  // Cashfree payment fields
  cashfree_order_id: { type: String, index: true },
  cashfree_cf_order_id: { type: String },
  cashfree_payment_id: { type: String },
  cashfree_order_status: { type: String },
  cashfree_payment_status: { type: String },
  cashfree_bank_reference: { type: String },

  // Legacy Razorpay fields retained for historical transactions
  razorpay_order_id: { type: String },
  razorpay_payment_id: { type: String },
  razorpay_signature: { type: String },
  status: { type: String, enum: ["pending", "success", "failed"], default: "success" },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Payment", paymentSchema);
