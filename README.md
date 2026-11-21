# FluxSentinel AI

**An automated reviewer for GitLab merge requests.** When a merge request opens, FluxSentinel:
- audits the diff for security issues with two different models
- checks whether the change breaks the docs
- scores the risk from 0 to 100
- posts its review back to GitLab: a summary comment, fix suggestions, a label and an email brief

Built for the GitLab AI Hackathon 2026. [**Demo video →**](https://youtu.be/YQyuyM2b5IA)

<sub>The hosted demo on Cloud Run has been shut down. Everything below runs locally.</sub>

---

## Pipeline

```
GitLab MR opened ──▶ POST /webhook (secret checked, 200 returned at once)
                          │
                          ▼  orchestrator runs six agents in order;
                             if one fails, the rest still run
 1  Context Engine    pulls the diff, wiki pages and issues; indexes them for retrieval
 2  Security Auditor  ┌ regex scan            (instant, deterministic)
                      ├ Claude audit          ┐
                      ├ Gemini audit          ├ in parallel
                      ├ OSV dependency lookup ┘
                      └ judge pass: merge duplicates, label who found what
 3  Docs Guardian     finds docs the change invalidates; updates the wiki and changelog
 4  Risk Scorer       weighted score 0–100 → approve / review / block
 5  Green Sentinel    estimates the CI runs saved by catching issues early
 6  Action Agent      posts the summary comment and fix suggestions, applies a label,
                      sends the email brief
```

## Design decisions

**Two independent auditors, one judge.** Claude (`claude-sonnet-4-6`) and Gemini (`gemini-2.5-flash`) review the same diff without seeing each other's output. A third pass, Claude acting as the judge, merges the findings. Nothing gets dropped: each finding is tagged with who found it, and that tag sets its confidence:

| Found by | Confidence |
| :-- | :-- |
| Both models | 0.95–1.0 |
| Regex scanner | 1.0 |
| One model only | 0.7–0.85 |

So a reviewer sees what the models agree on first, and single-model findings are still there, ranked lower. In security, a missed real issue costs more than a false alarm, so the judge is told to organise, not filter. If the judge fails or returns nothing, the code falls back to a plain merge, so no findings are lost.

**Deterministic checks alongside the models.**
- A regex layer catches the obvious cases (hard-coded secrets, `eval`, SQL built by string concatenation) instantly and for free.
- Dependency versions found in the diff are checked against the [OSV](https://osv.dev) vulnerability database.

These run in parallel with the model calls. Each layer has its own fallback, so one slow or failing provider doesn't fail the review.

**Risk is a formula, not a model.** The score adds fixed weights from [`src/config/default.json`](src/config/default.json): critical finding +25, high +10, no tests +15, large changeset +10, core files touched +10, author history up to +20.
- Below 30, the merge request is labelled `flux:cleared`.
- 70 and above, it's labelled `flux:blocked`.
- Anything in between goes to `flux:review-required`.

Keeping this step deterministic makes the verdict explainable.

**Answer the webhook fast, work in the background.** GitLab expects a quick response. The webhook returns immediately, and the six agents run afterwards.

**Multi-tenant.** Each user connects their own GitLab token. The orchestrator runs every review inside that user's context, so the GitLab calls act as them.

**Honest about estimates.** Green Sentinel counts each critical or high finding as one failed CI run avoided. Each run is assumed to be 6 minutes, at 0.4 g CO₂ per minute. These are configurable estimates, not measurements.

## Run it locally

```bash
npm install
cp .env.example .env          # GitLab token, Anthropic and Gemini keys, JWT secret
npm run dev                   # http://localhost:3000
```

To receive real GitLab webhooks on your machine, install [ngrok](https://ngrok.com/download) and set `NGROK_AUTHTOKEN`. The server opens a tunnel at startup and shows the webhook URL in the setup wizard at `/setup`.

Check that every route responds:

```bash
node scripts/smoke-test.js http://localhost:3000
```

Full GitLab setup steps are in [SETUP.md](SETUP.md). For self-hosting, `Dockerfile` and `deploy.sh` target Google Cloud Run.

## Layout

```
src/webhook.js        Express app: webhook, auth, dashboard, API
src/orchestrator.js   runs the six agents for one merge request
src/agents/           context, security, docs, risk, green, action
src/tools/            Claude, Gemini, GitLab, OSV, vector store, email, judge
src/dashboard/        setup wizard and run dashboard (static)
```

Stack: Node.js 20, Express, Anthropic and Gemini APIs, GitLab REST API, Vectra (local vector index), Firebase, Resend, Docker on Cloud Run.

## Limits

- Retrieval uses a local TF-IDF vector instead of learned embeddings, so matching is lexical, not semantic.
- Fix suggestions are posted as ordinary merge request comments, not inline suggestions on the diff. Inline suggestions need exact diff positions that the pipeline doesn't track yet.

MIT licensed.
