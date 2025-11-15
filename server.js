//C:\Ebook\server.js
// ==== Environment & Core Imports ====
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import mongoose from "mongoose";
import Razorpay from "razorpay";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";

// ==== AWS SES (v3) ====
import pkg from "@aws-sdk/client-ses";
const { SESClient, SendEmailCommand } = pkg;

// ==== Models ====
import AdminUser from "./src/models/AdminUser.js";
import Coupon from "./src/models/coupon.js";
import Payment from "./src/models/payment.js";
import Course from "./src/models/course.js";
import Order from "./src/models/order.js";

// ==== Routes & Middleware ====
import adminRoutes from "./src/routes/adminRoutes.js";
import adminAuthRoutes from "./src/routes/adminAuthRoutes.js";
import couponRoutes from "./src/routes/couponRoutes.js";
import courseRoutes from "./src/routes/courseRoutes.js";
import authAdmin from "./src/middleware/authAdmin.js";

// ==== Utilities ====
import { sendPaymentEmail } from "./src/utils/email.js";

// ==== Path Setup ====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==== App Initialization ====
const app = express();

// ============================
//  Security & Middlewares
// ============================
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(express.json({ limit: "200kb" }));

// --- Express 5–safe in-place sanitizer (blocks NoSQL injection operators) ---
function deepSanitize(obj) {
  if (!obj || typeof obj !== "object") return;
  for (const key of Object.keys(obj)) {
    // Block Mongo-style operators and dotted paths
    if (key.startsWith("$") || key.includes(".")) {
      delete obj[key];
      continue;
    }
    const val = obj[key];
    if (val && typeof val === "object") deepSanitize(val);
  }
}
// Apply AFTER parsers, BEFORE routes
app.use((req, res, next) => {
  try {
    deepSanitize(req.body);
    deepSanitize(req.params);
    deepSanitize(req.query); // mutate properties in place (no reassignment)
  } catch {}
  next();
});

// ==== CORS ====
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5000").split(",");
app.use(cors({ origin: allowedOrigins, credentials: true }));

// ==== Static Files ====
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static("uploads"));

// ============================
//  Database Connection
// ============================
mongoose
  .connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/course_selling", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ============================
//  Razorpay Setup
// ============================
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_1DP5mmOlF5G5ag",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "ZIDKRiWRL8RQ51HFNvIubVMR",
});

// ============================
//  AWS SES Setup
// ============================
const ses = new SESClient({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const FROM_EMAIL = process.env.SES_FROM_EMAIL || "no-reply@mademycourse.online";

// ============================
//  Rate Limiters
// ============================
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many OTP attempts. Try again later." },
});

const paymentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================
//  OTP Store (In-memory)
// ============================
const otpStore = new Map(); // { email: { otp, expiresAt } }

// ============================
//  Routes
// ============================

// ---- Admin Routes ----
app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/admin", authAdmin, adminRoutes);
app.use("/api/admin/coupons", couponRoutes);
app.use("/api/courses", courseRoutes);

// ---- OTP & Email Validation ----
// Validate and send OTP to email
app.post("/api/validate/email", async (req, res) => {
  const { email } = req.body;

  // Basic format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, message: "Invalid email format" });
  }

  // Generate OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(email, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });

  try {
    const command = new SendEmailCommand({
      Destination: { ToAddresses: [email] },
      Message: {
        Body: { Text: { Data: `Your OTP is ${otp}. It is valid for 5 minutes.` } },
        Subject: { Data: "CourseHub - Verify your email" },
      },
      Source: "no-reply@stribble.site",
    });

    await ses.send(command);
    res.json({ success: true, message: "OTP sent to email" });
  } catch (err) {
    console.error("❌ OTP send error:", err);
    console.error("❌ SES error details:", err.message || err);
    res.status(500).json({ success: false, message: "Error sending OTP" });
  }
});

app.post("/api/validate/otp", otpLimiter, (req, res) => {
  const { email, otp } = req.body;
  const record = otpStore.get(email);

  if (!record || record.otp !== otp || Date.now() > record.expiresAt)
    return res.status(400).json({ success: false, message: "Invalid or expired OTP" });

  otpStore.delete(email);
  res.json({ success: true, message: "OTP verified successfully" });
});


