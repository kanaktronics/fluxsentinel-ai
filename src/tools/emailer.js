/**
 * tools/emailer.js
 * Resend API email sender. Sends professionally formatted HTML emails
 * to the team lead with MR status, security findings, and risk score.
 */

import { Resend } from 'resend';
import logger from '../middleware/logger.js';

let _resend = null;
function getResend() {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

const RISK_COLORS = {
  LOW: { bg: '#1a4731', text: '#3fb950', badge: 'CLEARED' },
  MEDIUM: { bg: '#3d3114', text: '#d29922', badge: 'REVIEW REQUIRED' },
  HIGH: { bg: '#3d1a1a', text: '#f85149', badge: 'BLOCKED' },
};

/**
 * Send the executive MR brief to the team lead.
 */
export async function sendMRBrief({ mr, project, audit, risk, green, mrUrl, user }) {
  const resend = getResend();
  // Always use Resend's verified sender — works on all free accounts with zero domain setup
  const from = 'FluxSentinel AI <onboarding@resend.dev>';
  const to = user?.email || process.env.TEAM_LEAD_EMAIL;

  if (!to) {
    logger.warn('Emailer: No recipient configured (missing from user profile and TEAM_LEAD_EMAIL)');
    return { sent: false, reason: 'No recipient configured' };
  }

  const riskLabel = risk?.label || 'MEDIUM';
  const colors = RISK_COLORS[riskLabel] || RISK_COLORS.MEDIUM;
  const score = risk?.score ?? 0;
  const findings = audit?.findings || [];
  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const highCount = findings.filter(f => f.severity === 'high').length;

  const findingsTable = findings.length > 0
    ? `
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px;">
        <thead>
          <tr style="background:#161b22;">
            <th style="text-align:left;padding:8px 12px;color:#8b949e;border-bottom:1px solid #30363d;">Severity</th>
            <th style="text-align:left;padding:8px 12px;color:#8b949e;border-bottom:1px solid #30363d;">Type</th>
            <th style="text-align:left;padding:8px 12px;color:#8b949e;border-bottom:1px solid #30363d;">File</th>
            <th style="text-align:left;padding:8px 12px;color:#8b949e;border-bottom:1px solid #30363d;">Auto-Fix</th>
          </tr>
        </thead>
        <tbody>
          ${findings.slice(0, 10).map(f => `
            <tr style="border-bottom:1px solid #21262d;">
              <td style="padding:8px 12px;color:${severityColor(f.severity)};font-weight:bold;">${(f.severity || 'info').toUpperCase()}</td>
              <td style="padding:8px 12px;color:#c9d1d9;">${f.type || 'unknown'}</td>
              <td style="padding:8px 12px;color:#8b949e;font-family:monospace;">${(f.file || '').split('/').pop()}</td>
              <td style="padding:8px 12px;color:${f.fixedCode ? '#3fb950' : '#8b949e'};">${f.fixedCode ? '✅ Yes' : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`
    : '<p style="color:#8b949e;font-size:13px;margin:12px 0 0;">No security findings — code passed all checks.</p>';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>FluxSentinel AI — MR Brief</title></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#0d1117;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1c2d4f,#0d1117);padding:32px 40px;border-bottom:2px solid #58a6ff;">
      <div style="font-size:28px;font-weight:800;color:#58a6ff;letter-spacing:-0.5px;">⚡ FluxSentinel AI</div>
      <div style="color:#8b949e;font-size:13px;margin-top:4px;">Autonomous DevSecOps Orchestrator</div>
    </div>

    <!-- Status Badge -->
    <div style="padding:24px 40px;background:#161b22;border-bottom:1px solid #21262d;">
      <div style="font-size:13px;color:#8b949e;margin-bottom:8px;">MR STATUS</div>
      <div style="display:inline-block;background:${colors.bg};color:${colors.text};font-weight:700;font-size:16px;letter-spacing:1px;padding:8px 20px;border-radius:6px;border:1px solid ${colors.text}33;">
        ${colors.badge}
      </div>
      <div style="margin-top:16px;color:#c9d1d9;font-size:15px;font-weight:600;">
        ${mr?.title || 'Merge Request Review'}
      </div>
      <div style="color:#8b949e;font-size:13px;margin-top:4px;">
        by <strong style="color:#c9d1d9;">${mr?.author?.name || 'Unknown'}</strong> · 
        Branch: <code style="background:#21262d;padding:2px 6px;border-radius:4px;color:#79c0ff;">${mr?.source_branch || 'unknown'}</code>
      </div>
    </div>

    <!-- Risk Score -->
    <div style="padding:24px 40px;border-bottom:1px solid #21262d;">
      <div style="font-size:13px;color:#8b949e;margin-bottom:12px;">RISK SCORE</div>
      <div style="display:flex;align-items:center;gap:16px;">
        <div style="font-size:48px;font-weight:800;color:${colors.text};">${score}</div>
        <div style="flex:1;">
          <div style="background:#21262d;border-radius:8px;height:12px;overflow:hidden;">
            <div style="background:${colors.text};width:${score}%;height:100%;border-radius:8px;"></div>
          </div>
          <div style="color:#8b949e;font-size:12px;margin-top:6px;">${risk?.reasoning || 'Risk assessed by FluxSentinel agents'}</div>
        </div>
      </div>
    </div>

    <!-- Findings Summary -->
    <div style="padding:24px 40px;border-bottom:1px solid #21262d;">
      <div style="font-size:13px;color:#8b949e;margin-bottom:12px;">SECURITY FINDINGS</div>
      <div style="display:flex;gap:16px;margin-bottom:16px;">
        <div style="background:#3d1a1a;padding:12px 20px;border-radius:8px;border:1px solid #f8514933;flex:1;text-align:center;">
          <div style="color:#f85149;font-size:24px;font-weight:700;">${criticalCount}</div>
          <div style="color:#8b949e;font-size:12px;">Critical</div>
        </div>
        <div style="background:#3d2d14;padding:12px 20px;border-radius:8px;border:1px solid #d2992233;flex:1;text-align:center;">
          <div style="color:#d29922;font-size:24px;font-weight:700;">${highCount}</div>
          <div style="color:#8b949e;font-size:12px;">High</div>
        </div>
        <div style="background:#1a4731;padding:12px 20px;border-radius:8px;border:1px solid #3fb95033;flex:1;text-align:center;">
          <div style="color:#3fb950;font-size:24px;font-weight:700;">${green?.pipelinesSaved ?? 0}</div>
          <div style="color:#8b949e;font-size:12px;">Pipelines Saved</div>
        </div>
      </div>
      ${findingsTable}
    </div>

    <!-- CTA -->
    <div style="padding:32px 40px;text-align:center;">
      <a href="${mrUrl || '#'}" style="display:inline-block;background:#58a6ff;color:#0d1117;font-weight:700;font-size:15px;padding:14px 36px;border-radius:8px;text-decoration:none;letter-spacing:0.3px;">
        Review on GitLab →
      </a>
      <div style="color:#484f58;font-size:11px;margin-top:20px;">
        Sent by FluxSentinel AI · ${new Date().toUTCString()}
      </div>
    </div>

  </div>
</body>
</html>`;

  try {
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject: `⚡ FluxSentinel — MR !${mr?.iid} · ${riskLabel} RISK · ${findings.length} finding${findings.length !== 1 ? 's' : ''}`,
      html,
    });

    if (error) {
      logger.error(`Resend API Error: ${error.message}`);
      return { sent: false, error: error.message };
    }

    logger.info(`Email sent to ${to}, id: ${data.id}`);
    return { sent: true, id: data.id };
  } catch (err) {
    logger.error(`Email send failed: ${err.message}`);
    return { sent: false, error: err.message };
  }
}

function severityColor(severity) {
  switch ((severity || '').toLowerCase()) {
    case 'critical': return '#f85149';
    case 'high': return '#d29922';
    case 'medium': return '#58a6ff';
    default: return '#8b949e';
  }
}
