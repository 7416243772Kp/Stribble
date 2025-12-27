// C:\Ebook\server.js
// = Environment & Core Imports =
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
import promoterAdminRoutes from "./src/routes/adminPromoterRoutes.js";
import reviewRoutes from "./src/routes/reviewRoutes.js";

import helmet from "helmet";
// ==== Utilities ====
import { sendPaymentEmail } from "./src/utils/email.js";

// ==== Path Setup ====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==== App Initialization ====
const app = express();
app.use(helmet());

// server.js

app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      // SECURE: Removed 'unsafe-inline'
      scriptSrc: ["'self'", "https://checkout.razorpay.com", "https://cdn.jsdelivr.net"],

      // Keep 'unsafe-inline' for styles because you use style="..." in HTML
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],

      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      frameSrc: ["'self'", "https://api.razorpay.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://lumberjack.razorpay.com", "https://cdn.jsdelivr.net"]
    },
  })
);

// ============================
//  Security & Middlewares
// ============================
app.disable("x-powered-by");
app.set("trust proxy", 1);

// ==== CORS & Cookie Parser ====
import cookieParser from "cookie-parser";
import escapeHtml from "escape-html";

const rawAllowed = (process.env.CORS_ORIGINS || "http://localhost:5000,http://127.0.0.1:8080,http://localhost:8080").split(",").map(s => s.trim());

// allow JSON bodies (already present) + urlencoded for admin forms if needed
app.use(express.json({ limit: "200kb" }));
app.use(express.urlencoded({ extended: false }));

// cookie parser (populates req.cookies)
app.use(cookieParser());

// --- Express 5–safe in-place sanitizer (blocks NoSQL injection operators) ---
function deepSanitize(obj) {
  if (!obj || typeof obj !== "object") return;
  for (const key of Object.keys(obj)) {
    if (key.startsWith("$") || key.includes(".")) {
      delete obj[key];
      continue;
    }
    const val = obj[key];
    if (val && typeof val === "object") deepSanitize(val);
  }
}

app.use((req, res, next) => {
  try {
    deepSanitize(req.body);
    deepSanitize(req.params);
    deepSanitize(req.query);
  } catch (e) { }
  next();
});

// robust CORS: echo allowed origin, supports credentials
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (rawAllowed.indexOf(origin) !== -1) return callback(null, true);
    console.warn("Blocked CORS origin:", origin);
    return callback(null, false); // decline without creating an Error object
  },
  credentials: true,
}));

// ==== Static Files ====
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static("uploads"));

// safe JSON serialization to avoid breaking inline <script> tags (prevents XSS)
function safeJson(obj) {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

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
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ============================
//  AWS SES Setup
// ============================
const hasAwsCreds = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
const ses = hasAwsCreds
  ? new SESClient({
    region: process.env.AWS_REGION || "ap-south-1",
    credentials: {
      accessKeyId: String(process.env.AWS_ACCESS_KEY_ID).trim(),
      secretAccessKey: String(process.env.AWS_SECRET_ACCESS_KEY).trim(),
    },
  })
  : new SESClient({ region: process.env.AWS_REGION || "ap-south-1" }); // will use default provider chain if available

const FROM_EMAIL = process.env.SES_FROM_EMAIL || "no-reply@stribble.site";

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

// promo capture middleware (saves coupon/ref from query into cookies)
app.use((req, res, next) => {
  try {
    const { coupon, ref } = req.query;
    // Save to cookie if present (valid for 30 days)
    const cookieOpts = { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: false, sameSite: 'Lax' };
    if (coupon && typeof coupon === 'string') {
      res.cookie('promo_coupon', coupon.trim().toUpperCase(), cookieOpts);
    }
    if (ref && typeof ref === 'string') {
      res.cookie('promo_ref', ref.trim(), cookieOpts);
    }
  } catch (e) {
    // ignore cookie set errors
  }
  next();
});

// ============================
//  Routes
// ============================

// ---- Admin Routes ----
app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/admin", authAdmin, adminRoutes);
app.use("/api/admin/coupons", couponRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/admin/promoters", authAdmin, promoterAdminRoutes);
app.use("/api/reviews", reviewRoutes);

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
        Subject: { Data: "Stribble - Verify your email" },
      },
      Source: FROM_EMAIL,
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
    const couponCode = req.body.couponCode ?? req.body.code ?? "";
    const { courseId } = req.body;
    if (!courseId) return res.status(400).json({ success: false, message: "courseId required" });
    if (!mongoose.Types.ObjectId.isValid(courseId)) return res.status(400).json({ success: false, message: "Invalid courseId" });

    // If no coupon code provided, respond success with no coupon (meaning: no discount)
    if (!couponCode || String(couponCode).trim() === "") {
      return res.json({ success: true, coupon: null });
    }

    const code = String(couponCode).trim().toUpperCase();
    const coupon = await Coupon.findOne({ code, courseId: new mongoose.Types.ObjectId(courseId), active: true });

    if (!coupon) {
      return res.status(400).json({ success: false, message: "Invalid coupon" });
    }

    res.json({ success: true, coupon: { id: coupon._id, code: coupon.code, discount: coupon.discount || 0, influencerCommission: coupon.influencerCommission || 0, ebookCreatorCommission: coupon.ebookCreatorCommission || 0, influencerUPI: coupon.influencerUPI || "", ebookCreatorUPI: coupon.ebookCreatorUPI || "", isDefault: coupon.isDefault, }, });
  } catch (err) {
    console.error("❌ Coupon validate error:", err);
    res.status(500).json({ success: false, message: "Error validating coupon" });
  }
});

