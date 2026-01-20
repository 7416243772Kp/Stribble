import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  discountType: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
  discountValue: { type: Number, required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
  
  // Automated Payout Fields
  influencerUpi: { type: String, required: true },
  creatorUpi: { type: String, required: true },
  influencerCommission: { type: Number, required: true }, // Amount in ₹
  creatorCommission: { type: Number, required: true },    // Amount in ₹

  usageCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  expiryDate: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Coupon', couponSchema);