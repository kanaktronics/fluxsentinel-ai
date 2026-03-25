You are a senior full-stack engineer and DevSecOps architect with 
expert-level knowledge in Node.js, Express, GitLab APIs, Anthropic 
Claude API, Google Cloud Platform, multi-agent AI orchestration, 
and production-grade security systems.

You are building FluxSentinel AI — an autonomous, multi-agent 
DevSecOps orchestrator that acts as a "Traffic Controller" for 
GitLab Merge Requests. This is being built for the GitLab AI 
Hackathon 2026 (devpost: gitlab.devpost.com), competing for 
$65,000 in prizes including a $15,000 Grand Prize, $10,000 
Anthropic bonus, $10,000 Google Cloud bonus, and $3,000 Green 
Agent bonus.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRODUCT CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

THE PROBLEM:
When a developer pushes code to a Merge Request on GitLab, it 
enters a bottleneck. A human checks security. Another checks 
documentation. Another checks standards compliance. This is where 
innovation dies. Teams at high velocity lose 2-3 days per MR 
waiting for sequential human reviews.

THE SOLUTION — FluxSentinel AI:
A webhook-triggered, multi-agent orchestration system that 
autonomously handles the ENTIRE MR review lifecycle the moment 
code is pushed. Not a chatbot. Not a code generator. An 
autonomous system that TAKES ACTION.

Six specialized AI agents run in sequence:

AGENT 1 — Context Engine (RAG)
Reads the MR diff, fetches the linked Issue, reads the Project 
Wiki, retrieves the Security Policy, and builds a semantic 
understanding of WHY this code was written. Uses vector 
embeddings (vectra library) to store and retrieve the most 
relevant context chunks. This is real RAG, not prompt stuffing.

AGENT 2 — Security Auditor
Layer 1: Regex scan for hardcoded secrets, SQL injection, XSS, 
IaC misconfigurations, insecure patterns.
Layer 2: Claude deep semantic analysis of the full diff with 
context from Agent 1.
Layer 3: CVE dependency check against known vulnerability 
databases.
For EVERY finding, it generates the exact fixed code as a GitLab 
suggestion comment — so developers can apply the fix with ONE 
CLICK inside GitLab.

AGENT 3 — Docs Guardian
Detects whether the code changes break or invalidate existing 
documentation. If yes, it AUTOMATICALLY updates the GitLab Wiki 
with the correct information and appends a changelog entry. No 
human needed.

AGENT 4 — Risk Scorer
Synthesizes all findings into a structured risk score (0-100) 
with reasoning. Factors: lines changed, files changed, author 
track record, critical findings count, test coverage presence, 
whether core files are touched. Recommendation: auto-approve, 
escalate, or block.

AGENT 5 — Green Sentinel
Calculates compute savings from early issue detection. Every 
security fix caught at MR stage = one prevented failed pipeline 
= ~6 minutes of compute saved = ~2.4g CO₂ avoided. Logs 
cumulative green metrics to a dashboard. This is the $3,000 
Green Agent bonus qualification.

AGENT 6 — Action Agent
The execution layer. Posts a structured dashboard comment on the 
MR (formatted markdown table with all agent results), posts 
individual suggestion comments for each security fix, updates 
the Wiki if Agent 3 flagged gaps, applies GitLab labels 
(flux-cleared / flux-review-required / flux-blocked), and sends 
an executive email brief to the Team Lead via Resend API.

ORCHESTRATOR:
Sequences all 6 agents. Handles failures gracefully — if one 
agent fails, others continue and the failure is noted in the 
output. Never blocks the webhook response (202 Accepted 
immediately, process async).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TECH STACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Backend: Node.js 20+ with ES Modules (import/export syntax)
Framework: Express.js
AI: Anthropic Claude claude-sonnet-4-6 via @anthropic-ai/sdk
Vector Store: vectra (local in-memory, no external DB needed)
Email: Resend API (resend.com — simplest email API in 2026)
GitLab Integration: GitLab REST API v4 with personal access token
Deployment: Google Cloud Run (containerized via Docker)
Auth: JWT for dashboard, GitLab webhook secret validation
Rate Limiting: express-rate-limit
Dashboard: Vanilla HTML/CSS/JS served by Express (no framework)
Logging: Winston
Environment: dotenv
HTTP Client: node-fetch

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPLETE FILE STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

