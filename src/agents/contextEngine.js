/**
 * agents/contextEngine.js
 * Agent 1: Context Engine (RAG) — Day 3 Enhanced
 * - Wiki caching with 1-hour expiry (./data/wiki-cache.json)
 * - Contributor profile with risk scoring across last 10 MRs
 * - Real cosine similarity RAG via vectra vector store
 * - Semantic summary via Claude
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../middleware/logger.js';
import {
  getMRDetails,
  getLinkedIssue,
  getWikiPages,
  getSecurityPolicy,
  getAuthorMRHistory,
  getMRDiff,
} from '../tools/gitlabClient.js';
import { addDocument, queryDocuments } from '../tools/vectorStore.js';
import { askClaude } from '../tools/claudeClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIKI_CACHE_FILE = path.join(__dirname, '../../data/wiki-cache.json');
const RUNS_DIR = path.join(__dirname, '../../data/runs');
const WIKI_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function buildContext({ mr, project }) {
  logger.info(`[Agent 1: Context Engine] Starting for MR !${mr.iid}`);
  const startTime = Date.now();

  try {
    const projectId = project?.id || mr?.project_id;

    // Parallel fetch: diff, security policy, author history (always fresh)
    // Wiki uses cache layer
    const [mrDetailsResult, securityPolicyResult, authorHistoryResult, diffResult] = await Promise.allSettled([
      getMRDetails(projectId, mr.iid),
      getSecurityPolicy(projectId),
      getAuthorMRHistory(projectId, mr.author_id),
      getMRDiff(projectId, mr.iid),
    ]);

    const mrData = mrDetailsResult.status === 'fulfilled' ? mrDetailsResult.value : mr;
    const security = securityPolicyResult.status === 'fulfilled' ? securityPolicyResult.value : 'Default OWASP policy applies.';
    const rawAuthorHistory = authorHistoryResult.status === 'fulfilled' ? authorHistoryResult.value : { mergedCount: 0, recentMRs: [] };
    const diffContent = diffResult.status === 'fulfilled' ? diffResult.value : '';

    // ── Wiki cache (Day 3 upgrade) ───────────────────────────────────────────
    const wiki = await getWikiWithCache(projectId);

    // ── Linked issue ────────────────────────────────────────────────────────
    const issueContext = await getLinkedIssue(projectId, mrData.description).catch(() => null);

    // ── Contributor risk profile (Day 3 upgrade) ─────────────────────────────
    const authorProfile = await buildContributorProfile(rawAuthorHistory, mr.author_id);

    // ── Embed all documents into vector store ────────────────────────────────
    const embedPromises = [];

    if (diffContent) {
      const chunks = chunkText(diffContent, 2000);
      for (const [i, chunk] of chunks.entries()) {
        embedPromises.push(addDocument(chunk, { type: 'diff', mrIid: mr.iid, chunk: i }));
      }
    }

    for (const page of wiki) {
      if (page.content) {
        embedPromises.push(addDocument(page.content, {
          type: 'wiki',
          slug: page.slug,
          title: page.title,
          mrIid: mr.iid,
        }));
      }
    }

    if (security) {
      embedPromises.push(addDocument(security, { type: 'security_policy', mrIid: mr.iid }));
    }

    if (issueContext?.description) {
      embedPromises.push(addDocument(
        `${issueContext.title}: ${issueContext.description}`,
        { type: 'issue', issueIid: issueContext.iid, mrIid: mr.iid }
      ));
    }

    await Promise.allSettled(embedPromises);
    logger.info(`[Agent 1] Embedded ${embedPromises.length} documents into vector store`);

    // ── RAG query: retrieve most relevant chunks for this diff ───────────────
    const relevantChunks = await queryDocuments(
      `${mrData.title} ${(mrData.description || '').slice(0, 200)} ${diffContent.slice(0, 500)}`,
      5
    );
    logger.info(`[Agent 1] RAG retrieved ${relevantChunks.length} relevant chunks (cosine similarity)`);

    // ── Semantic summary ─────────────────────────────────────────────────────
    const summary = await buildSummary(mrData, diffContent, issueContext, security);

    const result = {
      summary,
      mrDetails: mrData,
      diff: diffContent,
      securityPolicy: security,
      wikiContent: wiki,
      issueContext,
      authorProfile,
      relevantChunks,
      projectId,
    };

    logger.info(`[Agent 1: Context Engine] Done in ${Date.now() - startTime}ms`);
    return result;
  } catch (err) {
    logger.error(`[Agent 1: Context Engine] Failed: ${err.message}`);
    return {
      summary: 'Context engine failed — proceeding with limited context.',
      mrDetails: mr,
      diff: '',
      securityPolicy: 'Default OWASP policy applies.',
      wikiContent: [],
      issueContext: null,
      authorProfile: { mergedCount: 0, recentMRs: [], riskScore: 10, commonIssueTypes: [] },
      relevantChunks: [],
      projectId: project?.id || mr?.project_id,
      error: err.message,
    };
  }
}

// ─── Wiki Cache (Day 3) ────────────────────────────────────────────────────────

async function getWikiWithCache(projectId) {
  const cacheKey = `project_${projectId}`;

  // Try to read from cache
  try {
    const raw = await fs.readFile(WIKI_CACHE_FILE, 'utf-8');
    const cache = JSON.parse(raw);

    if (cache[cacheKey]) {
      const age = Date.now() - cache[cacheKey].fetchedAt;
      if (age < WIKI_CACHE_TTL_MS) {
        logger.info(`[Agent 1] Wiki cache HIT for project ${projectId} (age: ${Math.round(age / 60000)}m)`);
        return cache[cacheKey].pages;
      }
      logger.info(`[Agent 1] Wiki cache EXPIRED for project ${projectId}, refreshing...`);
    }
  } catch {
    // Cache file doesn't exist yet
  }

  // Fetch fresh wiki pages
  let pages = [];
  try {
    pages = await getWikiPages(projectId);
    logger.info(`[Agent 1] Fetched ${pages.length} wiki pages fresh`);
  } catch (err) {
    logger.warn(`[Agent 1] Wiki fetch failed: ${err.message}`);
    return [];
  }

  // Write to cache
  try {
    await fs.mkdir(path.dirname(WIKI_CACHE_FILE), { recursive: true });
    let cache = {};
    try {
      cache = JSON.parse(await fs.readFile(WIKI_CACHE_FILE, 'utf-8'));
    } catch { /* fresh cache */ }

    cache[cacheKey] = { pages, fetchedAt: Date.now() };
    await fs.writeFile(WIKI_CACHE_FILE, JSON.stringify(cache, null, 2));
    logger.debug(`[Agent 1] Wiki cache written for project ${projectId}`);
  } catch (err) {
    logger.warn(`[Agent 1] Wiki cache write failed (non-fatal): ${err.message}`);
  }

  return pages;
}

