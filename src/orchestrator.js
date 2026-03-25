/**
 * orchestrator.js
 * Sequences all 6 agents for a given MR. Handles failures gracefully —
 * if one agent fails, later ones continue with null for that agent's result.
 * Stores full run result to ./data/runs/{mrIid}-{timestamp}.json
 * Never blocks — designed to be called async (fire-and-forget).
 */

import logger from './middleware/logger.js';
import { buildContext } from './agents/contextEngine.js';
import { auditSecurity } from './agents/securityAuditor.js';
import { guardDocs } from './agents/docsGuardian.js';
import { scoreRisk } from './agents/riskScorer.js';
import { trackGreen } from './agents/greenSentinel.js';
import { takeAction } from './agents/actionAgent.js';
import { gitlabAuthContext } from './tools/gitlabClient.js';
import { db } from './db.js';
import admin from 'firebase-admin';

/**
 * Run all 6 agents in sequence for an MR.
 * @param {{ mr: object, project: object, user: object }} payload 
 */
export async function orchestrate({ mr, project, user }) {
  // Wrap the entire orchestration pipeline in the user's auth context
  // This ensures all downstream generic gitlabClient.js fetch calls
  // automatically use this specific user's GitLab PAT.
  return gitlabAuthContext.run(user || {}, async () => {
    const runId = `${mr.iid}-${Date.now()}`;
    const orchestrateStart = Date.now();
    const resolvedUserId = user?.userId || user?.id || 'anonymous';

    const addLog = async (msg) => {
      logger.info(msg);
      if (resolvedUserId === 'anonymous') return;
      try {
        await db.collection('runs_active').doc(runId).update({
          logs: admin.firestore.FieldValue.arrayUnion(msg),
          updatedAt: new Date().toISOString()
        });
      } catch (err) {}
    };

    logger.info(`[Orchestrator] Starting run ${runId} for MR !${mr.iid} in project ${project?.id || mr.project_id} (User: ${user?.username || 'admin'})`);

    try {
      if (resolvedUserId !== 'anonymous') {
        await db.collection('runs_active').doc(runId).set({
          runId,
          userId: resolvedUserId,
          mrIid: mr.iid,
          mrTitle: mr.title,
          status: 'In Progress',
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          logs: [`[FluxSentinel] Intercepted MR !${mr.iid} - Initiating AI DevSecOps sequence...`]
        });
      }
    } catch (err) {}

    const run = {
      runId,
      mrIid: mr.iid,
      projectId: project?.id || mr.project_id,
      mrTitle: mr.title,
      mrAuthor: mr.author?.name,
      startedAt: new Date().toISOString(),
      completedAt: null,
      durationMs: null,
      agentErrors: [],
      context: null,
      audit: null,
      docs: null,
      risk: null,
      green: null,
      action: null,
    };

    // ── Agent 1: Context Engine ────────────────────────────────────────────────
    try {
      await addLog('[Orchestrator] → Agent 1: Context Engine (Extracting Git Diff & Context)');
      run.context = await buildContext({ mr, project });
    } catch (err) {
      logger.error(`[Orchestrator] Agent 1 failed: ${err.message}`);
      run.agentErrors.push({ agent: 'contextEngine', error: err.message });
      run.context = null;
    }

    // ── Agent 2: Security Auditor ─────────────────────────────────────────────
    try {
      await addLog('[Orchestrator] → Agent 2: Security Auditor (Multi-Model Consensus: Claude + Gemini)');
      run.audit = await auditSecurity({ mr, context: run.context });
    } catch (err) {
      logger.error(`[Orchestrator] Agent 2 failed: ${err.message}`);
      run.agentErrors.push({ agent: 'securityAuditor', error: err.message });
      run.audit = null;
    }

    // ── Agent 3: Docs Guardian ────────────────────────────────────────────────
    try {
      await addLog('[Orchestrator] → Agent 3: Docs Guardian (Checking inline documentation)');
      run.docs = await guardDocs({ mr, context: run.context, audit: run.audit });
    } catch (err) {
      logger.error(`[Orchestrator] Agent 3 failed: ${err.message}`);
      run.agentErrors.push({ agent: 'docsGuardian', error: err.message });
      run.docs = null;
    }

    // ── Agent 4: Risk Scorer ──────────────────────────────────────────────────
    try {
      await addLog('[Orchestrator] → Agent 4: Risk Scorer (Calculating dynamic CVE risk metrics)');
      run.risk = await scoreRisk({ mr, context: run.context, audit: run.audit, docs: run.docs });
    } catch (err) {
      logger.error(`[Orchestrator] Agent 4 failed: ${err.message}`);
      run.agentErrors.push({ agent: 'riskScorer', error: err.message });
      run.risk = null;
    }

    // ── Agent 5: Green Sentinel ───────────────────────────────────────────────
    try {
      await addLog('[Orchestrator] → Agent 5: Green Sentinel (Calculating carbon emission offsets)');
      run.green = await trackGreen({ mr, audit: run.audit });
    } catch (err) {
      logger.error(`[Orchestrator] Agent 5 failed: ${err.message}`);
      run.agentErrors.push({ agent: 'greenSentinel', error: err.message });
      run.green = null;
    }

    // ── Agent 6: Action Agent ─────────────────────────────────────────────────
    try {
      await addLog('[Orchestrator] → Agent 6: Action Agent (Posting MR payload & emailing executive brief)');
      run.action = await takeAction({
        mr,
        project,
        context: run.context,
        audit: run.audit,
        docs: run.docs,
        risk: run.risk,
        green: run.green,
        user,
      });
    } catch (err) {
      logger.error(`[Orchestrator] Agent 6 failed: ${err.message}`);
      run.agentErrors.push({ agent: 'actionAgent', error: err.message });
      run.action = null;
    }

    // ── Finalize ──────────────────────────────────────────────────────────────
    run.completedAt = new Date().toISOString();
    run.durationMs = Date.now() - orchestrateStart;

    logger.info(
      `[Orchestrator] Run ${runId} complete in ${run.durationMs}ms. ` +
      `Errors: ${run.agentErrors.length}. Risk: ${run.risk?.label || 'N/A'} (${run.risk?.score ?? 'N/A'}).`
    );

    // Persist run to disk for dashboard history
    await saveRunResult(runId, run, user || {});

    // Clean up active run terminal logs
    if (resolvedUserId !== 'anonymous') {
      try {
        await db.collection('runs_active').doc(runId).delete();
      } catch (err) {}
    }

    return run;
  });
}

async function saveRunResult(runId, run, user) {
  try {
    // Sanitize: remove large diff from persisted run (keep context summary)
    const persistRun = {
      ...run,
      userId: user.id || user.userId || 'anonymous',
      context: run.context ? { ...run.context, diff: '[truncated]' } : null,
      timestamp: new Date().toISOString()
    };

    await db.collection('runs').doc(runId).set(persistRun);
    logger.debug(`[Orchestrator] Run saved to Firestore: ${runId}`);
  } catch (err) {
    logger.error(`[Orchestrator] Failed to save run: ${err.message}`);
  }
}
