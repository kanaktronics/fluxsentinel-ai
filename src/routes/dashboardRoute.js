/**
 * routes/dashboardRoute.js
 * Serves the dashboard and login HTML files.
 *
 * NOTE: The /dashboard HTML page is served WITHOUT server-side JWT auth.
 * The HTML itself is not sensitive — all data comes from /api/* endpoints
 * which ARE JWT-protected. Client-side app.js handles the redirect to /login
 * when no token is present, avoiding an infinite redirect loop.
 */

import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIR = path.join(__dirname, '../dashboard');

const router = Router();

// Login page — public
router.get('/login', (req, res) => {
  res.sendFile(path.join(DASHBOARD_DIR, 'login.html'));
});

// Root redirect to /dashboard
router.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// Dashboard shell — served publicly; client-side JS handles auth guard
router.get('/dashboard', (req, res) => {
  res.sendFile(path.join(DASHBOARD_DIR, 'index.html'));
});

// Green metrics — PUBLIC shareable page
router.get('/green', (req, res) => {
  res.sendFile(path.join(DASHBOARD_DIR, 'green.html'));
});

// Sign-up page — public
router.get('/signup', (req, res) => {
  res.sendFile(path.join(DASHBOARD_DIR, 'signup.html'));
});

// Post-login setup wizard — client-side auth guard
router.get('/setup', (req, res) => {
  res.sendFile(path.join(DASHBOARD_DIR, 'setup.html'));
});

// Static assets
router.get('/dashboard/style.css', (req, res) => {
  res.sendFile(path.join(DASHBOARD_DIR, 'style.css'));
});

router.get('/dashboard/app.js', (req, res) => {
  res.sendFile(path.join(DASHBOARD_DIR, 'app.js'));
});

export default router;
