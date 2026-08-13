# Prompt audit — specced vs shipped on `canvas-v2`

Read-only audit of the recent sprint. **Evidence rule: a commit message claiming
something is not proof — every verdict below was checked against the code at HEAD.**
Two verdicts contradict their own commit messages; both are called out.

---

## The table

| # | Area | Verdict | Commit / gap |
|---|------|---------|--------------|
| 1 | **Film mode** | **PARTIAL — and the headline bug is still live** | see §Film below |
| 2 | Regression-guard test pass | **ABSENT** (0 of the 5 named tests) | `ceq-geom.test.ts` + `ceq-slots.test.ts` were added, but for the geometry split, not for these |
| 3 | Misconception layer | **ABSENT** | no `misconceptionId` on memos, no chips, no registry, no export. The 42 repo hits are all the unrelated /je engine |
| 4 | Element lock + layer nudge | **PARTIAL** | lock exists but **pre-dates the sprint** (`d6f2f96`, `9ac4c84`, 2026-07-13). Layer nudge **ABSENT** — no user-facing z-order control at all |
| 5 | Topics/Sets merge + "Ch N" names + chip simplification | **ABSENT / PARTIAL** | tabs were **not** merged (still separate Topics and Sets). Chips are still `✂ · I/O/W · ⏱ · ▶` — the spec wanted I/O/W removed and 🎬 added. Seeded set **names** still contain "Ch N ·" (stored `DeckDef.name`, `ceq-seed.ts`) — display-only passes can't reach them |
| 6 | Attended geometry split | **SHIPPED** | `e75a3b8` `c32e09d` `314936e` `4998827` — `CeqCard.geom` + `ceq-geom.ts`; `commitGeom` writes the instance, `deck.layout` is template-only |
| 7 | Distractor authoring | **SHIPPED** | `1e05e10` (right-click chain + place + one undo), `dee76ad` (exclusive chain view + `CHAINED_MARKER`) |
| 8 | Memo selection / overview-chains / toolbar slim-down | **ABSENT** | never started; the overview container it would live in exists (`8b75498`) |
| 9 | Arrow z-order / combine / unattached | **SHIPPED** | `6505392` (+`a0b274f` put them back on camera) — `EDGE_Z`, `chainBundle` edge type, dead-anchor filter |
| 10 | Question-transition centre-snap | **SHIPPED** | `7a06342` — one resolved spot feeds the live card and the `ov:` stand-ins; `transform-origin: 0 0` |
| 11 | Set export tool + script layers + covers-starred | **ABSENT** | no export path for a set |
| 12 | Video library + Mux links + costs | **SHIPPED** | `CeqVideoLibrary.tsx` + `mux-rates.ts`; rewritten as the Videos tab in `6934360`. **No Auphonic cost line** — encoding + storage only |

---

## §Film mode — the gap analysis

Sub-claim by sub-claim:

| Sub-claim | Verdict |
|---|---|
| (a) clean output: no frame chrome, no Q-number overlay, frame **fills** window | **PARTIAL** — chrome and Q-number are genuinely clean (`e760900`, `745b81e`); "fills" was never built |
| (b) film-mode class on the popout | **SHIPPED** — `CeqPreviewer.tsx` popout wrapper |
| (c) smooth question transitions (resolved position) | **SHIPPED** (`7a06342`), but the film *camera* still hard-cuts |
| (d) backtick full reset incl. chain state | **SHIPPED** for chains — but see the spotlight gap |
| (e) Enter / Shift+Enter walk in film | **SHIPPED** (`c4a4f89`, `e760900`) |

### Why it still looks wrong — ranked

**#1 — memo→choice arrows anchor to the popout's top-left corner. This is live in every
take, and my earlier "fix" could not have worked.**

