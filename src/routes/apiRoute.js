/**
 * routes/apiRoute.js
 * Dashboard REST API routes:
 * GET /api/metrics — aggregate stats
 * GET /api/runs — list of all runs (paginated)
 * GET /api/runs/:id — single run details
 * GET /api/config — current config
 * PUT /api/config — update config (authenticated)
 */

import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { authenticateDashboard } from '../middleware/auth.js';
import { getPublicUrl } from '../ngrok-tunnel.js';
import logger from '../middleware/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = path.join(__dirname, '../../data/runs');
const CONFIG_FILE = path.join(__dirname, '../config/default.json');

const router = Router();
router.use(apiLimiter);

// ── GET /api/health — Checks AI Configuration ────────────────────────────
router.get('/api/health', authenticateDashboard, (req, res) => {
  res.json({
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
  });
});

// ── GET /api/status — PUBLIC, no auth ────────────────────────────────────
router.get('/api/status', (req, res) => {
  let publicUrl = getPublicUrl();

  // On Cloud Run, use the request's own origin as the public URL
  if (!publicUrl && process.env.K_SERVICE) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    publicUrl = `${proto}://${host}`;
  }

  const webhookUrl = publicUrl ? `${publicUrl}/webhook` : null;
  res.json({
    status: 'ok',
    version: '1.0.0',
    webhookUrl,
    publicUrl,
    setupUrl: publicUrl ? `${publicUrl}/setup` : null,
    localUrl: `http://localhost:${process.env.PORT || 3000}`,
    ngrokActive: !!publicUrl,
  });
});

