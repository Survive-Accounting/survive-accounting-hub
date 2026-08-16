# Stitches & Publications — the layer between takes and Mux

**Status: PLAN ONLY. Nothing in this document has been migrated or built.**
Report-first per the prompt: the data model and the migration mapping are below,
with a dry-run design. Nothing runs until Lee approves.

Vocabulary, slotted into the locked set:
**takes are captured · stitches are cut · publications are shipped.**
(Sets are still *filmed*; topics are still *sold*. Nothing existing is renamed.)

---

## 0. What exists today, exactly

This matters because the gap is narrower than it looks — the *edit* already
happens, it just isn't a record.

| Thing | Where it lives now | Persisted? |
|---|---|---|
| A raw clip | `TakeRef` — `types.ts:330`: `url`, `path` (unique, in `canvas-media`), `duration`, `role`, `momentId`, `slateEndMs`, `coversFrameIds`, `refs` | ✅ scene JSON |
| A CEQ's clip stack | `CeqCard.takes?: TakeRef[]` (legacy `take` read as a one-item list) | ✅ scene JSON |
| Set-level slots | `CeqStudioPrefs.globalIntro/globalOutro/frontBumpers/backBumpers/transition`, `DeckDef.lookback`, `wrap` | ✅ prefs / deck |
| A dissect CEQ's baked stitch | `CeqCard.stitched?: TakeRef` + `DissectMoment.startMs` | ✅ — but only the **output**, never the recipe |
| **THE EDIT (free / full)** | `stitchFree` / `stitchFull`, recomputed every render by `resolveCeqConcat` | ❌ **nothing persists it** |
| **THE SHIPPING DECISION** | smeared across the *lesson node*: `muxAssetId`, `muxPlaybackId`, `muxPublishedAt`, `muxDurationS`, `status`, `ceqManifest[]`, `videoCourse/Chapter` | ❌ one lesson = one video, so one edit cannot ship twice |
| Trim / gap / loudness decisions | only as **arguments** to the worker call (`heads`, `trims`, `gapMs`, `silenceDb`) — gone the moment the job returns | ❌ |

So: **the stitch exists but is recomputed, and the publication exists but is a
projection onto one lesson.** Both need to become records.

---

## 1. Data model

### 1.1 Where it is stored — and why not SQL

Repo law: migrations are manual-apply, and additive authoring data has always
gone to scene JSON. Stitches and publications are authoring records scoped to a
set, so they live on `DeckDef`, alongside `layout`, `profile`, `lookback`:

```ts
DeckDef.stitches?: StitchDef[]
DeckDef.publications?: PublicationDef[]
```

**No DDL, no migration file, no student-side risk.**

The one hard constraint: the student site reads `lesson.muxPlaybackId`. So a
publication does **not** replace those fields — when a publication ships, it
*writes* them. The lesson fields stay exactly as they are today (the shipped
projection); the publication becomes the richer record behind them. Nothing on
the student read path changes, which is what keeps this migration safe.

### 1.2 `StitchDef` — the edit, as a recipe over immutable takes

```ts
export interface StitchItem {
  /** → TakeRef.path. The storage path is already unique and durable, so takes
   *  need no new id and no migration to acquire one. */
  takePath: string;
  /** DEFAULTS, not bakes: undefined ⇒ slateEndMs/1000, else silence detection.
   *  A number here is Lee's explicit override and always wins. */
  trimInS?: number;
  trimOutS?: number;
  gapAfterMs?: number;
  /** What this clip covers — drives chapters. */
  ceqId?: string;
  momentId?: string;
  /** Dropped from the cut WITHOUT losing the decision (§ "never destructive"). */
  muted?: boolean;
}

export interface StitchDef {
  id: string;                    // "st_…"
  scope:
    | { kind: "ceq"; ceqId: string }
    | { kind: "run"; run: string }
    | { kind: "set" };
  label?: string;
  items: StitchItem[];           // ordered — THE EDIT
  audio?: {
    roomTonePath?: string;
    gapMs?: number;              // base inter-clip gap
    jitterMs?: number;           // deterministic jitter (dissect-stitch.ts)
    crossfadeMs?: number;        // micro-crossfade
    loudnessLufs?: number;       // loudnorm target
  };
  /** CACHE of the last cut. NEVER authoritative over `items` — re-cutting with
   *  different settings is always possible because the takes are immutable and
   *  the recipe is what's stored. */
  cut?: {
    at: number;
    totalS: number;
    chapters: { ceqId?: string; momentId?: string; start: number; end: number }[];
    asset?: TakeRef;
  };
  /** Bumps on EVERY re-cut. Publications carry the rev they rendered from; a
   *  mismatch is the STALE signal (§1.4). */
  rev: number;
}
```

