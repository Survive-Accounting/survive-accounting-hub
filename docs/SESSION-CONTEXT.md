# SESSION-CONTEXT.md — read this before starting work

Written 2026-08-19, after a session that ran alongside a second Claude session and lost roughly a
day to problems that were all avoidable. Lee is moving to running **several sessions at once**, so
the hazards below are now the normal case, not the edge case.

`CLAUDE.md` at the repo root is the **canvas/studio** contract (branch `canvas-v2`, protected
zones, risk tiers). It is older than this file, and its "never merge to main" rule reflects that
surface — not the public-web work, where Lee merges to `main` routinely and says so explicitly.
When the two disagree, ask rather than assume.

---

## 1. You are not alone in this repo

Several worktrees point at the same GitHub repo and the same Supabase project:

| worktree | typically |
|---|---|
| `C:\Users\lee\Documents\sa-ui-polish` | public web: landing, `/go/`, chapters, campus pages, picker |
| `C:\Users\lee\Documents\survive-accounting-hub-je-tool-v2` | JE engine / studio |
| `C:\Users\lee\Documents\survive-accounting-hub-onboarding` | onboarding |

**Everything below follows from this: another session may be editing, committing and pushing while
you are.**

### Before you push to `main`

`git fetch` and check whether `main` moved. It usually has. Merge, then **re-run the build on the
merged result** — your branch building clean says nothing about the combination.

### Generated files WILL conflict

`src/routeTree.gen.ts` and `src/lib/schools.generated.ts` are build artifacts that git tracks.
Never hand-merge them. Regenerate:

```bash
NODE_OPTIONS=--max-old-space-size=6144 bun run build
```

```bash
set -a && . ./.env && set +a && bun run migration/supabase-migrations/gen_schools.ts
```

The route tree is produced by the Vite plugin during dev/build — there is no CLI for it.

---

## 2. Migrations — the mistake that cost a day

**Filenames are `YYYYMMDD_HHMM_short_description.sql`.** Not sequential numbers.

Sequential numbering collided three times (`0022`, `0115`, `0118`) because two sessions both look
at the folder, both see the same highest number, and neither can see the other's uncommitted work.

The `0118` collision is worth understanding, because the failure was *invisible*:

- Session A wrote `0118_take_transcripts.sql`; session B wrote `0118_entitlements_greek_seat_source.sql`
- They sorted adjacent in Explorer. Lee pasted **the wrong one** into Supabase and reported success
- The entitlements fix therefore never ran, and every seat grant kept failing `23514`
- Two rewrites of perfectly good SQL followed, chasing a failure that had never occurred
- It was settled only by **probing the live schema**, which showed `take_transcripts` existing and
  `greek_seat` still rejected

### Rules

- **One concern per file.** A file that both adds a table and backfills it cannot be partly applied.
- **Idempotent** — `IF NOT EXISTS`, `DROP ... IF EXISTS`. These get run by hand, sometimes twice.
- **Wrap in `BEGIN; ... COMMIT;`.**
- **End with a `SELECT` that proves it worked.** Not a comment claiming it worked. `DROP CONSTRAINT
  IF EXISTS` against a name that does not exist is a silent no-op, and a run that changed nothing
  looks exactly like a run that succeeded.
- Drop constraints by **discovering the real name**, never a guessed one:

```sql
SELECT conname FROM pg_constraint
WHERE conrelid = 'public.entitlements'::regclass AND contype = 'c'
  AND pg_get_constraintdef(oid) ILIKE '%source%';
```

### Applying

There is **no runner**, and DDL cannot be executed with the service-role key. Lee pastes these into
the Supabase SQL editor by hand. So:

- A file in `migration/supabase-migrations/` does **not** mean it has been applied
- The only way to know is to **query the schema**. Several `.ts` files there do exactly that
  (`audit_greek_live.ts`, `verify_greek_phase1.ts`, `check_0113_invariant.ts`)
- Existing `NNNN_` files keep their names — renaming applied migrations breaks every reference in
  commit messages and notes

---

## 3. Verification — what a green signal does and does not prove

This session shipped a feature that built cleanly and contained **none of the feature's code**.
Assume nothing.

| signal | proves |
|---|---|
| `tsc` + tests pass | nothing about deployability |
| build exits 0 | nothing — see below |
| a `200` from a best-effort logger | nothing about whether a row was written |
| Vercel says "Ready" | nothing about what the domain serves |

