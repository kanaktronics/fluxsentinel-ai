/**
 * agents/securityAuditor.js
 * Agent 2: Multi-Model Consensus Security Auditor
 *
 * Layer 1: Regex scan (sync, instant) — deterministic, zero cost
 * Layer 2: Claude + Gemini in PARALLEL — adversarial dual-model audit
 * Layer 3: CVE check via OSV.dev — runs in parallel with AI layers
 * Layer 4: Synthesizer (Claude CSO) — merges, deduplicates, assigns confidence
 *
 * Result includes: consensus metrics, verdict, per-source attribution.
 */

import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';
import logger from '../middleware/logger.js';
import { askClaudeJSON } from '../tools/claudeClient.js';
import { auditWithGemini } from '../tools/geminiClient.js';
import { synthesizeFindings } from '../tools/synthesizer.js';
import { queryDocuments } from '../tools/vectorStore.js';

// ─── Regex Scan Patterns ────────────────────────────────────────────────────

const PATTERNS = [
  {
    id: 'aws-key',
    regex: /AKIA[0-9A-Z]{16}/g,
    severity: 'critical',
    type: 'secret',
    description: 'Hardcoded AWS Access Key detected',
    cweId: 'CWE-798',
  },
  {
    id: 'generic-secret',
    regex: /(secret|password|passwd|pwd|api_key|apikey|token|auth)\s*[=:]\s*['"][^'"]{8,}['"]/gi,
    severity: 'critical',
    type: 'secret',
    description: 'Hardcoded credential or secret detected',
    cweId: 'CWE-798',
  },
  {
    id: 'private-key',
    regex: /-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----/g,
    severity: 'critical',
    type: 'secret',
    description: 'Private key material found in code',
    cweId: 'CWE-321',
  },
  {
    id: 'sql-injection',
    regex: /(query|sql)\s*\(?\s*['"`][^'"`]*\+\s*(req\.|user|input|params|body)/gi,
    severity: 'high',
    type: 'injection',
    description: 'Potential SQL injection via string concatenation',
    cweId: 'CWE-89',
  },
  {
    id: 'xss',
    regex: /\.innerHTML\s*=\s*(?!['"`]\s*['"`])/g,
    severity: 'high',
    type: 'xss',
    description: 'Potential XSS via unescaped innerHTML assignment',
    cweId: 'CWE-79',
  },
  {
    id: 'jwt-weak-secret',
    regex: /jwt\.sign\s*\([^,]+,\s*['"][^'"]{1,15}['"]/gi,
    severity: 'high',
    type: 'secret',
    description: 'JWT signed with a short or hardcoded secret',
    cweId: 'CWE-327',
  },
  {
    id: 'eval-usage',
    regex: /\beval\s*\(/g,
    severity: 'high',
    type: 'injection',
    description: 'eval() detected — possible code injection vector',
    cweId: 'CWE-95',
  },
  {
    id: 'console-secrets',
    regex: /console\.(log|info|debug)\s*\([^)]*(password|token|secret|key)[^)]*\)/gi,
    severity: 'medium',
    type: 'secret',
    description: 'Sensitive value logged to console',
    cweId: 'CWE-312',
  },
];

// ─── Main Export ─────────────────────────────────────────────────────────────

export async function auditSecurity({ mr, context }) {
  logger.info(`[Agent 2: Security Auditor] Starting multi-model audit for MR !${mr.iid}`);
  const startTime = Date.now();

  try {
    const diff = context?.diff || '';

    // ── STEP 1: Regex scan (sync, instant) ──────────────────────────────────
    const regexFindings = runRegexScan(diff);
    logger.info(`[Agent 2] Layer 1 (Regex): ${regexFindings.length} findings`);

    // ── STEP 2 + 3: Claude, Gemini, and CVE check all in PARALLEL ───────────
    const hasPkgChange = diff.includes('package.json');

    const [claudeResult, geminiResult, cveFindings] = await Promise.allSettled([
      runClaudeAudit(diff, context),
      auditWithGemini(diff, context),
      checkCVEs(diff),
    ]).then(results => results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      logger.error(`[Agent 2] Layer ${i + 2} failed: ${r.reason?.message}`);
      // Return safe fallbacks per layer
      if (i === 0) return { findings: [], summary: 'Claude audit failed', reasoning: '' };
      if (i === 1) return { findings: [], summary: 'Gemini unavailable', reasoning: '' };
      return [];
    }));

    logger.info(`[Agent 2] Layer 2 (Claude): ${claudeResult.findings?.length || 0} findings`);
    logger.info(`[Agent 2] Layer 3 (Gemini): ${geminiResult.findings?.length || 0} findings`);
    logger.info(`[Agent 2] Layer 4 (CVE/OSV): ${(cveFindings || []).length} findings`);

    // ── STEP 4: Synthesize ───────────────────────────────────────────────────
    // Include CVE findings tagged as 'regex' source (they're deterministic)
    const regexAndCve = [
      ...regexFindings,
      ...(cveFindings || []).map(f => ({ ...f, confirmedBy: 'regex' })),
    ];

    const synthesized = await synthesizeFindings(
      claudeResult.findings || [],
      geminiResult.findings || [],
      regexAndCve
    );

    // ── STEP 5: Build final result ───────────────────────────────────────────
    const finalFindings = synthesized.findings;
    const criticalCount = finalFindings.filter(f => f.severity === 'critical').length;
    const highCount = finalFindings.filter(f => f.severity === 'high').length;
    const agreementPct = Math.round((synthesized.consensus?.agreementRate || 0) * 100);

    logger.info(
      `[Agent 2] Layers — Regex:${regexFindings.length} Claude:${claudeResult.findings?.length || 0} ` +
      `Gemini:${geminiResult.findings?.length || 0} CVE:${(cveFindings || []).length} ` +
      `Final:${finalFindings.length} Agreement:${agreementPct}%`
    );

    return {
      passed: criticalCount === 0,
      findings: finalFindings,
      criticalCount,
      highCount,
      summary: synthesized.summary,
      consensus: synthesized.consensus,
      verdict: synthesized.verdict,
      claudeReasoning: claudeResult.reasoning || '',
      geminiReasoning: geminiResult.reasoning || '',
      layers: {
        regex: regexFindings.length,
        claude: claudeResult.findings?.length || 0,
        gemini: geminiResult.findings?.length || 0,
        cve: (cveFindings || []).length,
        final: finalFindings.length,
      },
    };
  } catch (err) {
    logger.error(`[Agent 2: Security Auditor] Fatal error: ${err.message}`);
    return {
      passed: false,
      findings: [],
      criticalCount: 0,
      highCount: 0,
      summary: `Security audit failed: ${err.message}`,
      consensus: null,
      verdict: 'REVIEW',
      layers: { regex: 0, claude: 0, gemini: 0, cve: 0, final: 0 },
      error: err.message,
    };
  }
}

// ─── Regex Scanner ──────────────────────────────────────────────────────────

function runRegexScan(diff) {
  const findings = [];
  const lines = diff.split('\n');

  for (const [lineIdx, line] of lines.entries()) {
    if (!line.startsWith('+')) continue; // Only scan added lines

    for (const pattern of PATTERNS) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      const matches = [...line.matchAll(regex)];
      for (const _match of matches) {
        findings.push({
          id: uuidv4(),
          severity: pattern.severity,
          type: pattern.type,
          file: extractFileFromDiff(lines, lineIdx),
          line: lineIdx + 1,
          description: pattern.description,
          originalCode: line.slice(1).trim(),
          fixedCode: null,
          cweId: pattern.cweId,
          confidence: 1.0,
          confirmedBy: 'regex',
          effort: 'low',
          source: 'regex',
        });
      }
    }
  }
  return findings;
}

function extractFileFromDiff(lines, currentIdx) {
  for (let i = currentIdx; i >= 0; i--) {
    if (lines[i].startsWith('=== ')) {
      return lines[i].replace('=== ', '').replace(' ===', '').trim();
    }
    // Also handle standard git diff format
    if (lines[i].startsWith('+++ b/')) {
      return lines[i].replace('+++ b/', '').trim();
    }
  }
  return 'unknown';
}

// ─── Claude Audit (Chain of Thought) ────────────────────────────────────────

async function runClaudeAudit(diff, context) {
  if (!diff || diff.length < 10) {
    return { findings: [], summary: 'No diff content to analyze.', reasoning: '', passed: true };
  }

  // Retrieve RAG context
  let contextSnippets = '';
  try {
    const relevantDocs = await queryDocuments(diff.slice(0, 500), 3);
    contextSnippets = relevantDocs.map(d => d.text).join('\n---\n').slice(0, 2000);
  } catch (_e) {
    contextSnippets = '';
  }

  const systemPrompt = `You are a senior security engineer performing an independent code review.
Your analysis will be cross-checked against another AI model and a regex scanner.

REASONING PHASE — think through these before producing findings:
1. What is this code's purpose and architecture?
2. What external inputs does it accept and from where?
3. Where are those inputs used without proper validation or sanitization?
4. What authentication and authorization assumptions exist? Are they warranted?
5. What could go wrong in production under adversarial conditions?

Context: ${(context?.summary || '').slice(0, 500)}
Security Policy: ${(context?.securityPolicy || 'Standard OWASP best practices').slice(0, 400)}

Return raw JSON only. No backticks. Start with { end with }.`;

  const userMessage = `Review this code diff and return a security audit as JSON.

DIFF:
${diff.slice(0, 6000)}

CODEBASE CONTEXT:
${contextSnippets}

Return this exact JSON structure:
{
  "reasoning": "your step-by-step analysis",
  "findings": [
    {
      "id": "uuid-string",
      "severity": "critical|high|medium|low",
      "type": "secret|injection|xss|iac|dependency|logic",
      "file": "path/to/file.js",
      "line": 42,
      "description": "Clear explanation for a developer",
      "originalCode": "the vulnerable line",
      "fixedCode": "the corrected line",
      "cweId": "CWE-89",
      "confidence": 0.85,
      "effort": "low|medium|high"
    }
  ],
  "summary": "One sentence executive summary"
}

If no issues found, return empty findings array and passed: true.`;

  try {
    const result = await askClaudeJSON(systemPrompt, userMessage, {
      label: 'security-audit-claude',
      maxTokens: 3500,
    });

    if (Array.isArray(result.findings)) {
      result.findings = result.findings.map(f => ({
        ...f,
        id: f.id || uuidv4(),
        confidence: f.confidence ?? 0.8,
        source: 'claude',
      }));
    }
    return result;
  } catch (err) {
    logger.error(`[Agent 2] Claude audit failed: ${err.message}`);
    return { findings: [], summary: 'Claude analysis unavailable.', reasoning: '', passed: true };
  }
}

// ─── CVE Check via OSV API ──────────────────────────────────────────────────

async function checkCVEs(diff) {
  try {
    const pkgMatch = diff.match(/=== package\.json ===[\s\S]*?(?===|$)/);
    if (!pkgMatch) return [];

    const addedLines = pkgMatch[0].split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'));
    const deps = {};

    for (const line of addedLines) {
      const match = line.match(/"([@\w\-./]+)"\s*:\s*"([^"]+)"/);
      if (match) {
        const [, name, version] = match;
        if (!['dependencies', 'devDependencies', 'peerDependencies'].includes(name)) {
          deps[name] = version.replace(/[\^~>=<]/g, '').split('.').slice(0, 3).join('.');
        }
      }
    }

    if (Object.keys(deps).length === 0) return [];

    const queries = Object.entries(deps).map(([name, version]) => ({
      package: { name, ecosystem: 'npm' },
      version,
    }));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let data;
    try {
      const res = await fetch('https://api.osv.dev/v1/querybatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries }),
        signal: controller.signal,
      });
      if (!res.ok) return [];
      data = await res.json();
    } finally {
      clearTimeout(timeout);
    }

    const findings = [];
    for (const [i, result] of (data.results || []).entries()) {
      if (result.vulns?.length > 0) {
        const [name, version] = Object.entries(deps)[i];
        for (const vuln of result.vulns.slice(0, 3)) {
          findings.push({
            id: uuidv4(),
            severity: mapOSVSeverity(vuln.database_specific?.severity),
            type: 'dependency',
            file: 'package.json',
            line: null,
            description: `${name}@${version}: ${vuln.id} — ${(vuln.summary || '').slice(0, 150)}`,
            originalCode: `"${name}": "${version}"`,
            fixedCode: null,
            cweId: vuln.aliases?.find(a => a.startsWith('CWE-')) || null,
            confidence: 1.0,
            confirmedBy: 'regex',
            effort: 'low',
            source: 'osv',
          });
        }
      }
    }

    logger.info(`[Agent 2] OSV CVE check: ${findings.length} vulnerable dependencies`);
    return findings;
  } catch (err) {
    logger.warn(`[Agent 2] CVE check failed (non-fatal): ${err.message}`);
    return [];
  }
}

function mapOSVSeverity(sev) {
  switch ((sev || '').toUpperCase()) {
    case 'CRITICAL': return 'critical';
    case 'HIGH': return 'high';
    case 'MEDIUM': return 'medium';
    default: return 'low';
  }
}
