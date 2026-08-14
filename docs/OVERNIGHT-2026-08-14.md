# Overnight run — Frames Rename + Film-Prep Tools (2026-08-13 → 14)

Everything ran in order: checkpoint → recon → frames rename (1–6) → checkpoint →
film-prep tools (1–4, one commit each) → overview polish B → verify → push.
All work is on `canvas-v2`. tsc clean · **750 tests pass** (was 729; +21 new) ·
vite build clean · live-verified in the browser at each stage.

## ⚡ Do these two things in the morning (in order)

1. **Open /study/canvas → "Open sets"** — the pool opens on the new dashboard.
2. **File ▾ → "Exam 1 master seed…" → Apply.** The 08-13 apply DID NOT PERSIST —
   a stale open tab autosaved the old scene over it (dry-run tonight showed the
   full diff again: ~154 cards to create · 102 to update · 5 renames). The seed is
   now one click in-app (CSV ships in the bundle), and with per-set rows + the two
   autosave fixes below, the write can't be clobbered again.

## The vocabulary card (shipped as behavior)

Sets are filmed. Frames are what's in them. CEQ frame counts/practices; Note frame
(`noteOnly`) is breath — films like any frame, never counts ("Q 14/29" skips it);
Bumpers are brand in/out; a run (`run` letter on a frame) = one take.

## What the DB looks like now (split EXECUTED tonight, in-app, dry-run first)

- **30 set-file rows** — one `canvas_scenes` row per set (`setFile: true`), ids
  copied verbatim → clips/markers/chains all resolve (unit-tested guard).
- **1 workspace row** (`__workspace`) — settings, factories, loose memos.
- **1 archive** — `Start Here Course — canvas archive`: the untouched 444-node
  original incl. 154 legacy orphan cards. Rollback = delete set rows, rename back.
  Openable via File ▾ → *Open canvas view — experimental*.

## The clobber, found and killed

The single-row scene was being overwritten by any open tab's 30s autosave — it ate
the seed apply on 08-13 AND tonight's first archive rename. Two fixes: **nothing
autosaves while Home is open** (a restored tab hydrates the canvas *behind* the
home frame), and **opening the pool resets the scene-tab machinery**. Per-set rows
shrink the blast radius permanently; per-set writes are hash-gated (quiet = zero writes).

## What you'll see

- **Home** → "Open sets" → the Studio IS the surface (closing it = Home). Outline
  topics → sets → click opens in the Studio with the **vertical filmstrip**:
  mini-cards (type glyph · Q# · run letter · clip dot · ★), hover a gap → [+] →
  CEQ/Note chooser; Ctrl/Cmd+Enter inserts below, +Shift above.
- **View ▾** (previewer bar) = Student chrome · Guides · Layout overlay · Overview ·
  World picker. Per-user persisted (world stays per-set — it's filmed content;
  layout overlay also stays per-set since it drives deal geometry — judgment calls,
  flag if wrong). Removed from the bar: STUDENT, GUIDES, LAYOUT ON/OFF, OVERVIEW,
  the world select; also the dead ★ filter + wrap toggle (they styled the deleted
  list column). FILM/play/reset stayed.
- **Film-prep strip buttons**: *Ready to film?* (pass/fail panel, ✗ rows click to
  the frame; exhibit check is a proxy — flagged frame with an empty chain) ·
  *Rehearse* (film-true fullscreen; ←/→/PgDn/PgUp walk, Esc exits, 500ms "— Run B —"
  interstitials) · header 🗒 *Takes* note + *Mark filmed today*.
- **File ▾**: *Exam 1 master seed…* · *Generate missing shorthands* (preview table,
  inline edit, one-undo apply, never overwrites) · *Open canvas view — experimental*.
- **Overview polish**: current frame ringed at 100%, same-run frames 80% with a
  cyan bracket, rest 55%; density steps 1/3/6/12 (Ctrl+scroll or the strip-header
  stepper — put there instead of the View menu so the control sits on the thing it
  controls); run map rail on the strip edge, click-to-jump.
- **Spotlight bolt signature**: static brand-red bolt @40% at the ring corner
  (regular spots); super-focus folds it into its bottom bar with a single 200ms
  pop; warn/🚨 keeps its siren identity (no bolt); reduced-motion always static.

## Run column note

`run` / `takesNote` / `lastFilmedAt` didn't exist — added as additive scene-JSON
fields (no SQL anywhere tonight). Runs are empty on all frames; *Ready to film?*
lists them as gaps until you letter them (that's your pre-film pass).

## Small flags

- Pre-existing data nit (console warning): one choice chains the same memo twice
  (`ch-ms3wqiu6-118` → `memo-mrxpgoxw-206`) — legal, just noisy. Fix by deleting
  the dupe chain item in that question.
- The "v2: reverse-selection set…" idea-note deck became a (0-frame) set file like
  everything else — park or delete it from the outline whenever.
- Studio's `qSel` bulk dead code + `visibleQs` are still around (outline owns bulk
  now) — cleanup candidate, not touched tonight.
