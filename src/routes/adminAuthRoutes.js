// src/routes/adminAuthRoutes.js
import express from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import crypto from "crypto";
import dotenv from "dotenv";
import { encrypt, decrypt, isEncrypted } from "../utils/crypto.js";
import AdminUser from "../models/AdminUser.js";
import authAdmin from "../middleware/authAdmin.js";
// Email import removed

dotenv.config();
const router = express.Router();

// =============================
// Config
// =============================
if (!process.env.JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET is not defined.");
}
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = "24h";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per window
  message: { success: false, message: "Too many login attempts. Please try again later." }
});

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "praveenkunche975@gmail.com").toLowerCase();

// =============================
// In-memory stores
// =============================
const tempTokenStore = new Map(); // 2FA temp sessions
const otpStore = new Map(); // password reset OTPs

// =============================
// Helpers
// =============================
function generateTempToken() {
  return crypto.randomBytes(32).toString("hex");
}
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Centralized cookie setter
function setAdminCookie(req, res, token) {
  const forceSecure = (process.env.COOKIE_SECURE || "").toLowerCase() === "true";
  const viaHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
  const secureCookie = forceSecure || viaHttps; // on localhost http, this is false

  // Scope cookie tightly to admin API paths and use strict SameSite
  res.cookie("adminToken", token, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "Strict", // prevents most cross-site sends
    maxAge: 24 * 60 * 60 * 1000, // 1 day (adjust as needed)
    path: "/", // cookie only sent for admin routes
  });
}

// Email sending removed

