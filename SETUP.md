# ⚡ FluxSentinel AI — Setup Guide

## Prerequisites

| Tool | Required | Notes |
|------|----------|-------|
| Node.js 20+ | ✅ | `node --version` |
| GitLab account | ✅ | With a project you can test on |
| Anthropic API key | ✅ | `claude-sonnet-4-6` access |
| Resend account | ✅ | Free tier works (resend.com) |
| gcloud CLI | For deploy only | Cloud Run deployment |

---

## Step 1: Fill in `.env`

```bash
cp .env.example .env
```

Edit `.env`:

```env
GITLAB_TOKEN=          # GitLab → Settings → Access Tokens → api scope
GITLAB_WEBHOOK_SECRET= # Any strong random string, e.g: openssl rand -hex 32
ANTHROPIC_API_KEY=     # platform.anthropic.com → API Keys
RESEND_API_KEY=        # resend.com → API Keys (re_...)
JWT_SECRET=            # Generate: openssl rand -hex 32
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=    # Your choice
TEAM_LEAD_EMAIL=       # Where to send executive email briefs
```

---

## Step 2: Start the Server

```bash
npm run dev
```

You'll see:
```
⚡ FluxSentinel AI started successfully
  Dashboard:         http://localhost:3000/dashboard
  Webhook endpoint:  http://localhost:3000/webhook
```

---

## Step 3: Configure GitLab Webhook

1. Go to your GitLab project → **Settings → Webhooks**
2. Click **Add new webhook**
3. Set:
   - **URL**: `http://your-server.com/webhook` _(or use ngrok for local testing)_
   - **Secret token**: Value of `GITLAB_WEBHOOK_SECRET` from `.env`
   - **Trigger**: ✅ Merge request events
4. Click **Add webhook**

### Local Testing with ngrok

```bash
# In a separate terminal:
npx ngrok http 3000
# Copy the https://xxxxx.ngrok.io URL → use as webhook URL in GitLab
```

---

## Step 4: Open a Test MR

Create a branch with these planted issues to see FluxSentinel in action:

```javascript
// test-vuln.js  ← add this to your repo and open an MR
const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";        // ← critical: hardcoded AWS key
const db_pass = "password123";                  // ← critical: hardcoded credential

function getUser(req) {
  return db.query("SELECT * FROM users WHERE id=" + req.params.id);  // ← SQL injection
}
```

When you open the MR, watch the terminal — you'll see all 6 agents fire within seconds.

---

## Step 5: Verify the Output

After the MR is created:

| Where to look | What you'll see |
|--------------|-----------------|
| GitLab MR → Discussion | Structured table with all 6 agent results |
| GitLab MR → Changes | Inline suggestion comments with one-click fixes |
| GitLab MR → Labels | `flux:blocked` or `flux:cleared` label applied |
| Team lead email | HTML executive brief with risk score |
| `http://localhost:3000/dashboard` | MR in the activity table |
| `http://localhost:3000/green` | CO₂ impact updated |

---

## Deploy to Google Cloud Run

```bash
# Authenticate gcloud
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Deploy (one command)
bash deploy.sh YOUR_PROJECT_ID us-central1
```

The script outputs:  
```
  Service URL:     https://fluxsentinel-ai-xxx-uc.a.run.app
  Webhook:         https://fluxsentinel-ai-xxx-uc.a.run.app/webhook
```

Use the webhook URL in GitLab Settings → Webhooks.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `401 Unauthorized` on webhook | Check `GITLAB_WEBHOOK_SECRET` matches GitLab setting |
| No comment on MR | Check `GITLAB_TOKEN` has `api` scope |
| Claude errors | Verify `ANTHROPIC_API_KEY` and account has `claude-sonnet-4-6` access |
| No email | Check `RESEND_API_KEY` and `TEAM_LEAD_EMAIL` are set |
| Dashboard `401` | Token expired — log out and log in again |

---

## Day-by-Day Feature Status

| Day | Feature | Status |
|-----|---------|--------|
| Day 1 | All 6 agents (foundation) | ✅ Complete |
| Day 2 | Security Auditor depth (8 regex, OSV CVE, Claude JSON) | ✅ Built in Day 1 |
| Day 3 | Wiki caching, contributor profiling, CHANGELOG auto-update | ✅ Complete |
| Day 4 | Risk weight matrix, labels, green dashboard Canvas chart | ✅ Built in Day 1 |
| Day 5 | Cloud Run deploy, executive email, `/api/config` | ✅ Complete |
| Day 6 | Demo video + Devpost submission | 🎬 Record last |
