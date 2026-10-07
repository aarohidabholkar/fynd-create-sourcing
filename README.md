# Fynd Create Sourcing (internal prototype)

One connected internal sourcing application with **Overview · My Work · Brands · Styles · Vendors**, built from the six PRDs
(Overall, Overview, My Work, Brands, Styles, Vendors).

> **Prototype notice.** All records, messages, dates and quantities are **illustrative demo data**. People are "John Doe" with role labels;
> vendor names are fictional. There are **no live integrations**: costing requests, follow-ups and notifications are simulated in-app and nothing
> is ever sent externally. There is **no real sign-in**: the "Demo role" switcher (account menu) only changes which demo permissions apply.
> Photos, files and original source documents are not stored; the UI says so wherever a file would be.

## Run it

```bash
# backend (Python 3.11+): FastAPI + SQLite, persists changes to backend/data/app.db
pip install -r backend/requirements.txt
cd backend && python3 -m uvicorn app.main:app --port 8000

# frontend dev server (Node 20+), proxies /api to :8000
cd frontend && npm install && npm run dev        # http://localhost:5173

# or build once and let the backend serve everything on :8000
cd frontend && npm run build && cd ../backend && python3 -m uvicorn app.main:app --port 8000
```

Use **Account menu → Reset demo data** to restore the original dataset, and **Simulate save failures** to see input preserved on failure.

## Tests

```bash
cd backend && python3 -m pytest -q          # 49 rule tests (duplicate-request guard, state separations, privacy, gates, allocation…)
cd frontend && npx playwright test          # 14 end-to-end journeys (starts both servers if needed)
```

## Architecture

* `backend/app/` – one shared, normalised record set (`seed_*.py`), business-rule operations (`ops_*.py`, each a named
  `POST /api/ops/{name}`), a single derivation module (`derive.py`: counts, readiness, clearance checklist, attention, vendor summaries) and per-user
  serialisation (`main.py`: private notes, drafts and commercial fields are removed server-side).
  Idempotency keys prevent double submission; `if_rev` gives concurrent-edit conflicts instead of silent overwrites.
* `frontend/src/` – React + TypeScript + React Router. Shared shell, tokens (`styles.css`, from the Overall PRD), one focused-detail component
  (`detail/FocusDetail.tsx`) used from Overview, My Work, Brands, Styles and Vendors, one timeline, one order view, one TNA table.
  Navigation state (filters, tabs, scroll) is remembered so closing a record returns you where you were.

## Product decisions made on top of the PRDs

* Detail view: full-width with a Back link from Overview; side panel (Expand/Close) from My Work, Brands, Styles, Vendors. CTA is "View all brand details" everywhere.
* Fixed demo date **6 Oct 2026** so overdue / today / upcoming are consistent.
* Linked actions that exist only to track a receipt (e.g. "get corrected sample") complete when the receipt is fully recorded; the preview says so first. Review, QC, approval and issue resolution are never triggered by a receipt.
* Policy gaps are demo configuration, not invented authority: who may verify closure, reopen, approve commercial terms or sign Gate 3 is a labelled demo role capability. Buyer AQL plans are stored per inspection (never a hard-coded value). Audit outcomes are stored as written and never recalculated.

## Known limits (disclosed, by design)

No authentication, file storage, real messaging, AI or calendar integration; fabric/trim booking and partial material receipt are represented by a milestone only;
graded all-size specifications are not modelled (base size only); selling price/margin policy is not configured.
