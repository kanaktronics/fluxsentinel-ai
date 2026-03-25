/**
 * tools/synthesizer.js
 * The "Judge" — Claude CSO reads findings from all sources and produces
 * a single authoritative consensus report. Deduplicates without discarding.
 * Fallback: if synthesis returns 0 findings or fails, naive merge is used.
 */

import { v4 as uuidv4 } from 'uuid';
import logger from '../middleware/logger.js';
import { askClaudeJSON } from './claudeClient.js';

// ── System prompt: ORGANIZE and DEDUPLICATE, never discard ──────────────────

const CSO_SYSTEM_PROMPT = `You are a Chief Security Officer reviewing security audit findings from multiple sources: Claude AI, Gemini AI, and a regex scanner.

CRITICAL RULES — READ THESE CAREFULLY:
1. NEVER discard findings — every finding must appear in the output
2. If Claude and Gemini found the same issue (same file + same type), MERGE into one finding marked confirmedBy: "both"
3. If only one model found it, KEEP IT marked with that model name
4. Regex findings are CERTAIN (deterministic) — always include every one of them
5. When in doubt, INCLUDE the finding — false positives are better than false negatives in security
6. Your job is to ORGANIZE and DEDUPLICATE, not to filter or dismiss

A finding is removed ONLY if it is an exact duplicate (identical file, type, AND description).

For each finding in the output, set:
- confirmedBy: "both" | "claude" | "gemini" | "regex"
- confidence: 0.95-1.0 for both/regex, 0.7-0.85 for single model
- verdict: "BLOCK" if ANY critical or high findings exist, "REVIEW" if medium only, "APPROVE" if all low/none

Return raw JSON only. No backticks. No markdown. Start with { and end with }.`;

/**
 * Synthesize findings from Claude, Gemini, and regex into a unified report.
 * Never throws — always returns a valid result object.
 */
export async function synthesizeFindings(claudeFindings, geminiFindings, regexFindings) {
  const allRawFindings = [
    ...(claudeFindings || []),
    ...(geminiFindings || []),
    ...(regexFindings || []),
  ];

  // If there are no findings at all, return clean result immediately
  if (allRawFindings.length === 0) {
    return buildCleanResult();
  }

  const userMessage = JSON.stringify({
    claude: claudeFindings || [],
    gemini: geminiFindings || [],
    regex: regexFindings || [],
  });

  try {
    const result = await askClaudeJSON(CSO_SYSTEM_PROMPT, userMessage, {
      label: 'synthesizer-cso',
      maxTokens: 4000,
    });

    // CRITICAL FALLBACK — if synthesis loses findings, use naive merge instead
    if (!result?.findings || result.findings.length === 0) {
      logger.warn('[Synthesizer] CSO returned 0 findings despite input — switching to naive merge fallback');
      return naiveMergeFallback(claudeFindings, geminiFindings, regexFindings);
    }

    // Ensure all findings have required fields
    const findings = (result.findings || []).map(f => ({
      id: f.id || uuidv4(),
      severity: f.severity || 'medium',
      type: f.type || 'unknown',
      file: f.file || 'unknown',
      line: f.line ?? null,
      description: f.description || '',
      originalCode: f.originalCode || '',
      fixedCode: f.fixedCode || null,
      confidence: f.confidence ?? 0.7,
      confirmedBy: f.confirmedBy || 'claude',
      cweId: f.cweId || null,
      effort: f.effort || 'medium',
    }));

    const consensus = buildConsensus(findings, result.consensus);
    const verdict = result.verdict || deriveVerdict(findings);

    logger.info(`[Synthesizer] Verdict: ${verdict} | Agreement: ${Math.round((consensus.agreementRate || 0) * 100)}% | Final findings: ${findings.length}`);

    return {
      findings,
      consensus,
      verdict,
      summary: result.summary || buildFallbackSummary(findings),
    };
  } catch (err) {
    logger.error(`[Synthesizer] Claude CSO synthesis failed: ${err.message} — using naive merge fallback`);
    return naiveMergeFallback(claudeFindings, geminiFindings, regexFindings);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildConsensus(findings, rawConsensus) {
  const confirmedByBoth = findings.filter(f => f.confirmedBy === 'both').length;
  const claudeOnly = findings.filter(f => f.confirmedBy === 'claude').length;
  const geminiOnly = findings.filter(f => f.confirmedBy === 'gemini').length;
  const regexDetected = findings.filter(f => f.confirmedBy === 'regex').length;
  const highConfidence = findings.filter(f => (f.confidence ?? 0) >= 0.9).length;

  const aiFindings = confirmedByBoth + claudeOnly + geminiOnly;
  const agreementRate = rawConsensus?.agreementRate
    ?? (aiFindings > 0 ? confirmedByBoth / aiFindings : 1.0);

  return {
    totalFindings: findings.length,
    confirmedByBoth,
    claudeOnly,
    geminiOnly,
    regexDetected,
    agreementRate: Math.round(agreementRate * 100) / 100,
    highConfidenceFindings: highConfidence,
  };
}

function deriveVerdict(findings) {
  if (findings.some(f => f.severity === 'critical' || f.severity === 'high')) return 'BLOCK';
  if (findings.length > 0) return 'REVIEW';
  return 'APPROVE';
}

function buildCleanResult() {
  return {
    findings: [],
    consensus: {
      totalFindings: 0, confirmedByBoth: 0, claudeOnly: 0, geminiOnly: 0,
      regexDetected: 0, agreementRate: 1.0, highConfidenceFindings: 0,
    },
    verdict: 'APPROVE',
    summary: 'No security issues found. Code passed all checks from both AI models and regex scanner.',
  };
}

function buildFallbackSummary(findings) {
  if (findings.length === 0) return 'No security issues found.';
  const crit = findings.filter(f => f.severity === 'critical').length;
  const high = findings.filter(f => f.severity === 'high').length;
  return `Found ${findings.length} issue(s): ${crit} critical, ${high} high. Multi-model consensus review required.`;
}

/**
 * Naive merge fallback — preserves ALL findings when Claude CSO fails or returns 0.
 * Deduplicates only exact copies (same type + file + description prefix).
 */
function naiveMergeFallback(claudeFindings, geminiFindings, regexFindings) {
  logger.warn('[Synthesizer] Using naive merge fallback — preserving all findings');

  const tagged = [
    ...(regexFindings || []).map(f => ({ ...f, confirmedBy: 'regex', confidence: 1.0, id: f.id || uuidv4() })),
    ...(claudeFindings || []).map(f => ({ ...f, confirmedBy: 'claude', confidence: f.confidence ?? 0.85, id: f.id || uuidv4() })),
    ...(geminiFindings || []).map(f => ({ ...f, confirmedBy: 'gemini', confidence: f.confidence ?? 0.80, id: f.id || uuidv4() })),
  ];

  // Deduplicate only exact copies
  const seen = new Set();
  const deduped = tagged.filter(f => {
    const key = `${f.type}:${f.file}:${(f.description || '').slice(0, 40)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const criticalCount = deduped.filter(f => f.severity === 'critical').length;
  const highCount = deduped.filter(f => f.severity === 'high').length;
  const consensus = buildConsensus(deduped, null);
  const verdict = criticalCount > 0 ? 'BLOCK' : highCount > 0 ? 'REVIEW' : 'APPROVE';

  return {
    findings: deduped,
    consensus,
    verdict,
    summary: `Found ${deduped.length} findings (${criticalCount} critical, ${highCount} high) — naive merge applied`,
  };
}
