/**
 * agents/riskScorer.js
 * Agent 4: Risk Scorer
 * Synthesizes all findings into a 0-100 risk score with structured reasoning.
 * Recommendation: auto-approve (<30), escalate (30-70), or block (>70).
 */

import logger from '../middleware/logger.js';

// Weight matrix from config/default.json
const WEIGHTS = {
  criticalFinding: 25,  // max 75
  highFinding: 10,      // max 30
  largeChangeset: 10,
  noTests: 15,
  coreFilesModified: 10,
  maxAuthorRisk: 20,
};

const CORE_FILE_PATTERNS = [
  /webpack\.config/, /babel\.config/, /jest\.config/, /package\.json$/,
  /Dockerfile/, /docker-compose/, /\.github\/workflows/, /\.gitlab-ci/,
  /auth\.(js|ts)/, /security\.(js|ts)/, /middleware\.(js|ts)/,
  /database\.(js|ts)/, /db\.(js|ts)/, /schema\.(prisma|sql)/,
];

export async function scoreRisk({ mr, context, audit, docs }) {
  logger.info(`[Agent 4: Risk Scorer] Starting for MR !${mr.iid}`);
  const startTime = Date.now();

  try {
    const diff = context?.diff || '';
    const findings = audit?.findings || [];
    const authorProfile = context?.authorProfile || { mergedCount: 0, recentMRs: [] };
    const mrDetails = context?.mrDetails || mr;

    // Count findings by severity
    const criticalCount = Math.min(findings.filter(f => f.severity === 'critical').length, 3);
    const highCount = Math.min(findings.filter(f => f.severity === 'high').length, 3);

    // Calculate lines changed
    const linesAdded = (diff.match(/^\+[^+]/gm) || []).length;
    const linesRemoved = (diff.match(/^-[^-]/gm) || []).length;
    const totalLines = linesAdded + linesRemoved;

    // Detect tests
    const hasTests = /\.(test|spec)\.(js|ts|jsx|tsx)/.test(diff) ||
      /describe\(|it\(|test\(|expect\(/.test(diff);

    // Detect core file modifications
    const changedFiles = extractChangedFiles(diff);
    const coreFilesModified = changedFiles.some(f => CORE_FILE_PATTERNS.some(p => p.test(f)));

    // Author risk factor (0-20 points based on history)
    const authorRiskScore = calculateAuthorRisk(authorProfile);

    // Build score
    let score = 0;
    const factors = [];

    const critPoints = criticalCount * WEIGHTS.criticalFinding;
    score += critPoints;
    if (critPoints > 0) factors.push(`+${critPoints} (${criticalCount} critical finding${criticalCount !== 1 ? 's' : ''})`);

    const highPoints = highCount * WEIGHTS.highFinding;
    score += highPoints;
    if (highPoints > 0) factors.push(`+${highPoints} (${highCount} high finding${highCount !== 1 ? 's' : ''})`);

    if (totalLines > 500) {
      score += WEIGHTS.largeChangeset;
      factors.push(`+${WEIGHTS.largeChangeset} (large changeset: ${totalLines} lines)`);
    }

    if (!hasTests) {
      score += WEIGHTS.noTests;
      factors.push(`+${WEIGHTS.noTests} (no tests detected)`);
    }

    if (coreFilesModified) {
      score += WEIGHTS.coreFilesModified;
      factors.push(`+${WEIGHTS.coreFilesModified} (core infrastructure files modified)`);
    }

    score += authorRiskScore;
    if (authorRiskScore > 0) factors.push(`+${authorRiskScore} (author risk profile)`);

    // Cap at 100
    score = Math.min(100, Math.round(score));

    // Determine label and recommendation
    let label, recommendation;
    if (score < 30) {
      label = 'LOW';
      recommendation = 'auto-approve';
    } else if (score < 70) {
      label = 'MEDIUM';
      recommendation = 'human-review';
    } else {
      label = 'HIGH';
      recommendation = 'block';
    }

    const reasoning = factors.length > 0
      ? `Score breakdown: ${factors.join(', ')}`
      : 'No significant risk factors detected.';

    const result = {
      score,
      label,
      recommendation,
      reasoning,
      factors: {
        criticalFindings: criticalCount,
        highFindings: highCount,
        linesChanged: totalLines,
        hasTests,
        coreFilesModified,
        authorRiskScore,
        changedFiles: changedFiles.length,
      },
    };

    logger.info(`[Agent 4: Risk Scorer] Done in ${Date.now() - startTime}ms. Score: ${score} (${label})`);
    return result;
  } catch (err) {
    logger.error(`[Agent 4: Risk Scorer] Failed: ${err.message}`);
    return {
      score: 50,
      label: 'MEDIUM',
      recommendation: 'human-review',
      reasoning: `Risk scoring failed: ${err.message}`,
      factors: {},
      error: err.message,
    };
  }
}

function extractChangedFiles(diff) {
  const matches = diff.match(/^=== (.+) ===/gm) || [];
  return matches.map(m => m.replace(/^=== /, '').replace(/ ===$/, ''));
}

function calculateAuthorRisk(authorProfile) {
  const { mergedCount = 0 } = authorProfile;
  if (mergedCount === 0) return 15; // Unknown author, moderate risk
  if (mergedCount < 5) return 10;
  if (mergedCount < 20) return 5;
  return 0; // Experienced contributor
}
