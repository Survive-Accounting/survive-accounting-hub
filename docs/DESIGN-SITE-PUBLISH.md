# DESIGN — "Posted to the website": from a captioned MP4 in storage to a student watching it on /learn

Status: **design only, nothing built.** Written 2026-09-09 against `film/free-camera-pinned-ceq`
at `749f1189` (which is also `origin/main` at the time of writing). Every `file:line` below was
read in that tree; re-verify the numbers before editing, because P1/P2/P6 all touch neighbouring
files and will shift them.

This document is for a future Claude Code session with no other context. It states the goal in
Lee's words, what exists today, the data model, the server functions, the UI, the migration Lee
must run by hand, the build order in small verifiable slices, the tests, and what not to build.
Where it disagrees with the synthesized plan it was seeded from, this document is the corrected
version and says so.

---

## 1. The goal, in Lee's words

- On /v3/post: *"We need post to be ready for splits… I only did account classification > assets.
  Not the full thing."* (v3.post.tsx:103-105). A set with cuts is several videos; each is posted,
  captioned and covered on its own — and so each must be **watched** on its own.
- On the site destination: *"Site is instantly on."* (docs/PROMPT-POSTING-YOUTUBE.md, Lee's brief).
  That brief's own guardrail is the other half: *"Nothing publishes without an explicit press."*
- On /learn: *"whatever questions get pushed to the final video we film from, THOSE
  questions/slides are what we will push to /learn"* (lib/learn-plan.ts:1-3). The plan is what
  students get; the film of the plan should be too.
- On the file: *"Where do I upload the video file? Where can I add captions? I want to do this
  from the post point."* (PostProduction.tsx:3-6). Post-production is the door; the site is the
  last step behind it.

So the job: **one press on /v3/post, after the captions are burned, puts that split on
SurviveAccounting.com where a student can play it — and nothing else does.**

---

## 2. What exists today (verified)

### 2.1 The "site" destination is a checkbox

`PUBLISH_DESTINATIONS = ["site","youtube","instagram","tiktok"]` (publish-queue.functions.ts:25).
`togglePublishDestination` upserts `site_posted_at` on `set_publish_status` keyed by the publish
key (publish-queue.functions.ts:82-101, the upsert at :92-94); `setPublishUrl` stores `site_url`
(:157-173). Nothing on the student side reads this table. The row key is free text, so a split's
key `<setId>#N` already works (v3.post.tsx:128-138; the key is minted at :136).

### 2.2 What students actually play

`fetchStudentTree` (student.functions.ts:90-276) builds `StudentSet` (:23-43). The cram video is
the set's first `blast` publication with `state:"shipped"` and a `render.muxPlaybackId`
(`shippedPub`, :59-60), else the legacy `lesson_videos` row (:212). `orientation` is hard-coded
`"landscape"` on every set (:215). The player streams **unsigned** HLS —
`https://stream.mux.com/${pid}.m3u8` (CramPlayer.tsx:232) — and its poster is an unsigned
`image.mux.com` thumbnail (cram-media.ts:4). Paid sets get their id withheld in the tree and
fetched through `getSetPlayback` (entitlements.functions.ts:70-91), which uses the same
`shippedPub` pick (:84-85).

One set = one `StudentSet` = one `playbackId`. `PlayerItem` is `{ set, topic, n, of, locked }`
(CramPlayer.tsx:25); the player walks one item per set (learn.tsx:347), and when a video ends it
advances to the next **set** (CramPlayer.tsx:96). **A second split has no home on /learn.**

### 2.3 The only writers of `state:"shipped"`

- CeqStudio's 16:9 pipeline (CeqStudio.tsx:1655), through `savePub` (:1571-1576), ids
  `pb:set:<deckId>:<kind>` (:1556).
- The stitch migration planner (stitch-defs.ts:370-395) — `destinations:["site"]`,
  `framing:"16:9"`, `state:"shipped"`.

The only Blast Off writer, `attachOneTakeBlast` (talkthrough.functions.ts:644-681), creates a
**signed** Mux asset (`createAssetFromUrl`, mux.server.ts:52-61, policy at :55) and writes
`state:"draft"` (:670). Signed ids play black on the unsigned player; drafts never reach
`shippedPub`. It is a dead end twice over — but its **scene read-modify-write (:661-679) is the
exact shape to reuse**, see §4.3.

### 2.4 The publication schema

`PublicationDef` (stitch-defs.ts:80-97): `id`, `stitchId`, `stitchRev?`, `kind` (`"blast" |
"short" | "lookback"`, :75), `destinations` (`"site" | "youtube"`, :76), `framing` (`"16:9" |
"9:16"`, :77), `state`, `meta { title?, description?, chapters? }`, `render { at, muxAssetId?,
muxPlaybackId?, durationS? }`, `shipped { at, lessonId?, access?, youtubeUrl? }`. The student side
reads the looser `RawPub` (student.functions.ts:53): `{ id?, kind?, state?, render? }`.

Canvas readers are tolerant of a publication with no `stitchId`: `isStale` returns false when
`stitchRev == null` (stitch-defs.ts:130-133); the Studio finds its own by exact id (CeqStudio.tsx:
1559) and filters derived publications by `stitchId` equality (:3418), so an absent `stitchId`
simply never matches. `attachOneTakeBlast` already writes such a record.

### 2.5 Post-production: the burned URL evaporates

`PostProduction` (PostProduction.tsx:66-79) keys on `pubKey`. The take uploads to
`canvas-media/blastoff-takes/` (take-burn.ts:42-45, `stage()` at :32-39 via
`createPipelineTestStagingUpload`, publish.functions.ts:365-377). The burn runs on the Fly worker:
`startCaptionBurn` (render-worker.functions.ts:182-210) writes to
`canvas-media/blastoff-captioned/<ts>.mp4` (:194) and returns `{ jobId, path, machineId }` (:209);
`resolveWorkerRender` (:212-228) pins the poll with `fly-force-instance-id` (:219) and returns the
public URL when done (:223). The worker's job map is in-memory (worker/src/server.ts:36); the
`machineId` it returns (:261) is the only way back to a job after a redeploy of the app.

The result is `const [burnUrl, setBurnUrl] = useState<string | null>(null)` (PostProduction.tsx:
143) — React state. Close the dialog and it is gone; the file is still in storage, but nothing
knows where. The take URL (`videoUrl`, :121) and the .ass URL are the same story. The transcript
alone is durable: `take_transcripts` keyed by `shortTranscriptPath(pubKey)` =
`blastoff/<pubKey>.take` (take-transcript.ts:16), which also carries Whisper's `duration_s`
(transcribe.functions.ts:33).

### 2.6 Where the public-policy precedent lives

`publish.functions.ts:421-424` creates a Mux asset with `playback_policy: ["public"]` (:423) via
its own `muxApi` (:46-54), and `:431` picks the public playback id **by policy** rather than
`playback_ids[0]`. `startCeqConcat` does the same (:462-465). `createDirectUpload` in
mux.server.ts already takes a `playbackPolicy` option (:85, used at :91) and a
`generatedSubtitles` switch (:94). `createAssetFromUrl` has neither and has exactly one caller
(talkthrough.functions.ts:653).

### 2.7 The constraint that governs this whole design

CLAUDE.md:28-30 — *"Unattended runs: Additive only. No data-rewriting. No touching protected
zones. Nothing that changes what students see. When in doubt, do nothing and report."* Writing a
`shipped` publication changes what students see. Therefore **no code path in this design writes
one except a server function invoked by Lee's press in a browser session, gated by
`assertAdmin()`** (admin-session.functions.ts:108-118). No cron, no webhook, no "on burn done"
auto-ship. The audit found `publish.functions.ts`, `render-worker.functions.ts`,
`transcribe.functions.ts` and `talkthrough.functions.ts` have zero `assertAdmin` (that is P7's
package); the functions this design adds must not repeat the omission.

---

## 3. The five-step gap, and the decision for each

| # | Gap | Decision |
|---|-----|----------|
| 1 | The burned URL is React state | Persist it — and the take URL, .ass URL, Fly job id + machine id — on a `short_jobs` row keyed by `pub_key`, written at each transition as it happens. Reopening Post-production seeds from the row. |
| 2 | Only a signed Mux ingest exists on the Blast Off path | Extend `createAssetFromUrl(url, opts?)` with `playbackPolicy` (default `"signed"`, so `attachOneTakeBlast` is byte-for-byte unchanged) and `generatedSubtitles` (default on; off for a burned file). **Assert** a public playback id exists before writing anything student-visible. |
| 3 | No `shipped` blast publication is ever written for a Blast Off short | `publishShortToSite` + `resolveShortPublish` write `{ id:"pb:blastoff:<pubKey>", kind:"blast", state:"shipped", framing:"9:16", takeIndex, … }` onto the deck with `attachOneTakeBlast`'s read-modify-write, **replacing by id**, never appending twice. |
| 4 | Splits have no home on /learn | Model (b): `shorts[]` on `StudentSet`, fed by blast publications that carry a numeric `takeIndex`; the player walks the parts of a set before moving to the next set; `playbackId` becomes `shorts[0]` so every existing consumer keeps working. Model (a) — a split becomes its own DeckDef — is rejected: it touches scene serialization and the outline (a protected zone, CLAUDE.md:11-17), it would leak `<setId>#2` into progress rows, practice, Ask Lee and entitlements, and it would double the set count on every student surface. |
| 5 | "Posted to the website" is a manual tick | The same server function that ships the publication stamps `site_posted_at` and `site_url` (the /learn deep link). The tick stays clickable for the legacy case, but a real publish sets it. |

Portrait: the player already switches aspect on `set.orientation === "portrait"` (CramPlayer.tsx:
222, poster width at :281). Do **not** invent `render.orientation`; the schema already has
`framing: "9:16"` (stitch-defs.ts:77). The student side derives `orientation` from it.

---

## 4. Data model (all additive)

### 4.1 `short_jobs` — one row per video, the durable hopper

New table (migration in §7). This is the same table docs/DESIGN-OBS-KEEP-LOOP.md (P10) needs for
its keep → burn → post hopper. **One migration file creates it; both designs read it.** If the
P10 document names a different filename for the same table, merge the columns into one file and
delete the other — never ship two files that each `create table short_jobs`.

Columns and who writes them (this design only writes the ones marked here):

| column | type | written by (this design) |
|---|---|---|
| `pub_key` | text pk | `<setId>` or `<setId>#N` — exactly the /v3/post row key (v3.post.tsx:136) |
| `set_id` | text not null | `pubKey.split("#")[0]` |
| `take_index` | integer not null default 0 | the row's `takeIndex` (v3.post.tsx:135), 0-based |
| `state` | text not null default 'kept' | `uploaded` → `burned` → `ingesting` → `posted`, or `error` (P10 adds `kept`, `transcribed`, `copy`, `ready` in front; the column has no CHECK so it needs no migration for that — the app validates with a zod enum) |
| `take_url` | text | the public URL `uploadTake` resolves (PostProduction.tsx:132) |
| `ass_url` | text | the URL `uploadAss` resolves (:152) |
| `burn_job_id` | text | `startCaptionBurn` → `jobId` |
| `burn_machine_id` | text | `startCaptionBurn` → `machineId` (nullable) |
| `burned_url` | text | the URL `burnCaptions` resolves (:153) — **the value that evaporates today** |
| `transcript_ready_at` | timestamptz | P10 (not this design) |
| `copy_ready_at` | timestamptz | P10 (not this design) |
| `mux_asset_id` | text | `publishShortToSite` |
| `mux_playback_id` | text | `publishShortToSite` (the **public** id) |
| `duration_s` | numeric | `resolveShortPublish`, from the ready asset's `duration` (mux.server.ts:32) |
| `published_at` | timestamptz | `resolveShortPublish` when the publication is written |
| `error` | text | the last failure, verbatim from Mux/worker; cleared on the next attempt |
| `created_at`, `updated_at` | timestamptz | defaults; `updated_at` set on every upsert |

RLS enabled, no policies (deny-by-default; service-role only), the house pattern
(20260906_0200_set_publish_status.sql).

### 4.2 The publication written onto the deck

Written as a `Record<string, unknown>` (the way talkthrough.functions.ts:663 casts), not as a
`PublicationDef` — do not fake a `stitchId` (a fabricated id that happened to match a real stitch
would make CeqStudio.tsx:3418 list it as derived from that stitch). Exact shape:

```ts
{
  id: `pb:blastoff:${pubKey}`,          // stable per video → re-publish REPLACES by id
  kind: "blast",
  state: "shipped",
  destinations: ["site"],
  framing: "9:16",
  takeIndex,                            // number, 0-based; the /learn part order
  takeName,                             // the split's name at publish time, "" when unnamed
  pubKey,
  source: "blastoff",
  meta: { title, description },         // title = captions.site.title || takeTitle || set name;
                                        // description = captions.site.caption || "" (caption-brief.ts:36 limits)
  render: { at: Date.now(), muxAssetId, muxPlaybackId, durationS },
  shipped: { at: Date.now(), access: deck.access === "paid" ? "PAID" : "FREE" },
  sourcePath,                           // the canvas-media path of the burned MP4 (re-ingest source)
  createdAt: new Date().toISOString(),
}
```

`stitchRev` is deliberately absent so `isStale` (stitch-defs.ts:130-133) is false forever. The id
namespace `pb:blastoff:` cannot collide with the Studio's `pb:set:<deckId>:<kind>` (CeqStudio.tsx:
1556) or `pb:lesson:<lessonId>` (stitch-defs.ts:126).

