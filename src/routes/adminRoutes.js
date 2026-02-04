//C:\Ebook\src\routes\adminRoutes.js
import express from "express";
import Order from "../models/order.js";
import Course from "../models/course.js";
import Coupon from "../models/coupon.js";
import Contact from '../models/Contact.js';

const router = express.Router();



// ===============================
// Dashboard Stats
// ===============================
router.get("/stats", async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday start
    weekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // Last Month Calculation
    const lastMonthStart = new Date();
    lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
    lastMonthStart.setDate(1);
    lastMonthStart.setHours(0, 0, 0, 0);

    const lastMonthEnd = new Date();
    lastMonthEnd.setDate(1);
    lastMonthEnd.setHours(0, 0, 0, 0); // Start of current month is end of last month

    // Helper for summing total amount
    const totalAmountExpr = { $add: ["$ownerAmount", "$influencerCommission", "$ebookCreatorCommission"] };

    const [
      coursesCount,
      couponsCount,
      salesCount,
      todaySales,
      weekSales,
      monthSales,
      lastMonthSales,
      perCourseSales,
      perCouponSales
    ] = await Promise.all([
      Course.countDocuments(),
      Coupon.countDocuments(),
      Order.countDocuments({ status: "completed" }),
      
      // Today
      Order.aggregate([
        { $match: { status: "completed", paidAt: { $gte: todayStart } } },
        { $group: { _id: null, total: { $sum: totalAmountExpr }, count: { $sum: 1 } } }
      ]),

      // This Week
      Order.aggregate([
        { $match: { status: "completed", paidAt: { $gte: weekStart } } },
        { $group: { _id: null, total: { $sum: totalAmountExpr } } }
      ]),

      // This Month
      Order.aggregate([
        { $match: { status: "completed", paidAt: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: totalAmountExpr } } }
      ]),

      // Last Month
      Order.aggregate([
        { $match: { status: "completed", paidAt: { $gte: lastMonthStart, $lt: lastMonthEnd } } },
        { $group: { _id: null, total: { $sum: totalAmountExpr } } }
      ]),

      // Course Sales Total
      Order.aggregate([
        { $match: { status: "completed" } },
        { $group: { _id: "$courseId", total: { $sum: totalAmountExpr }, count: { $sum: 1 } } },
        { $lookup: { from: "courses", localField: "_id", foreignField: "_id", as: "course" } },
        { $unwind: "$course" },
        { $project: { title: "$course.title", total: 1, count: 1 } }
      ]),

      // Coupon Sales Total
      Order.aggregate([
        { $match: { status: "completed", couponId: { $ne: null } } },
        { $group: { _id: "$couponId", total: { $sum: totalAmountExpr }, count: { $sum: 1 } } },
        { $lookup: { from: "coupons", localField: "_id", foreignField: "_id", as: "coupon" } },
        { $unwind: "$coupon" },
        { $project: { code: "$coupon.code", total: 1, count: 1 } },
        { $sort: { total: -1 } }
      ])
    ]);

    const stats = {
      courses: coursesCount,
      coupons: couponsCount,
      sales: salesCount,
      todaySales: todaySales[0]?.total || 0,
      todayCount: todaySales[0]?.count || 0,
      weekSales: weekSales[0]?.total || 0,
      monthSales: monthSales[0]?.total || 0,
      lastMonthSales: lastMonthSales[0]?.total || 0,
      perCourseSales,
      perCouponSales
    };

    res.json({ success: true, stats });
  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ===============================
// Sales Analytics
// ===============================
router.get("/sales", async (req, res) => {
  try {
    const dailySales = await Order.aggregate([
      { $match: { status: "completed" } },
      {
        $group: {
          _id: {
            year: { $year: "$paidAt" },
            month: { $month: "$paidAt" },
            day: { $dayOfMonth: "$paidAt" },
          },
          total: { $sum: "$ownerAmount" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);

    const salesPerCourse = await Order.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: "$courseId", totalSales: { $sum: "$ownerAmount" }, count: { $sum: 1 } } },
      {
        $lookup: {
          from: "courses",
          localField: "_id",
          foreignField: "_id",
          as: "course",
        },
      },
      { $unwind: "$course" },
      { $project: { courseTitle: "$course.title", totalSales: 1, count: 1 } },
    ]);

    const couponUsage = await Order.aggregate([
      { $match: { status: "completed", couponId: { $ne: null } } },
      {
        $group: {
          _id: "$couponId",
          usageCount: { $sum: 1 },
          totalInfluencerCommission: { $sum: "$influencerCommission" },
          totalEbookCommission: { $sum: "$ebookCreatorCommission" },
        },
      },
      {
        $lookup: {
          from: "coupons",
          localField: "_id",
          foreignField: "_id",
          as: "coupon",
        },
      },
      { $unwind: "$coupon" },
      { $project: { code: "$coupon.code", usageCount: 1, totalInfluencerCommission: 1, totalEbookCommission: 1 } },
    ]);

    res.json({ success: true, dailySales, salesPerCourse, couponUsage });
  } catch (err) {
    console.error("Sales analytics error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get('/messages', async (req, res) => {
    try {
        console.log("👉 Admin fetching messages...");
        // Fetch messages, newest first
        const messages = await Contact.find().sort({ createdAt: -1 });
        console.log(`✅ Found ${messages.length} messages.`);
        res.json(messages);
    } catch (error) {
        console.error("❌ Error fetching messages:", error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ===============================
// Refund Logic
// ===============================
import User from "../models/User.js";
import Razorpay from "razorpay";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// 1. GET /api/admin/user-orders-by-email?email=...
// Retrieves all completed courses for a specific email
router.get("/user-orders-by-email", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ success: false, message: "Email is required" });

    const orders = await Order.find({ 
      buyerEmail: new RegExp(email, 'i'), 
      status: "completed" 
    }).populate("courseId", "title price");

    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: "Search failed" });
  }
});

// 2. POST /api/admin/process-refund
router.post("/process-refund", async (req, res) => {
  try {
    const { orderId } = req.body; // The Mongo ID
    const order = await Order.findById(orderId);

    if (!order || order.status !== "completed") {
      return res.status(404).json({ success: false, message: "Valid order not found" });
    }

    if (order.refundStatus === "processed") {
        return res.status(400).json({ success: false, message: "Order already refunded" });
    }

    // Revoke course access from User model
    if (order.buyerEmail) {
        await User.findOneAndUpdate(
            { email: order.buyerEmail },
            { $pull: { purchasedCourses: order.courseId } }
        );
    }

    // Process refund via Razorpay (Paise)
    const refundAmount = Math.round((order.ownerAmount + (order.influencerCommission || 0) + (order.ebookCreatorCommission || 0)) * 100);
    
    const refund = await razorpay.payments.refund(order.razorpayPaymentId, {
      amount: refundAmount,
      notes: { reason: "Refund requested by student via email" }
    });

    // Update order status
    order.refundStatus = "processed";
    order.refundId = refund.id;
    order.refundedAt = new Date();
    // order.status = "failed"; // Optional: Mark strictly as failed, or keep as completed but refunded. User code suggested 'failed'.
    // Sticking to "completed" but with refundStatus="processed" is safer for analytics usually, but let's follow user guidance if specific.
    // User code said: order.status = "failed"; 
    order.status = "failed"; // Using "failed" as it is a valid enum value.

    await order.save();

    res.json({ success: true, message: "Refund processed and access revoked", refundId: refund.id });
  } catch (err) {
    console.error("Refund error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
