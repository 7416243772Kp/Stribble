// routes/paymentRoutes.js
import express from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import mongoose from "mongoose";
import Order from "../models/order.js";
import Coupon from "../models/coupon.js";
import Course from "../models/course.js";
import { sendPaymentEmail } from "../util/email.js";

const router = express.Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// --------------------
// Create Razorpay Order
// --------------------
router.post("/order", async (req, res) => {
  try {
    const { amount, courseId, couponCode, email } = req.body;

    if (!amount || !courseId || !couponCode || !email) {
      return res.status(400).json({ success: false, message: "Missing fields" });
    }

    // Validate course
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found" });
    }

    // Validate coupon
    const coupon = await Coupon.findOne({
      code: couponCode,
      courseId: new mongoose.Types.ObjectId(courseId),
    });
    if (!coupon) {
      return res.status(400).json({ success: false, message: "Invalid coupon for this course" });
    }

    // Compute commissions (₹, not paise)
    const influencerCommission = coupon.influencerCommission;
    const ebookCommission = coupon.ebookCommission;
    const ownerAmount = amount - influencerCommission - ebookCommission;

    if (ownerAmount < 0) {
      return res.status(400).json({ success: false, message: "Commission exceeds price" });
    }

    // Create Razorpay order (paise)
    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
    });

    // Save order in DB
    await Order.create({
      courseId,
      couponId: coupon._id,
      buyerEmail: email,
      influencerCommission,
      ebookCreatorCommission: ebookCommission,
      ownerAmount,
      status: "pending",
      razorpayOrderId: order.id,
      createdAt: new Date(),
    });

    // Send to client
    res.json({
      success: true,
      orderId: order.id,
      amountPaise: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID, // ✅ safe to expose
    });
  } catch (err) {
    console.error("Order creation failed:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// --------------------
// Verify Payment + Send Course Email
// --------------------
router.post("/verify", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: "Missing payment fields" });
    }

    // Signature check
    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const expectedSignature = hmac.digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }

    // Mark order as completed
    const order = await Order.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      {
        status: "completed",
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        paidAt: new Date(),
      },
      { new: true }
    ).populate("courseId"); // ✅ get course details

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const course = order.courseId;
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found" });
    }

    // ✅ Send course email with Drive link
    await sendPaymentEmail({
      to: order.buyerEmail,
      customerName: order.buyerEmail.split("@")[0], // fallback: before @
      courseName: course.title,
      amount: order.influencerCommission + order.ebookCreatorCommission + order.ownerAmount,
      orderId: order._id,
      paymentId: order.razorpayPaymentId,
      dateTime: new Date(order.paidAt).toLocaleString(),
      downloadLink: course.driveLink, // ✅ Google Drive link stored in course
      supportEmail: "support@mademycourse.online",
    });

    res.json({ success: true, message: "Payment verified & email sent", order });
  } catch (err) {
    console.error("Payment verification failed:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