### 4.3 The scene write: reuse `attachOneTakeBlast`'s shape, with two changes

talkthrough.functions.ts:656-679, restated so the builder does not have to open the file:

```ts
const db = await admin();                                              // :656
const { loadDecksDeduped } = await import("@/lib/student.functions");  // :657
const owned = await loadDecksDeduped(db as never);                      // :658
const o = owned.get(setId);                                             // :659
if (!o) throw new Error("set not found");                               // :660
const { data: row, error } = await db.from("canvas_scenes")
  .select("id,nodes_json").eq("id", o.sceneId).single();                // :661
if (error) rethrow(error);                                              // :662
const j = row.nodes_json as { decks?: { id: string; publications?: Record<string, unknown>[] }[] }; // :663
const deck = (j.decks ?? []).find((d2) => d2.id === setId);             // :664
if (!deck) throw new Error("deck vanished from its scene");             // :665
deck.publications ??= [];                                               // :666
deck.publications.push({ … });                                          // :667-677  ← change 1
const up = await db.from("canvas_scenes").update({ nodes_json: j }).eq("id", o.sceneId); // :678 ← change 2
if (up.error) rethrow(up.error);                                        // :679
```

Change 1 — **replace, not push**: `const i = deck.publications.findIndex((p) => p.id === pub.id);
if (i >= 0) deck.publications[i] = pub; else deck.publications.push(pub);`. Put this in a pure,
tested helper `upsertBlastPublication(publications, pub)` (new file, §6.4).

