# Fix: AI Research debug never persists + crash after leads succeed

## What we know from the USC run

- `research-campus-leads` succeeded server-side (13 leads inserted into DB).
- The modal "crashed" after that.
- `campuses.ai_research_debug_json` is still `null` ("no runs recorded").

## Root cause

`ApproveCampusModal.runAiResearch()` only writes the debug blob **once, at the very end** via `persistDebug → writePatch → onPatch → patchCampusDb`. That single save is fragile:

1. `writePatch` silently no-ops if `campus` is null. If the modal closes or the parent swaps `reviewing` mid-run, the debug is dropped.
2. `patchCampusDb` errors are caught in `routes/outreach.tsx` and only `console.error`'d — no toast, no retry.
3. If the React tree throws while re-rendering after 13 new leads come back (a common cause of "it crashed"), the line after `await runLeadResearch()` never executes and `persistDebug` is never called.
4. There's no `ErrorBoundary` around the modal, so a render crash kills the whole screen with no breadcrumb.

Net effect: every failure mode produces the exact symptom you're seeing — leads exist in DB, debug blob is still `null`.

## Fix plan (minimal, surgical)

### 1. Persist debug incrementally, directly to DB

In `src/components/outreach/ApproveCampusModal.tsx`:

- Replace `persistDebug` so it (a) updates local state, (b) `await`s `patchCampusDb(campusId, { ai_research_debug_json: next })` directly using the captured `campus.id` (not the possibly-null `campus` ref), and (c) on failure shows a toast like "Couldn't save debug log: …" so silent drops become visible.
- Write a debug snapshot **at three points**, not one:
  - **Start of `runAiResearch`**: `{ last_run_at: now, course: { status: "running", started_at }, leads: { status: "pending" } }` so a crash mid-run still leaves a trace.
  - **Immediately after `runCourseResearch` returns** (before starting leads).
  - **Immediately after `runLeadResearch` returns**.
- Same for `rerunCourseOnly` / `rerunLeadsOnly`.

### 2. Make `runAiResearch` crash-proof

Wrap the body in `try/catch/finally`:
- `catch` records `{ status: "failed", error: String(e), ... }` into whichever phase was active and persists it.
- `finally` always persists the final snapshot and clears `setAiResearching(false)`.

### 3. Surface DB write failures globally

In `src/routes/outreach.tsx` `patchCampus`, replace the silent `.catch((e) => …)` with a `toast.error` so any future "debug not saving" issue is loud.

### 4. Wrap the modal in an ErrorBoundary

Add a tiny `ResearchErrorBoundary` around `<ApproveCampusModal …/>` in `src/routes/outreach.tsx` that:
- Catches render-time exceptions.
- Renders a fallback with the error message + a "Copy details" button.
- Logs `error.stack` to console so we can see what blew up after the 13 leads landed.

This is what will actually tell us why USC crashed.

### 5. Diagnose the USC crash post-deploy

After the above ships:
- Re-run AI research on USC.
- If it crashes again, the ErrorBoundary will show the real error and the partial debug blob will already be in `ai_research_debug_json` (course done, leads either `running` or with full payload), so we can pinpoint the failing render path (most likely a malformed lead object in Step 3 / leads table).

### 6. Out of scope for this turn

- The "batch run across 170 campuses" goal. Once the per-campus flow stops dropping debug and we know what was crashing, we'll add a small admin "Run AI research for queue" action in a follow-up — it depends on this flow being trustworthy first.

## Files changed

- `src/components/outreach/ApproveCampusModal.tsx` — incremental persist, try/catch/finally in `runAiResearch`, direct `patchCampusDb` from `persistDebug`.
- `src/routes/outreach.tsx` — toast on `patchCampus` failure, wrap modal in `ResearchErrorBoundary`.
- `src/components/outreach/ResearchErrorBoundary.tsx` *(new, ~40 lines)* — minimal class boundary with copy-details fallback.

No DB schema changes. No edge function changes. No UI redesign.