// ── GET /api/user/profile — returns current user's connection status ───────
router.get('/api/user/profile', authenticateDashboard, async (req, res) => {
  try {
    const userId = req.user.userId || `env-${req.user.sub}`;
    const userDoc = await db.collection('users').doc(userId).get();
    const user = userDoc.exists ? userDoc.data() : null;
    
    if (!user) {
      if (req.user.role === 'admin') {
        return res.json({
          username: req.user.sub,
          role: 'admin',
          connected: false,
          gitlabTokenSet: false,
          webhookSecretSet: false,
        });
      }
      return res.status(404).json({ error: 'User not found in Firestore' });
    }
    
    res.json({
      username: user.username,
      role: user.role,
      email: user.email,
      connected: !!user.gitlabToken,
      gitlabTokenSet: !!user.gitlabToken,
      webhookSecretSet: !!user.webhookSecret,
      createdAt: user.createdAt,
    });
  } catch (err) {
    logger.error(`/api/user/profile error: ${err.message}`);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// ── POST /api/user/connect — saves user's GitLab token to their account ───
router.post('/api/user/connect', authenticateDashboard, async (req, res) => {
  const { gitlabToken, webhookSecret, email } = req.body || {};
  if (!gitlabToken && !webhookSecret && !email) return res.status(400).json({ error: 'No data provided' });

  try {
    const userId = req.user.userId || `env-${req.user.sub}`;
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    let user = userDoc.exists ? userDoc.data() : null;
    
    if (!user) {
      if (req.user.role === 'admin') {
        user = {
          id: userId,
          username: req.user.sub,
          role: 'admin',
          createdAt: new Date().toISOString()
        };
      } else {
        return res.status(404).json({ error: 'User not found' });
      }
    }

    if (gitlabToken && gitlabToken !== 'keep') user.gitlabToken = gitlabToken;
    if (webhookSecret) user.webhookSecret = webhookSecret;
    if (email) user.email = email;
    user.connectedAt = new Date().toISOString();

    await userRef.set(user, { merge: true });
    logger.info(`User "${user.username}" updated connection settings in Firestore`);
    res.json({ success: true, message: 'Settings saved' });
  } catch (err) {
    logger.error(`/api/user/connect error: ${err.message}`);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// ── GET /api/runs/active ──────────────────────────────────────────────────
router.get('/api/runs/active', authenticateDashboard, async (req, res) => {
  try {
    const userId = req.user.userId || `env-${req.user.sub}`;
    // Fetch all currently active runs for this tenant
    const snap = await db.collection('runs_active')
      .where('userId', '==', userId)
      .get();
      
    if (snap.empty) {
      return res.json({ active: [] });
    }
    
    // Return array of running jobs and their log history
    const active = snap.docs.map(doc => doc.data());
    res.json({ active });
  } catch (err) {
    logger.error(`/api/runs/active error: ${err.message}`);
    res.status(500).json({ active: [] });
  }
});

// ── GET /api/metrics ──────────────────────────────────────────────────────

router.get('/api/metrics', authenticateDashboard, async (req, res) => {
  try {
    const userId = req.user.userId || `env-${req.user.sub}`;
    const runs = await loadAllRuns(userId, 10);
    const green = calculateGreen(runs);

    const allFindings = runs.flatMap(r => r.audit?.findings || []);
    const criticalFindings = allFindings.filter(f => f.severity === 'critical').length;
    const avgRisk = runs.length > 0
      ? Math.round(runs.reduce((acc, r) => acc + (r.risk?.score || 0), 0) / runs.length)
      : 0;
    const docsUpdated = runs.filter(r => r.docs?.updated).length;

    res.json({
      totalMRs: green.totalMRs || 0,
      totalFindings: green.totalFindingsCount || 0,
      criticalFindings,
      pipelinesSaved: green.totalPipelinesSaved || 0,
      co2Saved: green.totalCo2Saved || 0,
      avgRiskScore: avgRisk,
      docsUpdated,
      recentRuns: runs.map(summarizeRun),
    });
  } catch (err) {
    logger.error(`/api/metrics error: ${err.message}`);
    res.status(500).json({ error: 'Failed to load metrics' });
  }
});


// ── GET /api/runs ─────────────────────────────────────────────────────────

router.get('/api/runs', authenticateDashboard, async (req, res) => {
  try {
    const userId = req.user.userId || `env-${req.user.sub}`;
    const limit = Math.min(parseInt(req.query.limit) || 50, 50);
    const runs = await loadAllRuns(userId, limit);
    res.json({ runs: runs.map(summarizeRun), total: runs.length });
  } catch (err) {
    logger.error(`/api/runs error: ${err.message}`);
    res.status(500).json({ error: 'Failed to load runs' });
  }
});

// ── GET /api/runs/:id ─────────────────────────────────────────────────────

router.get('/api/runs/:id', authenticateDashboard, async (req, res) => {
  try {
    const { id } = req.params;
    // Sanitize: ensure id only contains safe chars
    if (!/^[\w\-]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid run ID' });
    }

    const doc = await db.collection('runs').doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Run not found' });
    }

    res.json(doc.data());
  } catch (err) {
    logger.error(`/api/runs/:id error: ${err.message}`);
    res.status(500).json({ error: 'Failed to load run' });
  }
});

// ── GET /api/green ────────────────────────────────────────────────────────
// Public endpoint — shareable green metrics page

router.get('/api/green', authenticateDashboard, async (req, res) => {
  try {
    const userId = req.user.userId || `env-${req.user.sub}`;
    // Fetch up to 500 runs to calculate a decent historical green metrics total
    const runs = await loadAllRuns(userId, 500);
    const green = calculateGreen(runs);
    res.json(green);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load green metrics' });
  }
});

// ── GET /api/config ───────────────────────────────────────────────────────

router.get('/api/config', authenticateDashboard, async (req, res) => {
  try {
    const content = await fs.readFile(CONFIG_FILE, 'utf-8');
    res.json(JSON.parse(content));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load config' });
  }
});

// ── PUT /api/config ───────────────────────────────────────────────────────

router.put('/api/config', authenticateDashboard, async (req, res) => {
  try {
    const config = req.body;
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'Invalid config body' });
    }
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
    logger.info('Config updated via /api/config');
    res.json({ message: 'Config updated successfully', config });
  } catch (err) {
    logger.error(`/api/config PUT error: ${err.message}`);
    res.status(500).json({ error: 'Failed to save config' });
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loadAllRuns(userId, limit = 50) {
  try {
    let query = db.collection('runs').where('userId', '==', String(userId));
    
    // Note: Firestore requires a composite index if you query with == and orderBy on different fields.
    // To avoid complex index requirements for the hackathon, we fetch the subset and sort in-memory.
    const snapshot = await query.get();
    
    let docs = snapshot.docs.map(doc => doc.data());
    docs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return docs.slice(0, limit);
  } catch (err) {
    logger.error(`[Firestore] Failed to load runs: ${err.message}`);
    return [];
  }
}

function summarizeRun(run) {
  return {
    runId: run.runId,
    mrIid: run.mrIid,
    projectId: run.projectId,
    mrTitle: run.mrTitle,
    mrAuthor: run.mrAuthor,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    durationMs: run.durationMs,
    riskScore: run.risk?.score ?? null,
    riskLabel: run.risk?.label ?? null,
    findingsCount: run.audit?.findings?.length ?? 0,
    criticalCount: run.audit?.criticalCount ?? 0,
    pipelinesSaved: run.green?.pipelinesSaved ?? 0,
    docsUpdated: run.docs?.updated ?? false,
    agentErrors: run.agentErrors?.length ?? 0,
    labelApplied: run.action?.labelApplied ?? null,
  };
}

function calculateGreen(runs) {
  const totalPipelinesSaved = runs.reduce((acc, r) => acc + (r.green?.pipelinesSaved || 0), 0);
  const totalComputeMinutesSaved = runs.reduce((acc, r) => acc + (r.green?.computeMinutesSaved || 0), 0);
  const totalCo2Saved = runs.reduce((acc, r) => acc + (r.green?.co2Saved || 0), 0);
  const totalFindingsCount = runs.reduce((acc, r) => acc + (r.audit?.findings?.length || 0), 0);
  
  return {
    totalMRs: runs.length,
    totalPipelinesSaved,
    totalComputeMinutesSaved,
    totalCo2Saved: Math.round(totalCo2Saved * 10) / 10,
    totalFindingsCount,
    runs: runs.map(r => ({
      mrIid: r.mrIid,
      projectId: r.projectId,
      timestamp: r.timestamp,
      findingsCount: r.audit?.findings?.length || 0,
      criticalCount: r.audit?.criticalCount || 0,
      highCount: r.audit?.highCount || 0,
      pipelinesSaved: r.green?.pipelinesSaved || 0,
      computeMinutesSaved: r.green?.computeMinutesSaved || 0,
      co2Saved: r.green?.co2Saved || 0
    }))
  };
}

export default router;
