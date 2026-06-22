import express from 'express';
import passport from 'passport';

import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Review from '../models/Review.js'; // Import Review Model
import bcrypt from 'bcrypt';
import validator from 'validator';
import { z } from 'zod';
import crypto from 'crypto';

const router = express.Router();

const USER_TOKEN_COOKIE = 'user_token';
const DEVICE_ID_COOKIE = 'device_id';
const USER_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const DEVICE_ID_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const DEVICE_LOCK_DAYS = 10;

class DeviceLockError extends Error {
    constructor(lockedUntil) {
        const availableDate = new Intl.DateTimeFormat('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(lockedUntil);

        super(`Account is locked to a different device. You cannot login here until ${availableDate}.`);
        this.name = 'DeviceLockError';
        this.lockedUntil = lockedUntil;
    }
}

function authCookieOptions(maxAge) {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        maxAge,
    };
}

function clearAuthCookieOptions() {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
    };
}

function getOrCreateDeviceId(req, res) {
    const existingDeviceId = req.cookies?.[DEVICE_ID_COOKIE];

    if (
        typeof existingDeviceId === 'string' &&
        existingDeviceId.length >= 16 &&
        existingDeviceId.length <= 128
    ) {
        return existingDeviceId;
    }

    const deviceId = crypto.randomUUID();
    res.cookie(DEVICE_ID_COOKIE, deviceId, authCookieOptions(DEVICE_ID_MAX_AGE_MS));
    return deviceId;
}

function getDeviceName(req) {
    return String(req.headers['user-agent'] || 'Unknown Device').slice(0, 255);
}

function applyDeviceLock(user, req, res) {
    const currentDeviceId = getOrCreateDeviceId(req, res);
    const currentDeviceHash = User.hashDeviceId(currentDeviceId);
    const now = new Date();
    const lockedUntil = user.deviceLock?.lockedUntil ? new Date(user.deviceLock.lockedUntil) : null;
    const storedDeviceId = user.deviceLock?.deviceId;

    if (lockedUntil && lockedUntil > now && storedDeviceId) {
        if (storedDeviceId !== currentDeviceHash && storedDeviceId !== currentDeviceId) {
            throw new DeviceLockError(lockedUntil);
        }

        if (storedDeviceId === currentDeviceId) {
            user.deviceLock.deviceId = currentDeviceHash;
        }

        return;
    }

    user.deviceLock = {
        deviceId: currentDeviceHash,
        deviceName: getDeviceName(req),
        lockedUntil: new Date(now.getTime() + DEVICE_LOCK_DAYS * 24 * 60 * 60 * 1000),
    };
}

function setUserTokenCookie(res, sessionToken) {
    res.cookie(USER_TOKEN_COOKIE, sessionToken, authCookieOptions(USER_SESSION_MAX_AGE_MS));
}

async function issueUserSession(user, req, res) {
    applyDeviceLock(user, req, res);

    const sessionToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    user.activeSessionToken = sessionToken;
    await user.save();
    setUserTokenCookie(res, sessionToken);

    return sessionToken;
}

async function clearActiveSession(req) {
    const token = req.cookies?.[USER_TOKEN_COOKIE];

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).select('activeSessionToken deviceLock');
            if (
                user &&
                user.activeSessionToken === User.hashSessionToken(token) &&
                User.isDeviceLockMatch(user, req.cookies?.[DEVICE_ID_COOKIE])
            ) {
                await User.updateOne(
                    { _id: user._id, activeSessionToken: User.hashSessionToken(token) },
                    { $unset: { activeSessionToken: 1 } }
                );
            }
            return;
        } catch (e) {}
    }

    if (req.user?._id) {
        const user = await User.findById(req.user._id).select('deviceLock');
        if (user && User.isDeviceLockMatch(user, req.cookies?.[DEVICE_ID_COOKIE])) {
            await User.findByIdAndUpdate(req.user._id, { $unset: { activeSessionToken: 1 } });
        }
    }
}

async function findActiveSessionUser(req, populatePath) {
    const token = req.cookies?.[USER_TOKEN_COOKIE];
    if (!token) return null;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        let query = User.findById(decoded.id);
        if (populatePath) query = query.populate(populatePath);

        const user = await query;
        if (
            !user ||
            user.activeSessionToken !== User.hashSessionToken(token) ||
            !User.isDeviceLockMatch(user, req.cookies?.[DEVICE_ID_COOKIE])
        ) {
            return null;
        }

        return user;
    } catch (e) {
        return null;
    }
}

function handleDeviceLockError(res, err) {
    return res.status(403).json({
        success: false,
        message: err.message,
        lockedUntil: err.lockedUntil,
    });
}

