//C:\Ebook\src\models\course.js
import mongoose from "mongoose";

const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    thumbnail: {
      type: String, // e.g. /uploads/thumbnail.png
      required: true
    },
    pdfFile: { 
      type: String, 
      required: true, 
      select: false // Keeps it hidden from public API calls
    },
    pageImages: {
      type: [String], // Array of image filenames: ["page-1.png", "page-2.png", ...]
      default: [],
      select: false // Hidden from public API
    },
    totalPages: {
      type: Number,
      default: 0
    },
    soldCount: {
      type: Number,
      default: 0
    },
    // optional: if you ever want to store category or tags later
    category: {
      type: String,
      default: "General",
    },
  },
  { timestamps: true }
);

// Mongoose model name should always be Capitalized (good practice)
export default mongoose.model("Course", courseSchema);
