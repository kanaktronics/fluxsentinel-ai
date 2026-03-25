/**
 * agents/docsGuardian.js
 * Agent 3: Documentation Guardian — Day 3 Enhanced
 * - Detects code changes that break or invalidate existing docs
 * - Auto-updates GitLab Wiki pages with corrected content
 * - Appends structured CHANGELOG.md entry via GitLab Files API
 */

import logger from '../middleware/logger.js';
import { askClaudeJSON, askClaude } from '../tools/claudeClient.js';
import { updateWikiPage, upsertRepoFile } from '../tools/gitlabClient.js';

export async function guardDocs({ mr, context, audit }) {
  logger.info(`[Agent 3: Docs Guardian] Starting for MR !${mr.iid}`);
  const startTime = Date.now();

  try {
    const diff = context?.diff || '';
    const wikiContent = context?.wikiContent || [];
    const projectId = context?.projectId || mr.project_id;

    if (!diff || wikiContent.length === 0) {
      logger.info('[Agent 3] No diff or wiki content to analyze');
      return { updated: false, gaps: [], summary: 'No wiki content to validate.' };
    }

    // Ask Claude to detect documentation gaps
    const gapAnalysis = await detectDocGaps(diff, wikiContent, mr);

    if (!gapAnalysis.hasGaps || gapAnalysis.gaps.length === 0) {
      logger.info('[Agent 3: Docs Guardian] No documentation gaps detected');
      return {
        updated: false,
        gaps: [],
        summary: 'Documentation is up to date with code changes.',
      };
    }

    logger.info(`[Agent 3] Found ${gapAnalysis.gaps.length} doc gap(s). Updating wiki...`);

    const updatedPages = [];
    for (const gap of gapAnalysis.gaps) {
      try {
        // Find the matching wiki page content for this slug
        const wikiPage = wikiContent.find(p => p.slug === gap.wikiSlug);
        const existingContent = wikiPage?.content || '';

        const updatedContent = await generateUpdatedContent(gap, diff, mr, existingContent);
        if (updatedContent) {
          await updateWikiPage(
            projectId,
            gap.wikiSlug,
            updatedContent,
            `FluxSentinel: Auto-update docs for MR !${mr.iid} — ${gap.issue}`
          );
          updatedPages.push(gap.wikiSlug);
          logger.info(`[Agent 3] Updated wiki page: ${gap.wikiSlug}`);
        }
      } catch (err) {
        logger.error(`[Agent 3] Failed to update wiki page ${gap.wikiSlug}: ${err.message}`);
      }
    }

    // Append to CHANGELOG.md in repo (Day 3)
    await appendChangelog(projectId, mr, gapAnalysis.gaps);

    const result = {
      updated: updatedPages.length > 0,
      updatedPages,
      gaps: gapAnalysis.gaps,
      summary: gapAnalysis.summary,
    };

    logger.info(`[Agent 3: Docs Guardian] Done in ${Date.now() - startTime}ms. Updated: ${updatedPages.join(', ') || 'none'}`);
    return result;
  } catch (err) {
    logger.error(`[Agent 3: Docs Guardian] Failed: ${err.message}`);
    return {
      updated: false,
      gaps: [],
      summary: `Docs Guardian encountered an error: ${err.message}`,
      error: err.message,
    };
  }
}

// ─── Gap Detection ────────────────────────────────────────────────────────────

async function detectDocGaps(diff, wikiPages, mr) {
  const wikiSummary = wikiPages
    .slice(0, 3)
    .map(p => `[${p.slug}]: ${(p.content || '').slice(0, 500)}`)
    .join('\n---\n');

  const systemPrompt = `You are a technical documentation reviewer. Analyze if code changes break or invalidate existing documentation.
Look for: changed API signatures, removed functions, renamed endpoints, changed behavior, new config options, deprecated features.
Only flag REAL gaps where the documentation is actually wrong or missing information about the changes.`;

  const userMessage = `Code diff (first 3000 chars):
${diff.slice(0, 3000)}

Current wiki pages:
${wikiSummary}

MR Title: ${mr.title || 'Unknown'}
MR Description: ${(mr.description || '').slice(0, 300)}

Return JSON:
{
  "hasGaps": true,
  "gaps": [
    {
      "wikiSlug": "exact-wiki-page-slug",
      "issue": "What is outdated or incorrect in plain English",
      "relevantCode": "The specific change that caused this",
      "changeType": "api-change|deprecation|new-feature|behavior-change"
    }
  ],
  "summary": "One sentence about documentation health"
}

If documentation is accurate, return hasGaps: false and empty gaps array.`;

  try {
    return await askClaudeJSON(systemPrompt, userMessage, { label: 'docs-gap-analysis' });
  } catch (err) {
    logger.warn(`[Agent 3] Gap analysis failed: ${err.message}`);
    return { hasGaps: false, gaps: [], summary: 'Documentation analysis unavailable.' };
  }
}

// ─── Content Update Generator ─────────────────────────────────────────────────

async function generateUpdatedContent(gap, diff, mr, existingContent) {
  try {
    const updated = await askClaude(
      'You are a technical writer. Update the documentation to accurately reflect the code changes. Keep the same markdown format, tone, and style as the existing content. Return only the complete updated documentation content, no commentary.',
      `Wiki page "${gap.wikiSlug}" needs updating due to: ${gap.issue}

Change type: ${gap.changeType || 'unspecified'}
Relevant code: ${gap.relevantCode}

Existing documentation:
${existingContent.slice(0, 2000)}

Code diff context:
${diff.slice(0, 1500)}

Write the corrected, complete documentation for this page:`,
      { maxTokens: 2000, label: 'docs-update' }
    );
    return updated;
  } catch {
    return null;
  }
}

// ─── Changelog Append (Day 3) ─────────────────────────────────────────────────

async function appendChangelog(projectId, mr, gaps) {
  try {
    const date = new Date().toISOString().split('T')[0];
    const changes = gaps.map(g => `- Updated \`${g.wikiSlug}\`: ${g.issue}`).join('\n');

    const changelogEntry = `\n## [Unreleased] — ${date}\n\n### Changed\n\n${changes}\n\n_Auto-generated by FluxSentinel AI for MR !${mr.iid}: ${mr.title}_\n`;

    // Create a minimal CHANGELOG if it doesn't exist, or prepend to existing
    const content = `# Changelog\n\nAll notable documentation changes are auto-tracked by FluxSentinel AI.\n${changelogEntry}`;

    await upsertRepoFile(
      projectId,
      'CHANGELOG.md',
      content,
      `FluxSentinel: Auto-update CHANGELOG for MR !${mr.iid} [skip ci]`
    );
    logger.info('[Agent 3] CHANGELOG.md updated via GitLab Files API');
  } catch (err) {
    logger.warn(`[Agent 3] Changelog update failed (non-fatal): ${err.message}`);
  }
}
