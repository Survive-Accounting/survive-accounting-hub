# ProfIntel bounded batch runner

Safe scheduler + hard-guard layer around the existing ProfIntel scrape pipeline.
See the full audit at [`PROFINTEL_AUDIT.md`](../../PROFINTEL_AUDIT.md) and the ranked
campus list at [`PROFINTEL_PRIORITY.csv`](../../PROFINTEL_PRIORITY.csv).

## Files
- `batch-runner.mjs` — the runner (guards, checkpoint, concurrency, cost log). Dry-run by default.
- `executors.mjs` — `scrapeOne(campus)` implementations. Live executor is a **throwing stub** (safe).
- `batch-runner.test.mjs` — 10 tests (budget/request/count guards, resume, retry, dry-run).

## Run the tests
```bash
node --test scripts/profintel/batch-runner.test.mjs
```

## Dry-run (zero network, zero spend — the default)
```bash
node scripts/profintel/batch-runner.mjs --input PROFINTEL_PRIORITY.csv \
  --priority-min P3 --max-campuses 61 --budget-usd 10 \
  --max-requests 1200 --max-runtime-min 90 --concurrency 3 \
  --checkpoint .profintel-first-batch.json
```

## Key safety properties
- **Never exceeds `--budget-usd`** (reservation accounting; holds under concurrency).
- Also enforces `--max-requests`, `--max-runtime-min`, `--max-campuses`.
- **Resumable + idempotent** via `--checkpoint`; **graceful stop** on Ctrl-C.
- `--execute` **refuses** to run without a wired `--executor` module → no accidental spend.

Before any real run: confirm provider credit balances (SerpAPI `GET /account.json`,
Firecrawl `GET /v2/team/credit-usage`) and wire `scrapeOne()` per `executors.mjs`.
