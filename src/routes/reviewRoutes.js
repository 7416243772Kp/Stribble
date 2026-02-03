import express from "express";
import Review from "../models/Review.js";
import Payment from "../models/payment.js";
import mongoose from "mongoose";
import protectUser from "../middleware/authUser.js";

const router = express.Router();

// GET Top 5-Star Reviews (Across all courses)
router.get("/top", async (req, res) => {
    try {
        const reviews = await Review.find({ rating: 5 })
            .sort({ createdAt: -1 })
            .limit(20)
            .populate("courseId", "title"); // Only get title
        res.json({ success: true, reviews });
    } catch (err) {
        console.error("Error fetching top reviews:", err);
        res.status(500).json({ success: false, message: "Error fetching top reviews" });
    }
});

// GET Reviews for a specific course
router.get("/:courseId", async (req, res) => {
    try {
        const { courseId } = req.params;
        const reviews = await Review.find({ courseId }).sort({ createdAt: -1 });
        res.json({ success: true, reviews });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error fetching reviews" });
    }
});

// POST a new Review (VERIFIED BY ACCOUNT)
router.post("/", protectUser, async (req, res) => {
    try {
        const { courseId, rating, comment } = req.body;
        const user = req.user; // populated by protectUser

        if (!courseId) {
            return res.status(400).json({ success: false, message: "Course ID is required." });
        }

        // 1. CHECK OWNERSHIP
        const hasCourse = user.purchasedCourses.some(id => id.toString() === courseId);
        if (!hasCourse) {
            return res.status(403).json({
                success: false,
                message: "You must purchase this course to review it."
            });
        }

        // 2. CHECK EXISTING REVIEW (By User ID now, not just email)
        const existingReview = await Review.findOne({
            $or: [
                { userId: user._id, courseId: courseId }, // New check
                { userEmail: user.email, courseId: courseId } // Legacy check
            ]
        });

        if (existingReview) {
            return res.status(400).json({ success: false, message: "You have already reviewed this course." });
        }

        // 3. CREATE REVIEW
        const newReview = new Review({
            courseId,
            userId: user._id, // Link to account
            userName: user.name, // Use account name
            userEmail: user.email, // Use account email
            rating,
            comment
        });

        await newReview.save();
        res.status(201).json({ success: true, review: newReview });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// POST a Reply (Public interaction)
router.post("/:reviewId/reply", async (req, res) => {
    try {
        const { name, content } = req.body;
        const review = await Review.findById(req.params.reviewId);

        if (!review) return res.status(404).json({ success: false, message: "Review not found" });

        review.replies.push({ name, content });
        await review.save();

        res.json({ success: true, review });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error posting reply" });
    }
});

export default router;