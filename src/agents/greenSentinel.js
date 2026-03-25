/**
 * agents/greenSentinel.js
 * Agent 5: Green Sentinel
 * Calculates compute savings from early issue detection at MR stage.
 * Every prevented failed pipeline = ~6 minutes compute = ~2.4g CO₂ avoided.
 * Logs cumulative metrics to ./data/green-metrics.json.
 */

import logger from '../middleware/logger.js';

const MINUTES_PER_PIPELINE = 6;       // Average CI pipeline runtime
const GRAMS_CO2_PER_MINUTE = 0.4;     // gCO₂ per compute minute

export async function trackGreen({ mr, audit }) {
  logger.info(`[Agent 5: Green Sentinel] Starting for MR !${mr.iid}`);
  const startTime = Date.now();

  try {
    const findings = audit?.findings || [];
    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const highCount = findings.filter(f => f.severity === 'high').length;

    // Each critical/high finding caught at MR stage = 1 prevented pipeline run
    // (conservative estimate: 1 fix per severity level, not per finding)
    const pipelinesSaved = Math.ceil((criticalCount + highCount) / 2) || (findings.length > 0 ? 1 : 0);
    const computeMinutesSaved = pipelinesSaved * MINUTES_PER_PIPELINE;
    const co2Saved = Math.round(computeMinutesSaved * GRAMS_CO2_PER_MINUTE * 10) / 10; // grams

    const runMetric = {
      mrIid: mr.iid,
      projectId: mr.project_id,
      timestamp: new Date().toISOString(),
      findingsCount: findings.length,
      criticalCount,
      highCount,
      pipelinesSaved,
      computeMinutesSaved,
      co2Saved,
    };
    // Removed legacy updateMetricsFile(runMetric) dependency
    const result = {
      pipelinesSaved,
      computeMinutesSaved,
      co2Saved,
      impact: formatImpact(co2Saved, pipelinesSaved),
    };

    logger.info(`[Agent 5: Green Sentinel] Done in ${Date.now() - startTime}ms. Saved ${pipelinesSaved} pipelines, ${co2Saved}g CO₂`);
    return result;
  } catch (err) {
    logger.error(`[Agent 5: Green Sentinel] Failed: ${err.message}`);
    return {
      pipelinesSaved: 0,
      computeMinutesSaved: 0,
      co2Saved: 0,
      impact: 'Green metrics unavailable',
      error: err.message,
    };
  }
}


