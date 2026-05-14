import express from 'express';
import { createTicket, addNoteToTicket } from '../controllers/ticketController.js';
import { authUser } from '../middleware/authUser.js';
import { uploadTicketImages, sanitizeImages } from '../middleware/uploadMiddleware.js';

const router = express.Router();

router.post('/create', 
    authUser, 
    uploadTicketImages, 
    sanitizeImages,     
    createTicket 
);

router.post('/:id/note', authUser, addNoteToTicket);

export default router;