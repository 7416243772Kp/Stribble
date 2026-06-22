import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Review from "../models/Review.js";
import User from "../models/User.js";
import Course from "../models/course.js";

const router = express.Router();

// Middleware to check if user is logged in (using JWT token from cookie)
const isAuthenticated = async (req, res, next) => {

  // Check the active JWT session. Passport sessions alone do not enforce the
  // single-device lock.
  const token = req.cookies?.user_token;

  
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      
      if (user) {
        // Check if this token matches the active session token
        if (
          user.activeSessionToken === User.hashSessionToken(token) &&
          User.isDeviceLockMatch(user, req.cookies?.device_id)
        ) {
          req.user = user;

          return next();
        } else {

        }
      }
    } catch (e) {

    }
  }
  

  return res.status(401).json({ success: false, message: "Unauthorized - Please login" });
};

// POST /api/reviews - Add a review
router.post("/", isAuthenticated, async (req, res) => {


  try {
    const { courseId, rating, comment } = req.body;
    const userId = req.user._id;

    // 1. Verify Purchase
    const user = await User.findById(userId);
    


    const hasPurchased = user.purchasedCourses.some(
      (c) => c.toString() === courseId || (c._id && c._id.toString() === courseId)
    );

    if (!hasPurchased) {

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
    // 5. Update Course Aggregates
    const aggResult = await Review.aggregate([
      { $match: { courseId: new mongoose.Types.ObjectId(courseId) } },
      { $group: { _id: null, avgRating: { $avg: "$rating" }, count: { $sum: 1 } } }
    ]);
    if (aggResult.length > 0) {
      await Course.findByIdAndUpdate(courseId, {
        averageRating: Number(aggResult[0].avgRating.toFixed(1)),
        reviewCount: aggResult[0].count
      });
    }

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

// GET /api/reviews/course/:courseId/stats - Get rating breakdown for a course
router.get("/course/:courseId/stats", async (req, res) => {
  try {
    const { courseId } = req.params;
    
    const statsResult = await Review.aggregate([
      { $match: { courseId: new mongoose.Types.ObjectId(courseId) } },
      { $group: {
          _id: "$rating",
          count: { $sum: 1 }
        }
      }
    ]);

    const totalReviews = statsResult.reduce((acc, curr) => acc + curr.count, 0);
    const avgRating = totalReviews === 0 
      ? 0 
      : statsResult.reduce((acc, curr) => acc + (curr._id * curr.count), 0) / totalReviews;

    const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    statsResult.forEach(item => {
      breakdown[item._id] = item.count;
    });

    res.json({
      success: true,
      stats: {
        totalReviews,
        avgRating: Number(avgRating.toFixed(1)),
        breakdown,
        percentages: {
          5: totalReviews ? Math.round((breakdown[5] / totalReviews) * 100) : 0,
          4: totalReviews ? Math.round((breakdown[4] / totalReviews) * 100) : 0,
          3: totalReviews ? Math.round((breakdown[3] / totalReviews) * 100) : 0,
          2: totalReviews ? Math.round((breakdown[2] / totalReviews) * 100) : 0,
          1: totalReviews ? Math.round((breakdown[1] / totalReviews) * 100) : 0,
        }
      }
    });

  } catch (error) {
    console.error("Course Review Stats Error:", error);
    res.status(500).json({ success: false, message: "Error fetching review stats" });
  }
});

// GET /api/reviews/:courseId - Get reviews for a course (paginated & filterable)
router.get("/:courseId", async (req, res) => {
  try {
    const { courseId } = req.params;
    const { rating, page = 1, onlyTop } = req.query;
    
    // Pagination parameters
    const limit = 50;
    const skip = (Number(page) - 1) * limit;

    const query = { courseId };
    if (rating) {
      query.rating = Number(rating);
    } else if (onlyTop === 'true') {
      // If onlyTop is requested, filter for 4 and 5 stars
      query.rating = { $gte: 4 };
    }
    
    const [reviews, totalCount] = await Promise.all([
      Review.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("userId", "name profilePicture"),
      Review.countDocuments(query)
    ]);

    res.json({ 
      success: true, 
      reviews,
      pagination: {
        totalReviews: totalCount,
        currentPage: Number(page),
        totalPages: Math.ceil(totalCount / limit),
        hasNextPage: skip + reviews.length < totalCount
      }
    });
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
