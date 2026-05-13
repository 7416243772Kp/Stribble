import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  discountType: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
  discountValue: { type: Number, required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
  
  // Automated Payout Fields
  influencerPayoutMethod: { type: String, enum: ['upi', 'bank'], default: 'upi' },
  influencerUpi: { type: String }, 
  influencerBankAccount: { type: String },
  influencerIFSC: { type: String },
  influencerCommission: { type: Number, required: true }, // Amount in ₹
  
  creatorPayoutMethod: { type: String, enum: ['upi', 'bank'], default: 'upi' },
  creatorUpi: { type: String }, 
  creatorBankAccount: { type: String },
  creatorIFSC: { type: String },
  creatorCommission: { type: Number, required: true },    // Amount in ₹

  usageCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  expiryDate: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Coupon', couponSchema);