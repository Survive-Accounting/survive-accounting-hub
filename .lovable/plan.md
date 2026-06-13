# Broadcasts not showing — root cause and fix

## What's actually happening

Your data is fine. There are **25 scheduled broadcasts** sitting in `outreach_broadcasts` right now. The UI is showing the "Run migration 0012" fallback because `fetchBroadcasts()` is throwing an error, and the panel treats any error as "table missing".

## Root cause

`src/lib/outreach-api.ts` (line 546) selects this column list:

```
id, name, subject, body, campus_ids, include_replied, send_at, status,
sent_count, skipped_count, lead_type, created_at
```

But the `outreach_broadcasts` table has **no `lead_type` column** (confirmed via `\d outreach_broadcasts`). Migration 0017 added `lead_type` to leads/templates but skipped broadcasts. So the select 400s, React Query marks it `isError`, and the panel renders the "Run migration 0012" message — misleading, since 0012 already ran.

The save path already defends against this (it retries without `lead_type` on error), but the read path doesn't.

## Fix

One small migration to add the column, defaulting existing rows to `'professors'` so they appear in the Professors tab where the panel currently lives:

```sql
ALTER TABLE public.outreach_broadcasts
  ADD COLUMN IF NOT EXISTS lead_type text NOT NULL DEFAULT 'professors';
```

That's it. No code changes needed — `fetchBroadcasts` will succeed, the 25 scheduled broadcasts will populate, grouped by semester (Fall 2026 → Fall 2028), and the existing filter `(b.lead_type ?? "professors") === leadType` will match.

## Verification after migration

- Reload `/outreach` → Broadcasts panel shows 25 scheduled items grouped by semester.
- "New Broadcast" still works (save path is already lead_type-aware).
