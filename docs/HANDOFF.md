# HANDOFF — start here

Paste this at the top of a fresh Claude Code session:

> Read `docs/HANDOFF.md` and follow it. We're focusing on **filming, publishing, and authoring**.

---

## 1. What this is

Survive Accounting — exam-prep videos built from **CEQs** (Common Exam Questions). Lee
authors and films them himself, then publishes stitched videos to students.

**Vocabulary (locked, use these words):**
- A **SET** is a strip of **FRAMES**. "Scene" is retired everywhere.
- **CEQ frame** = a question card (the 90%). **Note frame** = text/memo only, films but
  never counts toward the student's "Q 14/29". **Bumper** = brand in/out.
- A **run** = a span of frames captured in one take (the `run` letter on each frame).

**Repo:** `C:\Users\lee\Documents\survive-accounting-hub-je-tool-v2`
(a git worktree; `main` is checked out in a *different* folder, so `git checkout main`
here fails — see §5.)

## 2. THE ONE RULE: Lee authors on PRODUCTION

Lee's authoring surface is **https://surviveaccounting.com/study/canvas** — not
localhost, not a preview URL. He decided this deliberately so "which build is this?"
can never bite again.

**Therefore: keep `main` current.** Merge work promptly instead of parking it on
`canvas-v2`, or he films on stale code. `main` and `canvas-v2` should stay identical.

There is **one live Supabase** — every surface (local, preview, production) writes to
the same data. There is no staging copy.

## 3. Current state (2026-08-14)

`origin/main` == `origin/canvas-v2` == **`ba4ac8e`**, deployed and verified live.

Shipped and working:
- **Set files** — one `canvas_scenes` row per set (30 sets + `__workspace` + a
  `Start Here Course — canvas archive`). The Studio loads them as one merged pool and
  saves back per-set, hash-gated.
- **Exam 1 seeded** — all 256 CEQ frames across 30 sets; a fresh dry-run is a clean
  no-op. Shorthands are complete; **run letters are NOT set on any frame yet.**
- **Filmstrip** (vertical, left of the editor): run letters, note frames, hover-`[+]`
  insert, density 1/3/6/12, run-map rail, ctrl/shift multi-select.
- **⋮ strip menu**: density, **Shuffle choices**, and the ★ / boss / chaching / short /
  free markers (act on the selection, else the open frame).
- **Add menu**: 29 elements grouped Teaching/Text/Data/Brand/Media → staged onto a
  CEQ's surface as their REAL card components. 👁 hides one in authoring (28% ghost)
  and drops it from film entirely.
- **Film-prep tools**: "Ready to film?" readiness check, Rehearse walkthrough,
  shorthand backfill, take logger + "Mark filmed today".
- **Readiness dots** on every outline set row (green/amber, same pure check).
- Cycle element: arrowheads clear of pills, slimmer arrows, multi-step chain
  spotlight, line breaks in step pills.

## 4. Non-negotiable laws (each one cost us a real incident)

1. **CLOBBER LAW** — a stale open tab autosaving `nodes_json` has eaten server-side
   writes twice (the Exam-1 seed, then the archive rename). Autosave is now gated on
   `!homeOpen` and pool mode resets the scene-tab machinery. Don't loosen those.
2. **NEVER import anything under `data/`** into app code. `data/*` is gitignored, so a
   `?raw` import passes locally and **breaks every Vercel build** — and it inlined the
   whole Exam-1 answer key into the public client bundle. The seed modal takes the CSV
   from a file picker instead.
3. **Verify deploys by CONTENT, not filename hash.** Vercel builds its own bundle, so
   its hash never matches a local build. Grep the served JS for a string you added.
4. **Verify new files are committed** — `git cat-file -e HEAD:<path>` — before trusting
   a green local build.
5. **Migrations are manual-apply** (`migration/supabase-migrations/`). Lee pastes them
   into the Supabase SQL editor. Still unapplied: **0088, 0101, 0102, 0111, 0112** —
   all degrade by design.

## 5. Verification ritual (run before any commit)

```
cd "C:/Users/lee/Documents/survive-accounting-hub-je-tool-v2"
./node_modules/.bin/tsc -p tsconfig.json --noEmit      # ~60s, must be silent
bun test                                                # 750 tests, must be 0 fail
NODE_OPTIONS=--max-old-space-size=6144 bun run build    # ~3min, Vercel's exact command
```

Dev server: `preview_start` with name **`je-tool`** (port 5199). The first `navigate`
often fails — just retry it. Browser screenshots don't work when the pane is hidden;
verify via DOM reads (`textContent`, computed styles) instead.

**Shipping to production:** `git push origin canvas-v2` then
`git push origin canvas-v2:main` (a clean fast-forward — no local `main` needed).
Then poll the live bundle for a string you added before claiming it's live.

## 6. Next session focus: FILMING · PUBLISHING · AUTHORING

Immediate, in rough priority:

1. **Run letters are the blocker.** Every frame is unlettered, so "Ready to film?"
   flags all 256. There's no UI to *set* a run letter yet — only to report it missing.
   Assigning runs across a set (ideally: select a range in the strip → assign "A")
   is the highest-value next build.
2. **The publish path is the least-exercised code in the app.** Stitch → Auphonic →
   Mux → attach. It has never been run end-to-end on a real filmed set. Expect to
   find breakage; treat the first real publish as a debugging session.
3. **Take ingest** — batch drop of OBS clips, name-matching to frames. Built, lightly
   tested against real files.
4. Known cosmetic debt: the Studio's bottom bar still has EDIT STEM & CHOICES /
   CHAINS & TEMPLATES as text buttons; the markers moved to ⋮ but these didn't.

**Deliberately parked until Exam 1 ships:**
- **OUTLINE-AS-MAP** — decided, wireframed, not built. See
  `docs/wireframes/MAP-authoring.pdf` + `MAP-student.pdf` and the memory file
  `outline-as-map-decisions.md`. Build order: State 1 → commit → 2 → commit → 3.
- Student UI/UX, the course player, teasing later exams — the *session after next*.
- Partner/tenant work (`TENANT-ZERO`): `/study/canvas` is public and unauthenticated,
  writing through the service role. Fine as Lee's private cockpit, disqualifying for
  partners. Don't deepen the single-user assumption in the meantime.

## 7. Credentials

Everything needed for **authoring on production** is already set in Vercel — nothing
to do.

The local `.env` has only Supabase + Mux *playback signing*. If a session needs to test
**take upload or publishing locally**, these four must be copied from the Vercel
dashboard into the local `.env` (see the session steps Lee has):

- `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET` — uploading takes to Mux
- `RENDER_WORKER_URL`, `RENDER_WORKER_TOKEN` — the ffmpeg stitch worker

Without them those paths **fail loud** with a message naming the missing var, which is
the intended behaviour — they don't fail silently.
