# Canvas-v2 — Overnight Hardening + Honest Audit (2026-07-20)

Unattended run. Primary deliverable is this audit; fixes were additive/safe only.
Every commit was green (tsc + full suite + production build). No serialization,
command-bus, space-walk, or data-rewriting migration was touched.

---

## Phase 1 — Health audit

### 1.1 Test suite
- **580 tests across 49 files**, full run ~0.5–0.8 s. Pure-logic suite (no timers,
  no network) → no flaky/slow tests observed; nothing over a few ms.
- Coverage is already broad. The filming-critical behaviors on the brief are
  **all covered**: JE invariant + Tab-walk (`je-logic.test`), space-walk order
  incl. skip-empty / stop-at-end / cross-lesson roll (`frames.test`), deck
  deal/skeleton (`deck-logic`, `deck-defs`), scene save→load + every migration
  incl. CRAM rename (`scene-io.test`, 20+ cases, idempotency proven), frame grid
  nav (`frames.test`), duplication frame/lesson (`duplicate-*` ×3).
- **Genuinely untested surfaces** (thin, lower-risk): standalone MemoCard node
  persistence (only structurally covered by the generic sanitize/round-trip; JE
  *line* memos are explicitly tested); route-only UI logic that isn't a pure
  export (`moveFrameToBeat`, `isCramLaunchFrame`, `enterFrame` SFX gating); the
  Cycle element geometry (lives in `CycleNode.tsx`, not extracted); the Web-Audio
  SFX engine (side-effectful). None are load-bearing for the invariant/order
  logic filming depends on.

### 1.2 Migrations vs code — the "shipped dark" check
Manual-apply canvas migrations and whether code reads their tables:

| Migration | Table | Read by | If UNAPPLIED |
| --- | --- | --- | --- |
| — | `canvas_scenes` / `canvas_folders` / `canvas_scene_snapshots` | `canvas.functions.ts` (scene save/load/snapshots) | **Filming breaks.** Core — assumed LIVE (save/load works daily). |
| 0090 | `canvas_decks` | **nothing** — decks ride the scene JSON (`scene.decks`) | No effect. Migration is effectively unused by current code. |
| 0091 | `scenario_placements` | `je-api.ts`, `canvas.functions.ts` | Placement features no-op; tree still renders (falls back to `chapter_id`). |
| 0094 | `frame_takes` | `canvas.functions.ts` (takes board / Mux) | Takes board errors on write. |
| 0095 | `lesson_videos` | `publish.functions.ts` | Publish pipeline errors on write. |
| 0096 | `intro_trim` fields | takes onset/trim | Trim fields absent; publish-intro degrades. |
| 0097 | `canvas_snippets` | `snippet.functions.ts` | Save-as-snippet / MY SNIPPETS errors on write. |
| 0098 | `frame_segments` | `segment.functions.ts` | Per-beat segment assembly errors on write. |

Per prior notes: 0090, 0091, 0097, 0098 are **not applied**; 0094/0095/0096 are
**unconfirmed**. **None block basic filming** — scenes are the core and are live.
GET server fns swallow throws (features quietly no-op); POST/save paths fail loud.
**Lee must run** whichever secondary migrations he wants those features to work.
**Tonight introduced no new migration** (all changes are additive scene-JSON).

### 1.3 Console + render
- Static signal: exactly **one** `console.warn` in the whole canvas (a benign
  image-paste catch in `NoteCardNode`); **no** stray `console.error`/`log`; **no**
  `import * as` whole-library imports; **tsc clean**; **production build clean**.
- **Live browser console pass was NOT run.** Reason: unattended, and this project's
  dev/preview pane is a documented stale/wedgy surface — fighting it risks the run
  for little signal the clean build doesn't already give. **Action for Lee:** a
  2-minute live pass in the morning (spawn one of each card, save→load a scene,
  enter/exit film) before the shoot.

### 1.4 Feature reality check (evidence from code, not prior claims)

