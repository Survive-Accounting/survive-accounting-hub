# DESIGN — the cram map: cram path vs offshoots

Written 2026-09-09 against `749f1189` (branch `film/free-camera-pinned-ceq`, which is also
`origin/main`). Design only — nothing here is built. Every `file:line` below was read on that
commit; if the file has moved, grep the quoted identifier rather than trusting the number.

This supersedes `docs/PROMPT-VIDEO-MAP.md` (2026-09-08, unexecuted). The first slice adds a
one-line "superseded by DESIGN-CRAM-MAP.md" note to the top of that file; do not delete it.

---

## 0. In one paragraph

A set IS a video. Today every live set sits on the cram path whether it is a cram video, a pitch,
or a "go deeper" review. Add three additive fields to the deck in scene JSON — `lane`,
`branchFrom`, `priorityTier` (declared, unwired) — with **absent = cram** so no existing set moves.
Carry them onto `BoothSetInfo` so every `/v3` screen reads them through `useBank`. One writer
(`setDeckLane`, a clone of `saveBlastPlan`), one minter (`blastOffIdeaShort`, generalised from
`blastOffStrategyShort`), a lane picker on the set's door, and a new `/v3/map` page: a pure SVG
per exam topic — **pitch videos on the LEFT, the cram path down the CENTRE, review/teaching
offshoots on the RIGHT** — coloured by the same `stageOf` chip the queue uses, with `+ offshoot`
and `+ pitch` on every cram node. Later, under the student's cram player, a one-click "want this
one" that files a `question` intake against the offshoot deck. **No new table. No SQL to run.**

---

## 1. The goal, in Lee's words

From `docs/PROMPT-VIDEO-MAP.md:13-19` (verbatim brief, 2026-09-08):

> "We need a map that lets us view how videos are connected… there's the main cram path in the
> center of the screen. On left side, there's pitch videos branching off. On right side, there's
> review videos branching off. Later, when students start requesting stuff, we can see where they
> branched off of. Or, we can see on the pitch branch which ones are performing/converting."

The model underneath (`docs/SURVIVE_STRATEGY_CULTURE_2026-09.md:380`): "keep the videos
incredibly crammable, and leave seeds of curiosity lying around." The map is how he sees where
the seeds are.

The two branch kinds, from the same doc:

- **Pitch** (`:375-378`): "any video that's directed at selling the student on something." A
  production kind distinct from a cram slide — e.g. the ~60 s Easy Points outro pitch.
- **Review / offshoot** (`:462-475`): "80% of the energy stays on cram videos." Review videos are
  made **on request**, weekly, first come first served. "'Go deeper' is the link": when a cram
  video runs out of time it points at a review video; if that video does not exist yet, "the link
  becomes the request form." And (`:480-486`) **THE ASK IS FREE** — no price on the request form,
  money only privately over email after the request arrives.

So the map has three jobs, in this order: (1) show the path and what hangs off it, (2) let Lee mint
an offshoot/pitch from a cram node in one click, (3) later, count the requests per unbuilt
offshoot so demand decides what he films.

---

## 2. What exists today (verified)

### The bank and the deck

- A set is a `DeckDef` inside `canvas_scenes.nodes_json.decks[]` (`src/components/canvas/types.ts:1532`).
  Production fields already ride there additively: `sortOrder` (`:1590`), `parked` (`:1595`),
  `publications` (`:1619`). The deck's `blastOff` plan is written by `saveBlastPlan`
  (`src/lib/blastoff.functions.ts:105-131`: read scene `:118`, find deck `:121`, mutate `:127`,
  update `:128`) and read raw by `loadBlastPlan` (`:27-43`). **`DeckDef` does not declare
  `blastOff`, `splitFrom` or `splitInto`** — they are typed ad hoc at each reader
  (`student.functions.ts:56` `RawDeck.blastOff?: unknown`; `split-set.functions.ts:41` local `Deck`).
- `loadBoothBank` (`src/lib/talkthrough.functions.ts:261-313`) is THE V3 data source: live,
  unparked card decks grouped by chapter. It casts the deck at `:273` to `{ id, name, topicId?,
  sortOrder? }` and pushes `BoothSetInfo { id, name, ceqs, liveCount, draftCount }` (`:256`) at
  `:298-302`. Topics sort by chapter number, sets by `sortOrder` then name (`:305-311`). A
  chapter with `course_id IS NULL` becomes `kind: "strategy"` (`:276`).
- `useBank` (`src/components/v3/use-bank.ts:44-54`) caches the promise at module scope for the
  page's life; `refreshBank()` (`:35-37`) drops it. Every write that changes the bank calls it
  (`ReviewDeck.tsx:633`, `:788`; `SplitPanel.tsx:86`). `blastOffPath` (`:114-117`) spells the
  per-set URL; `slugOf` (`:59`).
- Order within a topic on `/v3` = `orderedSets(slugOf(t.name), t.sets)`
  (`src/lib/v3-topic-groups.ts:77-78`; `v3.index.tsx:154`). Only the strategy topic has a group
  spec; exam topics come back in bank order. Strategy grouping matches by **set slug** (`:63`).
- Stage: `stageOf(input): StageInfo { stage, label, color, next }`
  (`src/components/v3/set-stage.ts:40-46`, `:102-113`). `/v3` (`v3.index.tsx:76-99`) and
  `/v3/post` (`v3.post.tsx:142-145`) both feed it from `listBlastPlanSetIds` (admin-gated,
  `blastoff.functions.ts:63-66`), `productionBottleneckReport`, `listPublishStatuses`, and the
  local talkthrough store. `StageChip` (`StageChip.tsx:22`) renders it.