// ─── Contributor Profile (Day 3 upgrade) ─────────────────────────────────────

async function buildContributorProfile(authorHistory, authorId) {
  const { mergedCount = 0, recentMRs = [] } = authorHistory;

  // Try to load historical risk scores for this author from past runs
  let avgRiskScore = 10;
  let commonIssueTypes = [];

  try {
    const files = await fs.readdir(RUNS_DIR).catch(() => []);
    const authorRuns = [];

    for (const file of files.slice(-50)) { // Check last 50 runs
      try {
        const run = JSON.parse(await fs.readFile(path.join(RUNS_DIR, file), 'utf-8'));
        if (run.context?.mrDetails?.author_id === authorId || 
            run.mrAuthor === authorHistory.name) {
          authorRuns.push(run);
        }
      } catch { /* skip */ }
    }

    if (authorRuns.length > 0) {
      const scores = authorRuns.map(r => r.risk?.score || 0).filter(s => s > 0);
      avgRiskScore = scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 10;

      // Extract common issue types
      const issueFreq = {};
      for (const run of authorRuns) {
        for (const finding of (run.audit?.findings || [])) {
          issueFreq[finding.type] = (issueFreq[finding.type] || 0) + 1;
        }
      }
      commonIssueTypes = Object.entries(issueFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([type, count]) => ({ type, count }));

      logger.info(`[Agent 1] Contributor profile: ${authorRuns.length} historical runs, avg risk: ${avgRiskScore}`);
    }
  } catch (err) {
    logger.debug(`[Agent 1] Contributor profile lookup failed (non-fatal): ${err.message}`);
  }

  // Classify contributor tier
  let tier;
  if (mergedCount === 0) tier = 'new-contributor';
  else if (mergedCount < 5) tier = 'junior';
  else if (mergedCount < 20) tier = 'regular';
  else tier = 'senior';

  return {
    mergedCount,
    recentMRs: recentMRs.slice(0, 10),
    avgRiskScore,
    commonIssueTypes,
    tier,
  };
}

// ─── Summary Builder ──────────────────────────────────────────────────────────

async function buildSummary(mrDetails, diff, issue, securityPolicy) {
  try {
    const prompt = `You are a senior code reviewer. Summarize this MR in 2-3 sentences explaining WHAT changed and WHY.

MR Title: ${mrDetails.title || 'Unknown'}
MR Description: ${(mrDetails.description || 'No description').slice(0, 500)}
${issue ? `Linked Issue: ${issue.title} — ${(issue.description || '').slice(0, 300)}` : ''}
Diff Preview (first 1000 chars): ${diff.slice(0, 1000)}

Respond with a plain summary, no markdown, no bullets.`;

    return await askClaude(
      'You are a DevSecOps code review system. Be concise and accurate.',
      prompt,
      { maxTokens: 256, label: 'context-summary' }
    );
  } catch {
    return `MR !${mrDetails.iid}: ${mrDetails.title || 'Code changes under review'}`;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function chunkText(text, size) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}
