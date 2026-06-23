# How This Repo Builds & Deploys — read this first

**For any Claude Code session working on `survive-accounting-hub`.** It exists so no
session re-guesses how this project ships. **We do NOT use Lovable anymore.**

---

## TL;DR

1. **Test locally, THEN push.** Run `bunx tsc --noEmit && bun run build` before every
   push. Use `bun run dev` to run the app and click through changes.
2. **Deploying = pushing to GitHub.** Vercel auto-builds the frontend from the repo.
   You never deploy the site by hand.
3. **Edge functions deploy separately** (to Supabase, not Vercel) — see that section;
   confirm the method before assuming.

---

## The stack

TanStack **Start** + Router (file-based routes under `src/routes/`; `routeTree.gen.ts`
is generated — the build regenerates it). **Vite** build. Tailwind v4, shadcn/ui, React.
Backend is **Supabase** (Postgres + Auth + Storage + Edge Functions). Package manager is
**Bun** (`bun.lock`). Repo: `github.com/Survive-Accounting/survive-accounting-hub`.

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
- **Run the app:** `bun run dev` → serves **http://localhost:8080/** to click through
  changes and catch runtime errors. `Ctrl+C` to stop.

Only push once typecheck and build are green. This is the point of having a local
toolchain — catch errors here, not on Vercel.

### Machine-specific gotchas (Windows, verified 2026-06-23)

- **Use `bunx tsc`, not `npx tsc`.** Plain `npx tsc` is broken on this machine — it
  fetches an unrelated deprecated `tsc` package instead of the project's TypeScript.
  Use `bunx tsc --noEmit` (or `node node_modules/typescript/bin/tsc --noEmit`). Bun on
  Windows does not create the `node_modules/.bin/tsc` shim.
- **PATH in fresh shells:** a newly opened terminal (or each Claude Code PowerShell call)
  may not have Node/Bun on PATH yet. Refresh with:
  `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine")+";"+[Environment]::GetEnvironmentVariable("Path","User")+";C:\Users\lee\.bun\bin"`
- **`.vercel/`** build output is **not** gitignored — don't commit it.

> If you're in a session where the toolchain is somehow missing (`node`/`bun` not found,
> no `node_modules`): do NOT spend time installing it mid-task. Do a careful manual
> review, push, and let the **Vercel build be the typecheck** — and say plainly that you
> couldn't verify locally. (There's a dedicated run-alone setup prompt for installing the
> toolchain.)

## How the frontend deploys

Vercel watches the GitHub repo:

1. Commit your work on a branch.
2. **Push the branch to origin** (`git push -u origin <branch>`). *("origin" = the repo
   up on GitHub; pushing = uploading there.)*
3. Vercel **automatically builds a preview** for that branch / pull request.
4. Merging to `main` triggers the **production** deploy.

If you commit but don't push, nothing deploys. Pushing is the step that matters.

## Edge functions (Supabase) — confirm the method

`supabase/functions/*` are Deno functions that run on **Supabase**, not Vercel. Pushing
to GitHub deploys the **frontend** only; it does **not** deploy edge functions.

> **Deploy method (Lee is confirming this):** the intended path is to deploy functions
> via the **Supabase CLI** (`supabase functions deploy <name>`) — but that requires the
> Supabase CLI installed and logged in. If the CLI isn't available or login fails, the
> fallback is the **Supabase dashboard** (supabase.com → Edge Functions → paste the
> function). **Until this line is confirmed, do not assume** — when you change a function,
> surface it clearly ("Edge function `X` changed — deploy it to Supabase") and tell Lee
> which method worked or failed. **Never say "deploy to Lovable."**

## Database migrations

SQL files in `migration/supabase-migrations/`, numbered in order. Conventions:

- **Idempotent always** (`create table if not exists`, `add column if not exists`,
  `drop policy if exists` before `create policy`).
- New migration = **next number after the highest existing file** (scan the folder;
  don't hardcode).
- Lee applies migrations to Supabase — surface the filename clearly when you add one.
- **Collision risk:** concurrent branches can each grab the same next number (e.g. two
  `0021_...`). On merge, renumber so there are no duplicates and apply in order.

> Note: there are **two** migration dirs — `supabase/migrations/` (live) and
> `migration/supabase-migrations/00XX` (manual-apply). Confirm which one a task means.

## Branch discipline (multiple sessions run at once)

Lee runs several sessions in parallel (scraper, JE tool, onboarding, …).

- **Work on your own branch** (e.g. `JE-tool`, `onboarding`). Do **not** push to `main`
  unless told to.
- For concurrent sessions on this one checkout, prefer an isolated **git worktree** off
  `main` (`git worktree add -b <branch> ..\survive-accounting-hub-<branch> main`) rather
  than switching branches in the shared tree.
- Touch only files in your scope; don't refactor shared files unless the task says so.
- Merge to `main` one branch at a time; Vercel previews each branch independently.
- Confirm which branch you should be on at the start of a task.

## Quick checklist for this session

- [ ] `cd` into the real `survive-accounting-hub` repo; confirm `git remote -v`.
- [ ] Checkout the branch the task names; never push to `main` unprompted.
- [ ] Make changes, then run `bunx tsc --noEmit && bun run build` — both green.
- [ ] Test behavior with `bun run dev` (http://localhost:8080/) where it matters.
- [ ] **Push the branch** so Vercel builds a preview.
- [ ] New migration? Next number after `main`'s highest, idempotent, flag possible
      renumber-on-merge.
- [ ] Changed an edge function? Surface it for Supabase deploy — never say Lovable.
- [ ] Don't reference Lovable anywhere. Ships via **Vercel (frontend) + Supabase
      (DB/functions)**.

## What changed (keep memory current)

This project **migrated off Lovable**. Lovable no longer hosts, previews, deploys
functions, or runs migrations. Frontend = **Vercel** (auto from GitHub). Backend =
self-owned **Supabase**. Local build/test now works via **Node + Bun** (installed
2026-06-23). Any saved memory or note that says "builds in Lovable's cloud" or "send
Lovable these messages" is **stale — update it.**
