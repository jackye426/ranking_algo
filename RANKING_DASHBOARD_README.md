# Ranking dashboard (single area)

All ranking dashboard, frontend, and ranking-method code and docs live in **one area** of this repo:

- **`ranking-dashboard/`** — Entry point README (links to everything below).
- **`Local Doctor Ranking/`** — Server, web UI, ranking package, recommendation loop, and docs.
  - **Dashboard & server:** `server.js`, `public/index.html`
  - **Frontend features:** `FRONTEND_FEATURES.md`
  - **Ranking methods:** `ranking-v2-package/`, `apply-ranking.js`, `bm25Service.js` / `bm25Service.cjs`
  - **Recommendation loop:** `recommendation-loop/`
  - **Blacklist scripts:** `scripts/add-blacklist-flag*.js`, `scripts/add-blacklist-flag.ps1`

Run the dashboard from `Local Doctor Ranking/`: `npm install` then `npm start` (requires practitioner data and env config; see `Local Doctor Ranking/README.md`).
