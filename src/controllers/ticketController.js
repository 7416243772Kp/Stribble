import Ticket from '../models/Ticket.js';

export const createTicket = async (req, res) => {
    try {
        const userId = req.user._id;

        // Rate Limit Check
        const activeTicketsCount = await Ticket.countDocuments({
            user: userId,
            status: { $ne: 'Resolved' }
        });

        if (activeTicketsCount >= 2) {
            return res.status(429).json({ 
                success: false, 
                message: "You have 2 active tickets. Please wait until one is resolved before opening another." 
            });
        }

        const newTicket = new Ticket({
            user: userId,
            category: req.body.category,
            subject: req.body.subject,
            description: req.body.description,
            attachments: req.body.attachments || [] 
        });

        await newTicket.save();
        res.status(201).json({ success: true, ticket: newTicket });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const addNoteToTicket = async (req, res) => {
    try {
        const ticket = await Ticket.findOne({ _id: req.params.id, user: req.user._id });
        if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });
        if (ticket.status === 'Resolved') return res.status(400).json({ success: false, message: "Cannot edit a resolved ticket." });

        ticket.notes.push({ message: req.body.message, addedBy: 'User' });
        await ticket.save();
        
        res.json({ success: true, ticket });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};