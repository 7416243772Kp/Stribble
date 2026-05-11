//C:\Ebook\src\routes\adminRoutes.js
import express from "express";
import multer from "multer";
import fs from "fs";
import Order from "../models/order.js";
import Course from "../models/course.js";
import Coupon from "../models/coupon.js";
import Contact from '../models/Contact.js';
import CourseProgress from "../models/CourseProgress.js";
import Unsubscribe from "../models/Unsubscribe.js";
import { sendCourseEmail } from "../utils/email.js";
import {
  buildCashfreeIdempotencyKey,
  cashfreeConfigReady,
  createCashfreeRefund,
  normalizeCashfreeError,
} from "../config/cashfree.js";
import { getPayoutToken, addUpiBeneficiary, requestUpiTransfer } from "../config/cashfreePayout.js";

const router = express.Router();

// Multer setup for announcement attachments
const upload = multer({ 
  dest: 'public/uploads/temp',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit per file
});



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

// ===============================
// Course Drop-off Analytics
// ===============================
router.get("/analytics/dropoff", async (req, res) => {
  try {
    // 1. Get total pages for all courses to provide scale
    const courses = await Course.find({}, "title totalPages").lean();
    
    // 2. Aggregate the CourseProgress collection
    const progressData = await CourseProgress.aggregate([
      {
        $group: {
          _id: "$courseId",
          totalReaders: { $sum: 1 },
          maxPagesReached: { $push: "$maxPageReached" },
          allVisitedPages: { $push: "$visitedPages" }
        }
      }
    ]);

    const analytics = courses.map(course => {
      const pData = progressData.find(p => p._id.toString() === course._id.toString());
      if (!pData || pData.totalReaders === 0) {
        return {
          courseId: course._id,
          title: course.title,
          totalPages: course.totalPages,
          totalReaders: 0,
          averageProgressPct: 0,
          maxDropoffPage: 1,
          dropoffCurve: []
        };
      }

      // Calculate the "drop-off curve" (how many users actually visited page X)
      const curve = new Array(course.totalPages).fill(0);
      let sumOfVisitedPages = 0;
      
      // Track where users completely stop reading
      const exitCounts = new Array(course.totalPages).fill(0);

      // Count the explicit pages visited by each user
      pData.allVisitedPages.forEach((userVisitedPages, idx) => {
        let pages = Array.isArray(userVisitedPages) ? userVisitedPages : [];
        
        // Backward compatibility for old records that only had maxPageReached
        if (pages.length === 0 && pData.maxPagesReached && pData.maxPagesReached[idx]) {
           const maxP = pData.maxPagesReached[idx];
           for(let i=1; i<=maxP; i++) pages.push(i);
        }

        sumOfVisitedPages += pages.length;

        let maxPageForUser = 0;

        // Count 1 for each page explicitly visited
        pages.forEach(page => {
          if (page >= 1 && page <= course.totalPages) {
            curve[page - 1]++;
            if (page > maxPageForUser) {
                maxPageForUser = page;
            }
          }
        });

        // The highest page they reached is where they "dropped off"
        if (maxPageForUser > 0) {
            exitCounts[maxPageForUser - 1]++;
        }
      });

      const averageProgressPct = course.totalPages > 0 
          ? Math.round(((sumOfVisitedPages / pData.totalReaders) / course.totalPages) * 100)
          : 0;

      // Find the page with the highest number of exits (drop-offs)
      let maxDropoffPage = 1;
      let maxExits = -1;
      
      for(let i = 0; i < exitCounts.length; i++) {
          if (exitCounts[i] > maxExits) {
              maxExits = exitCounts[i];
              maxDropoffPage = i + 1; // 1-indexed page where people dropped off
          }
      }

      return {
        courseId: course._id,
        title: course.title,
        totalPages: course.totalPages,
        totalReaders: pData.totalReaders,
        averageProgressPct,
        maxDropoffPage,
        dropoffCurve: curve
      };
    });

    res.json({ success: true, analytics });
  } catch (error) {
    console.error("Dropoff Analytics Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get('/messages', async (req, res) => {
    try {
        const messages = await Contact.find().sort({ createdAt: -1 });
        res.json(messages);
    } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ===============================
// Refund Logic
// ===============================
import User from "../models/User.js";

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

    if (!cashfreeConfigReady()) {
      return res.status(500).json({ success: false, message: "Cashfree credentials are not configured" });
    }

    const cashfreeOrderId = order.cashfreeOrderId || order.paymentOrderId;
    if (!cashfreeOrderId) {
      return res.status(400).json({ success: false, message: "Cashfree order ID missing for this order" });
    }

    const refundAmount = Number((Number(order.ownerAmount || 0) + Number(order.influencerCommission || 0) + Number(order.ebookCreatorCommission || 0)).toFixed(2));
    const refundId = `rfnd${order._id.toString().slice(-12)}${Date.now().toString().slice(-6)}`;

    const refund = await createCashfreeRefund(cashfreeOrderId, {
      refund_id: refundId,
      refund_amount: refundAmount,
      refund_note: "Refund requested by student via email",
    }, buildCashfreeIdempotencyKey());

    // Update order status
    order.refundStatus = "processed";
    order.refundId = refund.refund_id || refundId;
    order.refundedAt = new Date();
    order.status = "failed";

    await order.save();

    res.json({ success: true, message: "Refund processed and access revoked", refundId: order.refundId });
  } catch (err) {
    console.error("Refund error:", err?.response?.data || err);
    res.status(500).json({ success: false, message: normalizeCashfreeError(err) });
  }
});

// ===============================
// Course Announcements (Bulk Email)
// ===============================
router.post("/announcement", upload.array('attachments', 3), async (req, res) => {
  try {
    const { courseId, subject, message } = req.body;
    const files = req.files || [];

    if (!courseId || !subject || !message) {
      files.forEach(f => fs.unlinkSync(f.path)); // Cleanup
      return res.status(400).json({ success: false, message: "Course, subject, and message required" });
    }

    // 1. Find all active orders for this course (completed & not refunded)
    // Sometimes refunded orders are marked "failed", sometimes "refundStatus" is "processed"
    const activeOrders = await Order.find({
      courseId,
      status: "completed",
      refundStatus: { $ne: "processed" }
    }).select('buyerEmail').lean();

    if (activeOrders.length === 0) {
      files.forEach(f => fs.unlinkSync(f.path));
      return res.status(400).json({ success: false, message: "No active buyers found for this course" });
    }

    // Extract unique emails
    let uniqueEmails = [...new Set(activeOrders.map(o => o.buyerEmail))];

    // Check against Unsubscribe list
    const unsubscribedUsers = await Unsubscribe.find({ email: { $in: uniqueEmails.map(e => e.toLowerCase()) } }).lean();
    const unsubEmails = new Set(unsubscribedUsers.map(u => u.email));
    
    uniqueEmails = uniqueEmails.filter(email => !unsubEmails.has(email.toLowerCase()));

    if (uniqueEmails.length === 0) {
      files.forEach(f => fs.unlinkSync(f.path));
      return res.status(400).json({ success: false, message: "All active buyers have unsubscribed from emails." });
    }

    // 2. Format attachments for nodemailer
    const mailAttachments = files.map(file => ({
      filename: file.originalname,
      path: file.path
    }));

    // 3. Dispatch emails (Parallel sending, or sequentially if massive. We'll use Promise.all for now)
    let successCount = 0;
    
    // It's safer to send them one by one or in batches if the list is huge, 
    // but Promise.all is okay for small-medium lists.
    const emailPromises = uniqueEmails.map(async (email) => {

      // HTML wrapper for the message customized per user for the unsubscribe link
      const unsubscribeLink = `${process.env.FRONTEND_URL || 'https://stribble.site'}/unsubscribe?email=${encodeURIComponent(email)}`;
      const htmlMessage = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #2563eb;">Announcement: ${subject}</h2>
          <div style="margin-top: 20px; white-space: pre-wrap;">${message}</div>
          <hr style="margin-top: 40px; border: none; border-top: 1px solid #e2e8f0;" />
          <p style="font-size: 0.8rem; color: #64748b;">
            You are receiving this because you are enrolled in a course on Stribble.<br>
            If you no longer wish to receive announcement emails from us, you can 
            <a href="${unsubscribeLink}" style="color: #ef4444; text-decoration: underline;">unsubscribe here</a>.
          </p>
        </div>
      `;

      const sent = await sendCourseEmail({
        to: email,
        subject: subject,
        html: htmlMessage,
        text: message + `\n\nUnsubscribe from future emails: ${unsubscribeLink}`,
        attachments: mailAttachments
      });
      if (sent) successCount++;
    });

    await Promise.all(emailPromises);

    // 4. Cleanup temporary uploaded files
    files.forEach(f => fs.unlinkSync(f.path));

    res.json({ 
      success: true, 
      message: `Announcement sent to ${successCount} out of ${uniqueEmails.length} students.` 
    });

  } catch (err) {
    console.error("Announcement Error:", err);
    // Cleanup on crash
    if (req.files) {
      req.files.forEach(f => {
        if(fs.existsSync(f.path)) fs.unlinkSync(f.path);
      });
    }
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Admin route to retry a failed/pending payout
router.post("/payouts/retry/:orderId", async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId).populate("couponId");
    if (!order || !order.couponId) {
      return res.status(404).json({ message: "Order or coupon not found" });
    }

    const token = await getPayoutToken();
    const coupon = order.couponId;
    let results = [];

    // Retry Influencer
    if (order.influencerCommission > 0 && order.influencerPayoutStatus !== "completed") {
      const beneId = `inf_${coupon._id}`;
      await addUpiBeneficiary(token, beneId, coupon.influencerUpi, "Influencer", process.env.ADMIN_EMAIL);
      const transferId = `tr_inf_${order._id}_retry_${Date.now()}`; // New unique transfer ID for the retry
      
      await requestUpiTransfer(token, transferId, beneId, order.influencerCommission);
      
      order.influencerTransferId = transferId;
      order.influencerPayoutStatus = "pending"; // Will be updated to completed by webhook
      results.push("Influencer payout initiated");
    }

    // Retry Creator
    if (order.ebookCreatorCommission > 0 && order.creatorPayoutStatus !== "completed") {
      const beneId = `crt_${coupon._id}`;
      await addUpiBeneficiary(token, beneId, coupon.creatorUpi, "Creator", process.env.ADMIN_EMAIL);
      const transferId = `tr_crt_${order._id}_retry_${Date.now()}`;
      
      await requestUpiTransfer(token, transferId, beneId, order.ebookCreatorCommission);
      
      order.creatorTransferId = transferId;
      order.creatorPayoutStatus = "pending";
      results.push("Creator payout initiated");
    }

    await order.save();
    res.json({ success: true, message: "Retries processed", results });

  } catch (error) {
    console.error("Retry failed:", error?.response?.data || error);
    res.status(500).json({ success: false, message: "Failed to retry payouts" });
  }
});

export default router;
