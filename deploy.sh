#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# FluxSentinel AI — Google Cloud Run Deployment Script (Day 5)
# Usage: ./deploy.sh [PROJECT_ID] [REGION]
# ═══════════════════════════════════════════════════════════════════════════════

set -e

PROJECT_ID="${1:-$(gcloud config get-value project)}"
REGION="${2:-us-central1}"
SERVICE_NAME="fluxsentinel-ai"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

if [ -z "$PROJECT_ID" ]; then
  echo "❌ ERROR: No GCP project ID found. Run: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi

echo ""
echo "⚡ FluxSentinel AI — Cloud Run Deployment"
echo "  Project: ${PROJECT_ID}"
echo "  Region:  ${REGION}"
echo "  Image:   ${IMAGE}"
echo ""

# ── Step 1: Enable required APIs ───────────────────────────────────────────────
echo "→ Enabling required GCP APIs..."
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  containerregistry.googleapis.com \
  --project="${PROJECT_ID}" --quiet

# ── Step 2: Build and push Docker image ────────────────────────────────────────
echo "→ Building Docker image..."
gcloud builds submit \
  --tag "${IMAGE}:latest" \
  --project="${PROJECT_ID}" \
  .

echo "✅ Docker image built and pushed: ${IMAGE}:latest"

# ── Step 3: Load environment variables from .env ───────────────────────────────
if [ ! -f .env ]; then
  echo "❌ ERROR: .env file not found. Copy .env.example to .env and fill in secrets."
  exit 1
fi

echo "→ Loading environment variables from .env..."
# Convert .env to Cloud Run --set-env-vars format (skip comments and blanks)
ENV_VARS=$(grep -v '^\s*#' .env | grep -v '^\s*$' | \
  sed 's/=\(.*\)/="\1"/' | \
  tr '\n' ',' | \
  sed 's/,$//')

# ── Step 4: Deploy to Cloud Run ────────────────────────────────────────────────
echo "→ Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}:latest" \
  --platform managed \
  --region "${REGION}" \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --timeout 300 \
  --port 3000 \
  --set-env-vars="${ENV_VARS}" \
  --project="${PROJECT_ID}" \
  --quiet

# ── Step 5: Get service URL ────────────────────────────────────────────────────
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --platform managed \
  --region "${REGION}" \
  --project="${PROJECT_ID}" \
  --format="value(status.url)")

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ FluxSentinel AI deployed successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Service URL:     ${SERVICE_URL}"
echo "  Dashboard:       ${SERVICE_URL}/dashboard"
echo "  Webhook:         ${SERVICE_URL}/webhook"
echo "  Green metrics:   ${SERVICE_URL}/green"
echo ""
echo "  ⚠️  GitLab Webhook Setup:"
echo "     URL:    ${SERVICE_URL}/webhook"
echo "     Token:  (value of GITLAB_WEBHOOK_SECRET in .env)"
echo "     Trigger: Merge request events"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
