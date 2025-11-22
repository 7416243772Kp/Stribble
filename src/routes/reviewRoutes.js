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

// POST a new Review (WITH PAYMENT VERIFICATION)
router.post("/", async (req, res) => {
    try {
        const { courseId, name, email, paymentId, rating, comment } = req.body;

        // 1. VERIFICATION STEP
        // Check if a successful payment exists with this Email + Payment ID + Course
        const validPayment = await Payment.findOne({
            razorpay_payment_id: paymentId,
            email: email,
            courseId: courseId,
            status: "success"
        });

        if (!validPayment) {
            return res.status(401).json({
                success: false,
                message: "Verification failed. Invalid Payment ID or Email for this course."
            });
        }

        // 2. Check if already reviewed
        const existingReview = await Review.findOne({ paymentId, courseId });
        if (existingReview) {
            return res.status(400).json({ success: false, message: "You have already reviewed this course." });
        }

        // 3. Create Review
        const newReview = new Review({
            courseId,
            userName: name,
            userEmail: email,
            paymentId,
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