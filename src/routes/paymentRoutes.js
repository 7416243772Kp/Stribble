//C:\Ebook\src\routes\paymentRoutes.js
import express from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import mongoose from "mongoose";
import Order from "../models/order.js";
import Coupon from "../models/coupon.js";
import Course from "../models/course.js";
import { sendPaymentEmail } from "../utils/email.js";

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

    // Validate coupon (normalize code to uppercase like your schema)
    const coupon = await Coupon.findOne({
      code: couponCode.toUpperCase(),
      courseId: new mongoose.Types.ObjectId(courseId),
    });
    if (!coupon) {
      return res.status(400).json({ success: false, message: "Invalid coupon for this course" });
    }

    // compute commissions (coerce to Number)
    const influencerCommission = Number(coupon.influencerCommission || 0);
    const ebookCreatorCommission = Number(coupon.ebookCreatorCommission || 0);
    const ownerAmount = Number(amount) - influencerCommission - ebookCreatorCommission;

    if (ownerAmount < 0) {
      return res.status(400).json({ success: false, message: "Commission exceeds price" });
    }

    // Save new Order
    await Order.create({
      courseId,
      couponId: coupon._id,
      buyerEmail: email,
      influencerCommission,
      ebookCreatorCommission,
      ownerAmount,
      status: "pending",
      razorpayOrderId: razorpayOrder.id,
      createdAt: new Date(),
    });

    // Send to client
    res.json({
      success: true,
      orderId: razorpayOrder.id,
      amountPaise: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID, // safe to expose
      dbOrderId: createdOrder._id,
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

    // Mark order as completed and populate course with hidden field
    const order = await Order.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      {
        status: "completed",
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        paidAt: new Date(),
      },
      { new: true }
    ).populate({ path: "courseId", select: "+googleDriveLink title" }); // include hidden link and title

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const course = order.courseId;
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found" });
    }

    // compute amount (reconstruct from order fields you stored)
    const totalAmount =
      (order.influencerCommission || 0) +
      (order.ebookCreatorCommission || 0) +
      (order.ownerAmount || 0);

    // Use the correct field name: googleDriveLink
    const googleDriveLink = course.googleDriveLink; // present due to populate select
    console.log("Resolved googleDriveLink:", googleDriveLink);

    // Send course email (try/catch so payment still succeeds even if email fails)
    let emailOk = false;
    try {
      await sendPaymentEmail({
        to: order.buyerEmail,
        customerName: order.buyerEmail.split("@")[0],
        courseName: course.title,
        amount: totalAmount,
        orderId: order._id,
        paymentId: order.razorpayPaymentId,
        dateTime: new Date(order.paidAt).toLocaleString(),
        downloadLink: googleDriveLink,
        supportEmail: "support@stribble.site",
      });
      emailOk = true;
    } catch (e) {
      console.error("Email failed:", e);
    }

    // persist emailSent flag and ensure order saved
    order.emailSent = emailOk;
    await order.save();

    // IMPORTANT: increment coupon uses only after successful payment completion
    if (order.couponId) {
      try {
        await Coupon.findByIdAndUpdate(order.couponId, { $inc: { uses: 1 } });
      } catch (incErr) {
        console.error("Failed to increment coupon.uses:", incErr);
      }
    }

    // final response
    return res.json({ success: true, message: "Payment verified", emailSent: emailOk, order });
  } catch (err) {
    console.error("Payment verification failed:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
