import mongoose from "mongoose";

const courseProgressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    maxPageReached: { type: Number }, 
    visitedPages: {
      type: [Number],
      default: [1]
    },
    isCompleted: {
      type: Boolean,
      default: false
    },
    completedAt: {
      type: Date
    },
    lastAccessed: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);


courseProgressSchema.index({ userId: 1, courseId: 1 }, { unique: true });

export default mongoose.model("CourseProgress", courseProgressSchema);