- `/v3/post` already has one row per split, keyed `<setId>` / `<setId>#N` (`v3.post.tsx:131-138`),
  takes computed from the non-skipped frames (`blastoff.functions.ts:81-97`).

### Strategy shorts — the only idea → deck path

`blastOffStrategyShort` (`src/lib/strategy.functions.ts:84-131`): refuses non-strategy ideas
(`:92`), is idempotent on `ctx.deckId` (`:97-102`), ensures a course-less "Strategy" chapter
(`:42-51`), builds a spine with `planFramesForShort` (`:54-80`), mints a zero-card deck
(`:108-115`, `status: "live"`, `parked: false`, `blastOff.layout: "pass2"`), inserts a one-deck
scene with `strategy: true, ideaId` **on the scene, not the deck** (`:120`), and writes
`ctx.deckId / deckPath / deckAt` back on the idea (`:125-129`). Called from the strategy board
(`src/routes/admin.ideas_.strategy.tsx:118-126`), which opens the returned path in a new tab.

**Name collision to respect:** `ideas.context.lane` is ALREADY the strategy board's audience lane
(`admin.ideas_.strategy.tsx:130` reads `i.context.lane as ShortLane`; `src/lib/strategy.ts:103`
`ShortLane = "reps" | "chairs" | "students" | "building" | "founder" | "later"`; `:23`
`StrategyLane`). The deck field below is also called `lane` but means the path axis
(cram / offshoot / pitch). **Never write the path lane into `ideas.context.lane`.**

### Splits — provenance already recorded, never read

`splitSet` (`src/lib/split-set.functions.ts`) writes `splitFrom: parent.id` on each piece deck
(`:113`), on each moved card (`:120`) and on the scene (`:125`), and appends `splitInto` on the
parent (`:136`). Pieces are placed at `sortOrder = parent + k/(n+1)` (`:112`). A parent left with
no filmable card is parked + archived (`:141-142`) and so leaves the bank. Nothing reads
`splitFrom`/`splitInto` back. These are **provenance** (where a deck came from), not pedagogy —
do not overload them to mean "branches off".

### The student side

`fetchStudentTree` (`src/lib/student.functions.ts:90-`) lists every live, unparked deck of a topic
(`:107`, `liveDecks` `:87-88`) in `sortOrder` (`:214`, `:218`). The only drop is at `:197`: a deck
with **zero counted questions AND no shipped blast publication AND no lessonId**. So a zero-card
offshoot (the only kind this design mints) never reaches `/learn`; **a carded set marked offshoot
would still be listed on the cram path** — see §3.8 and slice S9.

Students play `decks[].publications[]` with `kind:"blast"`, `state:"shipped"` (`shippedPub`,
`:59-60`). `StudentSet` (`:23-43`) carries one `playbackId`.

### Requests — the backend exists in full

`submitIntake` (`src/lib/intake.functions.ts:55-60`; schema `:14-45`: `sourcePath` `:31`,
`source` `:39`, `email or phone required` `:45`) writes one `campus_waitlist` row
(`src/lib/comms/intake.server.ts:47` `source_path`, `:50` `source`) and, for PRIORITY kinds, pages
Lee (`:75`). `question` is a PRIORITY kind (`src/lib/comms/kinds.ts:18`). Two precedents:
`askAboutQuestion` (`src/lib/practice.functions.ts:75-98`) writes `source: "ask-lee"`,
`sourcePath: ceq:<setId>:<ceqId>` and the admin counter groups on that prefix (`:146-150`:
`.eq("kind","question").like("source_path","ceq:%")`); the cram player's Ask Lee
(`src/components/learn/CramPlayer.tsx:315`) writes `source: "ask-lee-cram"`,
`sourcePath: cram:<setId>`. The soft identity bridge is `readStudentEmail()`
(`src/lib/student-email.ts:15-21`, localStorage `sa-student-email`).

### The SVG pattern to copy

`src/components/blastoff/cluster/MapSchematic.tsx` — pure, "no store, no network, no side
effects" (`:9`); props `{ spec, shot, onShot?, w = 280 }` (`:32-39`); boxes tinted `${c}22` with a
1 px stroke (`:72`), title truncated to the box width (`:74`), the active item a gold 1.5 px
stroke (`:86`). Copy the **discipline and the styling**, not the component — its `spec` is a
cluster playfield, not a topic. (The seed described its contract as `{nodes, edges, selected,
onSelect, w}`; that is the shape `LaneMap` should have, not what `MapSchematic` has.)

### The TDZ rule

`src/components/canvas/tdz-graph.test.ts` walks the import graph from `CeqPreviewer.tsx` and
`CeqStudio.tsx` (`:29`) and counts module-scope `const f = () =>` callables (`:72-74`) against a
baseline (`:84-`); `components/canvas/account-registry.ts` is baselined at **6** (`:105`). A new
file joining the graph with any such callable, or a baselined file getting worse, fails the suite.
`use-bank.ts:12-14` states the house rule for V3: hoisted `function` declarations and `var` state,
because "a module-scope arrow here is the exact shape that has taken production down twice."
Several blastoff files import from `components/v3/` (`ReviewDeck.tsx`, `SplitPanel.tsx`,
`BlastOffCapture.tsx`), so assume anything under `components/v3/` can end up in the graph.

### `priorityTier`

