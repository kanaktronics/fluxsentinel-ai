/**
 * middleware/rateLimiter.js
 * Three separate rate limiters: webhook, auth, and API.
 * Protects against bursts, brute force, and dashboard abuse.
 */

import rateLimit from 'express-rate-limit';

const buildLimiter = (max, windowMs, message) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false },
    handler: (_req, res) => {
      const retryAfter = Math.ceil(windowMs / 1000);
      res.status(429).json({
        error: 'Too Many Requests',
        message,
        retryAfter,
      });
    },
  });

// GitLab sends webhook bursts — be generous
export const webhookLimiter = buildLimiter(
  1000,
  15 * 60 * 1000,
  'Webhook rate limit exceeded. GitLab will retry automatically.'
);

// Brute-force protection for login (relaxed for hackathon testing)
export const authLimiter = buildLimiter(
  100,
  15 * 60 * 1000,
  'Too many login attempts. Please wait 15 minutes before trying again.'
);

// Dashboard API calls — fairly liberal
export const apiLimiter = buildLimiter(
  2000,
  15 * 60 * 1000,
  'API rate limit exceeded. Please slow down your requests.'
);