fluxsentinel/
├── src/
│   ├── webhook.js              # Express server entry point
│   ├── orchestrator.js         # Sequences all 6 agents
│   ├── agents/
│   │   ├── contextEngine.js    # Agent 1: RAG
│   │   ├── securityAuditor.js  # Agent 2: Security scan
│   │   ├── docsGuardian.js     # Agent 3: Wiki updater
│   │   ├── riskScorer.js       # Agent 4: Risk score
│   │   ├── greenSentinel.js    # Agent 5: Carbon tracker
│   │   └── actionAgent.js      # Agent 6: GitLab executor
│   ├── tools/
│   │   ├── gitlabClient.js     # All GitLab API calls
│   │   ├── claudeClient.js     # Anthropic API wrapper
│   │   ├── emailer.js          # Resend email sender
│   │   └── vectorStore.js      # Vectra wrapper
│   ├── middleware/
│   │   ├── auth.js             # JWT + webhook secret validation
│   │   ├── rateLimiter.js      # Rate limiting rules
│   │   └── logger.js           # Winston logger setup
│   ├── dashboard/
│   │   ├── index.html          # Main dashboard UI
│   │   ├── login.html          # Login page
│   │   ├── style.css           # Dashboard styling
│   │   └── app.js              # Dashboard frontend JS
│   ├── config/
│   │   └── default.json        # Configurable settings
│   └── routes/
│       ├── webhookRoute.js     # POST /webhook
│       ├── authRoute.js        # POST /auth/login
│       ├── dashboardRoute.js   # GET /dashboard/*
│       └── apiRoute.js         # GET /api/metrics, /api/events
├── Dockerfile
├── .env.example
├── package.json
└── README.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DAY 1 — BUILD EVERYTHING FOUNDATIONAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Day 1 goal: Every piece of infrastructure working end-to-end. 
By end of Day 1, a real GitLab webhook fires, hits your server, 
all 6 agents run (even if just stubs), a comment appears on the 
MR, and the dashboard shows activity.

BUILD IN THIS EXACT ORDER:

STEP 1 — Project Setup
Initialize Node.js project with ES modules. Install ALL 
dependencies in one shot:

npm install express @anthropic-ai/sdk vectra resend 
node-fetch dotenv express-rate-limit express-jwt jsonwebtoken 
winston helmet cors uuid

Create .env with these variables:
PORT=3000
GITLAB_TOKEN=your_gitlab_pat
GITLAB_WEBHOOK_SECRET=your_webhook_secret
ANTHROPIC_API_KEY=your_anthropic_key
RESEND_API_KEY=your_resend_key
JWT_SECRET=your_jwt_secret_min_32_chars
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=your_secure_password
TEAM_LEAD_EMAIL=teamlead@example.com
NODE_ENV=development

STEP 2 — Middleware Layer (build this before routes)

Build middleware/logger.js:
Winston logger with two transports: console (colorized, 
development) and file (logs/app.log, JSON format). Export a 
single logger instance. Log levels: error, warn, info, debug.

Build middleware/rateLimiter.js:
Three separate rate limiters:
- webhookLimiter: 100 requests per 15 minutes per IP (GitLab 
  sends bursts)
- authLimiter: 5 requests per 15 minutes per IP (brute force 
  protection)
- apiLimiter: 200 requests per 15 minutes per IP (dashboard 
  API calls)
Use express-rate-limit. On limit exceeded, return JSON error 
with retryAfter field.

Build middleware/auth.js:
Two functions:
1. validateWebhookSecret(req, res, next): Reads 
   X-Gitlab-Token header, compares against 
   GITLAB_WEBHOOK_SECRET using timing-safe comparison 
   (crypto.timingSafeEqual). Rejects with 401 if mismatch.
