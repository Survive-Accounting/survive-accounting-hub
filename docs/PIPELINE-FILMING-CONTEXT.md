# Pipeline / Filming / Studio — Session Context

Read this before touching the **canvas studio, the CEQ previewer, the film/capture
window, or the Pipeline (cut/edit) view**. It is the distilled, load‑bearing
context from the sessions that built and hardened this subsystem — the
architecture, the conventions, and the hard‑won gotchas that keep biting.
Multiple sessions now run in parallel; this doc is the shared memory so you don't
re‑learn a bug that already cost a day.

Last updated: 2026‑08‑19 (Pipeline v2 Q0–Q3, spacewalk‑flash fix, brand cursor,
shorts safe‑zones).

---

## 0. How Lee works (why the stakes are what they are)

- Lee **authors AND films from PRODUCTION** (`surviveaccounting.com/study/canvas`).
  One surface. If `main` is broken or stale, he films on broken/stale code. Keep
  `main` green and current.
- The **capture window** (an OBS window‑capture of a Chrome popout) is what gets
  recorded. Anything wrong there — a flash, a black frame, a double cursor — is
  **on camera**. Bugs that are cosmetic elsewhere are showstoppers here.
- Takes are real screen recordings (tens to hundreds of MB, minutes long).

---

## 1. Build / test / deploy workflow (do this exactly)

- **Runtime is `bun`**, not npm. Tests: `bun test`. Typecheck: `bun x tsc --noEmit`.
  Build: `bun run build` — **always** with `NODE_OPTIONS=--max-old-space-size=8192`
  (it OOMs otherwise). Builds are slow (2–10 min); background them and wait.
- **NEVER `npm i`** — it rewrites `package-lock.json` (+thousands of lines) in a
  bun repo. If a build fails with "Cannot find module X" and X is already in
  `package.json`, your local `node_modules` is just stale — run **`bun install`**
  (populates node_modules, no‑ops the committed lockfile). This is the normal fix
  when another session added a dependency.
- **Deploy = push to `main`.** Vercel auto‑builds `main`. It runs `bun install`
  from `package.json`, so a missing‑dep build error is only ever *local*.
- **Verify a deploy by grepping the LIVE bundle contents**, not by commit hash
  (hashes have shipped without promoting before — see `docs/DEPLOY.md`).

### Multi‑session git discipline (critical now)

- Work happens on the `vertical-filming` branch and is pushed with
  `git push origin vertical-filming:main` (there is effectively one shared trunk).
- **Before every push:** `git fetch origin main && git rebase origin/main`, then
  push. Other sessions push constantly; a plain push is rejected. Rebasing your
  small change on top is almost always clean because sessions touch different
  surfaces.
- **Commit only files you changed, by explicit path.** Never `git add -A` — you
  will scoop up another session's work‑in‑progress.
- **`CHANGES.md` is stacked, never replaced.** Prepend your entry above the
  current top; never overwrite another session's entry. (It has apostrophes and
  em‑dashes — write it with the Write tool or a `.cjs` script, NOT `node -e '…'`
  in bash, which chokes on `'`.)
- Checkpoint before a risky phase: `git commit --allow-empty -m "checkpoint: …"`.

---

## 2. The surfaces (what renders where)

- **`CeqStudio.tsx`** — the authoring shell (the "Studio"). In pool mode it is the
  main surface the route mounts. Holds the deck/questions, the Pipeline view, the
  take inbox, orientation/platform state. Home state = no deck (questions empty).
- **`CeqPreviewer.tsx`** — renders one frame (CEQ card + memos + staged elements)
  on a React Flow canvas. Three mount contexts, **mutually exclusive by state**:
  - inline authoring previewer (`!filming && !recording`),
  - the **capture modal** (`filming && !recording`, kept mounted, hidden via
    display:none so the OBS popout + film keys survive),
  - the Recording Mode full‑window portal (`recording`).
- **The film/capture popout** — a separate Chrome window; `PanelPopout` portals the
  previewer into it. It is ONE React tree with the studio (see stores below).
- **Pipeline view** (`PipelineStage.tsx` + `TrimDetail.tsx` + `TakesInbox.tsx`) —
  the editing room: big cut preview over a single horizontal timeline, a
  trim‑detail with a zoomable waveform + transcript, and the take rail.

### Key modules