// Passport Config is now in src/config/passport.js

// Routes
// Routes
router.get('/google', (req, res, next) => {
    // Dynamic Callback URL Construction
    const protocol = req.protocol;
    const host = req.get('host');
    const callbackURL = `${protocol}://${host}/auth/google/callback`;
    
    passport.authenticate('google', { 
        scope: ['profile', 'email'],
        callbackURL: callbackURL
    })(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
    const protocol = req.protocol;
    const host = req.get('host');
    const callbackURL = `${protocol}://${host}/auth/google/callback`;

    passport.authenticate('google', { 
        failureRedirect: '/login',
        callbackURL: callbackURL
    })(req, res, next);
}, async (req, res) => {
    try {
        await issueUserSession(req.user, req, res);

        // Redirect to Home
        res.redirect('/'); 
    } catch (err) {
        if (err instanceof DeviceLockError) {
            res.clearCookie(USER_TOKEN_COOKIE, clearAuthCookieOptions());
            return req.logout(() => {
                res.redirect(`/?openLogin=1&authError=${encodeURIComponent(err.message)}`);
            });
        }

        console.error("Auth callback error:", err);
        res.redirect('/login');
    }
});

// In-memory OTP store (Use Redis in production)
const otpStore = new Map(); // { email: { otp, expiresAt, name, passwordHash } }

import { sendEmail } from '../utils/email.js';

const signupSchema = z.object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(50, 'Name is too long'),
    email: z.string().trim().email('Invalid email address format'),
    password: z.string().min(6, 'Password must be at least 6 characters')
});

const loginSchema = z.object({
    email: z.string().trim().email('Invalid email format'),
    password: z.string().min(1, 'Password is required')
});

function normalizeAuthEmail(email) {
    return validator.normalizeEmail(email) || email.trim().toLowerCase();
}