Change 2 — **compare-and-set on `updated_at`**: select `id,nodes_json,updated_at`, then
`.update({ nodes_json: j, updated_at: new Date().toISOString() }).eq("id", sceneId).eq("updated_at", row.updated_at).select("id")`
and throw `"the scene changed while publishing — press again"` when zero rows come back. This is
the last-write-wins hazard: an open Studio tab autosaves the whole `nodes_json`, and
`saveBlastPlan` (blastoff.functions.ts:118-129) does the same whole-document write. If
`updated_at` turns out never to change between reads, the predicate always matches and the write
degrades to today's behaviour — it costs one predicate and can only reduce clobbering. Do not
touch anything else in the scene: additive fields on a deck are allowed; schema_version handling
is not (CLAUDE.md:14).

### 4.4 `StudentSet` gains `shorts[]`

student.functions.ts:23-43, additive:

```ts
/** THE PARTS (Blast Off splits). One entry per shipped blast publication that carries a
 *  takeIndex, in take order. Empty for every set published the old way. `playbackId` is
 *  withheld (null) for paid sets exactly as the set-level id is. */
shorts: { playbackId: string | null; name: string; runtimeSec: number | null; takeIndex: number }[];
```

`RawPub` (:53) gains `takeIndex?: number; framing?: string; meta?: { title?: string }`.

The cram resolution at :210-215 becomes:

- `shorts = shortsFromPublications(d.publications)` — pure helper (§6.4): shipped, has
  `render.muxPlaybackId`, `typeof takeIndex === "number"`; sorted by `takeIndex`; if two carry the
  same `takeIndex` the later `render.at` wins (a re-publish replaced by id, so this should not
  happen — the rule exists so a hand-edited scene cannot crash the tree).
- `playbackId` = `shorts[0]?.playbackId ?? cramPid` — **shorts win over a legacy 16:9 lesson on
  the same set.** This is a student-visible change for any set that has both; it is the intended
  one (the Blast Off film of the plan is the cram video). It is also only reachable after Lee
  presses publish on that set.
