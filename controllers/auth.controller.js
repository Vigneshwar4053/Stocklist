import jwt from 'jsonwebtoken';
import { User } from '../models/user.model.js';

export const login = async (req, res) => {
  try {
    const body = req.body || {};
    const username = body.username;
    const password = body.password;

    if (!username || !password) {
      return res.status(400).json({ message: 'username and password are required in JSON body' });
    }

    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user._id, role: user.role, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user._id, username: user.username, role: user.role } });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