// 1. SIGNUP STEP 1: Request OTP
router.post('/signup', async (req, res) => {
    try {
        const validationResult = signupSchema.safeParse(req.body);

        if (!validationResult.success) {
            const errorMessage = validationResult.error.issues[0]?.message || 'Invalid signup data';
            return res.status(400).json({ success: false, message: errorMessage });
        }

        const { name, password } = validationResult.data;
        const email = normalizeAuthEmail(validationResult.data.email);

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "User already exists. Please login." });
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Hash password temporarily so we don't store plain text even in memory
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Store in memory (Expires in 10 mins)
        otpStore.set(email, {
            otp,
            name,
            passwordHash: hashedPassword,
            expiresAt: Date.now() + 10 * 60 * 1000
        });

        // Send Email
        const emailSent = await sendEmail({
            to: email,
            subject: "Your Verification Code - Stribble",
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #3b82f6;">Verify your email</h2>
                    <p>Hi ${name},</p>
                    <p>Use the code below to complete your signup:</p>
                    <div style="font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #2563eb; margin: 20px 0;">${otp}</div>
                    <p>This code expires in 10 minutes.</p>
                </div>
            `
        });

        if (!emailSent) {
            return res.status(500).json({ success: false, message: "Failed to send OTP email" });
        }

        res.json({ success: true, message: "OTP sent to your email", step: "otp" });

    } catch (err) {
        console.error("Signup error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// 2. SIGNUP STEP 2: Verify OTP & Create Account
router.post('/verify-otp', async (req, res) => {
    try {
        let { email, otp } = req.body;

        if (typeof email === 'string') {
            email = normalizeAuthEmail(email);
        }

        if (!email || !otp) {
            return res.status(400).json({ success: false, message: "Email and OTP required" });
        }

        const record = otpStore.get(email);

        if (!record) {
            return res.status(400).json({ success: false, message: "OTP expired or invalid request" });
        }

        if (record.expiresAt < Date.now()) {
            otpStore.delete(email);
            return res.status(400).json({ success: false, message: "OTP expired" });
        }

        if (record.otp !== otp) {
             return res.status(400).json({ success: false, message: "Invalid OTP" });
        }

        // Create User
        const user = await User.create({
            name: record.name,
            email: email,
            password: record.passwordHash, // Already hashed
        });

        // Clear OTP
        otpStore.delete(email);

        await issueUserSession(user, req, res);
        res.json({ success: true, user: { id: user._id, name: user.name, email: user.email } });

    } catch (err) {
        if (err instanceof DeviceLockError) {
            return handleDeviceLockError(res, err);
        }

        console.error("OTP Verification Error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// 3. FORGOT PASSWORD STEP 1: Request OTP
router.post('/forgot-password', async (req, res) => {
    try {
        let { email } = req.body;

        if (typeof email === 'string') {
            email = normalizeAuthEmail(email);
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Store purpose to distinguish from signup
        otpStore.set(email, {
            otp,
            expiresAt: Date.now() + 10 * 60 * 1000,
            purpose: 'reset'
        });

        await sendEmail({
            to: email,
            subject: "Reset Password Code - Stribble",
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #3b82f6;">Reset Your Password</h2>
                    <p>Use the code below to reset your password:</p>
                    <div style="font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #2563eb; margin: 20px 0;">${otp}</div>
                    <p>If you didn't request this, ignore this email.</p>
                </div>
            `
        });

        res.json({ success: true, message: "OTP sent to email" });

    } catch (err) {
        console.error("Forgot Password Error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// 4. FORGOT PASSWORD STEP 2: Reset Password
router.post('/reset-password', async (req, res) => {
    try {
        let { email, otp, newPassword } = req.body;

        if (typeof email === 'string') {
            email = normalizeAuthEmail(email);
        }
        
        const record = otpStore.get(email);
        
        if (!record || record.purpose !== 'reset') {
             return res.status(400).json({ success: false, message: "Invalid or expired request" });
        }
        
        if (record.expiresAt < Date.now()) {
            otpStore.delete(email);
            return res.status(400).json({ success: false, message: "OTP expired" });
        }

        if (record.otp !== otp) {
             return res.status(400).json({ success: false, message: "Invalid OTP" });
        }

        // Update Password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        await User.findOneAndUpdate({ email }, { password: hashedPassword });
        
        otpStore.delete(email);
        
        res.json({ success: true, message: "Password reset successfully" });

    } catch (err) {
        console.error("Reset Password Error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Email/Password Login
router.post('/login', async (req, res) => {
    try {
        const validationResult = loginSchema.safeParse(req.body);

        if (!validationResult.success) {
            return res.status(400).json({ success: false, message: "Invalid email or password format" });
        }

        const { password } = validationResult.data;
        const email = normalizeAuthEmail(validationResult.data.email);

        const user = await User.findOne({ email });
        if (!user || !user.password) { // Check if user exists and has a password (not just Google Auth)
            return res.status(400).json({ success: false, message: "Invalid credentials" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: "Invalid credentials" });
        }

        await issueUserSession(user, req, res);
        res.json({ success: true, user: { id: user._id, name: user.name, email: user.email } });

    } catch (err) {
        if (err instanceof DeviceLockError) {
            return handleDeviceLockError(res, err);
        }

        console.error("Login error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Logout
router.post('/logout', async (req, res) => { // Changed to POST for better security practice
    try {
        await clearActiveSession(req);
    } catch (e) {
        console.error("Logout DB clear error:", e);
    }

    res.clearCookie(USER_TOKEN_COOKIE, clearAuthCookieOptions());
    req.logout(() => {
        res.json({ success: true, message: "Logged out" });
    });
});
router.get('/logout', async (req, res) => { // Keep GET for legacy/link support
    try {
        await clearActiveSession(req);
    } catch (e) {
        console.error("Logout DB clear error:", e);
    }

    res.clearCookie(USER_TOKEN_COOKIE, clearAuthCookieOptions());
    req.logout(() => {
        res.redirect('/');
    });
});

import Order from '../models/order.js';

// Get User Orders (History)
router.get('/orders', async (req, res) => {
    try {
        const user = await findActiveSessionUser(req);
        if (!user) {
            res.clearCookie(USER_TOKEN_COOKIE, clearAuthCookieOptions());
            return res.status(401).json({ success: false });
        }

        const orders = await Order.find({ buyerEmail: user.email, status: 'completed' })
            .sort({ createdAt: -1 })
            .select('paymentProvider paymentOrderId cashfreeOrderId razorpayOrderId courseId amount ownerAmount createdAt status')
            .populate('courseId', 'title thumbnail');

        res.json({ success: true, orders });
    } catch (err) {
        console.error("Order fetch error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Get Current User (Helper for frontend)
router.get('/me', async (req, res) => {
    try {
        const user = await findActiveSessionUser(req, 'purchasedCourses');
        if (!user) {
            res.clearCookie(USER_TOKEN_COOKIE, clearAuthCookieOptions());
            return res.status(401).json({ success: false });
        }

        // Fetch user reviews
        const reviews = await Review.find({ userId: user._id }).select('courseId');
        const reviewedIds = reviews.map(r => r.courseId.toString());

        res.json({ 
            success: true, 
            user: { 
                id: user._id, 
                email: user.email, 
                name: user.name, 
                purchasedCourses: user.purchasedCourses,
                reviewedCourses: reviewedIds // Send list of reviewed course IDs
            } 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

export default router;
