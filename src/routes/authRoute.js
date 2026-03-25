/**
 * routes/authRoute.js
 * POST /auth/login — checks users.json (multi-user) first, then falls back
 * to DASHBOARD_USERNAME/DASHBOARD_PASSWORD env vars for backward compat.
 * Issues JWT tokens for dashboard access.
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import logger from '../middleware/logger.js';

const router = Router();
async function loadUsers() {
  try {
    const snapshot = await db.collection('users').get();
    return snapshot.docs.map(d => d.data());
  } catch (err) {
    logger.error(`[Firestore] Failed to load users for auth: ${err.message}`);
    return [];
  }
}

router.post('/auth/login', authLimiter, async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  // ── 1. Check users.json (multi-user registry) ──────────────────────────
  const users = await loadUsers();
  const found = users.find(u => u.username.toLowerCase() === username.toLowerCase());

  if (found) {
    const valid = await bcrypt.compare(password, found.passwordHash);
    if (!valid) {
      logger.warn(`Auth: Failed login for "${username.slice(0, 20)}" from ${req.ip}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { sub: found.username, role: found.role, userId: found.id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    logger.info(`Auth: Login OK for "${found.username}" (${found.role}) from ${req.ip}`);
    return res.json({ token, expiresIn: '24h', username: found.username, role: found.role });
  }

  // ── 2. Fallback: env-based admin credentials (backward compat) ──────────
  const expectedUser = process.env.DASHBOARD_USERNAME || 'admin';
  const expectedPass = process.env.DASHBOARD_PASSWORD || '';

  const userBuf = Buffer.from(username);
  const passBuf = Buffer.from(password);
  const expUserBuf = Buffer.from(expectedUser);
  const expPassBuf = Buffer.from(expectedPass);

  const userMatch =
    userBuf.length === expUserBuf.length &&
    crypto.timingSafeEqual(userBuf, expUserBuf);

  const passMatch =
    passBuf.length === expPassBuf.length &&
    crypto.timingSafeEqual(passBuf, expPassBuf);

  if (!userMatch || !passMatch) {
    logger.warn(`Auth: Failed login for "${username.slice(0, 20)}" from ${req.ip}`);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { sub: username, role: 'admin', userId: 'env-admin' },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  logger.info(`Auth: Login OK (env-admin) for "${username}" from ${req.ip}`);
  return res.json({ token, expiresIn: '24h', username, role: 'admin' });
});

export default router;