2. authenticateDashboard(req, res, next): Validates JWT from 
   Authorization: Bearer header using express-jwt. On failure, 
   redirect to /login for browser requests, 401 for API 
   requests.

STEP 3 — GitLab Client (most critical tool)

Build tools/gitlabClient.js with these exact functions:

getMRDiff(projectId, mrIid): 
GET /projects/:id/merge_requests/:iid/changes
Returns the raw diff string of all changed files.

getMRDetails(projectId, mrIid):
GET /projects/:id/merge_requests/:iid
Returns full MR object including description, author, 
source_branch, labels, changes_count.

getLinkedIssue(projectId, mrDescription):
Parse issue number from MR description (looks for #123 or 
full issue URL). Then GET /projects/:id/issues/:issue_iid.
Returns issue title + description or null if not found.

getWikiPages(projectId):
GET /projects/:id/wikis
Returns array of wiki page slugs and content. Fetch top 5 
most recently updated pages.

getSecurityPolicy(projectId):
Try to GET /projects/:id/repository/files/SECURITY.md/raw
If not found, try security-policy.md, then docs/security.md.
Return content or a default policy string.

postMRComment(projectId, mrIid, body):
POST /projects/:id/merge_requests/:iid/notes
Posts markdown comment. Returns note id.

postSuggestionComment(projectId, mrIid, filePath, 
oldLine, newLine, suggestionCode):
POST /projects/:id/merge_requests/:iid/discussions
Creates an inline suggestion comment that developers can 
apply with one click.

updateMRLabels(projectId, mrIid, labelsArray):
PUT /projects/:id/merge_requests/:iid
Updates the labels field.

updateWikiPage(projectId, slug, content, commitMessage):
PUT /projects/:id/wikis/:slug
If page doesn't exist, POST to create it.

getAuthorMRHistory(projectId, authorId):
GET /projects/:id/merge_requests?author_id=X&state=merged
Returns count of merged MRs and average time to merge.

All functions: use node-fetch. Add retry logic (3 attempts, 
exponential backoff). Log all API calls with duration. Throw 
descriptive errors with the GitLab API response body included.

STEP 4 — Claude Client

Build tools/claudeClient.js:

askClaude(systemPrompt, userMessage, options):
Creates Anthropic client. Calls claude-sonnet-4-6. 
Default max_tokens: 2048. Accept optional temperature 
(default 0.3 for consistency in security analysis).
Parse response from data.content[0].text.
Wrap in try/catch, log token usage (input + output tokens) 
on every call for cost tracking.

askClaudeJSON(systemPrompt, userMessage):
Same as above but append "Return valid JSON only. No 
markdown, no backticks, no explanation." to the system 
prompt. Parse result with JSON.parse. If parse fails, 
retry once with a stricter prompt. If fails again, throw.

getEmbedding(text):
Use Anthropic embeddings endpoint if available, otherwise 
use a simple TF-IDF approximation using a local function. 
This powers the vectra vector store for RAG.

STEP 5 — Vector Store

Build tools/vectorStore.js:
Wraps vectra LocalIndex.
Functions: initStore(), addDocument(text, metadata), 
queryDocuments(queryText, topK=5).
Store persists to ./data/vector-store directory.
On startup, check if store exists, if not create it.

STEP 6 — All 6 Agents (stubs that work on Day 1, 
deepen on Days 2-5)

Each agent exports a single async function. Each function:
- Logs start with logger.info
- Has a try/catch that logs error and returns a safe default
- Returns a structured result object

Agent 1 — contextEngine.js
export async function buildContext({ mr, project })
Day 1: Fetch MR details, linked issue, wiki pages, security 
policy. Store in vector store. Return { summary, 
securityPolicy, wikiContent, issueContext, authorProfile }

Agent 2 — securityAuditor.js  
export async function auditSecurity({ mr, context })
Day 1: Run regex scan on diff. Call Claude with diff + 
context. Return { passed, findings: [], criticalCount, 
summary }

