import express from 'express';
import passport from 'passport';

import jwt from 'jsonwebtoken';
import User from '../models/User.js';
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
        const sessionToken = jwt.sign({ id: req.user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
        
        // 🔒 SAVE TOKEN TO DB (Invalidates previous sessions)
        req.user.activeSessionToken = sessionToken;
        await req.user.save();

        // Send as HttpOnly Cookie
        res.cookie('user_token', sessionToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
        
        // Redirect to Home
        res.redirect('/'); 
    } catch (err) {
        console.error("Auth callback error:", err);
        res.redirect('/login');
    }
});

// Email/Password Signup
router.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Basic validation
        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: "Please provide all fields" });
        }

        // Check if user exists
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ success: false, message: "User already exists" });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        user = await User.create({
            name,
            email,
            password: hashedPassword,
        });

        // Auto-login (Generate Token)
        const sessionToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
        
        user.activeSessionToken = sessionToken;
        await user.save();

        res.cookie('user_token', sessionToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
        res.status(201).json({ success: true, user: { id: user._id, name: user.name, email: user.email } });

    } catch (err) {
        console.error("Signup error:", err);
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
        const sessionToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
        
        user.activeSessionToken = sessionToken;
        await user.save();

        res.cookie('user_token', sessionToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
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

        res.json({ 
            success: true, 
            user: { 
                id: user._id, 
                email: user.email, 
                name: user.name, 
                purchasedCourses: user.purchasedCourses 
            } 
        });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

export default router;
