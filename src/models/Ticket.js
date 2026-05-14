import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema({
    message: { type: String, required: true },
    addedBy: { type: String, enum: ['User', 'Admin'], required: true },
    createdAt: { type: Date, default: Date.now }
});

const ticketSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ticketId: { type: String, unique: true },
    category: { type: String, required: true },
    subject: { type: String, required: true },
    description: { type: String, required: true },
    attachments: [{ type: String }],
    status: { 
        type: String, 
        enum: ['Requested', 'Waiting for Response', 'Resolved'], 
        default: 'Requested' 
    },
    notes: [noteSchema] 
}, { timestamps: true });

ticketSchema.pre('save', function(next) {
    if (!this.ticketId) {
        this.ticketId = 'TKT-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    }
    next();
});

const Ticket = mongoose.model('Ticket', ticketSchema);
export default Ticket;