`rev` is the whole staleness mechanism, and it is one integer — no timestamps to
get confused by, no content hashing to get wrong.

### 1.3 `PublicationDef` — the shipping decision

```ts
export interface PublicationDef {
  id: string;                    // "pb_…"
  stitchId: string;
  stitchRev: number;             // rev at render time → STALE when stitch.rev > this
  kind: "blast" | "short" | "lookback";
  destinations: ("site" | "youtube")[];
  framing: "16:9" | "9:16";
  reframeId?: string;            // REQUIRED for 9:16 (§2)
  state: "draft" | "rendered" | "shipped";
  meta: {
    title?: string;
    description?: string;
    chapters?: { t: number; label: string }[];
  };
  render?: { at: number; muxAssetId?: string; muxPlaybackId?: string; durationS?: number };
  shipped?: {
    at: number;
    lessonId?: string;           // site: which lesson it wrote
    access?: "FREE" | "PAID";
    youtubeUrl?: string;
  };
  /** Every gate Lee clicked past, recorded. A blocked publish that ships anyway
   *  leaves a trail. */
  overrides?: { gateId: string; at: number; why?: string }[];
}
```

One stitch → many publications: the same set-level edit becomes a `blast` (site,
16:9) and a `short` (youtube, 9:16) without re-cutting.

### 1.4 Migration mapping — the table, before anything runs

Nothing is deleted or moved. Every row **adds** a record that points at data
that stays exactly where it is.

| Today | Becomes | Rule |
|---|---|---|
| `CeqCard.take` (legacy single) | already read as `takes[0]` | untouched |
| `CeqCard.takes[]` (n clips) | one `StitchDef{scope:ceq, rev:1}`, one `StitchItem` per take in order | trims left `undefined` (⇒ slate/detect). **`takes[]` is not modified.** "Existing attached takes become stitches of one" — n=1 is the common case |
| `CeqCard.stitched` + `dissect.moments[].startMs` | `StitchDef{scope:ceq}` with `cut.asset` = the already-baked asset and `cut.chapters` from the moment offsets, `rev:1` | preserves the bake so **nothing re-renders on migration** |
| `DeckDef.lookback` clip | `StitchDef{scope:set, label:"lookback"}` + `PublicationDef{kind:"lookback"}` | |
| set slots: `globalIntro`, `frontBumpers[]`, `transition`, `backBumpers[]`, `globalOutro`, `wrap` | items inside the `scope:set` blast stitch, role-tagged | mirrors what `resolveCeqConcat` already assembles |
| a PUBLISHED lesson (`muxAssetId`, `muxPlaybackId`, `muxPublishedAt`, `muxDurationS`, `ceqManifest[]`) — one per access tier | one `PublicationDef{kind:"blast", destinations:["site"], framing:"16:9", state:"shipped"}` per lesson; `render.mux*` from the lesson, `shipped.lessonId/access`, `meta.chapters` from `ceqManifest` | **lesson fields stay** — they remain the student read path |

Counts I will print in the dry run, per set and in total:
`sets · ceq-stitches · set-stitches · publications · lessons matched · lessons with mux but no set (orphans)`

**Dry run design:** a `Migrate ▸ Stitches (dry run)` action that walks every deck
in the open scene, builds the records **in memory only**, and renders the table
above plus every orphan it could not map. It writes nothing and touches no node.
Only a second, separate `Apply` button commits — through `patchDataCmd`, so one
Ctrl+Z undoes it.

### 1.5 Staleness (§1.4 of the prompt)

- Re-cutting a stitch bumps `stitch.rev`.
- Any publication with `stitchRev < stitch.rev` renders a **STALE** badge in the rail.
- Re-cut shows an explicit *"3 publications derive from this stitch — re-render which?"*
  with checkboxes. Default: **none checked.**
- Nothing auto-renders, nothing auto-publishes, and a shipped asset is never
  silently left out of date — the badge is permanent until re-rendered or dismissed
  with a recorded reason.

---

## 2. Framing — one stitch, two publications

A naive center crop loses the CEQ card (center-left) *and* the cutout
(bottom-right). So a `9:16` publication carries an **authored reframe**, saved
and reusable:

```ts
export interface ReframeDef {
  id: string; name: string;
  framing: "9:16";
  /** Composite, not crop: each slot takes a REGION of the 1920×1080 source and
   *  places it into the 1080×1920 canvas. Two crops stacked ≠ one center crop. */
  slots: { role: "card" | "camera"; src: Rect; dst: Rect }[];
  background?: string;
}
type Rect = { x: number; y: number; w: number; h: number };
```

- Stored in `CeqStudioPrefs.reframes[]` — **cross-set**, so the second short costs
  one click, not one design session.
- Rendered by a new worker stage `vertical_reframe`, fed the stitch's **source
  takes** — `crop` ×2 → `scale` → composite onto 1080×1920. It never reads the
  horizontal render, never upscales, never letterboxes.
- A `9:16` publication with `reframeId` unset **blocks the render** with
  *"this short has no reframe — author one, or pick a saved one."* No auto-crop
  path exists in the code at all, so there is nothing to accidentally fall back to.

---

## 3. Publish gate

One pure function, unit-testable, no side effects:

```ts
publishGate(pub, stitch, ctx): { id: string; level: "block" | "confirm"; text: string }[]
```

`block` = cannot proceed without an explicit override click (recorded in
`pub.overrides`). `confirm` = a checkbox Lee ticks, used where the machine
genuinely cannot verify.

| Applies to | id | Level | Rule |
|---|---|---|---|
| `kind:"short"` | `short/no-solved-je` | **confirm** | *"Confirm: no legible solved journal entry is visible."* Prompted, never guessed — the prompt is explicit that this cannot be automated |
| `kind:"short"` | `short/rip-at-end` | block | the rip must be the **final** item in the stitch |
| `kind:"short"` | `short/duration` | block | total outside **22–30s** |
| `dest:"youtube"` | `yt/title` | block | title present |
| `dest:"youtube"` | `yt/description` | block | description present **and** contains `surviveaccounting.com` |
| `dest:"youtube"` | `yt/chapters` | block | stitch has `cut.chapters` but `meta.chapters` is empty |
| `dest:"site"` | `site/attached` | block | resolves to a CEQ / run / set and a `lessonId` |
| `dest:"site"` | `site/tier` | block | free-vs-paid `access` explicitly set |
| all | `all/no-baked-watermark` | block | the render plan contains no watermark filter |

**`all/no-baked-watermark` — the one place the prompt and the pipeline collide,
flagged rather than quietly resolved.** Color/LUT and the slate trim bake;
brand overlays do not. On `site` that works: our player composites the watermark
in the DOM. On `youtube` there is no overlay layer we control — so a YouTube
publication either ships **unwatermarked** or the rule needs an exception for it.
**Assumption I will build under unless told otherwise: YouTube ships
unwatermarked, and the gate raises a `confirm` (not a block) saying so.** This is
the one open question in the plan.

---

## 4. Lookbacks

A lookback is its own filming pass: a `StitchDef{scope:"set"}` created **empty**
and filmed into, published as `kind:"lookback"`. It is not derived from the blast
stitch, and there will be no action anywhere that seeds one from blast material —
the absence of that path is the enforcement.

---

## 5. UI — inside the merged rail, not a new area

Everything lands in the Filming Mode take/publish rail (F2), which already merges
the Takes Inbox with the per-CEQ clip list:

```
CEQ / RUN / SET
 └ STITCH  "blast · 6 clips · 4:12"        [preview] [re-cut]
    ├ PUBLICATION  blast · site · 16:9 · shipped
    └ PUBLICATION  short · youtube · 9:16 · rendered   ⚠ STALE
```

- Every stitch previews **locally before any upload** (reuses the F3 stitch-preview surface).
- Creating a publication from a stitch is one action; **`blast` (site, 16:9) is a
  single click** with everything defaulted.
- Local originals always survive. Nothing auto-publishes.

---

## 6. Build order (once approved)

1. Types + pure helpers (`stitch-defs.ts`): `newStitch`, `stitchItemsFrom`, `isStale`, `publishGate`, `migrationPlan` — all unit-tested, zero UI.
2. The dry-run migration report (writes nothing).
3. Apply, behind `patchDataCmd` (one Ctrl+Z).
4. Rail UI (stitches → publications), reusing the F3 preview.
5. `vertical_reframe` worker stage + the reframe editor.
6. Publish gate wired into the ship action.

Steps 1–2 are safe to build before any decision, because neither writes anything.
