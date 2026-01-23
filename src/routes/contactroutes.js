import express from 'express';
import Contact from '../models/Contact.js';

const router = express.Router();

// POST / (mapped to /api/contact in server.js)
router.post('/', async (req, res) => {
    try {
        const { email, message } = req.body;
        console.log("👉 Contact POST received:", { email, message });
        
        if (!email || !message) {
            console.warn("⚠️ Contact POST missing fields");
            return res.status(400).json({ success: false, message: 'Email and message are required.' });
        }

        const newContact = new Contact({ email, message });
        await newContact.save();
        console.log("✅ New contact saved:", newContact._id);
        
        res.status(201).json({ success: true, message: 'Message sent successfully!' });
    } catch (error) {
        console.error('Contact error:', error);
        res.status(500).json({ success: false, message: 'Failed to send message.' });
    }
});

export default router;