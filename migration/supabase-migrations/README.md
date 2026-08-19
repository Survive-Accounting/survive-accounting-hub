# Migrations

## Naming: `YYYYMMDD_HHMM_short_description.sql`

Files used to be numbered sequentially (`0117_`, `0118_`). **That broke.** Two Claude
sessions work this repo at once, both look at the folder, both see `0117` as the highest,
and both take `0118`. Neither can see the other's uncommitted work.

It happened three times — `0022`, `0115`, and `0118` — and `0118` cost real time: the two
files sorted next to each other in Explorer, the wrong one got pasted into Supabase, and
the entitlements fix sat unapplied for a day while its SQL got rewritten twice chasing a
failure that had never occurred.

A timestamp cannot collide (two sessions would have to create a file in the same minute),
it still sorts chronologically, and the name says when it was written.

**Existing `NNNN_` files stay as they are.** Renaming applied migrations would break every
reference in commit messages and notes. New files use the timestamp form.

## Rules

- **One concern per file.** A file that both adds a table and backfills it cannot be
  partly applied.
- **Idempotent where possible** — `IF NOT EXISTS`, `DROP ... IF EXISTS`. These get run by
  hand, sometimes twice.
- **Wrap in `BEGIN; ... COMMIT;`** so a failure half way leaves nothing behind.
- **End with a `SELECT` that proves it worked.** Not a comment claiming it worked — output
  you can read. A `DROP CONSTRAINT IF EXISTS` against a name that does not exist is a
  silent no-op, and a run that changed nothing looks exactly like a run that succeeded.

## Applying

These are applied BY HAND in the Supabase SQL editor. There is no runner, and DDL cannot
be executed with the service-role key. So:

- A file in this folder does **not** mean it has been applied.
- The only way to know is to query the schema. Several `.ts` files here do exactly that
  (`audit_greek_live.ts`, `verify_greek_phase1.ts`, `check_0113_invariant.ts`).
- **When you paste one, check the filename against the one you meant to run.**
