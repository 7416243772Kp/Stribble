// routes/analyticsRoutes.js
import express from "express";
import Order from "../models/order.js";
import { authAdmin } from "../middleware/authAdmin.js";
import { ipWhitelist } from "../middleware/ipWhitelist.js";

const router = express.Router();

// Middleware: only admin can access
router.use(authAdmin, ipWhitelist);

// Sales summary (today, week, month)
router.get("/sales-summary", async (req, res) => {
  try {
    const now = new Date();

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [today, week, month] = await Promise.all([
      Order.countDocuments({ createdAt: { $gte: todayStart }, status: "completed" }),
      Order.countDocuments({ createdAt: { $gte: weekStart }, status: "completed" }),
      Order.countDocuments({ createdAt: { $gte: monthStart }, status: "completed" }),
    ]);

    res.json({ success: true, today, week, month });
  } catch (err) {
    console.error("Sales summary error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Sales by coupon
router.get("/coupon-usage", async (req, res) => {
  try {
    const results = await Order.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: "$couponId", count: { $sum: 1 }, total: { $sum: "$ownerAmount" } } },
      { $sort: { count: -1 } },
    ]);

    res.json({ success: true, results });
  } catch (err) {
    console.error("Coupon usage error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Sales by course
router.get("/course-sales", async (req, res) => {
  try {
    const results = await Order.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: "$courseId", count: { $sum: 1 }, total: { $sum: "$ownerAmount" } } },
      { $sort: { count: -1 } },
    ]);

    res.json({ success: true, results });
  } catch (err) {
    console.error("Course sales error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
