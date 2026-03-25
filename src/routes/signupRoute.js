/**
 * src/routes/signupRoute.js
 * POST /auth/signup — creates a new user account (bcrypt-hashed password).
 * Saves to data/users.json. Returns a JWT on success.
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import logger from '../middleware/logger.js';

const router = Router();

// Load users from Firestore
async function loadUsers() {
  try {
    const snapshot = await db.collection('users').get();
    return snapshot.docs.map(doc => doc.data());
  } catch (err) {
    logger.error(`[Firestore] Failed to load users: ${err.message}`);
    return [];
  }
}

// Save user to Firestore
async function saveUser(user) {
  await db.collection('users').doc(user.id).set(user);
}

// POST /auth/signup
router.post('/auth/signup', authLimiter, async (req, res) => {
  const { username, password, email } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  // Validate
  if (username.length < 3 || username.length > 32) {
    return res.status(400).json({ error: 'Username must be 3–32 characters' });
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return res.status(400).json({ error: 'Username may only contain letters, numbers, _ and -' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const users = await loadUsers();

  // Check duplicate
  if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  // Hash and save
  const hash = await bcrypt.hash(password, 12);
  const newUser = {
    id: `u_${Date.now()}`,
    username,
    email: email || null,
    passwordHash: hash,
    role: users.length === 0 ? 'admin' : 'user', // first user is admin
    createdAt: new Date().toISOString(),
  };

  try {
    await saveUser(newUser);
  } catch (err) {
    logger.error(`[Firestore] Failed to save user signup: ${err.message}`);
    return res.status(500).json({ error: 'Internal database error during signup' });
  }

  const token = jwt.sign(
    { sub: username, role: newUser.role, userId: newUser.id },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  logger.info(`Signup: new user "${username}" (role: ${newUser.role}) from ${req.ip}`);
  return res.status(201).json({ token, expiresIn: '24h', username, role: newUser.role, firstLogin: true });
});

export default router;