// ---- Coupon Validation ----
app.post("/api/validate/coupon", async (req, res) => {
  try {
    const { couponCode, courseId } = req.body;
    if (!couponCode || !courseId)
      return res.status(400).json({ success: false, message: "Coupon and courseId required" });

    if (!mongoose.Types.ObjectId.isValid(courseId))
      return res.status(400).json({ success: false, message: "Invalid courseId" });

    const code = couponCode.trim().toUpperCase();
    let coupon = await Coupon.findOne({
      code,
      courseId: new mongoose.Types.ObjectId(courseId),
      active: true,
    });

    if (!coupon) {
      coupon = await Coupon.findOne({
        courseId: new mongoose.Types.ObjectId(courseId),
        isDefault: true,
        active: true,
      });
      if (!coupon)
        return res.status(400).json({ success: false, message: "Invalid coupon" });
    }

    if (coupon.maxUses > 0 && coupon.uses >= coupon.maxUses)
      return res.status(400).json({ success: false, message: "Coupon usage limit reached" });

    res.json({
      success: true,
      coupon: {
        id: coupon._id,
        code: coupon.code,
        discount: coupon.discount || 0,
        influencerCommission: coupon.influencerCommission || 0,
        ebookCreatorCommission: coupon.ebookCreatorCommission || 0,
        influencerUPI: coupon.influencerUPI || "",
        ebookCreatorUPI: coupon.ebookCreatorUPI || "",
        isDefault: coupon.isDefault,
      },
    });
  } catch (err) {
    console.error("❌ Coupon validate error:", err);
    res.status(500).json({ success: false, message: "Error validating coupon" });
  }
});

