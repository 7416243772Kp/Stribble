import Contact from './src/models/Contact.js';

// Add this to your main server.js or routes file
app.post('/api/contact', async (req, res) => {
    try {
        const { email, message } = req.body;
        const newContact = new Contact({ email, message });
        await newContact.save();
        res.status(201).json({ success: true, message: 'Message sent successfully!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to send message.' });
    }
});