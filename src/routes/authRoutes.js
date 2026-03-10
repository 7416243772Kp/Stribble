import express from 'express';
import passport from 'passport';

import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Review from '../models/Review.js'; // Import Review Model
import bcrypt from 'bcrypt';

const router = express.Router();

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
        // Generate Session Token
        const sessionToken = jwt.sign({ id: req.user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
        
        // 🔒 SAVE TOKEN TO DB (Invalidates previous sessions)
        req.user.activeSessionToken = sessionToken;
        await req.user.save();

        // Send as HttpOnly Cookie
        res.cookie('user_token', sessionToken, { 
            httpOnly: true, 
            secure: process.env.NODE_ENV === 'production',
            maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
        });
        
        // Redirect to Home
        res.redirect('/'); 
    } catch (err) {
        console.error("Auth callback error:", err);
        res.redirect('/login');
    }
});

// In-memory OTP store (Use Redis in production)
const otpStore = new Map(); // { email: { otp, expiresAt, name, passwordHash } }

import { sendEmail } from '../utils/email.js';

// 1. SIGNUP STEP 1: Request OTP
router.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: "Please provide all fields" });
        }

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
        const { email, otp } = req.body;

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

        // Auto-login
        const sessionToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
        user.activeSessionToken = sessionToken;
        await user.save();

        res.cookie('user_token', sessionToken, { 
            httpOnly: true, 
            secure: process.env.NODE_ENV === 'production',
            maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
        });
        res.json({ success: true, user: { id: user._id, name: user.name, email: user.email } });

    } catch (err) {
        console.error("OTP Verification Error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// 3. FORGOT PASSWORD STEP 1: Request OTP
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
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
        const { email, otp, newPassword } = req.body;
        
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
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: "Please provide email and password" });
        }

        const user = await User.findOne({ email });
        if (!user || !user.password) { // Check if user exists and has a password (not just Google Auth)
            return res.status(400).json({ success: false, message: "Invalid credentials" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: "Invalid credentials" });
        }

        // Generate Token & Enforce Single Session
        const sessionToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
        
        user.activeSessionToken = sessionToken;
        await user.save();

        res.cookie('user_token', sessionToken, { 
            httpOnly: true, 
            secure: process.env.NODE_ENV === 'production',
            maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
        });
        res.json({ success: true, user: { id: user._id, name: user.name, email: user.email } });

    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Logout
router.post('/logout', (req, res) => { // Changed to POST for better security practice
    res.clearCookie('user_token');
    req.logout(() => {
        res.json({ success: true, message: "Logged out" });
    });
});
router.get('/logout', (req, res) => { // Keep GET for legacy/link support
    res.clearCookie('user_token');
    req.logout(() => {
        res.redirect('/');
    });
});

import Order from '../models/order.js';

// Get User Orders (History)
router.get('/orders', async (req, res) => {
    // 1. Get User ID (from Passport or Token)
    let userId = req.user?._id;
    if (!userId) {
        const token = req.cookies.user_token;
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                userId = decoded.id;
            } catch (e) {}
        }
    }

    if (!userId) return res.status(401).json({ success: false });

    // 2. Fetch Orders
    try {
        const user = await User.findById(userId);
        if (!user) return res.status(401).json({ success: false });

        const orders = await Order.find({ buyerEmail: user.email, status: 'completed' })
            .sort({ createdAt: -1 })
            .select('razorpayOrderId courseId amount ownerAmount createdAt status')
            .populate('courseId', 'title thumbnail');

        res.json({ success: true, orders });
    } catch (err) {
        console.error("Order fetch error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Get Current User (Helper for frontend)
router.get('/me', async (req, res) => {
    // Check for passport user or custom JWT middleware user
    // Note: protectUser middleware should ideally be used here if not using passport session
    // But since we use hybrid, we need to manually check if req.user is populated by passport
    // OR we reuse the token verification logic if specific to this route.
    
    // Simplest way: Check if we have a user from Passport (session)
    // If not, we might need to verify the JWT cookie manually if the middleware isn't applied globally.
    // For now, let's assume this is protected or we double check the cookie.
    
    let userId = req.user?._id;

    if (!userId) {
        const token = req.cookies.user_token;
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                userId = decoded.id;
            } catch (e) {}
        }
    }

    if (!userId) return res.status(401).json({ success: false });

    try {
        const user = await User.findById(userId).populate('purchasedCourses');
        if (!user) return res.status(401).json({ success: false });

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