| Feature | Verdict | Evidence |
| --- | --- | --- |
| CRAM rename incl. stored data | **BUILT & WORKS** | `migrateCheckToCram` (scene-io) migrate-on-LOAD + `beatColOf` runtime fallback. **No DB rewrite** — client-side, safe. Tested. |
| Memos as independent nodes (all kinds) | **BUILT & WORKS** | `memo` node kind + `anc:<id>` anchor handle attaches to any node (`MemoLightbulb`/`MemoAnchor`). |
| Spotlight Ctrl+click on JE | **BUILT & WORKS** | `JeCardNode` uses `spotTargetProps`/`useSpotTarget`. Now also works in FILM (tonight). |
| Card scale UI on JE | **BUILT & WORKS** | `CardScaleHandle` in `JeCardNode` + `BaseCard`. |
| Tab walk-and-wrap | **BUILT & WORKS** | `JeCardNode` tab handling; `je-logic.test`. |
| Amount echo Guided-only | **BUILT & WORKS** | `autoBalance` in `JeCardNode`. |
| @mark spawns card | **BUILT & WORKS** | `card-marks.ts` + `ScriptEditor` + route link/spawn callbacks; tested. |
| Named-deck seed from REAL chapters | **BUILT & WORKS** | `deck-defs.seedStartHereDecks(chapters, lessons)` derives from the live course (not hardcoded); tested. |
| Skeleton grid | **BUILT & WORKS** | `SkeletonLayer.tsx` + `deck-defs` + `DeckManager`. |
| Film-mode chrome sweep | **BUILT & WORKS** | `FILM_MODE_CSS` hides `.card-actions`/`.sa-chrome`/conn-dots/handles across every kind. |
| Popouts invisible to window capture | **BUILT & WORKS** | `PanelPopout.tsx` opens a **separate OS window** — OBS window-capture of the main window won't include it. |
| Background / Worlds picker | **BUILT & WORKS** | `worlds.ts` + `WorldBackground` + Visual Mix; `worlds.test`. |
| Effect-card derivation + batch | **BUILT & WORKS** | `equation-derive.ts` + `DeckManager` batch; `equation-derive.test`. |
| Duplication (frame / lesson) | **BUILT & WORKS** | `duplicate-frame.ts` + `duplicate-lesson.ts`; 3 test files. |
| Space-walk / cue panel editability | **BUILT & WORKS** | `cue-sheet.ts` + Cue Sheet Phase 2 (`cueOrder`, drag-reorder); tested. |
| Storyboard-first **default** | **PARTIAL** | Storyboard/read-time is built + tested, but no "default view" wiring found — it is not forced as the default surface. |
| **CEQ SET factory** | **NOT FOUND** | No `ceqSet` / `approveAsDeck` / `stem_template` anywhere in the tree. |

---

## Phase 2 — Safe fixes

Audited the Phase-2 axes and found **nothing safe worth changing** (this is a
"looked, it's clean" result, not "skipped"):
- No whole-library imports — imports already narrow.
- No stray console noise (one benign warn).
- No missing-key crash surfaced by the build; tsc + production build clean.

Per the unattended guardrails (behavior-preserving only, don't speculatively edit
working code), **no Phase-2 code changes were made**. The "Choose account" INP
re-measure needs the live pane and was deferred with 1.3.

---

## Phase 3 — Regression net (ADD-only, all green)

Added, targeting tonight's new surfaces (the real gaps) without touching any
passing test:
- **`floating-anchor.test.ts`** (10) — border-intersection geometry + side
  classification + plain-vs-semantic handle gate for the new floating arrows.
- **`spotlight-targets.test.ts`** (8) — locks the whole-element spotlight contract
  (heading/text/examcue/**cycle**/memo → `self`), card-kind component targets
  (ceq/formula), and `undefined`-safety. Protects the Ctrl-click-finds-a-target
  guarantee filming relies on, including the new Accounting Cycle element.

The higher-level filming behaviors were already covered (see 1.1) — not duplicated.

---

## Proposed-but-not-done (Lee's call in the morning)

- **CEQ SET factory** — the one NOT-FOUND feature. Large: needs a new additive
  `ceq_sets` migration, authoring UI, the film/student ordering engine, and
  approve-as-deck. Too big/risky for an unattended pass. *Risk: none (absent).*
- **CHECK→CRAM stored-data rewrite** — **do not build.** The client-side
  migrate-on-load already covers it; no DB rewrite exists or is needed. *Risk of
  adding one: high (touches stored data) for zero benefit.*
- **Live INP re-measure + live console pass** — needs the preview pane. *Risk:
  none; just needs a human at the machine.*
- **Per-lesson cram "elsewhere" picker** — data + engine already accept any frame
  id; the frame-header control cycles auto→off→here only. *Risk: low to extend.*

## Top 3 before filming
1. Do one real **save → reload** of a scene to confirm `canvas_scenes` is live.
2. Run the **2-minute live console pass** (the check I couldn't do unattended).
3. Set **audio routing** so the new SFX never reach the RE20 (headphones or a
   separate OBS track — see `FILMING-WORKFLOW.md`), and pick each lesson's
   cram-launch (auto/off).

## Top 3 before beta
1. Apply the **secondary migrations** you actually want live (0091 placements,
   0097 snippets, 0098 segments; 0094/0095/0096 for takes/publish/trim) and
   verify each.
2. Build the **CEQ SET factory**.
3. **Rotate the exposed Supabase PAT** (documented) if not already done.

## SQL Lee must run
**None from tonight.** All tonight's work is additive scene-JSON. The pre-existing
manual-apply migrations `0090`–`0098` remain yours to apply as needed (table above).
