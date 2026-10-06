# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3100 EXPERT_CACHE_DIR=/data/expert
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libgomp1 gosu && rm -rf /var/lib/apt/lists/*
FROM base AS dependencies
COPY package.json package-lock.json ./
RUN ONNXRUNTIME_NODE_INSTALL=skip npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
FROM dependencies AS models
COPY demo/models.cjs ./demo/models.cjs
RUN node -e "require('./demo/models.cjs').embed(['Professional evidence search']).then(v=>{if(v[0].length!==384)process.exit(1)})"
FROM base AS runtime
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=models --chown=node:node /app/demo/.cache/models ./demo/.cache/models
COPY package.json package-lock.json ./
COPY demo/models.cjs ./demo/models.cjs
COPY expert/server.cjs expert/reader.cjs expert/data.cjs expert/brief.cjs expert/search.cjs expert/ai.cjs expert/transport.cjs expert/enrichments.cjs expert/identity-reviews.cjs expert/resume.cjs expert/sources.cjs ./expert/
COPY expert/public/ ./expert/public/
COPY public/fonts/inter-variable.ttf public/fonts/OFL-Inter.txt ./public/fonts/
COPY public/brand/docmap-logo.jpg ./public/brand/docmap-logo.jpg
COPY expert/entrypoint.sh ./expert/entrypoint.sh
RUN sed -i 's/\r$//' /app/expert/entrypoint.sh && chmod 755 /app/expert/entrypoint.sh
# The entrypoint prepares only the dedicated cache volume, then drops privileges.
ENTRYPOINT ["/app/expert/entrypoint.sh"]
EXPOSE 3100
CMD ["node", "expert/server.cjs"]