**Shell exit codes lie if you write the command wrong.** `bun run build > log 2>&1; echo "EXIT=$?"`
reports the *echo's* status. Put the marker inside the redirect — `...; echo "EXIT=$?" >> log` —
then grep the log. A build that aborted with 134 (V8 out-of-memory) was reported as exit 0 this way.

**Build with production's heap.** `vercel.json` sets `NODE_OPTIONS=--max-old-space-size=6144`;
Node's default is ~2 GB, so a local build can fail where Vercel succeeds, and vice versa.

**The output directory is `.vercel/output`, not `.output`.** Grepping the wrong path produced a
false "the feature is missing" panic.

**Grep the built output for a string only your feature contains**, before pushing:

```bash
grep -rl "some string unique to the feature" .vercel/output | wc -l
```

**Verify deploys by content, not by hash or status.** Fetch the live page, pull the
`/assets/styles-*.css` or `/assets/index-*.js` URL out of it, and grep the bundle body. Vercel
builds can queue for minutes, so poll rather than concluding it stalled. `npx vercel ls` works —
the CLI **is** authenticated as `lee-1104`.

**Best-effort loggers must report.** An earlier logger returned 200 while writing nothing for a
day: it validated against a closed enum its dynamic value could never satisfy, and the caller
swallowed the error. Return `{ logged: boolean }` and let the caller ignore it — but never let
"it didn't throw" stand in for "it worked".

---

## 4. Environment

