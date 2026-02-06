import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema({
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  userName: {
    type: String,
    required: true,
    default: "Anonymous" 
  },
  userAvatar: {
    type: String
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  replies: [{
     name: String,
     content: String,
     createdAt: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
});

// Prevent multiple reviews per user per course
reviewSchema.index({ courseId: 1, userId: 1 }, { unique: true });

export default mongoose.model("Review", reviewSchema);
