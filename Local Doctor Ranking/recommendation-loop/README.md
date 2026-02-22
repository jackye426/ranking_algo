# Recommendation feedback loop

This folder holds everything for closing the loop between **algorithm output** and **what we actually send to patients** (e.g. via WhatsApp), so we can improve ranking and track patient-facing recommendations.

## What we commit

- **`output/whatsapp-suggested-doctors.json`** – Master list of doctors suggested in WhatsApp (deduplicated, with email and tally). Built by `scripts/build-whatsapp-suggested-doctors.js`.
- **Session storage** – The **tracker** (`scripts/recommendation-tracker.js`) stores the **session phone number** (patient/WhatsApp contact) per run so we can match runs to WhatsApp chats. Tracker data (`data/recommendation-tracker.json`) is regenerable and can stay local.
- **WhatsApp export parsing** – `scripts/parse-whatsapp-recommendations.js` parses a single exported WhatsApp chat (`_chat.txt`). `scripts/parse-all-whatsapp-sessions.js` parses all sessions in `whatsapp-sessions/`. Export chats into `whatsapp-sessions/<contact>/_chat.txt`, then run the build script to refresh `output/whatsapp-suggested-doctors.json`.

## Contents

- **`data/`** – Tracker JSON and other intermediate/raw data (e.g. `recommendation-tracker.json`, `whatsapp-sessions-parsed.json`).
- **`output/`** – Final compiled reports (e.g. `whatsapp-suggested-doctors.json`).
- **`scripts/`** – Tracker (top 10 + AI reasoning), WhatsApp parser, and any import/backdate helpers.
- **`whatsapp-sessions/`** – WhatsApp chat exports. Either drop **unzipped** `_chat.txt` files here (or in subfolders, one per conversation), or drop `.zip` exports and unzip them; each zip usually contains `_chat.txt`. Subfolders are named by contact (e.g. `+44 7951 344688`).

## Tracker

- Records **top 10** algorithm results per query (was top 5).
- Stores **AI reasoning** when the server runs fit evaluation (e.g. per-doctor fit reason).
- **Session phone number**: the frontend requires a session phone number (patient/WhatsApp contact); it is stored per run so we can match tracker runs to WhatsApp sessions by phone instead of time/query heuristics.
- Existing fields (e.g. `top5`) stay for backward compatibility; new records include `top10`, `aiReasoning`, and `sessionPhoneNumber`.

## WhatsApp

- Put export files in `whatsapp-sessions/` (one folder per chat, e.g. by phone number, each with `_chat.txt`).
- Use `scripts/parse-whatsapp-recommendations.js` to parse a single export into structured entries (rank, name, location, why good fit, best for, link).
- **Automatic master list:** whenever you add (or change) WhatsApp chats, run the build script to refresh a single deduplicated list with emails and tally (see below).

## Master list of WhatsApp-suggested doctors (automatic process)

Whenever a WhatsApp chat is added or updated:

1. **Add the new chat** under `whatsapp-sessions/<contact>/_chat.txt` (or run after unzipping an export).
2. **Run the build script** (from `Local Doctor Ranking`):

   ```bash
   node recommendation-loop/scripts/build-whatsapp-suggested-doctors.js
   ```

This script:

- **Re-parses** all sessions in `whatsapp-sessions/` and updates `data/whatsapp-sessions-parsed.json`.
- **Builds/updates** `output/whatsapp-suggested-doctors.json`: a single list of every doctor suggested in WhatsApp, with:
  - **Deduplication** by normalized name (titles like Mr/Dr/Prof stripped, case-insensitive).
  - **Email** looked up from practitioner data on file (`data/merged_all_sources_latest.json`).
  - **Tally** of how many times each doctor appeared in WhatsApp recommendations (`whatsappTally`).

Use `--no-parse` to skip re-parsing and only rebuild the master list from the existing `whatsapp-sessions-parsed.json`.

## Quick commands

From the `Local Doctor Ranking` directory:

```bash
# Update master list after adding WhatsApp chats (parse all sessions + dedupe + email + tally)
node recommendation-loop/scripts/build-whatsapp-suggested-doctors.js

# Parse a single WhatsApp export only
node recommendation-loop/scripts/parse-whatsapp-recommendations.js recommendation-loop/whatsapp-sessions/+44\ 7951\ 344688/_chat.txt

# Parse all sessions and write combined JSON only (no master list)
node recommendation-loop/scripts/parse-all-whatsapp-sessions.js --json
```
