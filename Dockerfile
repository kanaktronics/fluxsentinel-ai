FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer caching)
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Create persistent data directories (volume mount point for Cloud Run)
RUN mkdir -p data/runs data/vector-store logs

# Non-root user for security
RUN addgroup -S fluxsentinel && adduser -S fluxsentinel -G fluxsentinel
RUN chown -R fluxsentinel:fluxsentinel /app
USER fluxsentinel

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", "src/webhook.js"]
