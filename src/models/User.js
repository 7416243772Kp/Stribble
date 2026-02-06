import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String }, // Optional (if using Google only)
  googleId: { type: String },
  name: { type: String },
  // 🔒 SECURITY FIELDS
  purchasedCourses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
  reviewedCourses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
  activeSessionToken: { type: String } // Stores the ONLY valid login token
}, { timestamps: true });

export default mongoose.model('User', userSchema);
