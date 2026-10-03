# syntax=docker/dockerfile:1
# Build context must be Local Doctor Ranking/, or the equivalent staged folder.
FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libgomp1 \
    && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY package.json package-lock.json ./
# CPU binaries are bundled by ONNX Runtime. Skip its optional CUDA download.
RUN ONNXRUNTIME_NODE_INSTALL=skip npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

FROM dependencies AS models
COPY demo/models.cjs ./demo/models.cjs
COPY demo/scripts/prewarm-models.cjs ./demo/scripts/prewarm-models.cjs
# Public model weights only: no Supabase reader, records, env file or token is
# present in this stage. Inference smoke tests fail the build on bad downloads.
RUN node demo/scripts/prewarm-models.cjs

FROM base AS runtime
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=models --chown=node:node /app/demo/.cache/models ./demo/.cache/models
COPY package.json package-lock.json bm25Service.cjs location-filter.js ./
COPY demo/server.cjs demo/search.cjs demo/models.cjs demo/geo.cjs \
    demo/data-source.cjs demo/supabase-reader.cjs demo/supabase-mapper.cjs \
    demo/criteria.cjs demo/query-interpreter.cjs demo/clinical-filters.cjs demo/personalized-match.cjs \
    demo/match-explanation.cjs demo/evidence-page.cjs ./demo/
COPY demo/data/public-spire-records.cjs ./demo/data/public-spire-records.cjs
COPY public/index.html public/styles.css public/app.js ./public/
COPY public/fonts/inter-variable.ttf public/fonts/OFL-Inter.txt ./public/fonts/
# Live records and their fingerprint-checked embedding index are generated at
# runtime. Only the cache is writable; application files remain root-owned.
RUN mkdir -p /app/demo/.cache && chown -R node:node /app/demo/.cache
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=900s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(async r=>{const h=await r.json();process.exit(r.ok&&h.ready?0:1)}).catch(()=>process.exit(1))"
CMD ["node", "demo/server.cjs"]