`src/components/player-v2/planner-config.ts:9-13` documents the migration the beta was waiting
for: "Authoring adds a real `priorityTier` per set (natural home: the DeckDef…)". `PriorityTier =
"easy" | "core" | "b_to_a"` (`:17`). Never done.

### Routes and the manifest

V3 routes are file-routed (`createFileRoute("/v3/post")`, `v3.post.tsx:65-68`, wrapped in
`AdminGate`, `robots: noindex`) and listed in `IGNORED_ROUTES` in `src/lib/site-qa/manifest.ts`
(`:583-598`); `manifest.coverage.test.ts:20-23` fails on any route file that is neither owned by a
template nor ignored. The V3 shell's rule (`Shell.tsx:10-14`): the only global navigation is Home
and Exhibit Lab — new pages are reached by going somewhere, so the map is linked from `/v3` and
`/v3/$topic`, never from the shell.

### Migrations

High-water mark: `migration/supabase-migrations/20260907_0600_set_publish_captions.sql`. Names are
`YYYYMMDD_HHMM_short_description.sql`, never sequential (`docs/SESSION-CONTEXT.md:49-95`). Lee
pastes SQL by hand; a file in the folder proves nothing about the live schema.

### Corrections to the design seed (`designs.md §4`)

1. `saveBlastPlan` is `blastoff.functions.ts:105-131`, not `:113-129`.
2. `MapSchematic` takes `{spec, shot, onShot?, w}`; the `{nodes, edges, selected, onSelect}` shape
   is the target for `LaneMap`, not an existing contract.
3. `blastOffStrategyShort` writes `ideaId` on the **scene** (`:120`), not the deck.
4. `PROMPT-VIDEO-MAP.md` already has pitch LEFT and review RIGHT (`:67-70`) — it was not swapped;
   it agrees with Lee's brief. This design keeps that orientation.
5. `student.functions.ts:197` drops only zero-card decks; "an unbuilt offshoot is already dropped"
   holds for minted offshoots only.
6. `ideas.context.lane` is taken (audience lane). Minted offshoots write `ctx.deckLane`.
7. Migration naming is timestamped, and this design needs none.

---

## 3. Decisions

**3.1 Scene JSON, not a table.** Reject `video_links` (`PROMPT-VIDEO-MAP.md:41-57`). A deck's
parent is a single pointer; a table makes it a second source of truth that can dangle after a
split or a park, and it costs a hand-pasted migration. The "request backlog" the table wanted
(`to_set_id null`) is simply an `offshoot` deck with no shipped publication — and because it is a
real deck it already has Brainstorm → Editor → Film → Post; a stub row would not.

**3.2 `lane`, absent = cram.** Every existing set stays exactly where it is, in scene JSON and on
`/learn`, without a backfill. Writers DELETE the field to mean cram rather than writing
`"cram"`, so scenes do not grow a field per set. Reader normalises: unknown → cram.

**3.3 Reject `cramOrder`.** `sortOrder` is already the position within the topic, and it is the
order students see (`student.functions.ts:214`) and the order the queue shows
(`talkthrough.functions.ts:305-311`). A second order that can diverge from it is the same class of
bug as the two things called "Split". Cram order on the map = `orderedSets(...)` filtered to cram.
If Lee wants to reorder the path from the map, that later feature writes `sortOrder`.

**3.4 `priorityTier`: declare, do not wire.** It belongs on the deck (planner-config asked for it),
so it gets its type and doc comment now. No writer, no reader: wiring it changes what the
student planner serves, which is not this design's business.

**3.5 `branchFrom` is pedagogy; `splitFrom` is provenance.** Declare both on `DeckDef` so the
deck's real schema has one home. The map draws `branchFrom` as a branch edge and, for free,
`splitInto` as a dashed "split" edge between cram siblings. It never treats a split piece as an
offshoot.

**3.6 Strategy shorts are NOT pitch decks.** Reject writing `lane: "pitch"` in
`blastOffStrategyShort`. They are audience shorts in a course-less chapter, already off the cram
path, with no cram video to branch from; marking them would fill the left column with orphans.
The map does not draw `kind === "strategy"` topics at all — one line links to
`/admin/ideas/strategy` instead. The one change to `blastOffStrategyShort`: also write `ideaId`
on the deck (one line, additive), so provenance has one home and a later change to
`v3-topic-groups` can key on it instead of slugs. Do not change `v3-topic-groups.ts` now.

**3.7 One level deep.** An offshoot branches from a cram deck in the same topic. `setDeckLane`
and `blastOffIdeaShort` refuse a `branchFrom` that is not a cram deck, is not live, or is in a
different topic. Three columns cannot draw a tree; refusing nesting keeps the map honest.

**3.8 Student side untouched in v1.** Minted offshoots have zero cards and are dropped at `:197`.
The hazard: if Lee marks a carded set `offshoot`, or adds cards to a minted one in the Studio,
`/learn` lists it on the cram path. The fix is a one-line filter after `:197` — but it changes
what students see, so it is its own slice (S9), done with Lee present, never unattended
(`CLAUDE.md` § Unattended runs). The lane picker shows a warning when the set has cards.

**3.9 Pure SVG, never ReactFlow.** `/v3` loads no ReactFlow today and must not start. `LaneMap`
is a pure function of data with `function` declarations only, imports nothing from
`@/components/canvas/*` or `@/components/blastoff/cluster/*`, and never reads
`account-registry.ts`. A source-string test pins all three (§9).

