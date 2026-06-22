import mongoose from 'mongoose';
import { encrypt, decrypt } from '../utils/crypto.js';

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  discountType: { type: String, enum: ['fixed'], default: 'fixed' },
  discountValue: { type: Number, required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
  
  // Automated Payout Fields
  influencerPayoutMethod: { type: String, enum: ['upi', 'bank'], default: 'upi' },
  influencerUpi: { type: String, set: encrypt, get: decrypt }, 
  influencerBankAccount: { type: String },
  influencerIFSC: { type: String },
  influencerCommission: { type: Number, required: true },
  
  creatorPayoutMethod: { type: String, enum: ['upi', 'bank'], default: 'upi' },
  creatorUpi: { type: String, set: encrypt, get: decrypt }, 
  creatorBankAccount: { type: String },
  creatorIFSC: { type: String },
  creatorCommission: { type: Number, required: true },

  usageCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  expiryDate: { type: Date },
  createdAt: { type: Date, default: Date.now }
}, {
  toJSON: { getters: true },
  toObject: { getters: true },
});

export default mongoose.model('Coupon', couponSchema);
