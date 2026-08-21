# Road Safety Tracking System

**Road Maintenance Complaint and Tracking System** for Chhatrapati Sambhajinagar, Maharashtra.
A final-year project for the **Civil Department** and **Computer Department**.

## Purpose

Public road-damage complaints (potholes, broken surfaces, dangerous stretches) are reported
with photo evidence and exact GPS location, then tracked transparently from report to repair
by government authorities and tender companies.

## Features

- Public reporting with **photo upload** (JPG / PNG / WEBP, max 5 MB)
- Browser **GPS location** capture + optional **Google Maps** pin & address lookup
- **Anonymous reporting** support
- Severity levels: **Critical / Moderate / Low** with priority-first ordering
- Public issue register with search, filters, support votes and full activity timeline
- Status workflow: **New → In review → Assigned → Repair in progress → Resolved**
- Bilingual interface: **English / Marathi**
- Minimal, mobile-friendly UI
- Authority/tender company portal at `/authority.html` (token-protected)

## Tech stack

- **Cloudflare Workers** (serverless API)
- **Cloudflare D1** (SQLite database: reports, events, votes)
- **Cloudflare Workers KV** (1 GB free storage for evidence photos — no credit card needed)
- Vanilla JS + HTML/CSS front-end (no build step)

## Setup

1. Create a **D1 database** (`road-maintenance-db`) and a **KV namespace** in Cloudflare.
2. Add both IDs to `wrangler.jsonc`:

```json
{
  "d1_databases": [{ "binding": "DB", "database_name": "road-maintenance-db", "database_id": "PASTE_D1_ID" }],
  "kv_namespaces": [{ "binding": "IMAGES", "id": "PASTE_KV_NAMESPACE_ID" }]
}
```

3. Deploy via Cloudflare Workers (Github → Cloudflare connection) or:

```bash
npm install
npx wrangler login
npx wrangler d1 execute road-maintenance-db --remote --file=migrations/0001_init.sql
npx wrangler deploy
```

4. Add secrets in **Workers → Settings → Variables and Secrets**:
   - `ADMIN_TOKEN` — protects the authority portal (required)
   - `GOOGLE_MAPS_API_KEY` — enables the interactive map (optional)

## Project structure

```
├── migrations/0001_init.sql   — D1 schema (reports, events, votes)
├── public/                    — front-end (index.html, app.js, styles.css, authority.html, authority.js)
├── src/worker.js              — Cloudflare Worker API
└── wrangler.jsonc             — Worker configuration
```
