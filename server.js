// C:\Ebook\server.js
// = Environment & Core Imports =
import 'dotenv/config'; // This MUST be the very first line

import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";
import passport from "passport";
import session from "express-session";
import { RedisStore } from "connect-redis";
import { createClient } from "redis";
import "./src/config/passport.js";
import {
  buildCashfreeCustomerId,
  buildCashfreeIdempotencyKey,
  buildCashfreeOrderId,
  cashfreeConfigReady,
  createCashfreeOrder,
  fetchCashfreeOrder,
  fetchCashfreePayments,
  getCashfreeMode,
  normalizeCashfreeError,
  verifyCashfreeWebhookSignature,
} from "./src/config/cashfree.js";
import { 
  getPayoutToken,
  addUpiBeneficiary,
  requestUpiTransfer,
  addBankBeneficiary,
  requestBankTransfer
} from "./src/config/cashfreePayout.js";

// ==== Models ====
import AdminUser from "./src/models/AdminUser.js";
import Coupon from "./src/models/coupon.js";
import Payment from "./src/models/payment.js";
import Course from "./src/models/course.js";
import Order from "./src/models/order.js";
import Contact from "./src/models/Contact.js";
import User from "./src/models/User.js";
import Unsubscribe from "./src/models/Unsubscribe.js";

// ==== Routes & Middleware ====
import adminRoutes from "./src/routes/adminRoutes.js";
import authRoutes from "./src/routes/authRoutes.js";
import adminAuthRoutes from "./src/routes/adminAuthRoutes.js";
import couponRoutes from "./src/routes/couponRoutes.js";
import courseRoutes from "./src/routes/courseRoutes.js";
import authAdmin from "./src/middleware/authAdmin.js";
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
    // 1. Allow payment popup windows to communicate with checkout.
    crossOriginOpenerPolicy: false,

    // 2. Allow resources from other origins (Prevents blocking images/scripts)
    crossOriginResourcePolicy: { policy: "cross-origin" },

    // 3. Permissions Policy (Fixes "Parse failed" & "Violation" errors)
    //    We let Helmet generate the valid header with double-quotes.
    permissionsPolicy: {
      features: {
        // Allow common checkout risk checks.
        accelerometer: ["*"],
        gyroscope: ["*"],
        magnetometer: ["*"],
        // Allow payment API
        payment: ["self", "https://sdk.cashfree.com", "https://*.cashfree.com"],
      },
    },

    // 4. Content Security Policy
    contentSecurityPolicy: false, // TEMPORARY DEBUG: Disabled CSP to rule it out

    // contentSecurityPolicy: {
    //   directives: {
    //     defaultSrc: ["'self'"],
    //     scriptSrc: [
    //       "'self'",
    //       "https://sdk.cashfree.com",
    //       "https://*.cashfree.com",
    //       "https://cdn.jsdelivr.net",
    //       "'unsafe-inline'",
    //       "'unsafe-eval'"
    //     ],
    //     scriptSrcAttr: ["'unsafe-inline'"],
    //     styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    //     fontSrc: ["'self'", "https://fonts.gstatic.com"],
    //     frameSrc: ["'self'", "https://*.cashfree.com"],
    //     imgSrc: ["'self'", "data:", "https:"],
    //     connectSrc: [
    //       "'self'",
    //       "https://*.cashfree.com",
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
import xss from "xss-clean";

const rawAllowed = (process.env.CORS_ORIGINS || "http://localhost:5000,http://127.0.0.1:8080,http://localhost:8080").split(",").map(s => s.trim());

// allow JSON bodies (already present) + urlencoded for admin forms if needed
// allow JSON bodies (increased limit for base64 uploads)
app.use(express.json({
  limit: "50mb",
  verify: (req, res, buf) => {
    if (req.originalUrl?.startsWith("/api/payment/webhook/cashfree")) {
      req.rawBody = buf.toString("utf8");
    }
  },
}));
app.use(express.urlencoded({ extended: false, limit: "50mb" }));

// cookie parser (populates req.cookies)
app.use(cookieParser());

const xssMiddleware = xss();

// Express 5 exposes req.query via a getter, so make it writable before xss-clean runs.
app.use((req, res, next) => {
  Object.defineProperty(req, "query", {
    value: req.query,
    writable: true,
    configurable: true,
    enumerable: true,
  });
  xssMiddleware(req, res, next);
});

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
  exposedHeaders: [],
}));

