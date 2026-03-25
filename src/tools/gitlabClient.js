/**
 * tools/gitlabClient.js
 * All GitLab API v4 interactions. Includes retry logic with exponential backoff,
 * request logging, and descriptive errors with API response bodies.
 */

import fetch from 'node-fetch';
import { AsyncLocalStorage } from 'async_hooks';
import logger from '../middleware/logger.js';

export const gitlabAuthContext = new AsyncLocalStorage();

const GITLAB_API = process.env.GITLAB_API_URL || 'https://gitlab.com/api/v4';
const TIMEOUT_MS = 10000;
const MAX_RETRIES = 3;

/**
 * Core fetch wrapper with retry, timeout, and logging.
 */
async function gitlabFetch(path, options = {}, maxRetries = MAX_RETRIES) {
  const url = `${GITLAB_API}${path}`;
  
  // Use dynamically injected token from webhook auth, or fallback to admin env var
  const dynamicToken = gitlabAuthContext.getStore()?.gitlabToken;
  const tokenToUse = dynamicToken || process.env.GITLAB_TOKEN || '';

  const headers = {
    'PRIVATE-TOKEN': tokenToUse,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const start = Date.now();

    try {
      const res = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const duration = Date.now() - start;
      logger.debug(`GitLab API ${options.method || 'GET'} ${path} → ${res.status} (${duration}ms)`);

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`GitLab API error ${res.status} on ${path}: ${body}`);
      }

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return await res.json();
      }
      return await res.text();
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;
      if (attempt < maxRetries) {
        const delay = 500 * Math.pow(2, attempt - 1);
        logger.warn(`GitLab API attempt ${attempt} failed, retrying in ${delay}ms: ${err.message}`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Get MR diff (all changed files and hunks).
 */
export async function getMRDiff(projectId, mrIid) {
  const data = await gitlabFetch(
    `/projects/${encodeURIComponent(projectId)}/merge_requests/${mrIid}/changes`
  );
  const changes = data.changes || [];
  return changes
    .map(c => `=== ${c.new_path} ===\n${c.diff}`)
    .join('\n\n');
}

/**
 * Get full MR details object.
 */
export async function getMRDetails(projectId, mrIid) {
  return gitlabFetch(
    `/projects/${encodeURIComponent(projectId)}/merge_requests/${mrIid}`
  );
}

/**
 * Parse issue number from MR description and fetch it.
 * Supports #123 format and full GitLab issue URLs.
 */
export async function getLinkedIssue(projectId, mrDescription) {
  if (!mrDescription) return null;

  const patterns = [
    /(?:closes?|fixes?|resolves?)\s+#(\d+)/i,
    /#(\d+)/,
    /\/issues\/(\d+)/,
  ];

  let issueIid = null;
  for (const pattern of patterns) {
    const match = mrDescription.match(pattern);
    if (match) {
      issueIid = match[1];
      break;
    }
  }

  if (!issueIid) return null;

  try {
    const issue = await gitlabFetch(
      `/projects/${encodeURIComponent(projectId)}/issues/${issueIid}`
    );
    return {
      iid: issue.iid,
      title: issue.title,
      description: issue.description,
      labels: issue.labels,
      state: issue.state,
    };
  } catch (err) {
    logger.warn(`Could not fetch linked issue #${issueIid}: ${err.message}`);
    return null;
  }
}

/**
 * Get top 5 most recently updated wiki pages.
 */
export async function getWikiPages(projectId) {
  try {
    const pages = await gitlabFetch(
      `/projects/${encodeURIComponent(projectId)}/wikis?order_by=updated_at&per_page=5`
    );
    const results = [];
    for (const page of pages.slice(0, 5)) {
      try {
        const detail = await gitlabFetch(
          `/projects/${encodeURIComponent(projectId)}/wikis/${encodeURIComponent(page.slug)}`
        );
        results.push({ slug: detail.slug, title: detail.title, content: detail.content });
      } catch (e) {
        logger.warn(`Could not fetch wiki page ${page.slug}: ${e.message}`);
      }
    }
    return results;
  } catch (err) {
    logger.warn(`Could not fetch wiki pages: ${err.message}`);
    return [];
  }
}

/**
 * Try to fetch SECURITY.md from the repo root, then alternate locations.
 */
export async function getSecurityPolicy(projectId) {
  const files = ['SECURITY.md', 'security-policy.md', 'docs/security.md'];

  for (const file of files) {
    try {
      const content = await gitlabFetch(
        `/projects/${encodeURIComponent(projectId)}/repository/files/${encodeURIComponent(file)}/raw?ref=main`,
        {},
        1  // only 1 attempt — no retry spam for missing files
      );
      return content;
    } catch {
      continue; // silently try next file
    }
  }

  // Return default policy silently — no warn logs
  return 'No hardcoded credentials. Use parameterized queries. Sanitize all inputs.';
}

/**
 * Post a markdown comment to an MR.
 */
export async function postMRComment(projectId, mrIid, body) {
  return gitlabFetch(
    `/projects/${encodeURIComponent(projectId)}/merge_requests/${mrIid}/notes`,
    {
      method: 'POST',
      body: JSON.stringify({ body }),
    }
  );
}

/**
 * Post an inline suggestion comment (one-click fix) on a specific line.
 */
export async function postSuggestionComment(projectId, mrIid, filePath, oldLine, newLine, suggestionCode) {
  const body = `💡 **FluxSentinel AI Suggestion** — Apply this fix with one click:\n\n\`\`\`suggestion:-0+0\n${suggestionCode}\n\`\`\``;

  return gitlabFetch(
    `/projects/${encodeURIComponent(projectId)}/merge_requests/${mrIid}/discussions`,
    {
      method: 'POST',
      body: JSON.stringify({
        body,
        position: {
          position_type: 'text',
          base_sha: null,
          start_sha: null,
          head_sha: null,
          new_path: filePath,
          new_line: newLine,
          old_path: filePath,
          old_line: oldLine,
        },
      }),
    }
  );
}

/**
 * Update (or set) the labels on an MR.
 */
export async function updateMRLabels(projectId, mrIid, labelsArray) {
  return gitlabFetch(
    `/projects/${encodeURIComponent(projectId)}/merge_requests/${mrIid}`,
    {
      method: 'PUT',
      body: JSON.stringify({ labels: labelsArray.join(',') }),
    }
  );
}

/**
 * Update or create a wiki page.
 */
export async function updateWikiPage(projectId, slug, content, commitMessage = 'FluxSentinel: Auto-update wiki') {
  try {
    return await gitlabFetch(
      `/projects/${encodeURIComponent(projectId)}/wikis/${encodeURIComponent(slug)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ content, title: slug, message: commitMessage }),
      }
    );
  } catch {
    // Page doesn't exist, create it
    return gitlabFetch(
      `/projects/${encodeURIComponent(projectId)}/wikis`,
      {
        method: 'POST',
        body: JSON.stringify({ content, title: slug, message: commitMessage }),
      }
    );
  }
}

/**
 * Get an author's MR history to assess their track record.
 */
export async function getAuthorMRHistory(projectId, authorId) {
  try {
    const mrs = await gitlabFetch(
      `/projects/${encodeURIComponent(projectId)}/merge_requests?author_id=${authorId}&state=merged&per_page=100`
    );
    return {
      mergedCount: mrs.length,
      recentMRs: mrs.slice(0, 10).map(mr => ({
        iid: mr.iid,
        title: mr.title,
        mergedAt: mr.merged_at,
        changesCount: mr.changes_count,
      })),
    };
  } catch (err) {
    logger.warn(`Could not fetch author MR history: ${err.message}`);
    return { mergedCount: 0, recentMRs: [] };
  }
}

/**
 * Get MR changes (raw changes array) for file path analysis.
 */
export async function getMRChanges(projectId, mrIid) {
  try {
    const data = await gitlabFetch(
      `/projects/${encodeURIComponent(projectId)}/merge_requests/${mrIid}/changes`
    );
    return data.changes || [];
  } catch (err) {
    logger.warn(`Could not fetch MR changes: ${err.message}`);
    return [];
  }
}

/**
 * Create or update a repository file via GitLab Files API.
 * Used by docsGuardian to update CHANGELOG.md.
 */
export async function upsertRepoFile(projectId, filePath, content, commitMessage, branch = 'main') {
  const encoded = encodeURIComponent(filePath);
  // Try update first
  try {
    return await gitlabFetch(
      `/projects/${encodeURIComponent(projectId)}/repository/files/${encoded}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          branch,
          content,
          commit_message: commitMessage,
          encoding: 'text',
        }),
      }
    );
  } catch {
    // File doesn't exist, create it
    return gitlabFetch(
      `/projects/${encodeURIComponent(projectId)}/repository/files/${encoded}`,
      {
        method: 'POST',
        body: JSON.stringify({
          branch,
          content,
          commit_message: commitMessage,
          encoding: 'text',
        }),
      }
    );
  }
}
