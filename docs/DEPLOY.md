# How This Repo Builds & Deploys — read this first

**For any Claude Code session working on `survive-accounting-hub`.** It exists so no
session re-guesses how this project ships. **We do NOT use Lovable anymore.**

---

## Which Supabase project (READ THIS FIRST)

Three different Supabase projects appear in this repo's history. Using the wrong one is
the single biggest source of confusion — be deliberate:

| Project ref | What it is | Use it? |
| --- | --- | --- |
| **`unvxagsledbsdoremqeb`** | **Current, live project.** All new work targets this. URL: `https://unvxagsledbsdoremqeb.supabase.co` | ✅ **YES — this is the one.** |
| `dhlzorresurzlcpuplkv` | The old **Lovable-provisioned** project. Lee has no dashboard access to it. | ❌ Dead. Never target it. |
| `hdylxvyvateaephkbccy` | The **original pre-Lovable** app. | ⚠️ Source data only — read by the `migrate-from-old` edge function. Do not point new work here. |

The live project ref/URL/keys live in `.env` (git-ignored, local) and in the **Vercel
project's Environment Variables** (for the deployed app). If you ever see
`dhlzorresurzlcpuplkv` in a config or migration again, it's a bug — fix it to
`unvxagsledbsdoremqeb`.

---

## TL;DR

1. **Test locally, THEN push.** Run `bunx tsc --noEmit && bun run build` before every
   push. Use `bun run dev` to run the app and click through changes.
2. **Deploying = pushing to GitHub.** Vercel auto-builds the frontend from the repo.
   You never deploy the site by hand.
3. **Edge functions and DB migrations deploy separately** (to Supabase, not Vercel) —
   see those sections.

---

## The stack

TanStack **Start** + Router (file-based routes under `src/routes/`; `routeTree.gen.ts`
is generated — the build regenerates it). **Vite** build. Tailwind v4, shadcn/ui, React.
Backend is **Supabase** (Postgres + Auth + Storage + Edge Functions), project
`unvxagsledbsdoremqeb`. Package manager is **Bun** (`bun.lock`). Repo:
`github.com/Survive-Accounting/survive-accounting-hub`.

## Where the code lives

The code is in the **`survive-accounting-hub`** repo (on Lee's machine,
`C:\Users\lee\Documents\survive-accounting-hub`). The default Claude Code session folder
may be a near-empty "Survive Accounting" folder — `cd` into the real repo and confirm
with `git remote -v`.

## Local build & test (the normal workflow now)

The toolchain is installed (**Node LTS v24** + **Bun v1.3.x**, in `C:\Users\lee\.bun\bin`)
and `node_modules` exists (`bun install`). So **verify your work locally before pushing:**

- **Typecheck:** `bunx tsc --noEmit`
- **Build:** `bun run build` (= `vite build`; writes `.vercel/output`)
- **Run the app:** `bun run dev` → serves **http://localhost:8080/**. `Ctrl+C` to stop.

Only push once typecheck and build are green.

### Machine-specific gotchas (Windows, verified 2026-06-23)

- **Use `bunx tsc`, not `npx tsc`.** Plain `npx tsc` is broken on this machine — it
  fetches an unrelated deprecated `tsc` package. Use `bunx tsc --noEmit` (or
  `node node_modules/typescript/bin/tsc --noEmit`). Bun on Windows does not create the
  `node_modules/.bin/tsc` shim.
- **PATH in fresh shells:** a newly opened terminal (or each Claude Code PowerShell call)
  may not have Node/Bun on PATH yet. Refresh with:
  `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine")+";"+[Environment]::GetEnvironmentVariable("Path","User")+";C:\Users\lee\.bun\bin"`
- **`.vercel/`** build output is **not** gitignored — don't commit it.

## How the frontend deploys

Vercel watches the GitHub repo:

1. Commit your work on a branch.
2. **Push the branch to origin** (`git push -u origin <branch>`).
3. Vercel **automatically builds a preview** for that branch / pull request.
4. Merging to `main` triggers the **production** deploy.