// =============================
// Check auth status
// =============================
router.get("/check", async (req, res) => {
  try {
    const token = req.cookies?.adminToken;
    if (!token) return res.json({ success: true, authenticated: false });

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const admin = await AdminUser.findById(decoded.id);
      if (!admin) return res.json({ success: true, authenticated: false });
      return res.json({ success: true, authenticated: true, email: admin.email });
    } catch {
      return res.json({ success: true, authenticated: false });
    }
  } catch (err) {
    console.error("Auth check error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// optional: status for settings UI
router.get("/totp-status", authAdmin, async (req, res) => {
  try {
    const admin = await AdminUser.findById(req.admin.id);
    if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });
    res.json({ success: true, totpEnabled: !!admin.totpEnabled });
  } catch (err) {
    console.error("TOTP status error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// =============================
// Login: email+password → setupTotp or requireTotp
// =============================
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    const admin = await AdminUser.findOne({ email: String(email).toLowerCase() });
    if (!admin) return res.status(401).json({ success: false, message: "Invalid credentials" });

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) return res.status(401).json({ success: false, message: "Invalid credentials" });

    // If TOTP enabled and secret present -> require second step
    if (admin.totpEnabled && admin.totpSecret) {
      const tempToken = generateTempToken();
      tempTokenStore.set(tempToken, {
        adminId: admin._id.toString(),
        expiresAt: Date.now() + 10 * 60 * 1000,
      });
      return res.json({ success: true, requireTotp: true, tempToken });
    }

    // First-time setup (no TOTP yet)
    if (!admin.totpEnabled) {
      const secret = speakeasy.generateSecret({
        name: `CourseHub (${admin.email})`,
        issuer: "CourseHub Admin",
      });
      const qrCode = await QRCode.toDataURL(secret.otpauth_url);
      const tempToken = generateTempToken();
      tempTokenStore.set(tempToken, {
        adminId: admin._id.toString(),
        totpSecret: secret.base32,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });
      return res.json({ success: true, setupTotp: true, qrCode, secret: secret.base32, tempToken });
    }

    // Fallback (unlikely path) — sign and set cookie
    const token = jwt.sign({ id: admin._id, email: admin.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    setAdminCookie(req, res, token);
    return res.json({ success: true, message: "Login successful" });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// =============================
// Setup TOTP (initial QR verify)
// =============================
router.post("/setup-totp", async (req, res) => {
  try {
    const { tempToken, token } = req.body;
    if (!tempToken || !token) return res.status(400).json({ success: false, message: "Missing required fields" });

    const temp = tempTokenStore.get(tempToken);
    if (!temp || Date.now() > temp.expiresAt || !temp.totpSecret) {
      return res.status(401).json({ success: false, message: "Invalid or expired session" });
    }

    const verified = speakeasy.totp.verify({
      secret: temp.totpSecret,
      encoding: "base32",
      token,
      window: 2,
    });
    if (!verified) return res.status(400).json({ success: false, message: "Invalid code. Please try again." });

    const admin = await AdminUser.findByIdAndUpdate(
      temp.adminId,
      { totpSecret: encrypt(temp.totpSecret), totpEnabled: true },
      { new: true }
    );
    if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });

    tempTokenStore.delete(tempToken);

    const jwtToken = jwt.sign({ id: admin._id, email: admin.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    setAdminCookie(req, res, jwtToken);

    return res.json({ success: true, message: "2FA enabled successfully" });
  } catch (err) {
    console.error("TOTP setup error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

const totpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: "Too many login attempts. Please try again later." }
});

// =============================
// Verify TOTP (login step 2)
// =============================
router.post("/verify-totp", totpLimiter, async (req, res) => {
  try {
    const { tempToken, token } = req.body;
    if (!tempToken || !token) return res.status(400).json({ success: false, message: "Missing required fields" });

    const temp = tempTokenStore.get(tempToken);
    if (!temp || Date.now() > temp.expiresAt) {
      return res.status(401).json({ success: false, message: "Invalid or expired session" });
    }

    const admin = await AdminUser.findById(temp.adminId);
    if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });

    const decryptedSecret = decrypt(admin.totpSecret);
    const ok = speakeasy.totp.verify({
      secret: decryptedSecret,
      encoding: "base32",
      token,
      window: 2,
    });
    if (!ok) return res.status(400).json({ success: false, message: "Invalid code. Please try again." });

    tempTokenStore.delete(tempToken);

    const jwtToken = jwt.sign({ id: admin._id, email: admin.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    setAdminCookie(req, res, jwtToken);

    return res.json({ success: true, message: "Login successful" });
  } catch (err) {
    console.error("TOTP verify error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// =============================
// Change password (logged-in)
// =============================
router.post("/change-password", authAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ success: false, message: "Current and new passwords are required" });
    if (newPassword.length < 8)
      return res.status(400).json({ success: false, message: "New password must be at least 8 characters" });

    const admin = await AdminUser.findById(req.admin.id);
    if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });

    const ok = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!ok) return res.status(401).json({ success: false, message: "Current password is incorrect" });

    admin.passwordHash = await bcrypt.hash(newPassword, 12);
    await admin.save();

    res.json({ success: true, message: "Password changed successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// =============================
// Forgot password (no email prompt)
// =============================
router.post("/forgot-password", async (_req, res) => {
  try {
    const admin = await AdminUser.findOne({ email: ADMIN_EMAIL });
    if (!admin) {
      console.error("Admin record not found for email:", ADMIN_EMAIL);
      // IMPORTANT: Return here
      return res.status(404).json({ success: false, message: "Admin account not found." });
    }

    const otp = generateOTP();
    otpStore.set(ADMIN_EMAIL, {
      otp,
      adminId: admin._id.toString(),
      attempts: 0,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    // Email service disabled
    return res.status(403).json({ success: false, message: "Password reset via email is disabled. Please contact support." });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

// =============================
// Reset password with OTP (no email field)
// =============================
router.post("/reset-password", async (req, res) => {
  try {
    const { code, newPassword } = req.body;
    if (!code || !newPassword) return res.status(400).json({ success: false, message: "OTP and new password are required" });
    if (newPassword.length < 8)
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });

    const record = otpStore.get(ADMIN_EMAIL);
    if (!record) return res.status(400).json({ success: false, message: "No OTP requested. Please request a new one." });
    if (Date.now() > record.expiresAt) {
      otpStore.delete(ADMIN_EMAIL);
      return res.status(400).json({ success: false, message: "OTP expired. Please request a new one." });
    }
    if (record.attempts >= 3) {
      otpStore.delete(ADMIN_EMAIL);
      return res.status(400).json({ success: false, message: "Too many failed attempts. Request a new OTP." });
    }
    if (record.otp !== code) {
      record.attempts++;
      otpStore.set(ADMIN_EMAIL, record);
      return res.status(400).json({ success: false, message: `Invalid OTP. ${3 - record.attempts} attempts left.` });
    }

    const admin = await AdminUser.findByIdAndUpdate(
      record.adminId,
      { passwordHash: await bcrypt.hash(newPassword, 12) },
      { new: true }
    );
    if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });

    otpStore.delete(ADMIN_EMAIL);
    res.json({ success: true, message: "Password reset successful. 2FA disabled. Please set it up again after login." });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Logout
router.post("/logout", (req, res) => {
  // clear the admin cookie using the same path and flags
  const forceSecure = (process.env.COOKIE_SECURE || "").toLowerCase() === "true";
  const viaHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
  const secureCookie = forceSecure || viaHttps;

  res.clearCookie("adminToken", {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "Strict",
    path: "/",
  });
  res.json({ success: true, message: "Logged out successfully" });
});

// Cleanup expired temp sessions/OTPs
setInterval(() => {
  const now = Date.now();
  for (const [key, v] of tempTokenStore.entries()) if (now > v.expiresAt) tempTokenStore.delete(key);
  for (const [key, v] of otpStore.entries()) if (now > v.expiresAt) otpStore.delete(key);
}, 5 * 60 * 1000);

export default router;