// ==== Session & Passport ====
const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
});

redisClient.on("error", (err) => {
  console.error("Redis session error:", err);
});

redisClient.connect().catch((err) => {
  console.error("Redis session connection failed:", err);
});

const sessionConfig = {
  store: new RedisStore({
    client: redisClient,
    prefix: process.env.REDIS_SESSION_PREFIX || "stribble:",
  }),
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
};

app.use(session(sessionConfig));

app.use(passport.initialize());
app.use(passport.session());

// ==== Static Files ====
app.use(['/admin-login', '/admin.html', '/course.html'], (req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

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
//  Payment Helpers
// ============================
function getPublicBaseUrl(req) {
  return String(
    process.env.PUBLIC_BASE_URL ||
    process.env.FRONTEND_URL ||
    `${req.protocol}://${req.get("host")}`
  ).replace(/\/$/, "");
}

function getOrderLookupQuery(providerOrderId) {
  return {
    $or: [
      { paymentOrderId: providerOrderId },
      { cashfreeOrderId: providerOrderId },
      { razorpayOrderId: providerOrderId },
    ],
  };
}

async function findOrderByProviderOrderId(providerOrderId) {
  return Order.findOne(getOrderLookupQuery(providerOrderId)).populate({
    path: "courseId",
    select: "+googleDriveLink title price",
  });
}

function getSuccessfulCashfreePayment(payments) {
  return payments.find((payment) => String(payment.payment_status || "").toUpperCase() === "SUCCESS") || null;
}

function getLatestCashfreePayment(payments) {
  return payments
    .filter(Boolean)
    .sort((a, b) => new Date(b.payment_completion_time || b.payment_time || 0) - new Date(a.payment_completion_time || a.payment_time || 0))[0] || null;
}

function orderTotalAmount(order) {
  return Number(order.ownerAmount || 0) +
    Number(order.influencerCommission || 0) +
    Number(order.ebookCreatorCommission || 0);
}

async function completePaidOrder(order, cashfreeOrder, cashfreePayment) {
  await order.populate({
    path: "courseId",
    select: "+googleDriveLink title price",
  });

  if (order.status !== "completed") {
    order.status = "completed";
    order.paymentProvider = "cashfree";
    order.paymentOrderId = order.cashfreeOrderId || cashfreeOrder?.order_id || order.paymentOrderId;
    order.cashfreeOrderId = cashfreeOrder?.order_id || order.cashfreeOrderId || order.paymentOrderId;
    order.cashfreeCfOrderId = cashfreeOrder?.cf_order_id || order.cashfreeCfOrderId;
    order.cashfreeOrderStatus = cashfreeOrder?.order_status || order.cashfreeOrderStatus || "PAID";
    order.cashfreePaymentId = cashfreePayment?.cf_payment_id || cashfreePayment?.payment_id || order.cashfreePaymentId;
    order.cashfreePaymentStatus = cashfreePayment?.payment_status || order.cashfreePaymentStatus || "SUCCESS";
    order.cashfreeBankReference = cashfreePayment?.bank_reference || order.cashfreeBankReference;
    order.cashfreePaymentGroup = cashfreePayment?.payment_group || order.cashfreePaymentGroup;
    order.paidAt = new Date();
    await order.save();

    if (order.couponId) await Coupon.findByIdAndUpdate(order.couponId, { $inc: { uses: 1 } }).catch(() => { });
    if (order.courseId?._id) await Course.findByIdAndUpdate(order.courseId._id, { $inc: { soldCount: 1 } }).catch(() => { });

    // === CRITICAL: Update User's Purchased Courses ===
    if (order.buyerEmail) {
      await User.findOneAndUpdate(
        { email: order.buyerEmail },
        { $addToSet: { purchasedCourses: order.courseId._id } }
      ).catch(err => console.error("Failed to link course to user:", err));
    }

    await Payment.create({
      email: order.buyerEmail,
      courseId: order.courseId?._id,
      amount: orderTotalAmount(order),
      provider: "cashfree",
      provider_order_id: order.paymentOrderId,
      provider_payment_id: order.cashfreePaymentId || "",
      cashfree_order_id: order.cashfreeOrderId,
      cashfree_cf_order_id: order.cashfreeCfOrderId,
      cashfree_payment_id: order.cashfreePaymentId || "",
      cashfree_order_status: order.cashfreeOrderStatus || "PAID",
      cashfree_payment_status: order.cashfreePaymentStatus || "SUCCESS",
      cashfree_bank_reference: order.cashfreeBankReference || "",
      status: "success",
      createdAt: new Date(),
    });

    // --- TRIGGER PAYOUT QUEUE ---
    if (order.couponId) {
      processPayoutsForOrder(order._id).catch(err => console.error(`Background payout failed for Order ${order._id}:`, err));
    }
  }

  return order;
}

async function processPayoutsForOrder(orderId) {
  const order = await Order.findById(orderId).populate("couponId");
  if (!order || !order.couponId) return;
  
  const coupon = order.couponId;
  
  // Default status mapping to ensure clean tracking
  if (!order.influencerPayoutStatus) order.influencerPayoutStatus = "pending";
  if (!order.creatorPayoutStatus) order.creatorPayoutStatus = "pending";

  try {
    const token = await getPayoutToken();

    // 1. Process Influencer Payout
    if (order.influencerCommission > 0 && order.influencerPayoutStatus === "pending") {
      const beneId = `inf_${coupon._id}`; 
      const transferId = `tr_inf_${order._id}`;

      if (coupon.influencerPayoutMethod === 'bank') {
        await addBankBeneficiary(
          token, beneId, "Influencer Partner", process.env.ADMIN_EMAIL, 
          coupon.influencerBankAccount, coupon.influencerIFSC
        );
        await requestBankTransfer(token, transferId, beneId, order.influencerCommission, "imps");
      } else {
        await addUpiBeneficiary(
          token, beneId, coupon.influencerUpi, "Influencer Partner", process.env.ADMIN_EMAIL
        );
        await requestUpiTransfer(token, transferId, beneId, order.influencerCommission);
      }

      order.influencerTransferId = transferId;
      order.influencerPayoutStatus = "processing"; // Kept in processing until settlement webhook fires
    } else if (order.influencerCommission === 0) {
      order.influencerPayoutStatus = "not_applicable";
    }

    // 2. Process Ebook Creator Payout
    if (order.ebookCreatorCommission > 0 && order.creatorPayoutStatus === "pending") {
      const beneId = `crt_${coupon._id}`; 
      const transferId = `tr_crt_${order._id}`;

      if (coupon.creatorPayoutMethod === 'bank') {
        await addBankBeneficiary(
          token, beneId, "Creator Partner", process.env.ADMIN_EMAIL, 
          coupon.creatorBankAccount, coupon.creatorIFSC
        );
        await requestBankTransfer(token, transferId, beneId, order.ebookCreatorCommission, "imps");
      } else {
        await addUpiBeneficiary(
          token, beneId, coupon.creatorUpi, "Creator Partner", process.env.ADMIN_EMAIL
        );
        await requestUpiTransfer(token, transferId, beneId, order.ebookCreatorCommission);
      }

      order.creatorTransferId = transferId;
      order.creatorPayoutStatus = "processing"; // Kept in processing until settlement webhook fires
    } else if (order.ebookCreatorCommission === 0) {
      order.creatorPayoutStatus = "not_applicable";
    }

    await order.save();
    console.log(`✅ Payouts Queued successfully for order ${order._id}`);

  } catch (error) {
    console.error(`❌ Payout error for order ${order._id}:`, error?.response?.data || error.message);
  }
}

// ==== AWS SES Setup (REMOVED) ====
// const hasAwsCreds = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
// const ses = ... 

const FROM_EMAIL = process.env.SES_FROM_EMAIL || "no-reply@stribble.site";

async function requireUserPage(req, res, next) {
  try {
    const token = req.cookies?.user_token;
    if (!token) return res.redirect('/?openLogin=1');

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('activeSessionToken');

    if (!user || user.activeSessionToken !== token) {
      res.clearCookie('user_token');
      return res.redirect('/?openLogin=1');
    }

    req.user = user;
    next();
  } catch (err) {
    res.clearCookie('user_token');
    return res.redirect('/?openLogin=1');
  }
}

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

// Prevent indexing of sensitive backend routes
app.use(['/api', '/admin', '/private', '/server', '/config'], (req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

// ---- Admin Routes ----
app.use("/auth", authRoutes); // Google Auth
app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/admin", authAdmin, adminRoutes);
app.use("/api/admin/coupons", couponRoutes);
app.use("/api/courses", courseRoutes);

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

    if (!cashfreeConfigReady()) {
      return res.status(500).json({ success: false, message: "Cashfree credentials are not configured" });
    }

    const baseUrl = getPublicBaseUrl(req);
    const cashfreeOrderId = buildCashfreeOrderId();
    const orderAmount = Number(finalAmount.toFixed(2));

    const orderPayload = {
      order_amount: orderAmount,
      order_currency: "INR",
      order_id: cashfreeOrderId,
      customer_details: {
        customer_id: buildCashfreeCustomerId(email),
        customer_phone: process.env.CASHFREE_DEFAULT_CUSTOMER_PHONE || "9999999999",
        customer_email: email,
      },
      order_meta: {
        return_url: `${baseUrl}/checkout/${courseId}?order_id={order_id}`,
        notify_url: process.env.CASHFREE_NOTIFY_URL || `${baseUrl}/api/payment/webhook/cashfree`,
      }
    };
    const cashfreeOrder = await createCashfreeOrder(orderPayload);

    await Order.create({
      courseId,
      couponId: coupon ? coupon._id : null,
      buyerEmail: email,
      influencerCommission,
      ebookCreatorCommission,
      ownerAmount,
      paymentProvider: "cashfree",
      paymentOrderId: cashfreeOrder.order_id,
      cashfreeOrderId: cashfreeOrder.order_id,
      cashfreeCfOrderId: cashfreeOrder.cf_order_id,
      cashfreePaymentSessionId: cashfreeOrder.payment_session_id,
      cashfreeOrderStatus: cashfreeOrder.order_status,
      status: "pending",
      createdAt: new Date(),
    });

    res.json({
      success: true,
      provider: "cashfree",
      orderId: cashfreeOrder.order_id,
      cashfreeOrderId: cashfreeOrder.order_id,
      cfOrderId: cashfreeOrder.cf_order_id,
      paymentSessionId: cashfreeOrder.payment_session_id,
      amount: cashfreeOrder.order_amount,
      currency: cashfreeOrder.order_currency || "INR",
      cashfreeMode: getCashfreeMode(),
    });
  } catch (err) {
    console.error("Order creation failed:", err?.response?.data || err);
    res.status(500).json({ success: false, message: normalizeCashfreeError(err) || "Server error" });
  }
});

// ---- Payment Verification & Course Delivery ----
app.post("/api/payment/verify", paymentLimiter, async (req, res) => {
  try {
    const cashfreeOrderId = req.body.cashfree_order_id || req.body.cashfreeOrderId || req.body.order_id || req.body.orderId;

    if (!cashfreeOrderId)
      return res.status(400).json({ success: false, message: "Missing Cashfree order ID" });

    const order = await findOrderByProviderOrderId(cashfreeOrderId);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    const [cashfreeOrder, cashfreePayments] = await Promise.all([
      fetchCashfreeOrder(cashfreeOrderId),
      fetchCashfreePayments(cashfreeOrderId).catch(() => []),
    ]);

    const successfulPayment = getSuccessfulCashfreePayment(cashfreePayments);
    const latestPayment = successfulPayment || getLatestCashfreePayment(cashfreePayments);
    const orderStatus = String(cashfreeOrder?.order_status || "").toUpperCase();
    const paymentStatus = String(latestPayment?.payment_status || "").toUpperCase();
    const isPaid = orderStatus === "PAID" || paymentStatus === "SUCCESS";

    if (!isPaid) {
      if (["FAILED", "CANCELLED", "USER_DROPPED", "VOID"].includes(orderStatus) || ["FAILED", "CANCELLED", "USER_DROPPED"].includes(paymentStatus)) {
        order.status = "failed";
        order.cashfreeOrderStatus = cashfreeOrder?.order_status || order.cashfreeOrderStatus;
        order.cashfreePaymentStatus = latestPayment?.payment_status || order.cashfreePaymentStatus;
        order.cashfreePaymentId = latestPayment?.cf_payment_id || latestPayment?.payment_id || order.cashfreePaymentId;
        await order.save();
      }

      return res.status(400).json({
        success: false,
        message: "Payment is not successful yet",
        orderStatus: cashfreeOrder?.order_status || "",
        paymentStatus: latestPayment?.payment_status || "",
      });
    }

    await completePaidOrder(order, cashfreeOrder, successfulPayment || latestPayment);

    res.json({
      success: true,
      message: "Payment verified",
      provider: "cashfree",
      orderId: order.cashfreeOrderId || order.paymentOrderId,
      paymentId: order.cashfreePaymentId || "",
      downloadLink: order.courseId?.googleDriveLink || ""
    });

  } catch (err) {
    console.error("Payment verification failed:", err?.response?.data || err);
    res.status(500).json({ success: false, message: normalizeCashfreeError(err) || "Server error" });
  }
});

// Payout Webhook Listener
app.post("/api/payment/webhook/cashfree-payout", async (req, res) => {
  try {
    const signature = req.get("x-webhook-signature");
    // Note: Cashfree Payouts might use a slightly different signature logic than PG.
    // Verify according to Cashfree Payouts documentation.
    
    const { event, transferId, referenceId, status } = req.body;

    // Find the order that matches this transfer ID
    const order = await Order.findOne({
      $or: [{ influencerTransferId: transferId }, { creatorTransferId: transferId }]
    });

    if (!order) return res.status(200).send("Order not found, ignored");

    const isInfluencer = order.influencerTransferId === transferId;
    
    if (status === "SUCCESS") {
      if (isInfluencer) order.influencerPayoutStatus = "completed";
      else order.creatorPayoutStatus = "completed";
    } else if (status === "FAILED" || status === "REVERSED") {
      if (isInfluencer) order.influencerPayoutStatus = "failed";
      else order.creatorPayoutStatus = "failed";
    }

    await order.save();
    res.status(200).send("Webhook received");

  } catch (error) {
    console.error("Payout webhook error:", error);
    res.status(500).send("Error");
  }
});

app.post("/api/payment/webhook/cashfree", async (req, res) => {
  try {
    const signature = req.get("x-webhook-signature");
    const timestamp = req.get("x-webhook-timestamp");
    const rawBody = req.rawBody || JSON.stringify(req.body || {});

    if (!verifyCashfreeWebhookSignature(rawBody, signature, timestamp)) {
      return res.status(401).json({ success: false, message: "Invalid webhook signature" });
    }

    const payload = req.body || {};
    const eventData = payload.data || {};
    const webhookOrder = eventData.order || {};
    const webhookPayment = eventData.payment || {};
    const cashfreeOrderId = webhookOrder.order_id || eventData.order_id;

    if (!cashfreeOrderId) return res.json({ success: true });

    const order = await findOrderByProviderOrderId(cashfreeOrderId);
    if (!order) return res.json({ success: true });

    const paymentStatus = String(webhookPayment.payment_status || "").toUpperCase();
    const orderStatus = String(webhookOrder.order_status || "").toUpperCase();

    if (paymentStatus === "SUCCESS" || orderStatus === "PAID") {
      const [cashfreeOrder, cashfreePayments] = await Promise.all([
        fetchCashfreeOrder(cashfreeOrderId).catch(() => webhookOrder),
        fetchCashfreePayments(cashfreeOrderId).catch(() => [webhookPayment]),
      ]);
      const successfulPayment = getSuccessfulCashfreePayment(cashfreePayments) || webhookPayment;
      await completePaidOrder(order, cashfreeOrder, successfulPayment);
    } else if (["FAILED", "CANCELLED", "USER_DROPPED"].includes(paymentStatus) || ["FAILED", "CANCELLED", "USER_DROPPED", "VOID"].includes(orderStatus)) {
      order.status = "failed";
      order.cashfreeOrderStatus = webhookOrder.order_status || order.cashfreeOrderStatus;
      order.cashfreePaymentStatus = webhookPayment.payment_status || order.cashfreePaymentStatus;
      order.cashfreePaymentId = webhookPayment.cf_payment_id || webhookPayment.payment_id || order.cashfreePaymentId;
      await order.save();
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Cashfree webhook failed:", err?.response?.data || err);
    res.status(500).json({ success: false });
  }
});

app.post("/api/order/log-download", async (req, res) => {
  try {
    const providerOrderId = req.body.orderId || req.body.cashfreeOrderId || req.body.cashfree_order_id || req.body.razorpayOrderId;
    if (!providerOrderId) return res.status(400).json({ success: false });

    await Order.findOneAndUpdate(
      getOrderLookupQuery(providerOrderId),
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
app.get('/adm_lgn', (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Course page - Handles the specific IDs listed in the sitemap above
app.get('/course/:id', requireUserPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'course.html'));
});

// Checkout page 
app.get('/checkout/:id', (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
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
        query = getOrderLookupQuery(orderId.trim());
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