If you commit but don't push, nothing deploys. Pushing is the step that matters.

> **Repointing reminder:** the deployed app reads Supabase URL/keys from **Vercel's**
> Environment Variables, not from local `.env`. After any Supabase project change,
> confirm Vercel's env vars point at `unvxagsledbsdoremqeb` or production will talk to the
> wrong database.

## Edge functions (Supabase)

`supabase/functions/*` are Deno functions that run on **Supabase** (project
`unvxagsledbsdoremqeb`), not Vercel. Pushing to GitHub deploys the **frontend** only; it
does **not** deploy edge functions.

> **Deploy method:** the intended path is the **Supabase CLI**
> (`supabase functions deploy <name>`), which requires the CLI installed and the repo
> linked to project `unvxagsledbsdoremqeb`. The CLI is **not yet installed** on this
> machine. Fallback is the **Supabase dashboard** (supabase.com → the live project →
> Edge Functions → paste the function). When you change a function, surface it clearly
> ("Edge function `X` changed — deploy it to Supabase") and tell Lee. **Never say
> "deploy to Lovable."**

## Database migrations

Two migration directories exist (historical accident — confirm which a task means):

- `migration/supabase-migrations/00XX_*.sql` — the **clean, human-numbered** set
  (`0001`…`0021`). This is the canonical manual-apply set.
- `supabase/migrations/<timestamp>_*.sql` — Lovable's auto-generated timestamped history.

Conventions:

- **Idempotent always** (`create table if not exists`, `add column if not exists`,
  `drop policy if exists` before `create policy`, `on conflict do update` for seeds).
- New migration = **next number after the highest existing file** (scan the folder).
- **Migrations are ordered and depend on earlier ones** — e.g. `0021` inserts into
  `chart_of_accounts` (created ~`0018`). Never apply a late migration to a database that
  doesn't already have the earlier schema.

**How to apply a migration to the live project (`unvxagsledbsdoremqeb`):**

1. **Check the current state first.** The service-role key in `.env` can read the DB over
   the REST API (`/rest/v1/<table>?limit=1`) to see whether a table already exists — a
   migration may already be applied. (As of 2026-06-23 the live DB is migrated through
   `0021`.)
2. **Apply via the Supabase dashboard SQL editor** (Lee has access to the live project):
   open the project → SQL Editor → paste the migration file → Run. Because migrations are
   idempotent, re-running a already-applied one is safe.
3. **Verify** by re-querying the affected tables.

> **Note on automation:** the service-role key can read/write *data* but **cannot run DDL**
> (create tables, etc.). Fully automated `bun run db:migrate` would need either the
> Supabase CLI linked to the live project, or the project's **database connection string**
> (Project Settings → Database). Neither is configured yet — set one up if hands-free
> migrations are wanted.

> **Collision risk:** concurrent branches can each grab the same next number (two
> `0021_...`). On merge, renumber so there are no duplicates and apply in order.

## Branch discipline (multiple sessions run at once)

Lee runs several sessions in parallel (scraper, JE tool, onboarding, …).

- **Work on your own branch** (e.g. `JE-tool`, `onboarding`). Do **not** push to `main`
  unless told to.
- For concurrent sessions on this one checkout, prefer an isolated **git worktree** off
  `main` rather than switching branches in the shared tree.
- Touch only files in your scope; don't refactor shared files unless the task says so.
- Merge to `main` one branch at a time; Vercel previews each branch independently.

## What changed (keep memory current)

This project **migrated off Lovable**. Frontend = **Vercel** (auto from GitHub). Backend =
self-owned **Supabase** project `unvxagsledbsdoremqeb`. Local build/test works via
**Node + Bun** (installed 2026-06-23). Any note that says "builds in Lovable's cloud",
"Connect Supabase in Lovable Cloud", or points at `dhlzorresurzlcpuplkv` is **stale —
update it.**