- `orientation` = `shorts.length ? "portrait" : "landscape"`.
- `runtimeSec` = when `shorts.length`: the sum of part runtimes if every part has one, else
  `null`; otherwise unchanged. LearnHome totals cram time from this (LearnHome.tsx:24-26), so the
  set's time must be the whole set's time.
- The all-draft gate at :197 already accepts any shipped blast publication — a set whose only
  content is shorts still passes.

`getSetPlayback` (entitlements.functions.ts:70-91) gains an optional `takeIndex` in its input;
when present, it picks the blast publication with that `takeIndex` instead of `shippedPub`'s
first-match. Paid gating (:80-83) is unchanged and runs first.

### 4.5 The player walks parts

`PlayerItem` (CramPlayer.tsx:25) gains `part: { index: number; of: number; name: string }` —
`{ index: 0, of: 1, name: "" }` for every set without shorts. learn.tsx:347 expands each
`HomeSet` with `shorts.length > 1` into one item per part (pure helper `expandPlayerItems`,
§6.4); `n`/`of` keep describing the set within its topic.

Inside the player:

- The `Video` React key (CramPlayer.tsx:93) becomes `${set.id}#${part.index}` so a part change
  remounts the `<video>`.
- `Video` reads `pid = set.shorts[part.index]?.playbackId ?? set.playbackId ?? fetched` (:220);
  `resolvePlayback` (learn.tsx:302-307) passes `takeIndex: part.index` when `set.shorts.length`.
- Caption (:98, rendered at :292-293): when `part.of > 1`, a second line `Part 2 of 3 · <name>`
  under the set name; otherwise unchanged.
- Progress stays keyed by **set id only** (learn.tsx:275 writes one DB row per set for signed-in
  students; a `#` key would create a bogus row). Rules: `onStarted(set.id)` on any part;
  `onComplete(set.id)` only when `part.index === part.of - 1` — an earlier part's `finish`
  (CramPlayer.tsx:259) advances to the next item without marking complete; `onPosition` writes only
  for part 0 and the resume seek (:245, :250) applies only to part 0. Parts 2+ always start at 0.
  This is a deliberate simplification: resume-within-part-3 is not worth a progress schema change.
- `?part=N` (1-based) joins `LearnSearch` (learn.tsx:46-53, validated at :56-67 like `set`);
  `playerIndex` (:348) matches on set id **and** part; `openSet` (:352-356) accepts an optional
  part. `LAST_SET_KEY` keeps storing the set id.

Nothing about practice, cram cards or Ask Lee changes: they key on `set.id` and read the whole
set's plan (student.functions.ts:324, :361). See §10 for why per-part practice is not built.

---

## 5. Server functions

All new functions: `createServerFn`, zod input validators, `await assertAdmin()` as the first
line of every handler (the publish-queue.functions.ts:87-88 shape), dynamic imports for anything
touching `node:crypto`/Mux (mux.server.ts:1-3), missing-table errors mapped through
`isMissingSchema(e, /short_jobs/i)` (pg-errors.ts:28-34) to a message naming the migration file.

### 5.1 `src/lib/short-jobs.functions.ts` (new)

```ts
export const SHORT_JOB_STATES = ["kept","uploaded","transcribed","burned","copy","ready","ingesting","posted","error"] as const;
export interface ShortJob { pubKey; setId; takeIndex; state; takeUrl; assUrl; burnJobId; burnMachineId; burnedUrl; muxAssetId; muxPlaybackId; durationS; publishedAt; error; updatedAt }

getShortJob({ pubKey })            // → ShortJob | null   (missing table → null; the dialog says nothing until asked)
upsertShortJob({ pubKey, patch })  // merge upsert of only the keys present in `patch`; sets updated_at; returns the row
```

`patch` is validated against an explicit allow-list of columns; `setId`/`takeIndex` are derived
server-side from `pubKey` and the /v3/post row must also pass `takeIndex` so the two agree (throw
if they do not — a wrong index would publish the right video under the wrong part number).

### 5.2 `src/lib/mux.server.ts` — extend `createAssetFromUrl`

```ts
export async function createAssetFromUrl(url: string, opts: { playbackPolicy?: "public" | "signed"; generatedSubtitles?: boolean; passthrough?: string } = {}): Promise<MuxAsset>
```

Body: `playback_policy: [opts.playbackPolicy ?? "signed"]`; drop `generated_subtitles` when
`opts.generatedSubtitles === false` (mirror :94); add `passthrough` when given. The default stays
signed so the one existing caller (talkthrough.functions.ts:653) is unchanged. Add a pure
`publicPlaybackId(asset: MuxAsset): string | null` beside it —
`asset.playback_ids?.find((p) => p.policy === "public")?.id ?? null` — the assertion everyone
downstream calls (the policy-aware pick from publish.functions.ts:431, but strict: no
`playback_ids[0]` fallback).

### 5.3 `src/lib/site-publish.functions.ts` (new; not publish.functions.ts — that name is the canvas lesson pipeline, see publish-queue.functions.ts:6-8)

**`publishShortToSite({ pubKey, takeIndex })`** — the press.

1. `assertAdmin()`.
2. Read `short_jobs` for `pubKey`; require `burned_url` (else `"burn the captions first — nothing to publish"`); require the row's `take_index === takeIndex`.
3. Resolve the deck via `loadDecksDeduped`; require `status === "live"` and `parked !== true`
   (the `liveDecks` rule, student.functions.ts:87-88) — otherwise throw `"this set is not live —
   a publish would be invisible to students; make it live in the Studio first"`. Do not silently
   write.
