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
import passport from "passport";
import session from "express-session";
import "./src/config/passport.js";

// ==== Models ====
import AdminUser from "./src/models/AdminUser.js";
import Coupon from "./src/models/coupon.js";
import Payment from "./src/models/payment.js";
import Course from "./src/models/course.js";
import Order from "./src/models/order.js";
import Contact from "./src/models/Contact.js";
import Promoter from "./src/models/promoter.js";
import User from "./src/models/User.js";
import Unsubscribe from "./src/models/Unsubscribe.js";

// ==== Routes & Middleware ====
import adminRoutes from "./src/routes/adminRoutes.js";
import authRoutes from "./src/routes/authRoutes.js";
import adminAuthRoutes from "./src/routes/adminAuthRoutes.js";
import couponRoutes from "./src/routes/couponRoutes.js";
import courseRoutes from "./src/routes/courseRoutes.js";
import authAdmin from "./src/middleware/authAdmin.js";
import promoterAdminRoutes from "./src/routes/adminPromoterRoutes.js";
import reviewRoutes from "./src/routes/reviewRoutes.js"; // Added this line

import helmet from "helmet";
// ==== Utilities ====
import contactRoutes from "./src/routes/contactroutes.js";
// Email utils removed

// ==== Path Setup ====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==== App Initialization ====
const app = express();
// Enable trust proxy for correct protocol detection (req.protocol) behind proxies (Nginx, etc.)
app.set('trust proxy', 1);

// ============================
//  CRITICAL SECURITY CONFIGURATION
// ============================
app.use(
  helmet({
    // 1. Allow Razorpay popup to communicate (Fixes "Please use another method" error)
    crossOriginOpenerPolicy: false,

    // 2. Allow resources from other origins (Prevents blocking images/scripts)
    crossOriginResourcePolicy: { policy: "cross-origin" },

    // 3. Permissions Policy (Fixes "Parse failed" & "Violation" errors)
    //    We let Helmet generate the valid header with double-quotes.
    permissionsPolicy: {
      features: {
        // Allow sensors (Used by Razorpay for fraud detection/biometrics)
        accelerometer: ["*"],
        gyroscope: ["*"],
        magnetometer: ["*"],
        // Allow payment API
        payment: ["self", "https://checkout.razorpay.com", "https://*.razorpay.com"],
      },
    },

    // 4. Content Security Policy (Allows Razorpay & Inline Scripts)
    contentSecurityPolicy: false, // TEMPORARY DEBUG: Disabled CSP to rule it out

    // contentSecurityPolicy: {
    //   directives: {
    //     defaultSrc: ["'self'"],
    //     scriptSrc: [
    //       "'self'",
    //       "https://checkout.razorpay.com",
    //       "https://*.razorpay.com",
    //       "https://cdn.jsdelivr.net",
    //       "'unsafe-inline'",
    //       "'unsafe-eval'" // Required by some Razorpay builds
    //     ],
    //     scriptSrcAttr: ["'unsafe-inline'"],
    //     styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    //     fontSrc: ["'self'", "https://fonts.gstatic.com"],
    //     frameSrc: ["'self'", "https://api.razorpay.com", "https://*.razorpay.com"],
    //     imgSrc: ["'self'", "data:", "https:"],
    //     connectSrc: [
    //       "'self'",
    //       "https://lumberjack.razorpay.com",
    //       "https://*.razorpay.com",
    //       "https://cdn.jsdelivr.net"
    //     ]
    //   },
    // },
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
// allow JSON bodies (increased limit for base64 uploads)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: false, limit: "50mb" }));

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
    return callback(null, false);
  },
  credentials: true,
  // This allows the browser to see the Razorpay tracking header without warning
  exposedHeaders: ["x-rtb-fingerprint-id"], 
}));

// ==== Session & Passport ====
app.use(session({
  secret: process.env.SESSION_SECRET || 'super_secret_key_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    // Respect COOKIE_SECURE if set (string 'true'/'false'), otherwise fallback to NODE_ENV
    secure: process.env.COOKIE_SECURE !== undefined 
            ? process.env.COOKIE_SECURE === 'true' 
            : process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 1 day
  }
}));

app.use(passport.initialize());
app.use(passport.session());

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
  key_id: String(process.env.RAZORPAY_KEY_ID || "").trim(),
  key_secret: String(process.env.RAZORPAY_KEY_SECRET || "").trim(),
});

// ==== AWS SES Setup (REMOVED) ====
// const hasAwsCreds = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
// const ses = ... 

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

const contactLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: { success: false, message: "Too many messages. Please try again in 30 minutes." },
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
app.use("/auth", authRoutes); // Google Auth
app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/admin", authAdmin, adminRoutes);
app.use("/api/admin/coupons", couponRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/admin/promoters", authAdmin, promoterAdminRoutes);
app.use("/api/admin/promoters", authAdmin, promoterAdminRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/contact", contactLimiter, contactRoutes);

// ---- Unsubscribe Route ----
app.post("/api/public/unsubscribe", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email required" });

    // Save or ignore if already there
    await Unsubscribe.findOneAndUpdate(
      { email: email.toLowerCase() },
      { email: email.toLowerCase() },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: "Unsubscribed successfully" });
  } catch (err) {
    console.error("Unsubscribe error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ---- OTP & Email Validation REMOVED ----

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
    const coupon = await Coupon.findOne({ code, courseId: new mongoose.Types.ObjectId(courseId), isActive: true });

    if (!coupon) {
      return res.status(400).json({ success: false, message: "Invalid coupon" });
    }

    res.json({ success: true, coupon: { id: coupon._id, code: coupon.code, discount: coupon.discountValue || coupon.discount || 0, influencerCommission: coupon.influencerCommission || 0, ebookCreatorCommission: coupon.creatorCommission || coupon.ebookCreatorCommission || 0, influencerUPI: coupon.influencerUpi || coupon.influencerUPI || "", ebookCreatorUPI: coupon.creatorUpi || coupon.ebookCreatorUPI || "", isDefault: coupon.isDefault, }, });
  } catch (err) {
    console.error("❌ Coupon validate error:", err);
    res.status(500).json({ success: false, message: "Error validating coupon" });
  }
});

