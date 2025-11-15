//C:\Ebook\src\routes\orderRoutes.js
import express from "express";
import Order from "../models/order.js";
import Coupon from "../models/coupon.js";
import Course from "../models/course.js";
import razorpay from "../config/razorpay.js";

const router = express.Router();

// ✅ Checkout Route (Generate Razorpay Order)
router.post("/checkout", async (req, res) => {
  try {
    const { email, courseId, couponCode } = req.body;

    // 1. Validate course
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    // 2. Validate coupon
    let coupon = null;
    if (couponCode) {
      coupon = await Coupon.findOne({ code: couponCode, courseId });
      if (!coupon) {
        return res.status(400).json({ error: "Invalid coupon for this course" });
      }
    }

    // 3. Calculate commission split
    const influencerCommission = coupon ? coupon.influencerCommission : 0;
    const ebookCreatorCommission = coupon ? coupon.ebookCreatorCommission : 0;
    const platformShare = course.price - influencerCommission - ebookCreatorCommission;

    // 4. Create order in DB (pending payment)
    const newOrder = new Order({
      email,
      courseId,
      couponCode: coupon ? coupon.code : "DEFAULT",
      totalAmount: course.price,
      influencerCommission,
      ebookCreatorCommission,
      platformShare,
      status: "pending",
    });

    await newOrder.save();

    // 5. Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: course.price, // Razorpay expects amount in paise
      currency: "INR",
      receipt: newOrder._id.toString(),
    });

    res.status(201).json({
      success: true,
      msg: "Order created, proceed to payment",
      order: newOrder,
      razorpayOrder,
      key: process.env.RAZORPAY_KEY_ID, 
    });
  } catch (error) {
    console.error("Checkout Error:", error);
    res.status(500).json({ error: "Error during checkout" });
  }
});

export default router;