4. `createAssetFromUrl(burnedUrl, { playbackPolicy: "public", generatedSubtitles: false, passthrough: `blastoff:${pubKey}` })`.
5. `const playbackId = publicPlaybackId(asset); if (!playbackId) throw new Error("Mux returned no public playback id — refusing to publish a signed asset to the unsigned player")`.
6. `upsertShortJob` → `{ state: "ingesting", muxAssetId: asset.id, muxPlaybackId: playbackId, error: null }`.
7. `logCostEvent({ setId, kind: "mux", usd: muxCostEstimateUsd(durationEstimate), label: "site-publish", who })` — `"mux"` is in `COST_KINDS` (cost-ledger.functions.ts:19); `muxCostEstimateUsd` is shipped.functions.ts:59-60; the estimate uses `take_transcripts.duration_s` when present (transcribe.functions.ts:33), else 180 s, and is corrected in step 2 of resolve. Best-effort, never blocks.
8. Return `{ state: "ingesting", muxAssetId, muxPlaybackId }`.

Nothing student-visible is written here. A `preparing` asset is not playable yet, and an asset can
still error; writing `shipped` now would give a student a black player for a minute or forever.

**`resolveShortPublish({ pubKey })`** — stateless advance, the `resolvePipelineTestAuphonic`
pattern (publish.functions.ts:400-433). The browser polls it every `BURN_POLL_MS` (take-burn.ts:55)
with the burn's 20-minute budget (:56).

1. `assertAdmin()`.
2. Read the row; require `state === "ingesting"` and `muxAssetId` (a stale poll from an earlier
   press must not write — this guard is the reason the asset id lives on the row).
3. `getAsset(muxAssetId)` (mux.server.ts:63-66). `errored` → row `{ state: "error", error: <mux message> }`, return; not `ready` → return `{ state: "ingesting" }`.
4. Re-assert `publicPlaybackId(asset) === row.muxPlaybackId`.
5. Build the publication (§4.2) with `durationS = asset.duration`, `takeName` from the saved plan's
   take head (`planTakes` over non-skipped frames — compute it the way `listBlastPlanSetIds` does
   at blastoff.functions.ts:92-97, not over all frames), and `meta` from
   `set_publish_status.captions.site` when saved (publish-queue.functions.ts:36, :50).
6. The scene write of §4.3 (replace by id, CAS on `updated_at`).
7. `set_publish_status` upsert for `pubKey`: `site_posted_at = now`, `site_url = <learn deep link>`
   — the same upsert shape as :92-94 with `onConflict: "set_id"`. The deep link is
   `${SITE_ORIGIN}/learn?set=${setId}` plus `&part=${takeIndex + 1}` when `takeIndex > 0`. Reuse
   whatever absolute-origin constant `src/lib/og.ts` already uses; only if none exists, add
   `SITE_ORIGIN = "https://surviveaccounting.com"` to the new file.
8. Row → `{ state: "posted", durationS, publishedAt: now }`. Return `{ state: "posted", playbackId, url, durationS }`.

Steps 6-8 are three writes across two tables and a scene; there is no transaction across them.
Order them so a failure leaves the truth conservative: scene first (the student-visible fact), then
the status stamp, then the job row. A failure between them surfaces as the row still `ingesting`
with an `error`; pressing again re-runs resolve, which finds the asset `ready` and redoes the
idempotent writes (replace-by-id, upsert, upsert).

### 5.4 What this design does **not** add to the server

No cron (vercel.json crons are daily; the plan cannot schedule finer), no Mux webhook receiver
(none exists; a browser poll from the session that pressed is sufficient and the row persists the
asset id for a resume after reload), no change to `togglePublishDestination`.

---

## 6. UI

### 6.1 Post-production persists (PostProduction.tsx)

