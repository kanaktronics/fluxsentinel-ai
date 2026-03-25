/**
 * tools/geminiClient.js
 * Google Gemini 1.5 Flash wrapper for adversarial security auditing.
 * Runs in parallel with Claude to provide a second independent opinion.
 * Uses Chain of Thought prompting for thorough step-by-step reasoning.
 */

import logger from '../middleware/logger.js';

let _genAI = null;

async function getClient() {
  if (_genAI) return _genAI;

  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not set');
  }

  // Dynamic import — @google/generative-ai must be installed
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  _genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return _genAI;
}

const SYSTEM_INSTRUCTION = `You are a senior security engineer doing an independent code review.
Your analysis will be cross-checked against another AI model.
Be thorough and precise. Think step by step before producing findings.
Focus on real, exploitable vulnerabilities — not theoretical issues or style problems.`;

// gemini-2.5-flash: enhanced reasoning, available on v1beta for all AI Studio keys
const GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * Audit a code diff using Gemini with Chain of Thought reasoning.
 * Returns findings in the same schema as Claude's audit.
 * Never throws — always returns a valid result object.
 *
 * @param {string} diff - The MR git diff
 * @param {object} context - Context object from contextEngine
 * @returns {Promise<{reasoning: string, findings: Array, summary: string}>}
 */
export async function auditWithGemini(diff, context) {
  const fallback = {
    findings: [],
    summary: 'Gemini unavailable — Claude-only audit',
    reasoning: '',
  };

  if (!process.env.GEMINI_API_KEY) {
    logger.warn('[Gemini] GEMINI_API_KEY not set — skipping Gemini audit');
    return fallback;
  }

  if (!diff || diff.length < 10) {
    return { findings: [], summary: 'No diff content to analyze.', reasoning: '' };
  }

  try {
    const genAI = await getClient();
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: SYSTEM_INSTRUCTION,
    });

    const prompt = `Analyze this code diff for security vulnerabilities using Chain of Thought.

CHAIN OF THOUGHT — work through these steps before producing findings:
Step 1: What is this code doing? What is its purpose?
Step 2: What are the trust boundaries? What data comes from external sources?
Step 3: Where is user input handled? Is it sanitized or validated?
Step 4: What can an attacker exploit? What attack vectors exist?
Step 5: What is the minimal, non-breaking fix for each issue found?

CODE DIFF:
${diff.slice(0, 6000)}

CODEBASE CONTEXT:
${context?.summary?.slice(0, 800) || 'No additional context.'}

SECURITY POLICY:
${context?.securityPolicy?.slice(0, 400) || 'Standard security best practices apply.'}

After completing your chain of thought, produce your findings.
Return ONLY this raw JSON — no backticks, no markdown, no explanation.
Start with { and end with }:

{
  "reasoning": "your full step-by-step analysis here",
  "findings": [
    {
      "severity": "critical|high|medium|low",
      "type": "secret|injection|xss|iac|dependency|logic",
      "file": "filename.js",
      "line": 42,
      "description": "clear developer-facing explanation",
      "originalCode": "the vulnerable line of code",
      "fixedCode": "the corrected line of code",
      "confidence": 0.95,
      "cweId": "CWE-89"
    }
  ],
  "summary": "one sentence executive summary of the code's security posture"
}

If no issues found, return an empty findings array.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let result;
    let rawText;
    try {
      result = await model.generateContent(prompt);
      rawText = result.response.text();
    } finally {
      clearTimeout(timeout);
    }

    // Log usage metadata if available
    const usage = result.response?.usageMetadata;
    if (usage) {
      logger.info(`[Gemini] Tokens — input: ${usage.promptTokenCount ?? '?'}, output: ${usage.candidatesTokenCount ?? '?'}`);
    }

    // Strip any markdown fences Claude-style
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      logger.warn(`[Gemini] JSON parse failed: ${parseErr.message} — returning empty findings`);
      return { ...fallback, summary: 'Gemini response was not valid JSON' };
    }

    const findings = (parsed.findings || []).map(f => ({
      ...f,
      confidence: f.confidence ?? 0.75,
      source: 'gemini',
    }));

    logger.info(`[Gemini] Audit complete: ${findings.length} findings. Reasoning length: ${(parsed.reasoning || '').length} chars`);

    return {
      reasoning: parsed.reasoning || '',
      findings,
      summary: parsed.summary || 'Gemini audit complete.',
    };
  } catch (err) {
    logger.error(`[Gemini] Audit failed: ${err.message}`);
    return fallback;
  }
}
