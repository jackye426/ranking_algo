# Ranking Dashboard

This folder is the entry point for the **Local Doctor Ranking** dashboard, its frontend features, and the ranking methods used by the service.

## Dashboard & server

- **Web UI:** `../Local Doctor Ranking/public/index.html`  
  Single-page app: rank-by-query, search doctor by name, filters (specialty, location, insurance, NHS, age, gender, language), test mode, session phone number for WhatsApp linkage.

- **Server:** `../Local Doctor Ranking/server.js`  
  Express server; loads practitioner data, exposes `/api/rank`, `/api/rank-production`, `/api/status`, `/api/stats`, and search-by-name.  
  Start with: `npm start` (from `Local Doctor Ranking`).

## Frontend features

- **Doc:** [FRONTEND_FEATURES.md](../Local%20Doctor%20Ranking/FRONTEND_FEATURES.md)  
  Consolidated list of UI features: modes (rank vs find by name), session phone number, test mode, algorithm selector, filters (specialty, city, postcode, radius, age, gender, language, insurance, NHS), remote consultation display, result card fields, and API payload.

## Ranking methods

- **Packages & code**
  - `../Local Doctor Ranking/ranking-v2-package/` — V2 parallel ranking, V5 ideal profile, V6 progressive ranking, V7 checklist + progressive.
  - `../Local Doctor Ranking/apply-ranking.js` — Data loading, transform (insurance, PHIN, remote consultation), `deriveRemoteConsultation`.
  - `../Local Doctor Ranking/bm25Service.js` / `bm25Service.cjs` — BM25 shortlist, filters (blacklist, insurance, gender), two-stage retrieval.

- **Docs (in `Local Doctor Ranking/`)**
  - `README_RANKING.md` — Applying the ranking algorithm.
  - `README.md` — Server quick start and API.
  - `V2_INTEGRATION_PLAN.md`, `V2_INTEGRATION_COMPLETE.md` — V2 integration.
  - `V5_IDEAL_PROFILE_APPROACH.md`, `V5_IMPLEMENTATION_SUMMARY.md`, `V5_USAGE_EXAMPLE.md`, `V5_PROMPT_GUIDELINES.md` — V5.
  - `V6_PROGRESSIVE_RANKING_PLAN.md`, `V6_IMPLEMENTATION_SUMMARY.md`, `V6_IMPLEMENTATION_COMPLETE.md`, `V6_TESTING_GUIDE.md`, `V6_FLOW_DIAGRAM.md` — V6.
  - `PRODUCTION_BM25_*.md`, `FILTERING_LOGIC.md`, `MANUAL_SPECIALTY_FILTER.md` — Production BM25 and filtering.
  - `ranking-v2-package/README.md` — Ranking package usage.

## Recommendation loop & blacklist

- **Recommendation loop:** `../Local Doctor Ranking/recommendation-loop/`  
  WhatsApp suggestion parsing, build scripts, tracker; see `recommendation-loop/README.md`.

- **Blacklist:** Practitioners with `blacklisted: true` in the dataset are excluded from all ranking results. List and scripts: `Local Doctor Ranking/recommendation-loop/data/doctor-blacklist.json`, `Local Doctor Ranking/scripts/add-blacklist-flag*.js|.ps1`.
