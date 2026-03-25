# ⚡ FluxSentinel AI

> **Autonomous DevSecOps orchestrator for GitLab Merge Requests**  
> GitLab AI Hackathon 2026 — Competing for $65,000 in prizes

**🚀 Live Instance (Try it!):** [https://api-urtl66e5lq-uc.a.run.app/](https://api-urtl66e5lq-uc.a.run.app/)  
**📹 Demo Video:** [Watch on YouTube](https://youtu.be/YQyuyM2b5IA)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org)
[![Anthropic Claude](https://img.shields.io/badge/Anthropic-Claude%20claude--sonnet--4--6-orange.svg)](https://anthropic.com)
[![Cloud Run](https://img.shields.io/badge/Google%20Cloud-Cloud%20Run-blue.svg)](https://cloud.google.com/run)

---

## The Problem

When a developer opens a Merge Request on GitLab, it enters a bottleneck. A human checks security. Another checks documentation. Another checks standards. Teams at high velocity lose **2-3 days per MR** waiting for sequential human reviews.

## The Solution

FluxSentinel AI is a **webhook-triggered, multi-agent orchestration system** that autonomously handles the entire MR review lifecycle the moment code is pushed. Not a chatbot. Not a code generator. **An autonomous system that takes action.**

```
GitLab MR Opened
       │
       ▼
  POST /webhook
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│                   ORCHESTRATOR                            │
│                                                          │
│  [1] Context Engine ──RAG──▶ VectorStore                 │
│       ↓                                                  │
│  [2] Security Auditor ──Regex+Claude+OSV──▶ Findings     │
│       ↓                                                  │
│  [3] Docs Guardian ──Claude──▶ Wiki Auto-Update          │
│       ↓                                                  │
│  [4] Risk Scorer ──Weighted Matrix──▶ Score 0-100        │
│       ↓                                                  │
│  [5] Green Sentinel ──CO₂ Math──▶ Green Metrics          │
│       ↓                                                  │
│  [6] Action Agent ──GitLab API──▶ Comments+Labels+Email  │
└──────────────────────────────────────────────────────────┘
       │
       ▼
  MR Has: Dashboard Comment + One-Click Fix Suggestions
          + Updated Wiki + Label Applied + Email Brief
```

## Agents

| Agent | Role | Key Action |
|-------|------|------------|
| 🧠 Context Engine | RAG system | Embeds MR diff, wiki, issues into vector store |
| 🔐 Security Auditor | 3-layer security scan | Regex + Claude + OSV CVE check |
| 📚 Docs Guardian | Documentation health | Auto-updates GitLab Wiki when code breaks docs |
| 📊 Risk Scorer | Risk quantification | Weighted 0-100 score → auto-approve/block |
| 🌱 Green Sentinel | Environmental impact | Tracks compute + CO₂ savings per scan |
| ⚡ Action Agent | Execution layer | Posts comments, labels, suggestion fixes, emails |

## Prize Pool Eligibility

- ✅ **GitLab Duo Agent Platform** — Built on the GitLab Duo Agent Platform with multi-agent orchestration
- ✅ **Anthropic Bonus ($10,000)** — Powered by Anthropic Claude claude-sonnet-4-6 through GitLab's Anthropic integration
- ✅ **Google Cloud Bonus ($10,000)** — Deployed natively on Google Cloud Run (2nd Gen) via Firebase Functions for stateless, auto-scaling multi-tenant orchestration.
- ✅ **Green Agent Bonus ($3,000)** — Green Agent: reduces unnecessary pipeline compute through early issue detection

## Setup & Installation

### Prerequisites
- Node.js 20+
- GitLab account with admin access to a project
- Anthropic API key
- Resend API key (for email)

### Quick Start

```bash
# 1. Clone and install
git clone https://github.com/yourname/fluxsentinel-ai
cd fluxsentinel-ai
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your secrets

# 3. Start development server
npm run dev

# 4. Configure GitLab webhook
# Settings → Webhooks → Add new webhook
# URL: https://your-server.com/webhook
# Token: your GITLAB_WEBHOOK_SECRET value
# Trigger: Merge request events
```

### Deploy to Google Cloud Run (Production)
The project is architected to deploy directly to Firebase (Cloud Run 2nd Gen) as a serverless container.

```bash
# 1. Login to Google Cloud / Firebase
firebase login

# 2. Deploy the multi-tenant architecture
firebase deploy --only functions

# 3. Access your live instance!
# Firebase will automatically provision a global HTTPS endpoint.
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITLAB_TOKEN` | ✅ | GitLab Personal Access Token (api scope) |
| `GITLAB_WEBHOOK_SECRET` | ✅ | Secret for validating webhook payloads |
| `ANTHROPIC_API_KEY` | ✅ | Anthropic API key for Claude claude-sonnet-4-6 |
| `RESEND_API_KEY` | ✅ | Resend API key for email |
| `JWT_SECRET` | ✅ | 32+ char secret for dashboard JWT tokens |
| `DASHBOARD_USERNAME` | ✅ | Dashboard login username |
| `DASHBOARD_PASSWORD` | ✅ | Dashboard login password |
| `TEAM_LEAD_EMAIL` | ✅ | Recipients for executive email brief |
| `GITLAB_API_URL` | ❌ | GitLab API URL (default: https://gitlab.com/api/v4) |
| `PORT` | ❌ | Server port (default: 3000) |
| `FROM_EMAIL` | ❌ | Sender email address |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/webhook` | Webhook Secret | Receives GitLab MR webhook events |
| `POST` | `/auth/login` | None | Issues dashboard JWT token |
| `GET` | `/dashboard` | JWT | Main dashboard UI |
| `GET` | `/login` | None | Login page |
| `GET` | `/green` | None | Public green metrics page |
| `GET` | `/api/metrics` | JWT | Aggregate dashboard statistics |
| `GET` | `/api/runs` | JWT | List of all MR analysis runs |
| `GET` | `/api/runs/:id` | JWT | Single run details |
| `GET` | `/api/green` | None | Green metrics (public) |
| `GET` | `/api/config` | JWT | Current agent configuration |
| `PUT` | `/api/config` | JWT | Update agent configuration |

## Test the Webhook Locally

```bash
# Start the server
npm run dev

# In another terminal, simulate a GitLab webhook:
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "X-Gitlab-Token: your_webhook_secret" \
  -H "X-Gitlab-Event: Merge Request Hook" \
  -d '{
    "object_attributes": {
      "iid": 1,
      "action": "open",
      "title": "Add user authentication",
      "description": "Closes #5",
      "source_branch": "feature/auth",
      "target_branch": "main",
      "author_id": 123
    },
    "project": { "id": 456, "name": "test-project" },
    "user": { "name": "Dev User" }
  }'

# Expected response: HTTP 202 Accepted
# Then watch your terminal — all 6 agents fire sequentially
```

## What Judges Will See

1. **Login page** at `/login` — dark gradient, FluxSentinel branding
2. **Dashboard** at `/dashboard` — 4 metric cards + recent MR table, live data
3. **Green page** at `/green` — public shareable CO₂ impact chart
4. **GitLab MR** — structured dashboard comment with all agent results table
5. **Inline suggestions** — one-click fix buttons for security findings
6. **Auto-updated Wiki** — documentation corrected without human intervention
7. **Email brief** — HTML email in team lead's inbox

## Architecture Highlights

- **Real RAG**: Vectra vector store with cosine similarity (not prompt stuffing)
- **3-Layer Security**: Regex + Claude semantic + OSV CVE database
- **One-Click Fixes**: GitLab suggestion comments applied in one click
- **Auto-Config**: `/api/config` endpoint makes this a product, not a demo
- **Production Security**: `crypto.timingSafeEqual`, Helmet, 3-tier rate limiting

## Demo Video

[📹 Watch Demo on YouTube](https://youtu.be/YQyuyM2b5IA)

## License

MIT © 2026 FluxSentinel AI Team
