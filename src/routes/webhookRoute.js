/**
 * routes/webhookRoute.js
 * POST /webhook — receives GitLab MR webhooks.
 * Responds 202 immediately, runs orchestration asynchronously.
 */

import { Router } from 'express';
import { webhookLimiter } from '../middleware/rateLimiter.js';
import { validateWebhookSecret } from '../middleware/auth.js';
import { orchestrate } from '../orchestrator.js';
import logger from '../middleware/logger.js';

const router = Router();

router.post(
  ['/webhook', '/'],
  webhookLimiter,
  validateWebhookSecret,
  async (req, res) => {
    const event = req.headers['x-gitlab-event'];
    const payload = req.body;

    // Only handle Merge Request hooks
    if (event !== 'Merge Request Hook') {
      logger.debug(`Webhook: ignored event type "${event}"`);
      return res.status(200).json({ message: 'Event ignored' });
    }

    const action = payload?.object_attributes?.action;
    const mrIid = payload?.object_attributes?.iid;
    const projectId = payload?.project?.id;

    // Only process 'open' (new MR) and 'reopen' actions.
    // IMPORTANT: 'update' is intentionally excluded — when Agent 6 applies labels,
    // GitLab fires another webhook with action='update', which would cause an infinite loop.
    if (!['open', 'reopen'].includes(action)) {
      logger.debug(`Webhook: ignored MR action "${action}" for !${mrIid}`);
      return res.status(200).json({ message: `Action "${action}" not processed` });
    }

    logger.info(`Webhook: Received MR !${mrIid} action="${action}" project=${projectId}`);

    // Respond 202 immediately — don't block GitLab
    res.status(202).json({
      message: 'Accepted. FluxSentinel AI is analyzing your MR.',
      mrIid,
      projectId,
    });

    // Run orchestration asynchronously
    const mr = {
      iid: mrIid,
      title: payload.object_attributes?.title,
      description: payload.object_attributes?.description,
      source_branch: payload.object_attributes?.source_branch,
      target_branch: payload.object_attributes?.target_branch,
      author_id: payload.object_attributes?.author_id,
      author: payload.user || { name: 'Unknown' },
      project_id: projectId,
      web_url: payload.object_attributes?.url,
    };

    const project = payload.project || { id: projectId };

    setImmediate(() => {
      orchestrate({ mr, project, user: req.fluxUser }).catch(err => {
        logger.error(`[Webhook] Orchestration failed for MR !${mrIid}: ${err.message}`);
      });
    });
  }
);

export default router;
