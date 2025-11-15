// src/routes/adminRoutes.js
import express from "express";
import Order from "../models/order.js";
import Course from "../models/course.js";
import Coupon from "../models/coupon.js";
import { sendPaymentEmail } from "../utils/email.js";

const router = express.Router();

// ===============================
// Failed Emails Management
// ===============================

// Get all failed emails
router.get("/failed-emails", async (req, res) => {
  try {
    const failedOrders = await Order.find({
      emailSent: false,
      status: "completed",
    }).populate("courseId");

    res.json({ success: true, failedOrders });
  } catch (err) {
    console.error("Fetch failed emails error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Resend single failed email
router.post("/resend-email/:orderId", async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId).populate("courseId");
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    if (!order.courseId) {
      return res.status(404).json({ success: false, message: "Course not found" });
    }

    await sendPaymentEmail({
      to: order.buyerEmail,
      customerName: order.buyerEmail.split("@")[0],
      courseName: order.courseId.title,
      amount:
        Number(order.ownerAmount || 0) +
        Number(order.influencerCommission || 0) +
        Number(order.ebookCreatorCommission || 0),
      orderId: order.razorpayOrderId,
      paymentId: order.razorpayPaymentId,
      dateTime: new Date(order.paidAt).toLocaleString(),
      downloadLink: order.courseId.googleDriveLink, // fixed key name
    });

    order.emailSent = true;
    await order.save();

    res.json({ success: true, message: "Email resent successfully" });
  } catch (err) {
    console.error("Resend single email failed:", err);
    res.status(500).json({ success: false, message: "Server error during resend" });
  }
});

// Resend all failed emails
router.post("/resend-all-emails", async (req, res) => {
  try {
    const failedOrders = await Order.find({
      emailSent: false,
      status: "completed",
    }).populate("courseId");

    if (!failedOrders.length) {
      return res.json({ success: true, message: "No failed emails to resend" });
    }

    let successCount = 0;
    let failCount = 0;

    for (const order of failedOrders) {
      try {
        await sendPaymentEmail({
          to: order.buyerEmail,
          customerName: order.buyerEmail.split("@")[0],
          courseName: order.courseId.title,
          amount:
            Number(order.ownerAmount || 0) +
            Number(order.influencerCommission || 0) +
            Number(order.ebookCreatorCommission || 0),
          orderId: order.razorpayOrderId,
          paymentId: order.razorpayPaymentId,
          dateTime: new Date(order.paidAt).toLocaleString(),
          downloadLink: order.courseId.googleDriveLink, // fixed key name
        });

        order.emailSent = true;
        await order.save();
        successCount++;
      } catch (err) {
        console.error(`❌ Failed to resend email for order ${order._id}:`, err);
        failCount++;
      }
    }

    res.json({
      success: true,
      message: `Resend completed. ✅ ${successCount} sent, ❌ ${failCount} failed.`,
    });
  } catch (err) {
    console.error("Resend All failed:", err);
    res.status(500).json({ success: false, message: "Server error during resend all" });
  }
});

// ===============================
// Dashboard Stats
// ===============================
router.get("/stats", async (req, res) => {
  try {
    const courses = await Course.countDocuments();
    const coupons = await Coupon.countDocuments();
    const sales = await Order.countDocuments({ status: "completed" });

    res.json({ success: true, stats: { courses, coupons, sales } });
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
          _id: { day: { $dayOfMonth: "$paidAt" }, month: { $month: "$paidAt" } },
          total: { $sum: "$ownerAmount" },
        },
      },
      { $sort: { "_id.month": 1, "_id.day": 1 } },
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
      { $match: { status: "completed" } },
      { $group: { _id: "$couponId", usageCount: { $sum: 1 }, totalDiscount: { $sum: "$influencerCommission" } } },
      {
        $lookup: {
          from: "coupons",
          localField: "_id",
          foreignField: "_id",
          as: "coupon",
        },
      },
      { $unwind: "$coupon" },
      { $project: { code: "$coupon.code", usageCount: 1, totalDiscount: 1 } },
    ]);

    res.json({ success: true, dailySales, salesPerCourse, couponUsage });
  } catch (err) {
    console.error("Sales analytics error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;