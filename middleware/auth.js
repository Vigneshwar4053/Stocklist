// middleware/auth.js
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model.js';

/**
 * Auth middleware - verifies Bearer JWT and populates req.user
 * Exports default so routes can import: import auth from '../middleware/auth.js';
 */
export default async function auth(req, res, next) {
  try {
    const authHeader = req.headers?.authorization || req.headers?.Authorization;
    if (!authHeader || typeof authHeader !== 'string') {
      return res.status(401).json({ message: 'Authorization header missing' });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ message: 'Invalid Authorization format' });
    }

    const token = parts[1];
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    // Support either payload.id or payload.sub
    const userId = payload.id || payload.sub;
    if (!userId) return res.status(401).json({ message: 'Token payload missing user id' });

    // Optionally fetch user from DB to ensure user still exists
    const user = await User.findById(userId).select('username role');
    if (!user) return res.status(401).json({ message: 'User not found' });

    // Attach minimal user info to request
    req.user = {
      id: user._id.toString(),
      role: user.role,
      username: user.username
    };

    next();
  } catch (err) {
    console.error('auth middleware error:', err);
    return res.status(500).json({ message: 'Auth middleware error' });
  }
}