**3.10 Admin gate on every writer and on the request counter.** `setDeckLane`,
`blastOffIdeaShort`, `listOffshootRequests` call `assertAdmin()`
(`src/lib/admin-session.functions.ts:108`) the way `listBlastPlanSetIds` does
(`blastoff.functions.ts:65-66`). The audit found `saveBlastPlan` itself is ungated; do not copy
that.

**3.11 Never auto-navigate after a mint.** `SplitPanel.tsx:86-87` navigates away after its write
and the audit calls that context-destroying. The map selects the new node and offers
"Brainstorm it →".

---

## 4. Data model (additive; exact names; where each lives)

### 4.1 `src/lib/deck-lane.ts` — new, pure, dependency-free

```ts
export const DECK_LANES = ["cram", "offshoot", "pitch"] as const;
export type DeckLane = (typeof DECK_LANES)[number];
/** Absent, null, or anything not in DECK_LANES reads as "cram" — the invariant every reader relies on. */
export function laneOf(d: { lane?: unknown } | null | undefined): DeckLane { ... }
export function isDeckLane(v: unknown): v is DeckLane { ... }
```
`function` declarations only (this module will be imported by `types.ts`, which is in the TDZ
graph — a type-only import is erased, but keep the module clean regardless).

### 4.2 `DeckDef` — `src/components/canvas/types.ts`, insert after `parked` (`:1595`)

```ts
  /** CRAM PATH vs OFFSHOOTS (docs/DESIGN-CRAM-MAP.md, 2026-09-09). Which lane this set is on:
   *  ABSENT = "cram" — the main path students cram, ordered by sortOrder. "offshoot" = a review /
   *  go-deeper / nerd-out video hanging off a cram set. "pitch" = a video that sells the student on
   *  something, hanging off a cram set. Writers delete the field to mean cram. Additive scene
   *  JSON; no migration. NOT the strategy board's audience lane (lib/strategy.ts ShortLane). */
  lane?: DeckLane;
  /** The CRAM deck this offshoot/pitch hangs off (DeckDef.id, same topic). Meaningless when lane
   *  is absent/cram. One level deep by construction — setDeckLane refuses a non-cram parent. */
  branchFrom?: string;
  /** PEDAGOGY TIER (player-v2/planner-config.ts:9-13 asked for this home). Declared so the deck's
   *  schema is in one place; NO writer and NO reader yet — wiring it changes what the planner
   *  serves. Student-facing phrase for b_to_a is "Take it to an A", never the token. */
  priorityTier?: "easy" | "core" | "b_to_a";
  /** SPLIT PROVENANCE (lib/split-set.functions.ts:113,136) — where a piece came from / what a
   *  parent was cut into. Provenance only; never pedagogy. Declared here, written there. */
  splitFrom?: string;
  splitInto?: string[];
  /** The idea this deck was minted from (strategy.functions.ts). Provenance. */
  ideaId?: string;
  /** THE BLAST OFF PLAN (lib/blastoff.functions.ts saveBlastPlan) — typed loosely on purpose:
   *  the plan schema is blastoff-frame-schema.ts's, validated at the read. */
  blastOff?: { frames: unknown[]; updatedAt: string; layout?: "pass1" | "pass2" };
```
Add `import type { DeckLane } from "@/lib/deck-lane";` at the top of `types.ts`. This is
"additive fields OK" under the protected-zone rule; touch nothing else in the file.

### 4.3 `BoothSetInfo` — `src/lib/talkthrough.functions.ts:256`

```ts
export interface BoothSetInfo {
  id: string; name: string; ceqs: BoothCeq[]; liveCount: number; draftCount: number;
  /** Cram map (docs/DESIGN-CRAM-MAP.md). Absent = cram. Only ever one of DECK_LANES. */
  lane?: DeckLane;
  branchFrom?: string;
  splitFrom?: string;
  splitInto?: string[];
  ideaId?: string;
}
```
Widen the cast at `:273` to include the five fields; at `:298-302` push them **only when present
and well-formed** (`isDeckLane(d.lane) ? { lane: d.lane } : {}`, `typeof d.branchFrom ===
"string"`, `Array.isArray(d.splitInto)`), so a set with none of them is byte-identical to today
and the existing test fixture (`v3-topic-groups.test.ts:8`, five fields) still compiles.

### 4.4 `RawDeck` — `src/lib/student.functions.ts:56`

Add `lane?: unknown; branchFrom?: unknown` to the type only, so S9 and `fetchOffshootsFor` can
read them without a cast. No behaviour change in `fetchStudentTree` (S9 is separate).

### 4.5 A minted offshoot/pitch deck (what `blastOffIdeaShort` writes)

Same shape as the strategy deck (`strategy.functions.ts:108-115`) plus:

```ts
lane: "offshoot" | "pitch",
branchFrom: <parent DeckDef.id>,
topicId: <parent.topicId>,          // same chapter as the cram deck — /v3/<topic> lists it
courseId: parent.courseId ?? null,
sortOrder: (parent.sortOrder ?? 9999) + 0.5,   // right after its parent on /v3/<topic>; not on the path
ideaId?: <idea.id>,                 // only when minted from an idea
status: "live", parked: false, access: "free",
blastOff: { frames, updatedAt: now, layout: "pass2" },
```
Scene row: `name: "<topicName> · <name>"`, `chapter_id: parent.topicId`,
`nodes_json: { nodes: [], edges: [], zones: [], decks: [deck], lane, branchFrom, ideaId? }` —
mirror of `:116-122` with `strategy: true` replaced by `lane`.

### 4.6 The idea, when minted from one — `ideas.context` (jsonb, no migration)

