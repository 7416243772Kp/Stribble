//C:\Ebook\src\routes\adminRoutes.js
import express from "express";
import Order from "../models/order.js";
import Course from "../models/course.js";
import Coupon from "../models/coupon.js";
import { sendPaymentEmail } from "../utils/email.js";
import Contact from '../models/Contact.js';
import { authAdmin } from '../middleware/authAdmin.js';
const router = express.Router();

// If you have an admin auth middleware, apply it here:
// router.use(adminAuthMiddleware);

// ===============================
// Failed Emails Management
// ===============================

// Get all failed emails (completed orders where email wasn't sent)
router.get("/failed-emails", async (req, res) => {
  try {
    // find completed orders where emailSent is false OR not set
    const failedOrders = await Order.find({
      status: "completed",
      $or: [{ emailSent: false }, { emailSent: { $exists: false } }],
    }).populate({ path: "courseId", select: "+googleDriveLink title" });

    res.json({ success: true, failedOrders });
  } catch (err) {
    console.error("Fetch failed emails error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// Resend single failed email
router.post("/resend-email/:orderId", async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId).populate({
      path: "courseId",
      select: "+googleDriveLink title",
    });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const to = order.buyerEmail;
    const courseTitle = order.courseId?.title || "";
    const amount =
      Number(order.ownerAmount || 0) +
      Number(order.influencerCommission || 0) +
      Number(order.ebookCreatorCommission || 0);

    try {
      await sendPaymentEmail({
        to,
        customerName: (to || "").split("@")[0],
        courseName: courseTitle,
        amount,
        orderId: order.razorpayOrderId,
        paymentId: order.razorpayPaymentId,
        dateTime: order.paidAt ? new Date(order.paidAt).toLocaleString() : new Date().toLocaleString(),
        // prefer explicit link, else pass courseId so helper can resolve link
        downloadLink: order.courseId?.googleDriveLink || null,
        courseId: order.courseId?._id || null,
      });

      order.emailSent = true;
      order.emailFailReason = undefined;
      await order.save();

      res.json({ success: true, message: "Email resent successfully" });
    } catch (mailErr) {
      console.error("Resend single email failed:", mailErr);
      order.emailSent = false;
      order.emailFailReason = (mailErr && mailErr.message) || String(mailErr);
      await order.save().catch(() => {});
      res.status(500).json({ success: false, message: "Failed to send email", error: order.emailFailReason });
    }
  } catch (err) {
    console.error("Resend single email endpoint error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// Resend all failed emails
router.post("/resend-all-emails", async (req, res) => {
  try {
    const failedOrders = await Order.find({
      status: "completed",
      $or: [{ emailSent: false }, { emailSent: { $exists: false } }],
    }).populate({ path: "courseId", select: "+googleDriveLink title" });

    if (!failedOrders.length) {
      return res.json({ success: true, message: "No failed emails to resend" });
    }

    let successCount = 0;
    const failList = [];

    for (const order of failedOrders) {
      try {
        const downloadLink = order.courseId?.googleDriveLink || null;
        await sendPaymentEmail({
          to: order.buyerEmail,
          customerName: (order.buyerEmail || "").split("@")[0],
          courseName: order.courseId?.title || "",
          amount:
            Number(order.ownerAmount || 0) +
            Number(order.influencerCommission || 0) +
            Number(order.ebookCreatorCommission || 0),
          orderId: order.razorpayOrderId,
          paymentId: order.razorpayPaymentId,
          dateTime: order.paidAt ? new Date(order.paidAt).toLocaleString() : new Date().toLocaleString(),
          downloadLink,
          courseId: order.courseId?._id || null,
        });

        order.emailSent = true;
        order.emailFailReason = undefined;
        await order.save().catch(() => {});
        successCount++;
      } catch (e) {
        console.error(`❌ Failed to resend email for order ${order._id}:`, e);
        order.emailSent = false;
        order.emailFailReason = (e && e.message) || String(e);
        await order.save().catch(() => {});
        failList.push({ orderId: order._id, reason: order.emailFailReason });
      }
    }

    res.json({
      success: true,
      message: `Resend completed. ✅ ${successCount} sent, ❌ ${failList.length} failed.`,
      failList,
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

router.get('/api/admin/messages', authAdmin, async (req, res) => {
    try {
        // Fetch messages, newest first
        const messages = await Contact.find().sort({ createdAt: -1 });
        res.json(messages);
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

export default router;