// ---- Checkout Validate + OTP (alias used by checkout.js) ----
app.post("/api/checkout/validate", otpLimiter, async (req, res) => {
  try {
    const { email, couponCode, courseId } = req.body;

    // Basic checks
    if (!email || !couponCode || !courseId) {
      return res.status(400).json({ success: false, message: "Missing fields" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: "Invalid email format" });
    }

    // Validate courseId and coupon (case-insensitive), fallback to default coupon for this course
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ success: false, message: "Invalid courseId" });
    }
    const code = String(couponCode).trim().toUpperCase();

    let coupon = await Coupon.findOne({
      code,
      courseId: new mongoose.Types.ObjectId(courseId),
      active: true,
    });

    if (!coupon) {
      coupon = await Coupon.findOne({
        courseId: new mongoose.Types.ObjectId(courseId),
        isDefault: true,
        active: true,
      });
      if (!coupon) {
        return res.status(400).json({ success: false, message: "Invalid coupon" });
      }
    }

    if (coupon.maxUses > 0 && coupon.uses >= coupon.maxUses) {
      return res.status(400).json({ success: false, message: "Coupon usage limit reached" });
    }

    // Generate OTP and send via SES
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(email, { otp, expiresAt: Date.now() + 5 * 60 * 1000 }); // valid for 5 min

    const command = new SendEmailCommand({
      Destination: { ToAddresses: [email] },
      Message: {
        Body: { Text: { Data: `Your OTP is ${otp}. It is valid for 5 minutes.` } },
        Subject: { Data: "CourseHub - Verify your email" },
      },
      Source: FROM_EMAIL,
    });
    await ses.send(command);

    res.json({
      success: true,
      message: "Coupon validated and OTP sent",
      coupon: {
        id: coupon._id,
        code: coupon.code,
        discount: coupon.discount || 0,
        influencerCommission: coupon.influencerCommission || 0,
        ebookCreatorCommission: coupon.ebookCreatorCommission || 0,
      },
    });
  } catch (err) {
    console.error("❌ Checkout validate error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ---- Checkout OTP verify (alias used by checkout.js) ----
app.post("/api/checkout/verify-otp", otpLimiter, (req, res) => {
  const { email, otp } = req.body;
  const record = otpStore.get(email);

  if (!record || record.otp !== otp || Date.now() > record.expiresAt) {
    return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
  }

  otpStore.delete(email);
  res.json({ success: true, message: "OTP verified successfully" });
});

// ---- Payment: Create Order ----
app.post("/api/payment/order", paymentLimiter, async (req, res) => {
  try {
    const { email, courseId, couponCode } = req.body;
    if (!email || !courseId || !couponCode)
      return res
        .status(400)
        .json({ success: false, message: "Missing fields: email, courseId, couponCode are required" });

    if (!mongoose.Types.ObjectId.isValid(courseId))
      return res.status(400).json({ success: false, message: "Invalid courseId" });

    const course = await Course.findById(courseId);
    if (!course)
      return res.status(404).json({ success: false, message: "Course not found" });

    const code = couponCode.trim().toUpperCase();
    let coupon = await Coupon.findOne({
      code,
      courseId: new mongoose.Types.ObjectId(courseId),
      active: true,
    });

    if (!coupon) {
      coupon = await Coupon.findOne({
        courseId: new mongoose.Types.ObjectId(courseId),
        isDefault: true,
        active: true,
      });
      if (!coupon)
        return res.status(400).json({ success: false, message: "Invalid coupon for this course" });
    }

    if (coupon.maxUses > 0 && coupon.uses >= coupon.maxUses)
      return res.status(400).json({ success: false, message: "Coupon usage limit reached" });

    const discount = Number(coupon.discount || 0);
    const finalAmount = Math.max(1, Number(course.price) - discount);
    const influencerCommission = Number(coupon.influencerCommission || 0);
    const ebookCreatorCommission = Number(coupon.ebookCreatorCommission || 0);
    const ownerAmount = finalAmount - influencerCommission - ebookCreatorCommission;

    if (ownerAmount < 0)
      return res
        .status(400)
        .json({ success: false, message: "Commission exceeds price after discount" });

    const amountPaise = Math.round(finalAmount * 100);
    const rzpOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: "rcpt_" + Date.now().toString().slice(-8),
      notes: { email, courseId, couponCode: coupon.code },
    });

    await Order.create({
      courseId,
      couponId: coupon._id,
      buyerEmail: email,
      influencerCommission,
      ebookCreatorCommission,
      ownerAmount,
      razorpayOrderId: rzpOrder.id,
      status: "pending",
      createdAt: new Date(),
    });

    res.json({
      success: true,
      orderId: rzpOrder.id,
      amountPaise: rzpOrder.amount,
      currency: rzpOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("Order creation failed:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ---- Payment Verification ----
app.post("/api/payment/verify", paymentLimiter, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
      return res.status(400).json({ success: false, message: "Missing payment fields" });

    const secret = process.env.RAZORPAY_KEY_SECRET || "ZIDKRiWRL8RQ51HFNvIubVMR";
    const expected = crypto
      .createHmac("sha256", secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expected !== razorpay_signature)
      return res.status(400).json({ success: false, message: "Invalid signature" });

    const order = await Order.findOne({ razorpayOrderId: razorpay_order_id }).populate("courseId");
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    if (order.status === "completed")
      return res.json({ success: true, message: "Payment already verified", order });

    order.status = "completed";
    order.razorpayPaymentId = razorpay_payment_id;
    order.razorpaySignature = razorpay_signature;
    order.paidAt = new Date();
    await order.save();

    if (order.couponId)
      await Coupon.findByIdAndUpdate(order.couponId, { $inc: { uses: 1 } }).catch(() => {});
    if (order.courseId?._id)
      await Course.findByIdAndUpdate(order.courseId._id, { $inc: { soldCount: 1 } }).catch(() => {});

    const amountPaid =
      Number(order.ownerAmount || 0) +
      Number(order.influencerCommission || 0) +
      Number(order.ebookCreatorCommission || 0);

    await Payment.create({
      email: order.buyerEmail,
      courseId: order.courseId._id,
      amount: amountPaid,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      status: "success",
      createdAt: new Date(),
    });

    try {
      await sendPaymentEmail({
        to: order.buyerEmail,
        customerName: order.buyerEmail.split("@")[0],
        courseName: order.courseId.title,
        amount: amountPaid,
        orderId: order.razorpayOrderId,
        paymentId: order.razorpayPaymentId || razorpay_payment_id,
        dateTime: new Date(order.paidAt).toLocaleString(),
        downloadLink: order.courseId.googleDriveLink,
        supportEmail: "support@mademycourse.online",
      });

      order.emailSent = true;
      await order.save();
    } catch (mailErr) {
      console.error("❌ Email send failed:", mailErr);
    }

    res.json({ success: true, message: "Payment verified", order });
  } catch (err) {
    console.error("Payment verification failed:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ============================
//  Default Admin Setup
// ============================
async function ensureDefaultAdmin() {
  const email = process.env.ADMIN_EMAIL || "admin@example.com";
  const defaultPassword = process.env.ADMIN_PASSWORD || "change-me";
  const forceReset = (process.env.ADMIN_FORCE_RESET || "").toLowerCase() === "true";

  let admin = await AdminUser.findOne({ email });

  if (!admin) {
    const hash = await bcrypt.hash(defaultPassword, 12);
    admin = new AdminUser({ email, passwordHash: hash, totpEnabled: false, totpSecret: "" });
    await admin.save();
    console.log(`✅ Default admin created for ${email}`);
    console.log("👉 IMPORTANT: Change the default password after first login.");
  } else if (forceReset) {
    admin.passwordHash = await bcrypt.hash(defaultPassword, 12);
    admin.totpEnabled = false;
    admin.totpSecret = "";
    await admin.save();
    console.log(`✅ Admin password reset for ${email}`);
  } else {
    console.log(`ℹ️ Admin exists for ${email} (no reset).`);
  }
}
ensureDefaultAdmin().catch((err) => console.error("❌ Failed to ensure default admin:", err));

// ============================
//  Start Server
// ============================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