Agent 3 — docsGuardian.js
export async function guardDocs({ mr, context, audit })
Day 1: Ask Claude if diff breaks any docs. Return { 
updated: false, gaps: [], summary }

Agent 4 — riskScorer.js
export async function scoreRisk({ mr, context, audit, docs })
Day 1: Calculate score from factors. Return { score, label, 
reasoning, recommendation }

Agent 5 — greenSentinel.js
export async function trackGreen({ mr, audit })
Day 1: Calculate pipelinesSaved, co2Saved. Append to 
./data/green-metrics.json. Return { pipelinesSaved, 
computeMinutesSaved, co2Saved }

Agent 6 — actionAgent.js
export async function takeAction({ mr, project, context, 
audit, docs, risk, green })
Day 1: Build the dashboard comment markdown table. Post it 
to GitLab MR. Apply labels. Send email via Resend. Return 
{ commentPosted, labelApplied, emailSent }

STEP 7 — Orchestrator

Build orchestrator.js:
export async function orchestrate({ mr, project })
Run agents in sequence: 1 → 2 → 3 → 4 → 5 → 6.
Each agent receives results from all previous agents.
Wrap each agent call in try/catch — if Agent 2 fails, 
still run Agents 3-6 with audit = null and note the failure.
Log total orchestration time at the end.
Store full run result to ./data/runs/{mrIid}-{timestamp}.json
for dashboard history.

STEP 8 — Routes

