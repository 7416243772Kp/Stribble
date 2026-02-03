import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const protectUser = async (req, res, next) => {
  let token;
  // Get token from HttpOnly cookie (more secure than localStorage)
  if (req.cookies.user_token) {
    token = req.cookies.user_token;
  }

  if (!token) {
    // If it's an API call, return 401 JSON, otherwise redirect
    if (req.originalUrl.startsWith('/api/') && !req.originalUrl.includes('/stream/')) {
        return res.status(401).json({ success: false, message: 'Not authorized' });
    }
    return res.status(401).redirect('/login'); // Force login if no token
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    // 🔒 CONCURRENCY CHECK:
    // Does the token in the cookie match the one in the database?
    if (!user || user.activeSessionToken !== token) {
        // If not, it means someone else logged in on another device
        res.clearCookie('user_token');
        // If API, return 401
        if (req.originalUrl.startsWith('/api/')) {
           return res.status(401).json({ success: false, message: 'Session expired' });
        }
        return res.status(401).send('<h1>Session Expired</h1><p>You have logged in on another device.</p><a href="/login">Login again</a>');
    }

    req.user = user;
    next();
  } catch (error) {
    res.clearCookie('user_token');
    if (req.originalUrl.startsWith('/api/')) {
        return res.status(401).json({ success: false, message: 'Not authorized' });
    }
    return res.status(401).redirect('/login');
  }
};

export default protectUser;