// ---- Checkout Validate Routes REMOVED ----

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
      coupon = await Coupon.findOne({ code, courseId: new mongoose.Types.ObjectId(courseId), isActive: true });
      if (!coupon) {
        return res.status(400).json({ success: false, message: "Invalid coupon for this course" });
      }
    }

    const discount = Number((coupon && (coupon.discountValue || coupon.discount)) || 0);
    const finalAmount = Math.max(1, Number(course.price) - discount);
    const influencerCommission = Number((coupon && coupon.influencerCommission) || 0);
    const ebookCreatorCommission = Number((coupon && (coupon.creatorCommission || coupon.ebookCreatorCommission)) || 0);
    const ownerAmount = finalAmount - influencerCommission - ebookCreatorCommission;
    if (ownerAmount < 0) return res.status(400).json({ success: false, message: "Commission exceeds price after discount" });

    // decide referrer: prefer cookie (promo_ref) then body.ref (explicit)
    let referrer = req.cookies?.promo_ref || req.body?.ref || null;

    let promoterCommission = 0;
    // If a referrer exists and is valid, fetch the promoter's specific commission
    if (referrer) {
      try {
         const promoter = await Promoter.findOne({ refId: referrer, active: true });
         if (promoter) {
            promoterCommission = promoter.promoterCommission || 0;
         } else {
            referrer = null; // Invalid or inactive promoter
         }
      } catch (e) { 
           // promoter lookup failed silently
          referrer = null;
      }
    }

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

      // === CRITICAL: Update User's Purchased Courses ===
      if (order.buyerEmail) {
          await User.findOneAndUpdate(
              { email: order.buyerEmail },
              { $addToSet: { purchasedCourses: order.courseId._id } }
          ).catch(err => console.error("Failed to link course to user:", err));
      }
      // ===============================================

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
      // Email sending removed as per user request
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

app.post("/api/order/log-download", async (req, res) => {
  try {
    const { razorpayOrderId } = req.body;
    if (!razorpayOrderId) return res.status(400).json({ success: false });

    await Order.findOneAndUpdate(
      { razorpayOrderId },
      { 
        $push: { 
          downloadHistory: {
            timestamp: new Date(),
            ip: req.ip, // Captures User IP
            userAgent: req.headers['user-agent'] // Captures Browser/Device info
          }
        } 
      }
    );
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Log download error:", err);
    // Don't block the user if logging fails, just send error status
    res.status(500).json({ success: false });
  }
});

// --- 2. YOUR EXISTING ROUTES (The "Librarians") ---

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Static Pages (Clean URLs)
app.get('/my-courses', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'my-courses.html'));
});

app.get('/read', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'read.html'));
});

app.get('/contact', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

// Redirect .html to clean URLs
app.get('/terms.html', (req, res) => res.redirect(301, '/terms'));
app.get('/privacy.html', (req, res) => res.redirect(301, '/privacy'));
app.get('/refund.html', (req, res) => res.redirect(301, '/refund'));
app.get('/contact.html', (req, res) => res.redirect(301, '/contact'));
app.get('/about.html', (req, res) => res.redirect(301, '/about'));
app.get('/delivery-policy.html', (req, res) => res.redirect(301, '/delivery-policy'));

app.get('/delivery-policy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'delivery-policy.html'));
});

app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

app.get('/refund', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'refund.html'));
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

// Unsubscribe page
app.get('/unsubscribe', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'unsubscribe.html'));
});

app.get('/api/admin/messages', authAdmin, async (req, res) => {
    try {
        const messages = await Contact.find().sort({ createdAt: -1 });
        res.json(messages); // This sends the JSON that admin.js expects
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch messages' });
    }
});

// ---- SEARCH ORDERS (For Disputes & Refunds) ----
app.get("/api/admin/search-orders", authAdmin, async (req, res) => {
  try {
    const { email, orderId } = req.query;
    if (!email && !orderId) return res.status(400).json({ success: false, message: "Email or Order ID required" });

    let query = {};
    if (orderId) {
        query.razorpayOrderId = orderId.trim();
    } else if (email) {
        query.buyerEmail = new RegExp(email, 'i');
    }

    // Find orders and populate course details
    const orders = await Order.find(query)
      .populate("courseId", "title price")
      .sort({ createdAt: -1 });

    res.json({ success: true, orders });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ success: false, message: "Search failed" });
  }
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

  } else if (forceReset) {
    admin.passwordHash = await bcrypt.hash(defaultPassword, 12);
    admin.totpEnabled = false;
    admin.totpSecret = "";
    await admin.save();

  } else {

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