Build routes/webhookRoute.js:
POST /webhook
Middleware: webhookLimiter, validateWebhookSecret
Check X-Gitlab-Event header === 'Merge Request Hook'
Check object_attributes.action === 'open' (only new MRs)
Respond 202 immediately
Call orchestrate() asynchronously (don't await in handler)

Build routes/authRoute.js:
POST /auth/login
Middleware: authLimiter
Accept { username, password } JSON body
Compare against DASHBOARD_USERNAME and DASHBOARD_PASSWORD 
env vars using bcrypt or timing-safe comparison
If valid: sign JWT with { sub: username, iat, exp: 24h }
Return { token, expiresIn: '24h' }
If invalid: 401 with generic message (don't say which field 
was wrong)

Build routes/apiRoute.js:
GET /api/metrics — returns aggregate dashboard data:
{ totalMRs, totalFindings, criticalFindings, 
  pipelinesSaved, co2Saved, avgRiskScore, 
  recentRuns: last10 }

GET /api/runs — returns list of all run files from 
./data/runs/ sorted by timestamp desc, limit 50

GET /api/runs/:id — returns single run file content

Build routes/dashboardRoute.js:
GET /login — serve dashboard/login.html
GET /dashboard — serve dashboard/index.html (protected)
GET /dashboard/style.css — serve css
GET /dashboard/app.js — serve js

STEP 9 — Main Server (webhook.js)

Import express, helmet, cors, all routes, logger.
app.use(helmet()) — sets security headers
app.use(cors({ origin: process.env.ALLOWED_ORIGINS || '*' }))
app.use(express.json({ limit: '10mb' }))
Mount all routes.
404 handler for unknown routes.
Global error handler that logs and returns JSON error.
Start server on PORT, log startup message with all 
configured env vars (mask secrets, show only first 4 chars).

STEP 10 — Dashboard UI

Build a clean, dark-themed single-page dashboard.

login.html:
Dark background (#0d1117 — GitHub dark theme color).
Centered card with FluxSentinel logo (text-based, large 
gradient text: "⚡ FluxSentinel").
Username and password fields.
Login button.
On submit: POST /auth/login, store JWT in localStorage, 
redirect to /dashboard.
Show error message on failed login.
No external CSS frameworks. Pure CSS. Clean and minimal.

index.html / app.js / style.css:
Dark theme matching login (#0d1117 background, #161b22 cards,
#21262d borders, #58a6ff accent blue, #3fb950 green).
Top navigation: "⚡ FluxSentinel AI" logo left, 
"Logout" button right.
Metric cards row (4 cards):
- Total MRs Analyzed
- Security Issues Caught  
- Pipelines Saved
- CO₂ Avoided (grams)
Recent Activity table: columns MR ID, Author, Risk Score, 
Status, Agents Run, Timestamp. Color-code risk: green <30, 
yellow 30-70, red >70.
All data fetched from /api/metrics and /api/runs on load.
Auto-refresh every 30 seconds.
All API calls include Authorization: Bearer {jwt} header.
If 401 received, redirect to /login.
Logout button: clear localStorage, redirect to /login.

STEP 11 — Dockerfile

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN mkdir -p data/runs logs
EXPOSE 3000
CMD ["node", "src/webhook.js"]

STEP 12 — README.md (judges read this)

Structure:
# ⚡ FluxSentinel AI
> Autonomous DevSecOps orchestrator for GitLab Merge Requests

## The Problem (3 sentences max)
## The Solution (with architecture diagram in ASCII)
## Agents (table: Agent | Role | Key Action)
## Prize Pool Eligibility
  - ✅ GitLab Duo Agent Platform
  - ✅ Anthropic Claude claude-sonnet-4-6 (Anthropic bonus)
  - ✅ Google Cloud Run (GCP bonus)
  - ✅ Green Sentinel (Green Agent bonus)
## Setup & Installation
## Environment Variables (table)
## API Endpoints (table)
## Demo Video
## License: MIT

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DAYS 2-6 — DEEPEN EACH AGENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DAY 2 — Deepen Agent 2 (Security Auditor)

Add these specific regex patterns to the scan:
- AWS keys: /AKIA[0-9A-Z]{16}/
- Generic secrets: /(secret|password|passwd|pwd|api_key|
  apikey|token)\s*[=:]\s*['"][^'"]{8,}['"]/gi
- SQL injection: /(query|sql|exec)\s*\+\s*(req\.|user|input|
  params)/gi
- XSS: /innerHTML\s*=\s*(?!['"`]<)/gi
- Private keys: /-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----/
- JWT secrets: /jwt\.sign\([^,]+,\s*['"][^'"]{1,20}['"]/gi

Improve Claude security prompt to return this exact JSON:
{
  "findings": [
    {
      "id": "uuid",
      "severity": "critical|high|medium|low",
      "type": "secret|injection|xss|iac|dependency|logic",
      "file": "path/to/file.js",
      "line": 42,
      "description": "Clear explanation for a developer",
      "originalCode": "the vulnerable code line",
      "fixedCode": "the corrected code line",
      "cweId": "CWE-89",
      "effort": "low|medium|high"
    }
  ],
  "passed": true,
  "summary": "One sentence executive summary"
}

For each finding with severity critical or high:
Call postSuggestionComment with the fixedCode as a GitLab 
suggestion. Developers can apply it with one click.

Add CVE check: read package.json from the diff if present,
extract dependencies, call the OSV API 
(https://api.osv.dev/v1/querybatch) to check for known 
vulnerabilities. Add findings to the audit result.

DAY 3 — Deepen Agent 1 (Real RAG) + Agent 3 (Docs)

Agent 1 upgrades:
On every run, embed ALL retrieved documents into vectra.
When querying, use cosine similarity to retrieve the 5 most 
relevant chunks for the specific diff content.
Add contributor profile: fetch author's last 10 MRs, 
calculate their average risk score and common issue types.
Cache wiki pages in ./data/wiki-cache.json, invalidate after 
1 hour. Wiki pages don't change on every MR.

Agent 3 upgrades:
After detecting doc gaps, actually UPDATE the GitLab wiki.
Build a changelog format:
## [Unreleased]
### Changed
- {auto-generated description from Claude}
Append this to CHANGELOG.md in the repo via GitLab Files API.
POST to /projects/:id/repository/files/CHANGELOG.md

DAY 4 — Agent 4 Risk Scoring + Agent 5 Green Dashboard

Agent 4 deep risk model:
Weight matrix for risk score calculation:
- criticalFindings * 25 points (max 75)
- highFindings * 10 points (max 30)  
- linesChanged > 500 ? +10 : 0
- noTestsDetected ? +15 : 0
- coreFilesModified ? +10 : 0
- authorRiskAverage (0-20 points based on history)
Cap at 100. 
0-30: Low (auto-approve recommendation)
31-70: Medium (human review recommended)
71-100: High (block until resolved)

Apply GitLab labels accordingly:
Low → flux:cleared (green label)
Medium → flux:review-required (yellow label)  
High → flux:blocked (red label)

Agent 5 Green Dashboard:
Add a /dashboard/green route serving a green metrics page.
Show: total pipelines saved, total compute minutes saved, 
total CO₂ saved, equivalent in "trees planted" 
(1 tree absorbs ~21kg CO₂/year, so divide grams by 21000).
Show a simple bar chart using plain Canvas API (no libraries).
This page is public (no auth required) — shareable link.

DAY 5 — Deployment + Executive Email + Config System

Cloud Run deployment:
gcloud builds submit --tag gcr.io/PROJECT/fluxsentinel
gcloud run deploy fluxsentinel \
  --image gcr.io/PROJECT/fluxsentinel \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="$(cat .env | xargs)"
Use Cloud Run's HTTPS URL as your GitLab webhook endpoint.

Executive Email (via Resend):
HTML email template with inline styles (email clients don't 
render stylesheets). Dark header with FluxSentinel logo.
Content:
- Developer name and MR title
- One-line status: CLEARED / REVIEW REQUIRED / BLOCKED
- Security findings table (severity, type, auto-fix status)
- Risk score with color bar
- Green impact (pipelines saved)
- One big CTA button: "Review on GitLab" linking to MR URL
Send to TEAM_LEAD_EMAIL from env.

Config System (config/default.json):
{
  "agents": {
    "contextEngine": { "enabled": true, "wikiPageLimit": 5 },
    "securityAuditor": { 
      "enabled": true, 
      "severityThreshold": "low",
      "autoPostSuggestions": true 
    },
    "docsGuardian": { "enabled": true, "autoUpdate": true },
    "riskScorer": { "enabled": true },
    "greenSentinel": { "enabled": true },
    "actionAgent": { 
      "enabled": true,
      "postDashboardComment": true,
      "sendEmail": true,
      "applyLabels": true
    }
  },
  "risk": {
    "autoApproveThreshold": 30,
    "blockThreshold": 70
  }
}

Add a GET /api/config and PUT /api/config endpoint 
(authenticated) so teams can tune FluxSentinel without 
touching code. This is what makes it a product, not a demo.

DAY 6 — Demo Video + Devpost Submission

Demo video shot list (exactly 3 minutes):

00:00–00:25: Screen recording of a GitLab MR sitting open 
for 2 days. Show the empty discussion tab. 
Voiceover: "This MR has been waiting for review for 2 days.
3 people need to check it. The developer is blocked."

00:25–00:45: Show the FluxSentinel architecture diagram.
Simple Excalidraw diagram showing the 6 agents in sequence.
Voiceover: "FluxSentinel changes this. Six autonomous agents 
activate the moment code is pushed."

00:45–02:15: Live demo. Push a commit to a test repo with 
these PLANTED issues:
  - A hardcoded AWS key: const key = "AKIAIOSFODNN7EXAMPLE"
  - A SQL injection: db.query("SELECT * FROM users WHERE id=" 
    + req.params.id)
  - A missing test file for the new function
  - An outdated API endpoint mentioned in the Wiki
Show terminal: watch the orchestrator log each agent firing.
Switch to GitLab: show the dashboard comment appearing in 
real-time with the table of all agent results.
Show the suggestion comments with one-click fix buttons.
Show the Wiki page updating automatically.
Show the email arriving in inbox.

02:15–02:40: Show the dashboard at /dashboard.
Metrics: "47 MRs analyzed. 23 security issues caught. 
12 pipelines saved. 4.8g CO₂ avoided."
Show the green page.

02:40–03:00: Close on the MR page with the comment visible.
"One webhook. Six agents. Zero blockers. 
This is FluxSentinel."

Devpost description must include these exact phrases for 
judges scanning for bonus eligibility:
"Built on the GitLab Duo Agent Platform"
"Powered by Anthropic Claude claude-sonnet-4-6 through 
GitLab's Anthropic integration"
"Deployed on Google Cloud Run"
"Green Agent: reduces unnecessary pipeline compute"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE INEVITABILITY FACTORS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

These are the specific details that make FluxSentinel nearly 
impossible to beat. Build ALL of them.

FACTOR 1 — One-Click Fix Comments
No other submission will post GitLab suggestion comments 
that developers can apply with a single click. This is the 
most impressive GitLab-native feature a judge can see. It 
shows deep platform knowledge.

FACTOR 2 — Real RAG (not fake)
Every other "context-aware" submission will stuff 
everything into one prompt. Your vectra vector store with 
cosine similarity retrieval is real RAG. Judges who open 
your code will immediately see the difference.

FACTOR 3 — Auto Wiki Updates
Agents that write documentation is genuinely novel. No 
other submission in 4,900 participants will do this.

FACTOR 4 — Four Prize Pools
Your README explicitly lists eligibility for Grand Prize, 
Anthropic bonus, GCP bonus, and Green bonus. Most 
submissions don't even know the bonus pools exist.

FACTOR 5 — Config System = Product
The /api/config endpoint transforms FluxSentinel from a 
hackathon demo into a deployable product. Judges who are 
GitLab engineers will recognize this immediately. Products 
beat demos.

FACTOR 6 — The Narrative
"Zero-human bottleneck from open MR to merge-ready." 
This is a $65,000 sentence. Every feature maps back to it.
The demo video must hammer this narrative. Not "we built 
an AI agent." "We eliminated the MR bottleneck."

FACTOR 7 — OSV CVE Checking
Calling the real OSV vulnerability database API for 
dependency scanning puts FluxSentinel in enterprise 
security territory. This is what Snyk and Dependabot do.
You're doing it inside a GitLab agent, which is new.

FACTOR 8 — Green Dashboard Public URL
The /dashboard/green page is public and shareable. In 
your Devpost submission, include the live URL of this 
page showing real metrics. Judges can click it and see 
live data. No other submission will have a live, publicly 
accessible metrics page.

FACTOR 9 — Executive Email HTML Template
The email brief is not a plain text notification. It is a 
professionally designed HTML email with a color-coded risk 
status, a findings table, and a CTA button. Take a 
screenshot of this email and put it in your Devpost 
description. Visual proof of polish.

FACTOR 10 — Timing-Safe Auth + Helmet + Rate Limiting
Production security on the server itself. Webhook secret 
validated with crypto.timingSafeEqual. Helmet sets all 
security headers. Three-tier rate limiting. These details 
scream "senior engineer." No student project has this.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUILD INSTRUCTIONS FOR YOU (THE AI)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Build this project completely. Start with Day 1 in this 
exact order: package.json → .env.example → middleware → 
tools → agents (stubs) → orchestrator → routes → 
webhook.js → dashboard HTML/CSS/JS → Dockerfile → README.

Write complete, production-ready code for every file. 
No placeholders. No TODO comments. Every function must 
work. Every error must be caught and logged.

Use ES module syntax throughout (import/export).
Use async/await throughout (no callbacks, no .then chains).
Every async function has try/catch.
Every external API call has a timeout (10 seconds).
Every file has a top comment explaining its role.

After building all Day 1 files, pause and list:
1. All files created
2. All npm packages used
3. The exact curl command to test the webhook locally
4. The exact command to start the dev server
5. What the judge will see when they open the dashboard

Then ask: "Ready to build Day 2 (Security Auditor depth)?