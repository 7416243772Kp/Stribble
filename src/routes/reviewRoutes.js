import express from "express";
import Review from "../models/Review.js";
import Payment from "../models/payment.js";
import mongoose from "mongoose";

const router = express.Router();

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

// POST a new Review (VERIFIED BY EMAIL ONLY)
router.post("/", async (req, res) => {
    try {
        // Removed paymentId from destructuring
        const { courseId, name, email, rating, comment } = req.body;

        if (!email || !courseId) {
            return res.status(400).json({ success: false, message: "Email and Course ID are required." });
        }

        // 1. VERIFICATION STEP
        // Check if a successful payment exists with this Email + Course
        const validPayment = await Payment.findOne({
            email: email,
            courseId: courseId,
            status: "success"
        });

        if (!validPayment) {
            return res.status(401).json({
                success: false,
                message: "Verification failed. No purchase found for this email."
            });
        }

        // 2. Check if already reviewed by this email
        const existingReview = await Review.findOne({ userEmail: email, courseId });
        if (existingReview) {
            return res.status(400).json({ success: false, message: "You have already reviewed this course." });
        }

        // 3. Create Review
        const newReview = new Review({
            courseId,
            userName: name,
            userEmail: email,
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