- On open: `getShortJob(pubKey)` alongside `storedTranscript` (:89-95). Seed `videoUrl` from
  `takeUrl`, `burnUrl` from `burnedUrl`, and show step 1 as done ("uploaded earlier") and step 3 as
  done ("captioned earlier — download or re-burn") without a file picked. Step 2 already works this
  way. `file` stays null until he picks one; re-burn requires a pick (the .ass is written from the
  file's name, :152).
- After `uploadTake` resolves (:132): `upsertShortJob({ takeUrl, state: "uploaded" })`.
- After `uploadAss` resolves (:152): `{ assUrl }`. After `startCaptionBurn` returns — this happens
  inside `burnCaptions` (take-burn.ts:69); give `burnCaptions` an optional `onStarted(job)`
  callback rather than unpicking it — `{ burnJobId, burnMachineId }`.
- After `burnCaptions` resolves (:153): `{ burnedUrl, state: "burned", error: null }`. On rejection:
  `{ error: message }` (state unchanged).
- Every upsert is fire-and-forget with the error shown in the existing `err` line (:184) — a lost
  persist must be visible, never silent, but it must not block the burn that is already done.

### 6.2 Step 7 — the press

Below step 6 (:308-315), shown only when `burnUrl` is known (state or seeded):

> **7 · Put it on SurviveAccounting.com** — *the captioned file, as this set's cram video, part N of M*
>
> What happens: a public Mux asset is made from the burned file (≈ ¢ per minute, logged); when it
> is ready this part goes live on /learn for every student, and the site chip on the row is ticked
> with the link. Nothing else posts.
>
> [ Publish part N to the site ]   ·   after: `live · 2:41 · Watch it as a student ↗`

- Disabled while `state === "ingesting"` (label `Mux is preparing it…`), with the same note line
  the burn uses (:258).
- When the row is already `posted`: the button reads `Publish again (replaces the site copy)` and
  the link shows. A second press creates a new asset and replaces the publication by id; the old
  asset is left in Mux (see §10).
- Step 6's copy (:310-314) gets one sentence: "The site is step 7 — it publishes itself from here."
- Never rendered when `takeIndex` cannot be established. The dialog receives `takeIndex` as a prop
  from the row (v3.post.tsx:284 already has it).

### 6.3 The row (v3.post.tsx)

- `onProduce` passes `takeIndex` through; the `PostProduction` mount (:306-316) gains
  `takeIndex={producingRow.takeIndex}` and an `onPublished(status)` that merges the returned
  `SetPublishStatus` into `status` (the `onSaved` shape at :301) so the site chip flips to ✓ and
  the `open ↗` link (:465-469) appears without a reload.
- The site chip's toggle (:452) keeps working by hand for the legacy case, but its title gains
  "publish from Post-production to put the video on the site — this tick alone does not".
- No new columns, no new row types. P6 owns the other edits to this file (always-visible URL field,
  deep links, Escape); build after P6 lands, or in the same session, to avoid a three-way merge on
  `SetRow`.

### 6.4 New pure modules (client-safe, tested)

- `src/lib/short-publication.ts` — `blastoffPubId(pubKey)`, `buildBlastoffPublication(input)`,
  `upsertBlastPublication(list, pub)`.
- `src/lib/student-shorts.ts` — `shortsFromPublications(pubs)`, `cramFromShorts(shorts, fallbackPid, paid)` → `{ playbackId, orientation, runtimeSec }`.
- `src/components/learn/player-items.ts` — `expandPlayerItems(homeSets)`, `isLastPart(item)`,
  `partFromSearch(s)`.

Keep them free of React and network (the plan.ts / set-flow.ts stance), so the tests need no
mocks.

---

## 7. SQL LEE MUST RUN (never auto-run)

The current high-water mark is `20260907_0600_set_publish_captions.sql` in this tree, on
`origin/main`, and in every sibling worktree checked (sa-growth-dashboard). **Re-check at build
time** (`ls migration/supabase-migrations | sort | tail`, and `git ls-tree origin/main` the same
folder) — sibling sessions add files, and two files creating one table was the exact failure
docs/SESSION-CONTEXT.md §2 records. Filenames are `YYYYMMDD_HHMM_description.sql`.

File: `migration/supabase-migrations/20260909_0100_short_jobs.sql`

```sql
-- SHORT JOBS (2026-09-09). One row per Blast Off video ("<setId>" or "<setId>#N" — the /v3/post
-- row key), carrying everything post-production learns about it that the browser used to hold in
-- React state and lose on close: where the take, the subtitles and the burned file landed in
-- canvas-media, the Fly render job (its map is in-memory on the worker, so jobId + machineId are
-- the only way back to it), and — once Lee presses "Put it on SurviveAccounting.com" — the public
-- Mux asset and playback id. docs/DESIGN-SITE-PUBLISH.md §4.1; the OBS keep-loop design
-- (docs/DESIGN-OBS-KEEP-LOOP.md) drives the same rows through its earlier states.
--
-- `state` is free text on purpose: the app validates it (SHORT_JOB_STATES in
-- src/lib/short-jobs.functions.ts) so a later stage needs no migration. Known values, in order:
--   kept · uploaded · transcribed · burned · copy · ready · ingesting · posted · error
--
-- RLS: deny-by-default like every other table this year — service-role server fns only.
-- Additive, idempotent. One concern per file.
BEGIN;

create table if not exists public.short_jobs (
  pub_key              text primary key,
  set_id               text not null,
  take_index           integer not null default 0,
  state                text not null default 'kept',
  take_url             text null,
  ass_url              text null,
  burn_job_id          text null,
  burn_machine_id      text null,
  burned_url           text null,
  transcript_ready_at  timestamptz null,
  copy_ready_at        timestamptz null,
  mux_asset_id         text null,
  mux_playback_id      text null,
  duration_s           numeric null,
  published_at         timestamptz null,
  error                text null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists short_jobs_set_idx on public.short_jobs (set_id, take_index);

alter table public.short_jobs enable row level security;
-- no policies: deny-by-default; the service role bypasses RLS.

COMMIT;

-- Proof it ran (SESSION-CONTEXT §2: end with a SELECT, not a comment).
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'short_jobs'
order by ordinal_position;
```

No change to `set_publish_status`: `site_posted_at` and `site_url` already exist
(20260906_0200). No change to `canvas_scenes`: the publication is JSON inside `nodes_json`.

Until the file is applied, `getShortJob` returns null (the dialog behaves exactly as today) and
`upsertShortJob` / `publishShortToSite` fail with
`"Run migration/supabase-migrations/20260909_0100_short_jobs.sql first."` — the publish-queue
wording (publish-queue.functions.ts:96). Never a silent no-op (CLAUDE.md:23-26).

---

## 8. Build order — small, verifiable slices

Each slice: `bunx tsc --noEmit` clean, `bun test` green, one commit. RISKY tier (migrations,
scene data, student-visible): commit per slice, full report (CLAUDE.md:33-36). Do not push to main
without Lee's word. Build S1-S3 only after P6 (PostProduction/v3.post edits) has landed or in the
same session; S4-S5 are independent of P6.

**S0 — the table and its functions.** Write the migration file (§7). Add
`short-jobs.functions.ts` with `SHORT_JOB_STATES`, `getShortJob`, `upsertShortJob`, and a pure
`mergeShortJobPatch` (tested). Verify: tsc; the test; with the migration applied, a scratch call
from the browser console of /v3/post round-trips a row. Nothing user-visible yet.

**S1 — post-production remembers.** §6.1. Verify: pick a take, let it upload, burn; close the
dialog; reopen — steps 1 and 3 show done, the download button works without re-burning, the row
in `short_jobs` carries `take_url`, `ass_url`, `burn_job_id`, `burn_machine_id`, `burned_url`,
`state = 'burned'`. Break the table name on a scratch branch: the `err` line names the migration.

**S2 — the public ingest and the publication (server only).** `createAssetFromUrl` option +
`publicPlaybackId`; `short-publication.ts` (tested); `site-publish.functions.ts` with both
functions. Verify: tsc; tests; source-pin test (§9.5) green; `attachOneTakeBlast` unchanged
(diff shows no edit to talkthrough.functions.ts). Do **not** call the functions against a live
set yet.

**S3 — step 7 and the row.** §6.2-6.3. Verify in the browser on a **test set that is live but
carries no students' attention** (Lee names it): press → `ingesting` → `posted`; `short_jobs`
row has `mux_asset_id`, `mux_playback_id`, `duration_s`, `published_at`; the deck's
`publications[]` has exactly one `pb:blastoff:<pubKey>` (press again → still exactly one, new
asset id); `set_publish_status.site_posted_at` set and `site_url` is the deep link; the site chip
is ✓ with `open ↗`; `https://stream.mux.com/<id>.m3u8` plays **unsigned** in a private window.
Cost row present in `cost_events` with `kind = 'mux'`.

**S4 — the student tree.** §4.4 and `getSetPlayback`'s `takeIndex`. `student-shorts.ts` (tested).
Verify: tests; `/learn` for a set with no shorts is byte-identical (compare the `fetchStudentTree`
JSON before/after for a set without shorts — the only new key is `shorts: []`); the test set from
S3 shows `orientation: "portrait"`, `playbackId` = the short's public id, `runtimeSec` = the part's
duration.

**S5 — the player walks parts.** §4.5 and `player-items.ts` (tested). Verify: on the S3 set with
two published parts, `/learn?set=<id>` plays part 1, ends, rolls into part 2 (caption "Part 2 of
2"), and only then marks the set crammed; `/learn?set=<id>&part=2` opens on part 2; a set with one
part behaves exactly as before; arrow keys and swipe move part-by-part; the practice drawer still
opens the whole set's questions.

**S6 — docs.** Update this file's status line, add the two-line summary to
docs/V3-PRODUCTION-HANDOFF.md's update log, and list the SQL under "SQL LEE MUST RUN" in the
report. No CLAUDE.md edit is needed: the design lives inside its existing rule.

---

## 9. Tests to write (bun:test, the house style of takes.test.ts / set-stage.test.ts)

### 9.1 `src/lib/short-jobs.test.ts`
- `mergeShortJobPatch(row, patch)` overwrites only keys present in `patch`; `undefined` never
  clears; `null` does (the `error: null` reset).
- `SHORT_JOB_STATES` contains every state this doc names, in this order.
- `pubKeyParts("deck-x#3")` → `{ setId: "deck-x", takeIndex: 2 }`; `"deck-x"` → `takeIndex 0`;
  a mismatch between the parsed index and a passed `takeIndex` is rejected.

### 9.2 `src/lib/short-publication.test.ts`
- `blastoffPubId("deck-x#2")` is stable and namespaced `pb:blastoff:`.
- `buildBlastoffPublication` emits `kind:"blast"`, `state:"shipped"`, `framing:"9:16"`,
  `destinations:["site"]`, numeric `takeIndex`, no `stitchId`, no `stitchRev`; `meta.title` falls
  back from the site caption to the take title to the set name; `shipped.access` follows
  `deck.access`.
- `upsertBlastPublication`: replaces by id in place (order preserved), appends when new, never
  touches other publications, never mutates its input.

### 9.3 `src/lib/student-shorts.test.ts`
- `shortsFromPublications` ignores drafts, unshipped, missing playback id, and publications with
  no numeric `takeIndex` (the legacy 16:9 shipped lesson is not a part); sorts by `takeIndex`;
  duplicate `takeIndex` → later `render.at` wins; returns `[]` for `undefined`.
- `cramFromShorts`: no shorts → `{ playbackId: fallback, orientation: "landscape", runtimeSec: fallbackRuntime }`;
  shorts → `playbackId = shorts[0]`, `portrait`, `runtimeSec` = sum, or `null` if any part lacks
  one; paid → every `playbackId` null but names and runtimes intact.

### 9.4 `src/components/learn/player-items.test.ts`
- A set with `shorts: []` → one item, `part {0,1,""}`; two parts → two items sharing `n`/`of`;
  `isLastPart` true only on the last; `partFromSearch("2")` → 1, `"0"`/`"x"`/absent → 0.

### 9.5 `src/lib/site-publish.test.ts` (source pin, the style of pipeline-timeline.test.ts:166)
Read `site-publish.functions.ts` and `short-jobs.functions.ts` as text and assert: every
`.handler(` is preceded within its function by `await assertAdmin()`; `playbackPolicy: "public"`
and `publicPlaybackId(` both appear in `site-publish.functions.ts`; the string
`playback_ids?.[0]` does **not** appear in it; `mux.server.ts` still contains
`opts.playbackPolicy ?? "signed"`. These pins are the assertion the spec asked for: no
student-visible write can happen behind an unauthenticated door, and no signed id can reach the
unsigned player.

### 9.6 Existing tests to keep green, untouched
`takes.test.ts`, `set-stage.test.ts`, `caption-brief.test.ts`, `blastoff-frame-schema*.test.ts`.
Never weaken one to go green (CLAUDE.md:9).

---

## 10. Do not build (and why)

- **The YouTube Data API plan** (docs/PROMPT-POSTING-YOUTUBE.md: OAuth, `videos.insert`,
  `video_stats`, a daily cron). Separate scope, needs Google Cloud setup by Lee's hands, and its
  "site flips on the moment the asset is ready" contradicts the explicit press. Socials stay
  manual; P6 gives the deep links and paste-back.
- **Auto-publish when the burn finishes.** CLAUDE.md:28-30. The burn is a render; the publish is
  a decision.
- **Model (a): a split as its own DeckDef.** Scene serialization and the outline are protected
  zones (CLAUDE.md:11-17); `<setId>#2` would leak into progress rows (learn.tsx:275), practice
  (`fetchSetPractice({setId})`), Ask Lee (`cram:<setId>`, CramPlayer.tsx:315) and entitlements.
- **A signed player for shorts.** CramPlayer is unsigned by design (CramPlayer.tsx:232); paid
  gating is by withholding ids server-side (entitlements.functions.ts:80-83), not by signing.
- **Per-part practice and cram cards.** `fetchSetPractice` and `fetchSetCramCards` read the whole
  plan (student.functions.ts:361, :324). Slicing them by take needs `runFor`-style selection on the
  server and a product decision about where practice sits in a multi-part set. Ask Lee; not now.
- **Deleting or replacing the old Mux asset on re-publish.** Leave it; a stray asset costs cents
  a month (shipped.functions.ts:56-58) and deleting is irreversible. An admin cleanup chore later.
- **A Mux webhook receiver.** None exists; the browser poll plus the persisted asset id resumes
  after a reload. A webhook is infrastructure for a problem this line does not have yet.
- **Changing `shippedPub`'s first-match for `lookback`** or the legacy `lesson_videos` fallback.
  Only the cram resolution learns about parts.
- **Storing the burned MP4 only in Mux and dropping the Supabase copy.** The Supabase copy is the
  re-ingest source and the download step 3 hands Lee. Keep both.
- **A CHECK constraint on `short_jobs.state`.** P10 adds states; a CHECK would force a migration
  for each. The zod enum in the app is the gate.
- **Editing steps 1-6 of PostProduction beyond the persistence hooks.** P6 owns those edits
  (Escape, `TakeFrame onFile`, Whisper cost, copy). Two sessions in one 320-line file is how
  merges go wrong.
- **Any `assertAdmin` retrofit on the existing render/transcribe/publish functions.** Needed,
  but it is P7's package; do it there so the audit's finding closes in one place.
- **Touching CLAUDE.md.** The design lives inside the existing rule; cite it, do not amend it.

---

## 11. Coordination and hazards

- **Two docs, one table.** docs/DESIGN-OBS-KEEP-LOOP.md (P10) describes the hopper that drives
  `short_jobs` through `kept → uploaded → transcribed → burned → copy → ready`; this design uses
  the same row from `burned` onward. The DDL in §7 is the union. Whichever is built first creates
  the file; the other must not create a second.
- **Scene last-write-wins.** The CAS in §4.3 narrows the window; it does not close it. Lee should
  not have the set's scene open in the canvas Studio while publishing. If a publication vanishes,
  the `short_jobs` row still says `posted` with the asset id — pressing again rewrites it.
- **`orientation` becomes real.** Until now every set was `"landscape"`; the player already
  handles `"portrait"` (CramPlayer.tsx:222, :281) but nothing else has ever seen it. LearnHome's
  thumbnails (LearnHome.tsx:204-211) use a fixed aspect; check them on the S3 set.
- **A green build proves nothing about Mux.** `MUX_TOKEN_ID/SECRET` live in Vercel env
  (mux.server.ts:12-17); the S3 verification is the only proof and needs a real press on a real
  set. Choose the set with Lee.
- **`takeIndex` is positional.** Adding a cut above a published part renumbers it: the
  publication says part 2, the plan now says part 3. The row on /v3/post is also positional
  (v3.post.tsx:135), so both drift together, and re-publishing re-stamps the index. Show the
  stored `takeName` beside the part number on /learn so a drift is at least legible. A stable
  take id (the head frame's id, `PlanTake.headId`, plan.ts:421) would fix this properly — note it
  as the follow-up; it belongs with the spine work, not here.

---

## 12. Open questions for Lee (answer before S3)

1. Which live set is the first to publish this way? It must be one whose legacy cram video, if
   any, he is happy to see replaced by the Blast Off parts (§4.4, `shorts` win).
2. The site caption's one-liner (caption-brief.ts:36) becomes the part's `meta.description`. Is
   that the line he wants students to see under the video, or should /learn show nothing but the
   name?
3. Re-publish leaves the old Mux asset. Fine for now, or does he want the old id recorded on the
   row (`previous_mux_asset_id`) so a cleanup can find it?

---

## 13. Status, 2026-09-11 — Lee's post-button bypass

Built without S0/S1 (no `short_jobs` table, no migration). Lee asked for a way to "just upload a
file and have it post", chose a post button, and said a new vertical video may replace a set's old
one.

- **Server:** `src/lib/site-publish.functions.ts`. `startSitePost` hands the canvas-media take to
  Mux as a public asset; `resolveSitePost` polls, then writes the publication onto the deck
  (replace by id, compare-and-set on `canvas_scenes.updated_at`) and stamps the row's site tick and
  link. `mux.server.ts createAssetFromUrl` gained `{ playbackPolicy, generatedSubtitles,
  passthrough }`; the default is unchanged, so `attachOneTakeBlast` is untouched.
- **Pure:** `src/lib/short-publication.ts` (§4.2) and `src/lib/student-shorts.ts` (§4.4), both
  tested.
- **Student tree:** `StudentSet.shorts?` (optional). When a set has posted parts, `playbackId` is
  part 1, `orientation` is `"portrait"` and `runtimeSec` is part 1's.
- **UI:** PostProduction step 7, "Post it to the site".
- **Not built: S5, the player walking parts.** It lives in CramPlayer and the learn route, the
  /learn session's files. A set with several posted parts plays part 1 only until the player reads
  `set.shorts`. `getSetPlayback` (paid sets) still returns the first shipped blast, which may be
  any part. LearnHome thumbnails assume a fixed aspect; check a portrait set.
- **Unverified against Mux:** the building PC has no `MUX_*` keys, so Lee's first press is the
  first real run.