`deckId`, `deckPath`, `deckAt` exactly as `:125-127`, plus `deckLane: "offshoot" | "pitch"` and
`branchFrom`. **Not `lane`** (§2, name collision).

### 4.7 A student request — one `campus_waitlist` row via `submitIntake`

```ts
{ kind: "question", source: "offshoot-request", sourcePath: `offshoot:${deckId}`,
  topic: topic.name, chapter: set.name,            // the cram set they were watching
  note: `Wants the deeper video: ${offshoot.name}`,
  email: <known or typed>, campusName, campusSlug, skipConfirmation: true }
```
`source_path` is the grouping key (`offshoot:<deckId>`), the way `ceq:` is for questions.
`skipConfirmation: true` in v1: the `question` confirmation template was written for a typed
question, and Lee answers requests privately by email anyway (§1). The founder alert still fires
(`intake.server.ts:75`).

---

## 5. Server functions

### 5.1 `setDeckLane` — `src/lib/blastoff.functions.ts` (RISKY tier)

```ts
export const setDeckLane = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    setId: z.string().min(1).max(120),
    lane: z.enum(DECK_LANES),
    branchFrom: z.string().min(1).max(120).nullable().optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; lane: DeckLane; branchFrom: string | null }> => { ... });
```
Body, in order: `assertAdmin()`; `loadDecksDeduped`; the set must exist ("set not found");
if `lane !== "cram"`: `branchFrom` required ("an offshoot needs the cram set it hangs off"),
parent must exist, be live and unparked, have `laneOf(parent) === "cram"` ("branch from a cram
set, not another offshoot"), share `topicId` ("same topic only"), and not be the set itself.
Then the `saveBlastPlan` read-modify-write (`:118-128`): read the scene fresh, find the deck, and
either `delete deck.lane; delete deck.branchFrom` (cram) or set both; bump `updatedAt`; update.
Throw on every failure; never write a partial state.

Client: a `useDeckLane(set)` hook is unnecessary — call it directly and `refreshBank()` on
success, the `SplitPanel.tsx:85-86` shape.

### 5.2 `blastOffIdeaShort` — `src/lib/strategy.functions.ts` (RISKY tier)

```ts
export const blastOffIdeaShort = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    ideaId: z.string().min(1).max(80).optional(),
    title: z.string().trim().min(1).max(120).optional(),
    lane: z.enum(["offshoot", "pitch"]),
    branchFrom: z.string().min(1).max(120),
  }).refine((x) => !!x.ideaId || !!x.title, { message: "an idea or a title" }).parse(d))
  .handler(async ({ data }): Promise<{ deckId: string; path: string; created: boolean }> => { ... });
```
Body: `assertAdmin()`; parent checks as in 5.1 (plus `parent.topicId` non-null: "the cram set has
no topic — assign it in the Studio first"); topic name from `chapters` the way
`split-set.functions.ts:76-78` does; if `ideaId`: read the idea, and if `ctx.deckId` still
resolves return `{ created: false }` (the `:97-102` idempotency); `name = idea.title | title`;
`frames = planFramesForShort(idea ?? { title: name, context: {}, body: "" })` (a title-only mint
yields open / intro / bio / outro — Brainstorm fills it); deck from `shortDeck(...)` (5.3); scene
insert; idea context write (4.6); return the `/v3/<topic>/<set>/blast-off` path.

The **strategy check stays in `blastOffStrategyShort`** (`:92`); this function does not read
`ctx.strategy`. Do not make one function do both — the chapter, the lane and the parent rules
differ, and the strategy board must keep working byte-for-byte.

### 5.3 `shortDeck` — `src/lib/short-deck.ts` (new, pure, tested)

Extract the deck literal at `strategy.functions.ts:108-115` into
`shortDeck({ id, name, topicId, courseId, frames, now, lane?, branchFrom?, ideaId?, sortOrder? })`
returning the deck object, with the optional fields included only when given. Both minters call
it. The strategy path's output must be identical to today except for the added `ideaId`
(test-pinned in §9).

### 5.4 `blastOffStrategyShort` — one-line change

At `:108-115` (now via `shortDeck`), pass `ideaId: idea.id`. Nothing else changes.

### 5.5 `loadBoothBank` — carry the fields (§4.3)

### 5.6 `listOffshootRequests` — `src/lib/practice.functions.ts` (admin)

```ts
export const listOffshootRequests = createServerFn({ method: "GET" })
  .handler(async (): Promise<Record<string, number>> => { ... });   // deckId → count
```
`assertAdmin()`; `db.from("campus_waitlist").select("source_path").eq("kind", "question")
.eq("source", "offshoot-request").like("source_path", "offshoot:%")`, mirroring `:146-150`
(including the same `is_test` handling it uses); split on `:` and count. The map treats a
rejection as "no signal", the way the queue treats `listBlastPlanSetIds`.

### 5.7 `fetchOffshootsFor` — `src/lib/student.functions.ts` (public, minimal)

```ts
export const fetchOffshootsFor = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ setId: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }): Promise<{ id: string; name: string }[]> => { ... });
```
`loadDecksDeduped` → `liveDecks` → `laneOf(d) === "offshoot" && d.branchFrom === setId &&
!shippedPub(d, "blast")` → `{ id, name: setName(d.name) }` sorted by `sortOrder`, max 8. Names
only — never stems, never draft content. Pitch decks are never requestable.

---

## 6. UI

### 6.1 Lane picker — `/v3/$topic/$set` (`src/routes/v3.$topic.$set.index.tsx`)

Directly under `TemplatePicker` (`:62`), the same idiom (`:84-100`: uppercase label, a `<select>`,
a `saving` word, one line of hint). Options: `Cram path` / `Offshoot of…` / `Pitch off…`; choosing
either branch reveals a second select of the topic's cram sets (`topic.sets` filtered by
`laneOf`, in `orderedSets` order, excluding this set). Save immediately via `setDeckLane`, then
`refreshBank()`. When the set has cards (`set.liveCount + set.draftCount > 0`) and a branch lane is
chosen, show one warning line: "This set has cards — until the student-side filter lands it still
shows on /learn. Ask before marking it." That warning is the whole of §3.8 in the UI.

Also: one small lane chip (`offshoot` / `pitch`, muted, uppercase like the stage chip) next to the
`N q` count on `/v3` rows (`v3.index.tsx:165`) and on `/v3/$topic` rows. Cram sets get no chip.

### 6.2 `/v3/map` — `src/routes/v3.map.tsx`

Route shape = `v3.post.tsx:65-68`: `createFileRoute("/v3/map")`, `<AdminGate>`, noindex,
`<V3Shell wide crumbs={[{label:"V3",to:"/v3"},{label:"Map"}]}>`. Register in `IGNORED_ROUTES`
next to `v3.post.tsx` with the note `"V3 map (AdminGate, noindex) — cram path vs offshoots per
topic, added 2026-09-xx (docs/DESIGN-CRAM-MAP.md)"`.

Data on mount, all best-effort like `/v3` (`v3.index.tsx:84-95`): `useBank()`, `startTT` +
`subscribeTT` + `subscribeReview` for `talkStageOf`, `listBlastPlanSetIds` (also gives per-set
frame counts for the runtime chip), `productionBottleneckReport`, `listPublishStatuses`,
`listOffshootRequests`. `stageFor(set)` exactly as `v3.index.tsx:96-99`.

Body: for each topic with `kind !== "strategy"`, a `<section>` with the topic name (linked to
`/v3/$topic`) and a `<LaneMap>`; a topic with no cram sets says so. One quiet line at the foot:
"Strategy shorts are on the strategy board →" (`/admin/ideas/strategy`). Wide content scrolls
inside its own `overflow-x: auto` container; the page never scrolls horizontally.

Links to it: one line under "The queue — Blast Offs" on `/v3` ("The map — cram path, pitches,
offshoots →", the `v3.index.tsx:214` idiom) and one on `/v3/$topic` header ("Map →",
`/v3/map#<topic-slug>`). Not in `Shell.tsx`.

### 6.3 `src/components/v3/lane-map.ts` — pure layout (tested)

```ts
export interface LaneNode { id: string; name: string; lane: DeckLane; col: 0 | 1 | 2; row: number; sub: number; orphan: boolean }
export interface LaneEdge { from: string; to: string; kind: "branch" | "split" }
export interface LaneLayout { nodes: LaneNode[]; edges: LaneEdge[]; rows: number; orphans: number }
export function layoutLanes(order: readonly BoothSetInfo[]): LaneLayout
```
`order` = `orderedSets(slugOf(topic.name), topic.sets)`. Rules:
- cram sets → `col 1`, `row` = index among cram sets, `sub 0`;
- pitch → `col 0`, offshoot → `col 2`, `row` = the parent's row, `sub` = k-th child on that side
  (children ordered as `order` lists them);
- a branch whose `branchFrom` is missing, not in this topic, or not a cram set → `orphan: true`,
  drawn in one extra bottom row (dashed), never hidden and never thrown on;
- edges: `branch` parent→child for every non-orphan branch; `split` parent→piece for every
  `splitInto` id present in `order`;
- `rows` = cram count; `orphans` = orphan count. Deterministic; no Date, no random.

### 6.4 `src/components/v3/LaneMap.tsx` — pure SVG

```ts
export function LaneMap({ layout, stage, runtime, asks, selected, onSelect, w = 960 }: {
  layout: LaneLayout;
  stage: (setId: string) => StageInfo;                 // stageOf, from the page
  runtime?: (setId: string) => string | null;          // "0:48–1:48" or null
  asks?: Record<string, number>;                       // offshoot deckId → requests
  selected: string | null; onSelect: (setId: string) => void;
  w?: number;
}): JSX.Element
```
Geometry: three columns at `w/3` each; node box `220 × 44` centred in its column; `rowH = 64`;
children on the same row stack downward by `sub * 50` and the row grows to fit the tallest side;
the orphan row sits below a dashed hairline. Edges are cubic curves from the cram node's left edge
(pitch) or right edge (offshoot) to the child's near edge; `split` edges are dashed and vertical
between cram siblings. Node fill `${info.color}22`, stroke `info.color` 1 px (`MapSchematic.tsx:72`);
selected → gold 1.5 px (`:86`). Text: name truncated to the box (`:74`), then a second line:
`stage.label · N q · 0:48–1:48` (strategy-style "short" when `liveCount === 0`), and on offshoot
nodes `· N asked` in gold when `asks[id] > 0`. Runtime = `fmtRange(estimatedLengthSeconds(...))`
(`film-summary.ts:29-37`) over the set's non-skipped frame count from `listBlastPlanSetIds`
(`takes[].frames` summed); null when there is no plan. `role="img"` + `aria-label` like `:47`.

Hoisted `function` declarations only; imports: `react` types, `@/lib/deck-lane`, `./lane-map`,
`./set-stage` (types), `./Shell` (colours). Nothing from `canvas/` or `blastoff/cluster/`.

### 6.5 The side panel (HTML, beside the SVG, on the selected node)

Name → link to `/v3/$topic/$set`; `<StageChip info>`; the four step links (the `STEP_BUTTONS`
list in `v3.index.tsx:59-71` — copy the four entries into `components/v3/step-buttons.ts` and
import it from both places, or copy them inline if that lift is out of scope); lane + parent
name; on a cram node: `+ offshoot` and `+ pitch`; on an offshoot node: `N asked` linking to
`/outreach/demand`.

`+ offshoot` / `+ pitch`: an inline title input in the panel (not `window.prompt`; Lee's taste is
contained detail views), Enter → `blastOffIdeaShort({ data: { title, lane, branchFrom } })` →
`refreshBank()` → the map re-reads → the new node is selected → "Brainstorm it →"
(`blastOffPath(topic, newSet, "talkthrough")`). Errors render in the panel. No navigation.
When P4's Ctrl+I shorts land, the same panel can offer "from an idea…" passing `ideaId` instead
of `title` — the server function already accepts it; do not wait for P4.

### 6.6 Student row — `src/components/learn/CramPlayer.tsx` (S8, with Lee present)

Under the Ask Lee button row (`:104-111`), when `fetchOffshootsFor({ setId: set.id })` returns
anything: a heading in Lee's words — placeholder copy `Want this one? Tell me` — and one button
per offshoot name. Click: if `readStudentEmail()` is null, show the same contact input the
`AskLee` panel uses (`:302-`) first; then `submitIntake` with the §4.7 row; then "Got it. I make
these on request and I'll email you." No price anywhere (§1, THE ASK IS FREE). Demo mode
(`demo`) never sends, same as `:315`. Copy is Lee's to edit before it ships.

---

## 7. Migration SQL

**None.** Everything is scene JSON (`canvas_scenes.nodes_json`), `ideas.context` (jsonb), and
`campus_waitlist` rows the intake already writes.

**SQL LEE MUST RUN: none.**

If a later slice ever needs one (an index on `campus_waitlist (source, source_path)` is not
needed at today's volume — do not add it speculatively), name it `20260909_HHMM_<concern>.sql`
after a true high-water check, one concern per file, idempotent, `BEGIN…COMMIT`, ending in a
`SELECT` that proves it (`docs/SESSION-CONTEXT.md:65-80`). Never auto-run.

---

## 8. Build order — small, verifiable slices

Run `bunx tsc --noEmit` and the named tests after every slice; the full build once at the end.
Tiers per `CLAUDE.md`: S1–S3, S7, S9 are RISKY (serialization-adjacent, data) — commit per slice,
suite after each; the rest STANDARD.

**S0 — docs.** Add the "superseded by" line to `docs/PROMPT-VIDEO-MAP.md`. Verify: diff is one line.

**S1 — types + bank carry.** `deck-lane.ts`; `DeckDef` fields (§4.2); `BoothSetInfo` fields +
`loadBoothBank` cast/push (§4.3); `RawDeck` typing (§4.4). Tests: `deck-lane.test.ts`;
`bun test src/lib/v3-topic-groups.test.ts src/components/v3 src/components/canvas/tdz-graph.test.ts
src/components/canvas/import-cycles.test.ts`. Verify: `/v3` renders byte-identical (no set has the
fields yet).

**S2 — `setDeckLane` + lane picker + chips.** §5.1, §6.1. Verify by hand on a zero-card test set
(or a strategy short — the parent rule will refuse it, which is itself a check): pick Offshoot of
X → reload → the chip shows; pick Cram path → the field is gone from `nodes_json` (read the row).
Confirm `/learn` is unchanged.

**S3 — `shortDeck` + `blastOffIdeaShort` + `ideaId` on strategy decks.** §5.2–5.4. Tests:
`short-deck.test.ts`. Verify: blast off a strategy short from the board — same behaviour, deck now
carries `ideaId`; call `blastOffIdeaShort` from the console with a title on a cram set → a new set
appears under that topic on `/v3/<topic>` with the chip, and not on `/learn`.

**S4 — pure layout.** `lane-map.ts` + `lane-map.test.ts`. No UI yet.

**S5 — `/v3/map` + `LaneMap` (read-only).** §6.2–6.4 without the panel's mint buttons; manifest
entry; links from `/v3` and `/v3/$topic`; `lane-map-source.test.ts`; `manifest.coverage.test.ts`
green. Verify: every exam topic draws; the S3 offshoot hangs off its parent on the right; a
`splitInto` pair (Account classification's pieces, if the parent is still live) shows a dashed
split edge; colours match the queue's chips row for row.

**S6 — mint from the map.** §6.5. Verify: `+ offshoot` on a cram node → new node selected,
"Brainstorm it →" opens the booth on it; a second click with the same title mints a second deck
(titles are not idempotent — only ideas are; say so in the panel).

**S7 — request counts.** `listOffshootRequests` + `asks` on the map. Verify with a hand-inserted
`campus_waitlist` row (`is_test: true`) — the node says `1 asked`.

**S8 — the student row (with Lee).** `fetchOffshootsFor` + §6.6. Verify on `/learn` with a set
that has an unshipped offshoot: the row shows, one click writes the row (check `campus_waitlist`),
the founder alert arrives, no confirmation email goes out. Copy signed off by Lee.

**S9 — student-side lane filter (with Lee, explicit yes).** After `student.functions.ts:197`:
`if (laneOf(d) !== "cram") continue;`. Verify: a carded set marked offshoot leaves the `/learn`
outline; every cram set stays; `fetchSetPractice`/`getSetPlayback` for the offshoot still work by
id (they are not tree-gated). Remove the S2 warning line once this ships.

---

## 9. Tests to write

- `src/lib/deck-lane.test.ts` — `laneOf`: absent → cram; `null` → cram; `"pitch"` → pitch;
  `"CRAM"`, `42`, `"review"` → cram. `isDeckLane` on each.
- `src/lib/short-deck.test.ts` — strategy call (no lane) produces exactly the key set of
  `strategy.functions.ts:108-115` plus `ideaId`; offshoot call adds `lane`, `branchFrom`,
  `sortOrder`; no `lane` key when not given (absent, not `undefined`-valued — JSON must not carry
  it); `status: "live"`, `parked: false`, `blastOff.layout: "pass2"` always.
- `src/components/v3/lane-map.test.ts` — cram rows follow input order; pitch → col 0 and offshoot
  → col 2 at the parent's row; two offshoots on one parent → `sub` 0 and 1 in input order; a
  branch pointing at a set outside the list → orphan row, `orphans === 1`, no edge; a branch
  pointing at an offshoot (nesting) → orphan, never a throw; `splitInto` edge only for ids present;
  empty input → `rows 0`, no nodes; the fixture is `v3-topic-groups.test.ts:8`'s `set()` helper
  extended with the optional fields.
- `src/components/v3/lane-map-source.test.ts` — reads `LaneMap.tsx`, `lane-map.ts`,
  `src/routes/v3.map.tsx` as text (CRLF-normalised, the `tdz-graph.test.ts:36-38` idiom): no
  `@xyflow`, `reactflow`, `@/components/canvas/`, `@/components/blastoff/cluster/`,
  `account-registry` imports; zero module-scope arrow callables using the exact regex at
  `tdz-graph.test.ts:73`.
- Existing suites that must stay green without edits: `v3-topic-groups.test.ts`,
  `set-stage.test.ts`, `tdz-graph.test.ts`, `tdz-hazards.test.ts`, `import-cycles.test.ts`,
  `manifest.coverage.test.ts` (green once `v3.map.tsx` is ignored).
- Server functions have no DB tests in this repo; each slice above names its hand verification.
  Do not write a mocked-Supabase test — it would prove the mock.

---

## 10. Do not build (and why)

1. **`video_links` table** (`PROMPT-VIDEO-MAP.md:41-57`) — §3.1. A field, not a table; no SQL.
2. **ReactFlow anywhere under `/v3`** — protected by intent since V3 began; bundle weight; the
   TDZ ratchet. The source test in §9 makes it fail loudly.
3. **`cramOrder`** — §3.3. `sortOrder` already is the order; two orders diverge.
4. **`lane: "pitch"` on strategy shorts** — §3.6. Wrong semantics, orphan clutter.
5. **Any change to `v3-topic-groups.ts`** — the map does not need it; `ideaId` on the deck is the
   seam for a later switch off slug matching.
6. **Unifying the `ideas` table and the canvas `idea_notes` bank** — a data migration across two
   tables; nothing here depends on it.
7. **Student-side changes unattended** — S8 and S9 change what students see (`CLAUDE.md`). Lee
   present, explicit yes, copy his.
8. **Shipped-offshoot playback on `/learn`** — depends on P11's `shorts[]` / public Mux policy
   (`designs.md §3`). The map and the request row are worth building before it.
9. **Drag on the map** (reorder the path, re-parent an offshoot) — a pointer-events layer over
   SVG for no tonight value; `sortOrder` reorder lives in the outline; re-parent is the lane picker.
10. **Conversion/performance numbers on pitch nodes** — `PROMPT-VIDEO-MAP.md:86`: "Do NOT
    fabricate conversion numbers." Leave `asks` as the only count; no `metrics` field until a real
    source exists.
11. **Nesting (offshoot of an offshoot)** — refused server-side (§3.7). Do not add a fourth column.
12. **Auto-navigating after a mint** — §3.11.
13. **Writing lane from the map in v1** — the picker on the set door is the writer; the map reads
    and mints. Fewer writers, fewer races with an open Studio tab (scene writes are
    read-modify-write, last write wins).
14. **Backfilling `lane: "cram"` onto existing sets** — absent already means cram; a backfill is
    a scene rewrite of every set for nothing.
15. **A mocked-Supabase test for the server functions** — §9.

---

## 11. Open questions for Lee (do not guess)

1. Should a one-click "want this one" page him immediately (it will — `question` is a PRIORITY
   kind) or roll into the Sunday digest? If digest, that is a new intake kind, not a source tag.
2. The student row's copy (§6.6 placeholder is his phrase from the brief).
3. Should pitch decks be listed on `/v3/$topic` and the queue at all, or only on the map? v1 lists
   them with a chip; hiding them is a one-line filter later.
4. Whether a minted offshoot should default to `access: "free"` (v1) or inherit the parent's.

---

## 12. Verification, end of session

```
bunx tsc --noEmit
bun test src/lib src/components/v3 src/components/canvas/tdz-graph.test.ts src/components/canvas/tdz-hazards.test.ts src/components/canvas/import-cycles.test.ts src/lib/site-qa
NODE_OPTIONS=--max-old-space-size=6144 bun run build     # once, at the end
```
Report per slice: pass / fail / stubbed; "SQL LEE MUST RUN: none"; anything decided that this doc
left open (§11), and how.
