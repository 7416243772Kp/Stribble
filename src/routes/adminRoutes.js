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

export default router;