| File | Role |
|---|---|
| `cut-sequencer.ts` | PURE playback decisions (skip‑don't‑wedge). Regression‑tested at 12 clips. |
| `use-cut-player.ts` | DOM executor for the sequencer (one `<video>`, rAF, seek). |
| `stitch-preview.ts` / `stitch-defs.ts` | The cut RECIPE (order, trims, gaps, internal cuts). `splitAroundCut` = pure internal‑cut split. |
| `coverage-log.ts` | Module‑level visited‑frames log → which frame(s) a take covers. |
| `orientation-store.ts` / `platform-store.ts` | Cross‑window shared state (see §3). |
| `landmarks.ts` / `waveform-peaks.ts` | RMS speech onset/offset + Web‑Audio peaks (cached per path). |
| `transcript-client.ts` / `lib/transcribe.functions.ts` | Whisper word‑level transcription (background queue). |
| `edit-telemetry.ts` / `lib/edit-events.functions.ts` | Trim telemetry (local‑first). |
| `BrandCursor.tsx` | Filmable split‑bolt cursor. |
| `brand.tsx` | `BOLT_OUTER` / `BOLT_RIGHT` / `BOLT_VIEWBOX` — the ONE bolt geometry. |

---

## 3. Load‑bearing patterns (follow these)

- **Module‑level stores for cross‑window state.** The studio and the capture
  popout are one React tree, but a prop would have to thread through the previewer,
  the portal, and the take inbox — three places to forget. So orientation, the
  platform pick, the slate, coverage, triage, and the drop bus are all
  module‑level get/set/subscribe stores. There is **no BroadcastChannel and none
  is needed**; `qId`/store values are the single signal both windows read.
- **The cut is a DERIVED recipe.** `pipelineStitch` = the saved set recipe + fresh
  kept takes auto‑joined at their spine position. It NEVER writes; edits persist
  via `persistStitch` (which is `saveStitch` minus the modal). Empty frames simply
  contribute nothing — a short that uses intro + 2 CEQs + outro is just those clips
  concatenated in spine order; gaps are skipped, and preview/trim/render all work.
- **ONE keep path.** `doKeep(take, over?)` in `TakesInbox`. Drag‑drop routes through
  the keep‑to bus, not a second path. Explicit drop target beats coverage/armed;
  F10 keeps never set `explicit`.
- **Blast vs clip‑to‑clip.** One take can cover MANY frames (`coversFrameIds`) via
  the frame‑bar checkboxes under the timeline — stored once on the first checked
  frame. Single‑frame inserts still drop onto a track position.
- **Film‑safe law is about PIXELS, not processes.** Never unmount the take inbox or
  the previewer to hide them (it kills the OBS socket / the popout) — hide with
  `display:none`.

---

## 4. Gotchas that already cost time — DO NOT repeat

1. **In‑component render‑time TDZ (crashed prod).** A `useMemo` factory runs DURING
   render, so if it calls a `const` declared LATER in the same component, that const
   is in its Temporal Dead Zone → "Cannot access X before initialization" → white
   error page. tsc, the build, AND `tdz-hazards.test.ts` all missed it (the guard
   only flags module‑scope arrows). **Declare any const a `useMemo`/render path
   calls ABOVE the caller.** (This is why opening a set once crashed the whole route.)
2. **Never animate the film‑popout viewport on navigation.** `setViewport({duration>0})`
   on a Space walk **black‑screens the capture window** (a single animated fit
   mis‑times against the node re‑seed; the frame lands off‑screen). The camera
   CUTS between slots — use the proven multi‑fire `settle` at `duration:0`.
3. **The spacewalk flash** was the active frame's background using a SHARED node id
   (`__frame__`) while stand‑ins used per‑frame `fbg:<qid>`. Navigating swapped the
   background node id → React Flow remounted `WorldBackground` → its CSS animations
   restarted = the flash. Fix: the active frame's bg uses the SAME `fbg:<qid>` id in
   the film stack. Rule: **never key a per‑frame thing to a shared id when
   stand‑ins use per‑frame ids.**
4. **Stored `take.duration` is rounded to 0.1s.** Rounded‑up durations overshoot the
   real media end; `ended` used to fire into nothing → the preview wedged (the
   "stops at clip 5"). Always use the DECODED duration for px↔ms math; the player's
   `onEnded` must advance.
5. **CRLF.** `autocrlf=true` here. EVERY `readFileSync` in a test or an edit script
   must `.split("\r\n").join("\n")` (a guard test enforces it for tests). **NEVER
   `eslint --fix`** — CRLF vs prettier‑lf = ~1900 baseline errors.
6. **Edit‑script substring collisions.** A `split/join` replace matches SUBSTRINGS —
   a JSX line at 20‑space indent also matches inside a 22‑space copy elsewhere and
   mangles it. When a line can repeat at different indents, include a neighboring
   unique line in the anchor. Prefer Write‑tool `.cjs` scripts run with `node` over
   bash heredocs (heredocs eat backslashes/quotes).
7. **Never bundle `data/` files** — gitignored; a `?raw` import broke 3 builds AND
   leaked an answer key into the public chunk.

---

## 5. Filmable brand cursor + OBS

- The cursor is a **DOM element that follows the mouse** (`BrandCursor.tsx`), NOT a
  CSS `cursor: url(...)` — a CSS image cursor is drawn by the OS and OBS
  window‑capture does not reliably record it, nor can it animate. Native cursor is
  hidden via `cursor: none` on the host **and every child** (`[data-sa-brand-cursor] *`
  — ReactFlow panes set their own cursor, so the host alone leaves a second arrow).
- **Lee must turn OFF "Capture Cursor" on the OBS window‑capture source**, or OBS
  composites the OS arrow on top of the bolt (two cursors).
- Tunables are constants at the top of `BrandCursor.tsx` (`H`, `LEAN`, `FLIP`,
  `TIP_FX/FY`, `BOIL_EVERY`); colors are props (`c1`/`c2`/`keyline`) so a campus
  video can pass that school's colorway. Default = Ole Miss red + powder blue +
  white keyline (the keyline is what makes it legible on navy AND on white cards).

---

## 6. Testing conventions

- Most tests are **source‑pin tests**: read a component's source and assert exact
  strings / occurrence counts. They pin the CONTRACT (e.g. `{clipsPanel}` count,
  "one home" invariants). When you legitimately change a pinned line, update the
  pin AND its reasoning comment.
- Pure logic (sequencer decisions, seek math, split math, RMS detection, telemetry
  classification) is unit‑tested directly — keep new logic pure and testable.
- `tdz-hazards.test.ts` guards render‑path hoisting (see gotcha #1). The suite is
  ~1300 tests; keep it green.

---

## 7. Pending Lee‑actions (config/DDL I can't do — hand these off, don't assume done)

- **Apply SQL in the Supabase SQL editor** (the token is write‑only; I can't apply):
  - `0117_edit_events.sql` (trim telemetry)
  - `0118_take_transcripts.sql` (Whisper transcripts)
  - `20260819_canvas_media_size_limit.sql` (bucket 5 GiB)
- **Env var:** transcription reads `OPENAI_WHISPER` (falls back to `OPENAI_API_KEY`).
- **Supabase Storage upload limit** — the REAL cap on take size. Dashboard → Storage
  → Settings → "Upload file size limit" (SQL can't touch the project‑global one).
  Raise to ~5 GB or takes over ~50 MB fail with "object exceeded the maximum
  allowed size."

Until applied: telemetry + transcription queue locally (nothing lost); exports
say "local‑only".

---

## 8. Known open items

- **Shorts capture window opens landscape for 9:16.** The capture popout should snap
  to portrait 1080×1920 for a 9:16 set (`captureSize("9:16")`), but it can open wide
  (frame tiny at top, black below) — either launched before the 9:16 shape
  registered, or the browser blocked the resize. Workaround: set 9:16 BEFORE
  Capture, then hit the **SNAP** button in the capture badge. Making it automatic is
  the next fix; confirm with Lee whether SNAP fixes it (pinpoints launch‑order vs
  blocked‑resize).
- **Shorts safe‑zones** are now rendered (previewer View menu → "Shorts safe zone",
  9:16 only) drawing caption/rail/top no‑go bands per platform. Authoring‑only.

---

## 9. Where the deeper detail lives

- Per‑feature memory lines in `~/.claude/.../memory/MEMORY.md` (this agent's memory)
  and the individual notes it links.
- `docs/FILMING-WORKFLOW.md`, `docs/BRAND-CARDS-FILMING.md`, `docs/DEPLOY.md`,
  `docs/NEW-EXHIBIT-CHECKLIST.md`, `docs/CANVAS-ROADMAP.md`.
- `CHANGES.md` (root) — the running, stacked change log.