- **bun, never npm.** `npm i` rewrote `package-lock.json` by +2409 lines in a bun repo.
- **`core.autocrlf=true`** — working files are CRLF. Multi-line string matching in a patch script
  silently fails against LF search text. Use line-based `sed`, or regex with `\r?\n`. Also:
  **never run `eslint --fix`** (autocrlf vs prettier's `endOfLine: "lf"` = 1915 baseline errors).
- **Python is not installed.** Use `bun -e` or a scratch `.ts` file.
- **Foreground `sleep` is blocked.** For waits, use a backgrounded command with an `until` loop.
- Foreground commands are killed at ~10 minutes. Background anything longer — full builds take
  2–4 minutes but can queue.
- Beware apostrophes and backticks when writing files via shell heredocs; for prose-heavy files,
  write the file directly instead of fighting quoting.

---

## 5. Data gotchas

**PostgREST caps responses at 1,000 rows regardless of `.limit()`.** Page with `.range()`:

```ts
for (let from = 0; ; from += 1000) {
  const { data } = await db.from(t).select(cols).range(from, from + 999);
  out.push(...data);
  if (!data || data.length < 1000) break;
}
```

**718 of 945 campuses are archived** (`archived_at` set 2026-06-24, `approval_status =
needs_review`). That is why so many have no slug. A query that forgets `.is("archived_at", null)`
returns mostly rows nobody intends to publish — and one that filters them out will "lose" campuses
you expected to find.

**Never normalise away "University of" when matching school names.** It collapses **Miami
University** (Ohio, ACC 221) into **University of Miami** (Florida, ACC 211) — two different
schools, both present. Fold dashes and diacritics only:

```ts
const norm = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[\u2010-\u2015]/g, "-").replace(/[^a-z0-9]/g, "");
```

An en-dash in a name also produced **three duplicate campus rows** (UCLA, UCSB, Wisconsin–Madison),
each split so that one row held the chapters and the other held the course code. Those were merged;
look for more of that shape before trusting any campus-level count.

**`greek_orgs.council` holds NATIONAL bodies** — `NIC` (53), `NPC` (26). Campus chapters and the
council pages use `IFC` and `Panhellenic`. Anything creating a chapter must map NIC→IFC and
NPC→Panhellenic, or the chapter never appears on its council page **and nothing errors**.

**Course codes** live in `campuses.course_family_codes_json.intro_1`, sometimes as a double-encoded
string. Never invent one — the copy degrades to "your accounting course" on purpose.

---

## 6. Public web architecture (as of 2026-08-19)

**One school list, generated from the database.** `src/lib/schools.generated.ts` comes from
`migration/supabase-migrations/gen_schools.ts`. 66 rows = SEC 16 + 50 hand-verified seed campuses.
`src/lib/schools.ts` wraps it and is the single join between the three namespaces that used to
disagree: picker id (`ole-miss`), campus slug (`university-of-mississippi`), and `campusId`.

There were **four** copies of this list before this session, and `landing.tsx`'s had already
drifted. If you need school facts, import from `@/lib/schools` — do not add a fifth.

Two deliberate overrides of the database, both documented in the generator's header:

- **SEC colours come from `brand.tsx`**, not `campuses.color_*`. The DB disagrees on three SEC
  schools and has **Ole Miss's pair reversed**; reading colours from data would restyle every
  existing SEC bolt. Non-SEC campuses *do* read from data.
- Aliases fall back to `migration/seeds/campus-seed-FINAL.csv` until `search_aliases` exists.

**Campus pages** — `src/routes/$school.index.tsx`, one indexable page per seeded school at
`/<slug>`. They render the real `LandingPage`, so the product below the fold is the working thing,
with a per-campus hero from `CampusTop`. That hero is not decoration: without it, 66 pages share
one H1 and get filtered as near-duplicates rather than ranked.

**Lazy chapter creation** — `src/lib/greek-lazy-chapter.functions.ts`. "My chapter isn't listed"
creates a `pending` row and sends the member straight to a working `/go/` page. Pending blocks
nothing: the `/go/` resolver keys on campus + slug and filters on neither `status` nor
`archived_at`. Admin queue at `/outreach/chapters`; **remove archives rather than deletes**,
because the URL may already be in a group chat.

### Theme tokens — a real trap

`:root` defines `--accent: #CE1126` for **shadcn** (the light admin surfaces). The brand's amber
`--accent`, plus `--brand-cream` and `--text-muted`, are a *different* palette sharing one name.

Any navy page must render `frameThemeVars()` **inline on its root**, so the palette is present in
the server-rendered HTML. `html.sa-navy` also defines it as a backstop, but that class is added by
a `useEffect` and so does not exist at first paint — pages relying on it alone showed navy-on-navy
text until hydration. This is the same shape as the old `/go/` flash: **the server sends the wrong
thing and the client corrects it a beat later.** Check the SSR HTML, not just the hydrated page.

### Route notes

- `/$school` sits at the top level and catches unknown slugs; it redirects home rather than 404ing
- Static routes win over it, so `/chapters`, `/rep` and friends are unaffected
- File routes live in the **client** route tree — Vite follows even dynamic imports into the
  browser graph, so a heavy server-only dependency must be `await import()`ed inside the handler

---

## 7. The browser preview pane

- **Screenshots require the pane to be visibly open** on Lee's screen. Otherwise the page is not
  compositing and `computer{action:"screenshot"}` times out. This has blocked screenshot delivery
  across many specs — say so plainly rather than promising them.
- **Colour readings are unreliable whenever a transition is involved.** A `CSSTransition` stays
  frozen at offset 0 in a non-compositing pane, so `getComputedStyle` returns the *start* colour
  indefinitely. This nearly caused a correct fix to be reported as broken. Finish animations first:

```js
document.getAnimations().forEach((a) => { try { a.finish(); } catch {} });
```

  The tell: a cloned node renders correctly while the original ignores even a literal value.
- `.claude/launch.json` in the **primary** working directory drives `preview_start`, not the
  worktree's. There is a `ui-polish` entry on port 5233 pointing at `sa-ui-polish`.

---

## 8. Open items (2026-08-19)

- **Unapplied migrations:** `20260819_1432_campus_rep_applications.sql` (optional — rep
  applications currently live as `referrals` rows behind a `[CAMPUS REP]` JSON envelope) and
  `20260819_1615_campus_aliases_and_code_demand.sql` (**demand logging writes nowhere until this
  lands**; it warns rather than pretending).
- `20260819_1046_entitlements_greek_seat_source.sql` **is applied** and probe-verified —
  `greek_seat` accepted, `bogus_value` still rejected.
- Campus flyer QR (`/{school}?s=flyer`) resolves now that campus pages exist, but **no physical
  scan test has been done.**
- Chapter dashboard's "Active this week" is mislabelled — it computes `joined_at >= 7d`.
- No non-SEC campus has a single pickable professor (roster + RMP URL + not archived), so
  professor-dependent copy must degrade gracefully.
