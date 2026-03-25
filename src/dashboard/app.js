/**
 * dashboard/app.js — FluxSentinel AI
 * Matches actual API response shape from /api/metrics and /api/runs:
 *   run.mrIid, run.mrTitle, run.mrAuthor, run.riskScore, run.riskLabel,
 *   run.findingsCount, run.criticalCount, run.pipelinesSaved, run.startedAt
 */

const token = localStorage.getItem('flux_token');
if (!token) window.location.href = '/login';

async function api(path) {
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    localStorage.removeItem('flux_token');
    window.location.href = '/login';
    return null;
  }
  return res.json();
}

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso);
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

function riskClass(score) {
  if (score >= 70) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

function riskDisplayLabel(label, score) {
  if (label) return label.toUpperCase().slice(0, 4);
  if (score >= 70) return 'HIGH';
  if (score >= 30) return 'MED';
  return 'LOW';
}

function initials(name) {
  if (!name) return '??';
  return name.split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2);
}

function animateNumber(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const current = parseInt(el.textContent) || 0;
  const diff = target - current;
  const steps = 20;
  let step = 0;
  const timer = setInterval(() => {
    step++;
    el.textContent = Math.round(current + (diff * step / steps));
    if (step >= steps) { el.textContent = target; clearInterval(timer); }
  }, 30);
}

async function loadData() {
  const btn = document.getElementById('refreshBtn');
  if (btn) btn.classList.add('spinning');

  try {
    const [metrics, runsData] = await Promise.all([
      api('/api/metrics'),
      api('/api/runs'),
    ]);

    if (!metrics || !runsData) return;

    // Metric cards
    animateNumber('totalMRs', metrics.totalMRs || 0);
    animateNumber('totalFindings', metrics.totalFindings || 0);
    animateNumber('pipelinesSaved', metrics.pipelinesSaved || 0);

    const co2 = Math.round(metrics.co2Saved || 0);
    document.getElementById('co2Saved').textContent = co2 + 'g';
    document.getElementById('criticalSub').textContent =
      `${metrics.criticalFindings || 0} critical findings`;

    // Footer stats
    document.getElementById('avgRisk').textContent =
      `${Math.round(metrics.avgRiskScore || 0)}/100`;

    // Count docs updated from run list
    const runs = runsData.runs || [];
    const docsCount = runs.filter(r => r.docsUpdated).length;
    document.getElementById('docsUpdated').textContent =
      `${docsCount} wiki page${docsCount !== 1 ? 's' : ''}`;

    const fixesCount = runs.filter(r => r.findingsCount > 0).length;
    document.getElementById('autoFixes').textContent =
      fixesCount > 0 ? `${fixesCount} MR${fixesCount !== 1 ? 's' : ''}` : '—';

    // Run count badge
    document.getElementById('runCount').textContent = `${runs.length} runs`;

    renderTable(runs);
  } catch (e) {
    console.error('Load error:', e);
    document.getElementById('statusText').textContent = 'Error';
  } finally {
    if (btn) btn.classList.remove('spinning');
  }
}

function renderTable(runs) {
  const container = document.getElementById('tableContainer');

  if (!runs || runs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚡</div>
        <p>No MR analyses yet. Open a Merge Request to trigger FluxSentinel.</p>
      </div>`;
    return;
  }

  const rows = runs.slice(0, 50).map(run => {
    // API returns: mrIid, mrTitle, mrAuthor, riskScore, riskLabel,
    //              findingsCount, criticalCount, pipelinesSaved, startedAt
    const score   = run.riskScore ?? 0;
    const label   = run.riskLabel || null;
    const cls     = riskClass(score);
    const dispLbl = riskDisplayLabel(label, score);
    const findings = run.findingsCount ?? 0;
    const critical = run.criticalCount ?? 0;
    const pipelines = run.pipelinesSaved ?? 0;
    const author   = run.mrAuthor || 'Unknown';
    const title    = run.mrTitle || 'MR Analysis';
    const ts       = run.startedAt;

    return `
      <tr>
        <td><span class="mr-id">!${run.mrIid ?? '?'}</span></td>
        <td><span class="mr-title" title="${title}">${title.length > 45 ? title.slice(0, 45) + '…' : title}</span></td>
        <td>
          <div class="author-cell">
            <div class="author-avatar">${initials(author)}</div>
            ${author}
          </div>
        </td>
        <td>
          <span class="risk-badge ${cls}">
            <span class="risk-score">${score}</span>
            ${dispLbl}
          </span>
        </td>
        <td>
          <div class="findings-cell">
            <span class="finding-tag total">${findings} total</span>
            ${critical > 0 ? `<span class="finding-tag critical">${critical} crit</span>` : ''}
          </div>
        </td>
        <td>
          ${pipelines > 0
            ? `<span class="green-badge">🌱 ${pipelines}</span>`
            : '<span style="color:var(--text-muted)">—</span>'}
        </td>
        <td><span class="time-cell">${timeAgo(ts)}</span></td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>MR</th>
          <th>Title</th>
          <th>Author</th>
          <th>Risk Score</th>
          <th>Findings</th>
          <th>Pipelines</th>
          <th>Time</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function logout() {
  localStorage.removeItem('flux_token');
  localStorage.removeItem('flux_user');
  localStorage.removeItem('flux_role');
  window.location.href = '/login';
}

let _webhookUrl = null;
function copyUrl() {
  if (!_webhookUrl) return;
  navigator.clipboard.writeText(_webhookUrl).then(() => {
    const btn = event.target;
    btn.textContent = '✅ Copied!';
    setTimeout(() => { btn.textContent = '📋 Copy'; }, 2000);
  });
}

async function loadStatus() {
  try {
    const d = await fetch('/api/status').then(r => r.json());
    if (d.webhookUrl) {
      _webhookUrl = d.webhookUrl;
      const banner = document.getElementById('webhookBanner');
      const urlEl = document.getElementById('webhookBannerUrl');
      if (banner && urlEl) {
        urlEl.textContent = d.webhookUrl;
        banner.style.display = 'flex';
      }
    }
  } catch { /* silent */ }
}

// Init
loadData();
loadStatus();
setInterval(loadData, 30000);

// CSP Compliance: Attach event listeners
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) logoutBtn.addEventListener('click', logout);

const copyUrlBtn = document.getElementById('copyUrlBtn');
if (copyUrlBtn) copyUrlBtn.addEventListener('click', copyUrl);

const refreshBtn = document.getElementById('refreshBtn');
if (refreshBtn) refreshBtn.addEventListener('click', loadData);