// ---- Checkout Validate + OTP (alias used by checkout.js) ----
app.post("/api/checkout/validate", otpLimiter, async (req, res) => {
  try {
    const { email, couponCode, courseId } = req.body;

    // Only email and courseId required here — couponCode optional
    if (!email || !courseId) {
      return res.status(400).json({ success: false, message: "Missing fields: email and courseId are required" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: "Invalid email format" });
    }

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ success: false, message: "Invalid courseId" });
    }

    let coupon = null;
    const code = String(couponCode || "").trim().toUpperCase();

    if (code) {
      coupon = await Coupon.findOne({ code, courseId: new mongoose.Types.ObjectId(courseId), active: true });
      if (!coupon) {
        return res.status(400).json({ success: false, message: "Invalid coupon" });
      }
    }

    // Generate OTP and send via SES (same behavior irrespective of coupon)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(email, { otp, expiresAt: Date.now() + 5 * 60 * 1000 }); // valid for 5 min

    const command = new SendEmailCommand({
      Destination: { ToAddresses: [email] },
      Message: {
        Body: { Text: { Data: `Your OTP is ${otp}. It is valid for 5 minutes.` } },
        Subject: { Data: "Stribble - Verify your email" },
      },
      Source: FROM_EMAIL,
    });
    await ses.send(command);

    res.json({
      success: true,
      message: "OTP sent",
      coupon: coupon ? { id: coupon._id, code: coupon.code, discount: coupon.discount || 0, influencerCommission: coupon.influencerCommission || 0, ebookCreatorCommission: coupon.ebookCreatorCommission || 0 } : null,
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

// Create order (includes validated referrer)
app.post("/api/payment/order", paymentLimiter, async (req, res) => {
  try {
    const { email, courseId, couponCode } = req.body;
    if (!email || !courseId) return res.status(400).json({ success: false, message: "Missing fields: email and courseId are required" });
    if (!mongoose.Types.ObjectId.isValid(courseId)) return res.status(400).json({ success: false, message: "Invalid courseId" });

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ success: false, message: "Course not found" });

    // If couponCode provided, try to find coupon; if not provided or not found, proceed with no coupon
    let coupon = null;
    const code = String(couponCode || "").trim().toUpperCase();
    if (code) {
      coupon = await Coupon.findOne({ code, courseId: new mongoose.Types.ObjectId(courseId), active: true });
      if (!coupon) {
        return res.status(400).json({ success: false, message: "Invalid coupon for this course" });
      }
    }

    const discount = Number((coupon && coupon.discount) || 0);
    const finalAmount = Math.max(1, Number(course.price) - discount);
    const influencerCommission = Number((coupon && coupon.influencerCommission) || 0);
    const ebookCreatorCommission = Number((coupon && coupon.ebookCreatorCommission) || 0);
    const ownerAmount = finalAmount - influencerCommission - ebookCreatorCommission;
    if (ownerAmount < 0) return res.status(400).json({ success: false, message: "Commission exceeds price after discount" });

    // decide referrer: prefer cookie (promo_ref) then body.ref (explicit)
    let referrer = req.cookies?.promo_ref || req.body?.ref || null;

    // validate promoter now to avoid saving invalid refs
    if (referrer) {
      try {
        const Promoter = (await import('./src/models/promoter.js')).default;
        const exists = await Promoter.exists({ refId: referrer, active: true });
        if (!exists) {
          referrer = null; // drop invalid ref
        }
      } catch (err) {
        console.warn('Promoter validation failed while creating order:', err && err.message);
        referrer = null;
      }
    }

    const promoterCommission = Number((coupon && coupon.influencerCommission) || 0);

    const amountPaise = Math.round(finalAmount * 100);
    const rzpOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: "rcpt_" + Date.now().toString().slice(-8),
      notes: { email, courseId, couponCode: coupon ? coupon.code : "", referrer: referrer || "" },
    });

    await Order.create({
      courseId,
      couponId: coupon ? coupon._id : null,
      buyerEmail: email,
      influencerCommission,
      ebookCreatorCommission,
      ownerAmount,
      promoterCommission,
      referrer,
      razorpayOrderId: rzpOrder.id,
      status: "pending",
      createdAt: new Date(),
    });

    res.json({ success: true, orderId: rzpOrder.id, amountPaise: rzpOrder.amount, currency: rzpOrder.currency, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error("Order creation failed:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ---- Payment Verification & Course Delivery ----
app.post("/api/payment/verify", paymentLimiter, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
      return res.status(400).json({ success: false, message: "Missing payment fields" });

    const secret = process.env.RAZORPAY_KEY_SECRET;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expected !== razorpay_signature)
      return res.status(400).json({ success: false, message: "Invalid signature" });

    // 1. FETCH ORDER WITH GOOGLE DRIVE LINK (Critical Change)
    const order = await Order.findOne({ razorpayOrderId: razorpay_order_id })
      .populate({
        path: "courseId",
        select: "+googleDriveLink title price" // <--- Explicitly select the hidden link
      });

    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    if (order.status !== "completed") {
      order.status = "completed";
      order.razorpayPaymentId = razorpay_payment_id;
      order.razorpaySignature = razorpay_signature;
      order.paidAt = new Date();
      await order.save();

      // Update stats (Promoter, Coupon, Course Sold Count)
      if (order.referrer) { /* ... (Keep your existing promoter logic here if needed) ... */ }
      if (order.couponId) await Coupon.findByIdAndUpdate(order.couponId, { $inc: { uses: 1 } }).catch(() => { });
      if (order.courseId?._id) await Course.findByIdAndUpdate(order.courseId._id, { $inc: { soldCount: 1 } }).catch(() => { });

      // Record Payment
      const amountPaid = Number(order.ownerAmount || 0) + Number(order.influencerCommission || 0) + Number(order.ebookCreatorCommission || 0);
      await Payment.create({
        email: order.buyerEmail,
        courseId: order.courseId?._id,
        amount: amountPaid,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        status: "success",
        createdAt: new Date(),
      });

      // Send Email
      const downloadLink = order.courseId?.googleDriveLink || null;
      if (downloadLink) {
        await sendPaymentEmail({
          to: order.buyerEmail,
          customerName: order.buyerEmail.split("@")[0],
          courseName: order.courseId.title,
          amount: amountPaid,
          orderId: order.razorpayOrderId,
          paymentId: order.razorpayPaymentId,
          dateTime: new Date(order.paidAt).toLocaleString(),
          downloadLink,
          supportEmail: "support@stribble.site",
        });
        order.emailSent = true;
        await order.save().catch(() => { });
      }
    }

    // 2. SEND LINK TO FRONTEND
    res.json({
      success: true,
      message: "Payment verified",
      downloadLink: order.courseId?.googleDriveLink || "" // <--- Send link here
    });

  } catch (err) {
    console.error("Payment verification failed:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }


});

app.get('/sitemap.xml', async (req, res) => {
  try {
    // Fetch _id instead of slug because your route is /course/:id
    const courses = await Course.find({}, '_id updatedAt');
    const baseUrl = 'https://stribble.site';

    let sitemap = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

    // Add static pages
    sitemap += `<url><loc>${baseUrl}/</loc><changefreq>daily</changefreq></url>`;
    sitemap += `<url><loc>${baseUrl}/about</loc><changefreq>monthly</changefreq></url>`;

    // Add dynamic courses using the ID
    courses.forEach(course => {
      sitemap += `
                <url>
                    <loc>${baseUrl}/course/${course._id}</loc>
                    <lastmod>${course.updatedAt.toISOString()}</lastmod>
                    <changefreq>weekly</changefreq>
                </url>
            `;
    });

    sitemap += '</urlset>';
    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
  } catch (e) {
    console.error(e);
    res.status(500).end();
  }
});

// --- 2. YOUR EXISTING ROUTES (The "Librarians") ---

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Admin login
app.get('/admin-login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Course page - Handles the specific IDs listed in the sitemap above
app.get('/course/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'course.html'));
});

// Checkout page 
app.get('/checkout/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'checkout.html'));
});

// About page
app.get('/about', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'about.html'));
});

// --- 3. CATCH-ALL ROUTE (Must be last) ---
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});



// ============================
//  Default Admin Setup
// ============================
async function ensureDefaultAdmin() {
  const email = process.env.ADMIN_EMAIL || "praveenkunche@gmail.com";
  const defaultPassword = process.env.ADMIN_PASSWORD || "praveenkunche";
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

process.on("unhandledRejection", (reason, p) => {
  console.error("Unhandled Rejection at Promise:", p, "reason:", reason);
  // optionally: send alert or graceful shutdown
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  // optionally: perform graceful shutdown
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});
