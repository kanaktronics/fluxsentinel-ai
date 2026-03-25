/**
 * src/webhook.js
 * Main Express server entry point for FluxSentinel AI.
 * Mounts all middleware and routes. Starts HTTP server.
 */

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { onRequest } from 'firebase-functions/v2/https';
import { initStore } from './tools/vectorStore.js';
import logger from './middleware/logger.js';
import webhookRoute from './routes/webhookRoute.js';
import authRoute from './routes/authRoute.js';
import signupRoute from './routes/signupRoute.js';
import apiRoute from './routes/apiRoute.js';
import dashboardRoute from './routes/dashboardRoute.js';
import { startNgrok } from './ngrok-tunnel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Trust reverse proxy (ngrok, Cloud Run, etc.) for correct rate-limit IP tracking
app.set('trust proxy', true);

// ── Security middleware ────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
    },
  },
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS === '*'
    ? '*'
    : (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Gitlab-Token', 'X-Gitlab-Event'],
}));

// ── Body parsing ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Request logger ────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path} from ${req.ip}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────
app.use(webhookRoute);
app.use(authRoute);
app.use(signupRoute);
app.use(apiRoute);
app.use(dashboardRoute);



// ── 404 handler ───────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found', message: 'The requested route does not exist' });
});

// ── Global error handler ──────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  logger.error('Unhandled error:', { message: err.message, stack: err.stack });
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
  });
});

// ── Startup ───────────────────────────────────────────────────────────────
async function start() {
  // Initialize vector store on startup
  try {
    await initStore();
  } catch (err) {
    logger.warn(`Vector store init warning: ${err.message}`);
  }

  await new Promise(resolve => app.listen(PORT, resolve));

  const mask = (val) => val ? `${val.slice(0, 4)}****` : 'NOT SET';
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('  ⚡ FluxSentinel AI started successfully');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info(`  PORT:              ${PORT}`);
  logger.info(`  NODE_ENV:          ${process.env.NODE_ENV || 'development'}`);
  logger.info(`  GITLAB_TOKEN:      ${mask(process.env.GITLAB_TOKEN)}`);
  logger.info(`  ANTHROPIC_API_KEY: ${mask(process.env.ANTHROPIC_API_KEY)}`);
  logger.info(`  RESEND_API_KEY:    ${mask(process.env.RESEND_API_KEY)}`);
  logger.info(`  JWT_SECRET:        ${mask(process.env.JWT_SECRET)}`);
  logger.info(`  Dashboard:         http://localhost:${PORT}/dashboard`);
  logger.info(`  Sign Up:           http://localhost:${PORT}/signup`);
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Start ngrok tunnel (non-blocking — logs URL when ready)
  if (process.env.NGROK_AUTHTOKEN) {
    startNgrok(PORT).then(publicUrl => {
      if (publicUrl) {
        logger.info('');
        logger.info('  ┌─────────────────────────────────────────────────────┐');
        logger.info('  │  🌐  PUBLIC WEBHOOK URL (paste this into GitLab)    │');
        logger.info(`  │  ${(publicUrl + '/webhook').padEnd(52)} │`);
        logger.info('  │  📋  Setup page: ' + (publicUrl + '/setup').padEnd(34) + ' │');
        logger.info('  └─────────────────────────────────────────────────────┘');
        logger.info('');
      }
    }).catch(err => logger.warn(`ngrok warning: ${err.message}`));
  } else {
    logger.warn('  NGROK_AUTHTOKEN not set — running locally only.');
  }
}

// Only start the local web server manually if not in Cloud Run production
// Cloud Run natively injects K_SERVICE, so its absence confirms a local environment
if (!process.env.K_SERVICE) {
  start().catch(err => {
    logger.error('Fatal startup error:', err);
    process.exit(1);
  });
}

// Export for Firebase Cloud Functions (Cloud Run Gen 2)
export const api = onRequest({ region: 'us-central1', memory: '1GiB' }, app);

export default app;
