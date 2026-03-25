/**
 * tools/claudeClient.js
 * Anthropic Claude API wrapper with cost tracking (token logging),
 * JSON-specific variant with retry, and embedding approximation.
 */

import Anthropic from '@anthropic-ai/sdk';
import logger from '../middleware/logger.js';

const MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_TEMPERATURE = 0.3;

let _client = null;
function getClient() {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

/**
 * Core Claude call. Returns the text content of the first response block.
 * Logs input/output token usage on every call for cost tracking.
 */
export async function askClaude(systemPrompt, userMessage, options = {}) {
  const client = getClient();
  const {
    maxTokens = DEFAULT_MAX_TOKENS,
    temperature = DEFAULT_TEMPERATURE,
    label = 'unlabeled',
  } = options;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    logger.info(`Claude [${label}] tokens — input: ${inputTokens}, output: ${outputTokens}, cost_estimate: $${((inputTokens * 0.000003) + (outputTokens * 0.000015)).toFixed(5)}`);

    return response.content[0].text;
  } catch (err) {
    logger.error(`Claude API error [${label}]: ${err.message}`);
    throw err;
  }
}

/**
 * Calls Claude and parses the response as JSON.
 * Automatically retries once with a stricter prompt if JSON.parse fails.
 */
export async function askClaudeJSON(systemPrompt, userMessage, options = {}) {
  const strictInstruction = '\n\nCRITICAL: Return raw JSON only. No ```json wrapper. No backticks. No markdown. No explanation. Start your response with { and end with }. Your entire response must be parseable by JSON.parse() with no pre-processing.';

  const attempt = async (sys) => {
    const text = await askClaude(sys + strictInstruction, userMessage, {
      ...options,
      temperature: 0.1,
      label: options.label || 'json',
    });
    return JSON.parse(text.trim());
  };

  try {
    return await attempt(systemPrompt);
  } catch (firstErr) {
    logger.warn(`Claude JSON parse failed (attempt 1): ${firstErr.message}. Retrying with stricter prompt.`);
    const stricterSystem = systemPrompt + '\n\nCRITICAL: Your response MUST be ONLY valid JSON. Any other text will cause a system crash. No explanation, no formatting, no code blocks.';
    try {
      return await attempt(stricterSystem);
    } catch (secondErr) {
      logger.error(`Claude JSON parse failed (attempt 2): ${secondErr.message}`);
      throw new Error(`Failed to get valid JSON from Claude after 2 attempts: ${secondErr.message}`);
    }
  }
}

/**
 * Generates a text embedding using TF-IDF approximation (locally computed).
 * Vectra accepts any numeric array as an embedding vector.
 * Fall back to this since Anthropic doesn't expose a public embeddings endpoint.
 */
export async function getEmbedding(text) {
  return computeTFIDFVector(text);
}

// ─── Local TF-IDF Embedding Approximation ────────────────────────────────────

const VOCAB_SIZE = 512;

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function hashToken(token) {
  let hash = 5381;
  for (let i = 0; i < token.length; i++) {
    hash = ((hash << 5) + hash) ^ token.charCodeAt(i);
  }
  return Math.abs(hash) % VOCAB_SIZE;
}

function computeTFIDFVector(text) {
  const tokens = tokenize(text);
  const vector = new Array(VOCAB_SIZE).fill(0);

  if (tokens.length === 0) return vector;

  const tf = {};
  for (const token of tokens) {
    const idx = hashToken(token);
    tf[idx] = (tf[idx] || 0) + 1;
  }

  // Normalize by total tokens (TF)
  for (const [idx, count] of Object.entries(tf)) {
    vector[parseInt(idx)] = count / tokens.length;
  }

  // Normalize L2
  const magnitude = Math.sqrt(vector.reduce((acc, v) => acc + v * v, 0));
  if (magnitude > 0) {
    return vector.map(v => v / magnitude);
  }
  return vector;
}
