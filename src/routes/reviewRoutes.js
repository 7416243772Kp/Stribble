import express from "express";
import jwt from "jsonwebtoken";
import Review from "../models/Review.js";
import User from "../models/User.js";

const router = express.Router();

// Middleware to check if user is logged in (using JWT token from cookie)
const isAuthenticated = async (req, res, next) => {
  console.log("🔐 [ReviewAPI] Checking authentication...");
  
  // First check for Passport session
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    console.log("✅ [ReviewAPI] Passport session found:", req.user._id);
    return next();
  }
  
  // Fallback to JWT token from cookie
  const token = req.cookies?.user_token;
  console.log("🔐 [ReviewAPI] Checking JWT token:", token ? "Token exists" : "No token");
  
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      
      if (user) {
        // Check if this token matches the active session token
        if (user.activeSessionToken === token) {
          req.user = user;
          console.log("✅ [ReviewAPI] JWT auth successful for user:", user._id);
          return next();
        } else {
          console.log("⚠️ [ReviewAPI] Token doesn't match active session");
        }
      }
    } catch (e) {
      console.log("❌ [ReviewAPI] JWT verification failed:", e.message);
    }
  }
  
  console.log("❌ [ReviewAPI] Authentication failed - no valid session or token");
  return res.status(401).json({ success: false, message: "Unauthorized - Please login" });
};

// POST /api/reviews - Add a review
router.post("/", isAuthenticated, async (req, res) => {
  // LOGGING START
  console.log("📥 [API] Review POST received");
  console.log("👉 User:", req.user ? req.user._id : "UNDEFINED (Auth Failed)");
  console.log("👉 Body:", req.body);
  // LOGGING END

  try {
    const { courseId, rating, comment } = req.body;
    const userId = req.user._id;

    // 1. Verify Purchase
    const user = await User.findById(userId);
    
    // LOGGING
    console.log("👉 Checking purchase for User:", user.email);
    console.log("👉 User Purchased Courses:", user.purchasedCourses);

    const hasPurchased = user.purchasedCourses.some(
      (c) => c.toString() === courseId || (c._id && c._id.toString() === courseId)
    );

    if (!hasPurchased) {
      console.warn("⛔ [API] User has not purchased this course.");
      return res.status(403).json({ success: false, message: "You must purchase this course to review it." });
    }

    // 2. Check existing review
    const existing = await Review.findOne({ courseId, userId });
    if (existing) {
       // Optional: Allow update? For now, reject.
       return res.status(400).json({ success: false, message: "You have already reviewed this course." });
    }

    // 3. Create Review
    // Use Google name if available, else local name
    const userName = user.name || "Learner";
    const userAvatar = user.profilePicture || null; // If you have this field

    const review = await Review.create({
      courseId,
      userId,
      userName,
      userAvatar,
      rating: Number(rating),
      comment
    });
    
    // 4. Add to User's reviewed list (to hide button)
    // Ensure reviewedCourses array exists
    if (!user.reviewedCourses) user.reviewedCourses = [];
    user.reviewedCourses.push(courseId);
    await user.save();
    
    console.log("✅ [API] Review created successfully");

    res.status(201).json({ success: true, review });

  } catch (error) {
    console.error("Post Review Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /api/reviews/top - Get random top reviews for homepage
router.get("/top", async (req, res) => {
  try {
    // Aggregation pipeline to get random 4 or 5 star reviews
    const reviews = await Review.aggregate([
      { $match: { rating: { $gte: 4 } } },
      { $sample: { size: 10 } }
    ]);

    // Populate manually since aggregate returns plain objects
    await Review.populate(reviews, { path: "courseId", select: "title thumbnail" });
    // User data is already in the review doc snapshot (userName), but we can populate to be sure if dynamic
    // But we designed the schema to store snapshot. Let's rely on snapshot for performance or populate if needed.
    // Schema has 'userName'.

    res.json({ success: true, reviews });
  } catch (error) {
    console.error("Top Reviews Error:", error);
    res.status(500).json({ success: false, message: "Error fetching top reviews" });
  }
});

// GET /api/reviews/:courseId - Get reviews for a course
router.get("/:courseId", async (req, res) => {
  try {
    const { courseId } = req.params;
    
    const reviews = await Review.find({ courseId })
      .sort({ createdAt: -1 })
      .populate("userId", "name profilePicture"); // Get latest user details if needed

    res.json({ success: true, reviews });
  } catch (error) {
    console.error("Get Course Reviews Error:", error);
    res.status(500).json({ success: false, message: "Error fetching reviews" });
  }
});

// POST /api/reviews/:id/reply - Admin reply (optional, keeping for completeness if admin features exist)
// You might want to protect this with Admin check
router.post("/:id/reply", async (req, res) => {
   // Implementation depends on if admin auth is available/passed
   // For now, minimal placeholder or omit if not requested.
   // Keeping it simple as user request focused on Buyer Flow.
   res.status(501).json({ message: "Not implemented yet" });
});

export default router;
