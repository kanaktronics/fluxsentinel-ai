/**
 * middleware/auth.js
 * Two auth mechanisms:
 * 1. validateWebhookSecret — timing-safe comparison for GitLab webhook tokens
 * 2. authenticateDashboard — JWT validation for protected dashboard routes
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import logger from './logger.js';
import { db } from '../db.js';

/**
 * Validates the X-Gitlab-Token header against users in Firestore
 * Uses crypto.timingSafeEqual to prevent timing-based attacks.
 */
export async function validateWebhookSecret(req, res, next) {
  const incomingToken = req.headers['x-gitlab-token'];
  const envToken = process.env.GITLAB_WEBHOOK_SECRET;

  if (!incomingToken) {
    logger.warn('Webhook secret validation failed: missing token');
    return res.status(401).json({ error: 'Unauthorized: Missing webhook token' });
  }

  try {
    const incoming = Buffer.from(incomingToken);
    let matchedUser = null;

    // 1. Check fallback .env token first (for legacy single-user mode)
    if (envToken) {
      const expected = Buffer.from(envToken);
      if (incoming.length === expected.length && crypto.timingSafeEqual(incoming, expected)) {
        matchedUser = { id: 'env-admin', userId: 'env-admin', username: 'admin', role: 'admin', gitlabToken: process.env.GITLAB_TOKEN || '' };
      }
    }

    // 2. If not matched against env, check Firestore
    if (!matchedUser) {
      try {
        // In a production app with thousands of users, it's better to index the webhookSecret and query it.
        // For the hackathon scale, we can fetch all and compare (or query specifically).
        const snapshot = await db.collection('users').where('webhookSecret', '==', incomingToken).get();
        if (!snapshot.empty) {
           matchedUser = snapshot.docs[0].data();
        } else {
           // Fallback to strict timing-safe check across all users if needed
           const allUsers = await db.collection('users').get();
           for (const doc of allUsers.docs) {
             const user = doc.data();
             if (user.webhookSecret) {
               const expected = Buffer.from(user.webhookSecret);
               if (incoming.length === expected.length && crypto.timingSafeEqual(incoming, expected)) {
                 matchedUser = user;
                 break;
               }
             }
           }
        }
      } catch (err) {
        logger.error(`[Firestore] Auth error: ${err.message}`);
      }
    }

    if (!matchedUser) {
      logger.warn('Webhook secret validation failed: token mismatch');
      return res.status(401).json({ error: 'Unauthorized: Invalid webhook token' });
    }

    // Attach matched user so orchestration knows whose GitLab token to use
    req.fluxUser = matchedUser;
    next();
  } catch (err) {
    logger.error('Webhook secret validation error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error during auth' });
  }
}

/**
 * Validates JWT from Authorization: Bearer header.
 * For browser requests (no API prefix), redirects to /login on failure.
 * For API requests (/api/*), returns 401 JSON.
 */
export function authenticateDashboard(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    logger.debug('Dashboard auth: no token provided');
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }
    return res.redirect('/login');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    logger.warn('Dashboard auth: invalid JWT', { error: err.message });
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    }
    return res.redirect('/login');
  }
}