`FilmOverlays.tsx:253` hides handles with `.film-mode .react-flow__handle { display: none !important }`.
That CSS reaches the popout (PanelPopout clones the opener's `<style>` nodes) and applies
because of the `.film-mode` wrapper. React Flow measures handles with
`getBoundingClientRect()`, and a `display:none` element returns an **all-zero rect**, so
every handle in the film provider resolves to the same point: the flow coordinate of the
viewport's top-left corner.

Commit `063e5d4` diagnosed this symptom as a `ReactFlowProvider` mount race and shipped
`FilmInternalsNudge` (re-firing `updateNodeInternals` at 0/60/180/400/800 ms). **That
diagnosis was wrong** — re-measuring a `display:none` element yields the same zeros, so
the nudge cannot fix it. The main canvas is immune for a reason that does not transfer:
there, nodes are measured *before* `.film-mode` is added and the cached bounds survive;
in the popout, nodes mount already inside `.film-mode`, so the first and every
measurement is zero.

**Fix, with its trap:** switch the rule to `visibility: hidden` (or `opacity: 0`), which
keeps a real layout rect. Simply deleting the rule would expose the visibly-styled cyan
handle dots on camera.

**#2 — the frame never fills the window.** `fitFilm` uses `fitView`, which preserves
aspect ratio. A 16:9 frame in a popup of any other aspect letterboxes — black bars top/
bottom at the default 1000×600, left/right when maximised. `f1b54cc` only tightened
padding (0.02 → 0.012); there is no crop/cover path. OBS has to crop.

**#3 — hover-revealed resize grips render on camera.** `ScaleGrip` renders in film and
`PV_CSS` makes it visible on `:hover`, so resting the pointer on a card mid-take pops an
18px square at its corner.

**#4 — with Overview on, neighbouring question frames are in the film scene**, just
outside the fit (and `OverviewCeqNode` never reads `FilmContext`, so it paints its yellow
number badge). They become visible in the letterbox. The film refit also hard-cuts on
every question change while the previewer glides.

**#5 — backtick's "full reset" leaves spotlights lit.** It clears emphasis/resolution/
chains but not `spots`; only the RotateCcw button clears those. A gold pill or 🔥 flame
survives into the next take.

**#6 — Q0's dashed LAYOUT border and ribbon are not film-gated** (no `!film` guard,
unlike every other badge in that file).

---

## Orphan commits — work that maps to no area above

| Commit | What it is | Worth surfacing? |
|---|---|---|
| `ef7c77a` | **Shorts queue** — a whole feature you may never have opened | **Yes** |
| `6b1a3a0` | **F9 run timer removed** — but the popout + readout still exist and still say "press F9" | **Yes** — stale affordance |
| `00945dc` | Changed what "seed Ch 1–5" stamps | Yes |
| `bdc4078` | Delete-a-question + duplicate-lands-below | Minor |

Everything else in the window maps to a known area (publish pipeline, batch ingest, bulk
ops, Q0 palette, topic-first outline, caret fix, memo context menu, question-number
overlay, double-click zoom, memo sweep, docs, plus two stability fixes: `a606113`
infinite re-render #185 and `16f3cce` crash-on-load).

---

## SQL LEE MUST RUN — suspects to verify

**I cannot query the database.** This is a list to check against `unvxagsledbsdoremqeb`,
not a claim that they're missing.

**This sprint added ZERO migrations** — every CEQ Studio field (`geom`, `layout`,
`layoutMode`, `courseId/topicId`, clip stacks) rides the scene JSON blob. Areas 6–8 need
no SQL.

**Run-these suspects — both are read by live code:**

| File | Creates | Breaks if missing |
|---|---|---|
| `0099_canvas_sfx.sql` | `public.canvas_sfx` (global SFX URLs) | SFX save/upload throws — `canvas.functions.ts` has an explicit fail-loud hint naming this file |
| `0100_frame_take_coverage.sql` | `frame_takes.frame_ids text[]` | **every take upload insert fails** (it writes `frame_ids` unconditionally) |

**Contradiction worth resolving:** my memory says all canvas tables 0090/0091/0094–0098
were verified live on 2026-07-20; this repo's own `docs/CANVAS-AUDIT-2026-07-20.md:42`
says 0090/0091/0097/0098 are *not* applied. Same day, opposite claims — re-verify.

Also unconfirmed (data seeds, not tables): `0092_seed_start_here.sql` (needs 0091 first)
and `0093_principles_and_tags.sql`.

**Verification order:** 0099 and 0100 first, then 0094–0098, then the 0092/0093 seeds.

---

## The honest summary

Shipped: the geometry split, distractor authoring, arrows, centre-snap, video library.
Absent: the misconception layer, the set export tool, memo selection, layer nudge, the
topics/sets merge, and **the entire regression-guard test pass** — the sprint added test
coverage only for the geometry split it happened to be shipping.

The one that matters most: **film mode's arrow bug was misdiagnosed and is still live.**
Everything else in film is cosmetic-but-fixable; that one puts wrong pixels in every take.
