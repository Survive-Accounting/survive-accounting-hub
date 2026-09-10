# DESIGN — OBS record-stop → Keep / Try again / Scratch → the hopper (V3 Blast Off)

Status: **design only, nothing built.** Written 2026-09-09 against `film/free-camera-pinned-ceq`
at `749f1189` (= `origin/main` that day). Every `file:line` below was read from that tree; re-check
line numbers before editing, the files move.

Companion runbook: `docs/OBS-WIRING.md` (what Lee sets in OBS and Chrome, and what each error means).

Read first, in this order: `CLAUDE.md`, `docs/SESSION-CONTEXT.md` §1–§3 (bun, migrations, what a
green build does not prove), `docs/PIPELINE-FILMING-CONTEXT.md` §0 and §5, `docs/OBS-WIRING.md`.

---

## 0. The goal, in Lee's words

The words are quoted from the source comments that captured them.

- "I want it to start assembling the second the video starts. The second I start talking. So the
  countdown from 10, at 0 I hit my recording hotkey F4. Animation begins. We could even program the
  animation to hit when I press f4?" — `src/components/blastoff/BlastOffCapture.tsx:381-384`
- "I actually don't have the video file on this computer. This is only for claude code. I am filming
  on a separate laptop. Can we add a way for me to upload the file in the web app?" —
  `src/components/v3/take-burn.ts:3-5`
- "Where do I upload the video file? Where can I add captions? I want to do this from the post point.
  It's post-filming / post production to me. So somewhere in /post. Explain how this process can work
  and in the most streamlined way. I'm a bit confused the order of operations once I have a finished
  video file." — `src/components/v3/PostProduction.tsx:3-6`
- "we need post to be ready for splits… I only did account classification > assets. Not the full
  thing." — `src/routes/v3.post.tsx:103-104`
- The 2026-09-09 audit's heading for his POST notes: **"OBS keep-loop → hopper → posted to the
  website"** (`docs` audit §9).

What that means, concretely:

1. He presses his OBS record hotkey, films a split, presses it again. **Nothing else.**
2. The app already knows the recording stopped, already knows which file OBS wrote, and asks one
   question in the main `/film` window: **Keep · Try again · Scratch**, naming the split it was.
3. **Keep** puts that file into a durable queue ("the hopper") that carries it, without him,
   through upload → transcript → burned captions, and lands it on `/v3/post` as a captioned MP4
   with its copy and cover one click away.
4. **Try again** and **Scratch** move the file to the recycle folder (never delete) and put him back
   on the same split.
5. "Posted to the website" stays an explicit press on `/v3/post` — that is P11's design, not this one.

This document covers 1–4. It does not touch what students see.

---

## 1. What exists today (verified)

### 1.1 The canvas world already has the whole loop — as closures inside one React drawer

| Piece | Where | What it proves |
| --- | --- | --- |
| obs-websocket v5 client: Hello→Identify with sha256 auth (known-answer tested), `RecordStateChanged` parsing incl. `outputPath` on STOP, close-code diagnosis, backoff | `src/components/canvas/obs-bridge.ts` (`parseRecordEvent` :39-47, `closeDiagnosis` :56-65, `connectObs` :74-128, backoff `min(30s, 1.5s·2^n)` :117, terminal codes stop retrying :111) | No React, no UI; verified `ws://localhost` from the https origin 2026-08-15 (:3-7) |
| The granted recordings folder: pick once, remember the handle in IndexedDB, re-query permission on load, scan, read a file, MOVE to `_trash`, restore | `src/components/canvas/takes-folder.ts` (`pickTakesFolder` :28-34, `savedTakesFolder` :37-46, `scanFolder` :49-61, `getFile` :71-73, `moveToRecycle` :77-89, `restoreFromRecycle` :92-104, `probeDuration` :123-131) | THE LAW (:7-9): read, or move to Recycle. Never modify, never delete. `takes-inbox.test.ts:77-85` counts the two `removeEntry` sites and fails on a third |
| Take records (pending/kept/trashed + upload state), file identity `name|size|mtime`, scan diffing, prune, triage bus | `src/components/canvas/takes-store.ts` (`TakeRecord` :22-45, `fileKey` :51, `newFiles` :59-64, `makeRecord` :66-76, `missingRecords` :112-115, `latestPending` :118-121, IndexedDB `sa-takes` v1 :133-148, `putMeta/getMeta` :160-161, `setTriageHandler` :200) | Adding an optional field to `TakeRecord` needs **no** IndexedDB version bump (keyPath `id`, no indexes on fields) |
| The loop itself: OBS STARTED → slate + coverage; STOPPED → retry-scan the folder at 400/1200/2500 ms for `baseName(outputPath)` → pending row; F10 keep → upload + `enqueueTranscription`; F8 trash → `moveToRecycle` | `src/components/canvas/TakesInbox.tsx` (localStorage keys :82-84, the flashing-bug refs :89-99, `connectTick` :102, `ingest` :118-143, OBS effect :146-183 with deps `[obsOn, connectTick, ingest]` :183, `doKeep` :188-216, `doTrash` :218-224, `doRestore` :226-232, triage handlers :237-254) | STUDIO SURFACE ONLY (:3-7). Eight test files read this file as text — see §5.2 |
| Upload primitives: signed PUT with progress, `stageTake` to `canvas-media/ceq-takes/` | `src/components/canvas/ceq-takes.ts` (`putSignedUpload` :45-62, `stageTake` :68-86) | `createPipelineTestStagingUpload` (`src/lib/publish.functions.ts:365-377`) mints the signed slot; bytes never touch Vercel |
| Background transcription queue (localStorage `sa-transcribe-queue`, drains on 45 s timer / focus / online, keeps failures at the head) | `src/components/canvas/transcript-client.ts` (`transcribeSmart` :36-59, queue :63-107, `startTranscription` :110-120) | Its `>24 MB` path calls `extractWavFromUrl(url)` which **re-downloads the whole take** (`transcribe-audio.ts:27`) — fine for a 60 MB canvas clip, wrong for a 300 MB vertical take |
| Triage hotkeys F8/F10 in the film-controller keymap | `src/components/canvas/CeqPreviewer.tsx:2639-2640, :2685` | App-focus keys, `preventDefault` + `stopImmediatePropagation` (F10 would otherwise focus Chrome's menu bar) |

### 1.2 V3 has the post-production line, but no socket, no hopper, and the burned URL is React state

| Piece | Where | Fact |
| --- | --- | --- |
| Capture surface; F4 = ROLL in both windows | `BlastOffCapture.tsx` (`useState(0)` :107, `filmFrames` :121, `useCapturePopout` :128, `usePopoutTake` :129, `roll` :396, `useRollSignal` :400, keydown :440-511, F4 :502-507, `.film-mode` root :538) | F4 is a keydown the **focused** window sees (:496-501). If OBS has focus, no window rolls |
| Cross-window state on localStorage + `storage` events | `src/components/blastoff/capture/prompter-sync.ts` (`sa-film-active` :32, `FilmActive` :36-52, `readFilmActive` :91-96, `sa-film-roll` :147, `isFreshRoll` :159-163, `signalRoll` :167-169, `useRollSignal` :180-197, `popoutTake` :213-218, `usePopoutTake` :238-249) | The pop-out is the only writer of `sa-film-active` while live (:23-27); the main window reads |
| The 9:16 pop-out (`?popout=1`), `POPOUT_NAME/FEATURES` | `src/components/blastoff/capture/popout.ts:29-31, :73-111`; route flag `src/routes/v3.$topic.$set.blast-off.film.tsx:25-27` | The pop-out's client area IS the OBS shot (`popout.ts:18-22`). Nothing status-like may render there. `ProductionTimer.tsx:247-249` is the guard idiom |
| Splits: `cutAfter` / `takeName` on frames; `planTakes`; `runFor`; `filmFrames` | `src/components/blastoff/plan.ts` (:120, :123, `cutAfterFrame` :395-404, `planTakes` :427-441, `takeLabel` :444, `runFor` :451, `filmFrames` :591) | `planTakes` is unit-tested (`takes.test.ts`) |
| `/v3/post` renders **one row per take**, keyed `setId` for the first and `<setId>#N` after | `src/routes/v3.post.tsx:131-138`; server side `src/lib/blastoff.functions.ts:63-101` computes the same takes **over non-skipped frames** (:93) | So the browser must compute takes over `filmFrames(plan.frames)` to get the same N. `set_publish_status.set_id` is free text, so `<setId>#2` already has a publish row |
| Post-production: six steps, one dialog, keyed by `pubKey` | `src/components/v3/PostProduction.tsx` (props :66-79, stored transcript on mount :89-95, pick → background upload :124-139, `burnUrl` **is React state** :143, burn :146-158, steps :187-315) | Close the dialog, lose the burned URL (:143). That is the whole reason for durable rows |
| Transcript for a short: keyed `blastoff/<pubKey>.take`, from the **local** File (audio only leaves the machine) | `src/components/v3/take-transcript.ts` (`shortTranscriptPath` :16, `storedTranscript` :21-24, `transcribeTakeFile` :30-60) | Idempotent per path (`transcribe.functions.ts:56-58`) — a **replaced** take must pass `force` or it silently reuses the old words |
| Upload + burn: `uploadTake` → `canvas-media/blastoff-takes/`, `uploadAss`, `burnCaptions` polls every 3 s for up to 20 min | `src/components/v3/take-burn.ts` (:42-45, :48-50, :55-56, :61-89, `downloadUrlAs` :94-103) | |
| Worker bridge: `startCaptionBurn` writes to `blastoff-captioned/<ts>.mp4`; `resolveWorkerRender` pins polls with `fly-force-instance-id` | `src/lib/render-worker.functions.ts` (:182-210, path :194; :212-228, header :219) | Env `RENDER_WORKER_URL` + `RENDER_WORKER_TOKEN` (:17-23) |
| The Fly worker keeps jobs **in memory** (`const jobs = new Map`), keeps 40, self-exits after 5 min idle, whole-job ceiling 50 min | `worker/src/server.ts:36-37, :39-50, :261 (machineId), :267 (404 "unknown job — re-submit")`; `worker/src/config.ts:75-86` | A restart loses the job; the app must hold `jobId + machineId + path` durably and re-submit on 404 |
| Publish checklist: `set_publish_status` (one row per pubKey; `filmed_at`, four `*_posted_at`, `captions`) | `src/lib/publish-queue.functions.ts` (:25, `togglePublishDestination` :82-101, `setFilmed` :108-125, `setPublishCaptions` :133-154) | All four fns `assertAdmin` (:58, :87, :112, :140) |
| Stage chip | `src/components/v3/set-stage.ts` (`stageOf` :102-113, filters :129-136) | Pure; do not make it read the hopper in v1 (see §7) |

### 1.3 Two facts the seed design had wrong

1. **Migration names are `YYYYMMDD_HHMM_<concern>.sql`, not a sequence** (`docs/SESSION-CONTEXT.md` §2 — the
   `0118` collision cost a day). The current high-water file is
   `migration/supabase-migrations/20260907_0600_set_publish_captions.sql`; `git log --all` shows nothing
   dated 09-08 or 09-09 on any ref. The new file is **`20260909_0100_short_jobs.sql`** (§4.3). Re-run
   the high-water check (folder + `git log --all --name-only -- migration/supabase-migrations/`) the
   day you build.
2. **Do not route V3 transcription through `enqueueTranscription`.** Its drain calls `transcribeSmart`,
   which for anything over 24 MB fetches the uploaded take back down to extract audio
   (`transcript-client.ts:42-45` → `transcribe-audio.ts:26-38`). The V3 take is on disk in the granted
   folder; `transcribeTakeFile(pubKey, file)` (`take-transcript.ts:30-60`) reads it locally and is
   already keyed the way `PostProduction` reads it back. The hopper row is the queue; a second durable
   queue for the same job is two sources of truth.

### 1.4 Security debt this design must not extend

`publish.functions.ts`, `render-worker.functions.ts`, `transcribe.functions.ts` and
`talkthrough.functions.ts` contain **zero** `assertAdmin` (grep). Signed uploads, Whisper billing and
Fly jobs are callable unauthenticated. Every new server function in this design calls
`assertAdmin()` first (`src/lib/admin-session.functions.ts:108-118`), and slice S0 (§5) adds it to the
four existing files as its own commit.

---

## 2. What the browser can and cannot do (the constraints the design is built on)

- **No directory watcher.** `FileSystemObserver` has only ever been an origin-trial/flagged API. Do
  not depend on it. What works, and what `TakesInbox` does today: keep the `FileSystemDirectoryHandle`
  in IndexedDB (`takes-store.ts:160-161`), re-query `queryPermission({mode:"readwrite"})` on mount
  (`takes-folder.ts:41`), and **scan on demand** — triggered by the OBS `STOPPED` event, retried at
  400/1200/2500 ms because OBS finalises the file just after the event (`TakesInbox.tsx:170-177`).
- **Chrome may require one "Grant folder" click per browser session** for a remembered handle
  (`requestPermission` needs a user gesture, `takes-folder.ts:43-45`). The UI must have that button
  wherever a Keep can happen — including inside the decision modal — and must never assume the grant
  is silent.
- **The browser cannot open an arbitrary OS path.** OBS's `outputPath` is useful only as (a) a
  basename to look for inside the granted directory and (b) a directory name to compare with
  `dir.name`, so a mismatch gets "OBS is writing to `Videos`, the granted folder is `OBS-takes`" instead
  of a bare "grant the folder". `obs-bridge.ts` gains `dirName(p)` beside `baseName` (§4.1).
- **"Delete" does not exist.** Scratch and Try again are `moveToRecycle` into `_trash/` — a real
  `FileSystemFileHandle.move()`, copy-then-remove only as a fallback (`takes-folder.ts:75-89`). The
  count-the-`removeEntry`-sites test stays green or the build is wrong.
- **One socket, one window.** obs-websocket accepts several clients, but two `/film` main windows
  would each ingest the same file and each show a decision. The socket mounts in the main `/film`
  window only, never the pop-out, and the design assumes one main window is open. (A `BroadcastChannel`
  lock is listed under do-not-build; it is not worth it until it bites.)
- **Chrome and `.mkv`.** `takeFileProblem` refuses `.mkv` for the cover grab (`src/lib/take-frame.ts:69`),
  and `decodeAudioData` on Matroska is not something this repo has verified. The runbook tells Lee to
  record MP4 (Hybrid MP4 on OBS 30+). The scan still accepts mkv (`takes-folder.ts:16`); the decision
  modal shows a warning line for one, and the drain refuses to transcribe it locally (URL fallback
  still works because Whisper reads what the worker can decode — it cannot; the worker can, ffmpeg
  handles mkv). So: **mkv takes burn, but the cover and the local transcript need mp4.** Say so in
  the modal rather than failing later.

---

## 3. The design

### 3.1 The loop, end to end

```
 laptop, Chrome, /film main window                      laptop, Chrome, /v3/post
 ───────────────────────────────────                    ────────────────────────
 OBS ws  STARTED ──▶ signalRoll(set.id) (debounced)      listShortJobs() every 15 s / focus / online
         STOPPED(path) ─▶ awaitStoppedFile(dir, base)    pickNext(): oldest non-terminal, unclaimed
             │ found                                     claimShortJob → run ONE step → advance (CAS)
             ▼
   TakeRecord{pending, pubKey}  (IndexedDB, same store)    kept ──upload──▶ uploaded
             │                                             uploaded ──transcribe (local File)──▶ transcribed
   TakeDecision modal (main window, never pop-out)         transcribed ──.ass + startCaptionBurn──▶ burning
   ├─ Keep  F10 → short_jobs row {kept} + upload here      burning ──poll resolveWorkerRender──▶ ready
   │          + setFilmed(pubKey)                          (404 unknown job → re-submit, ≤3) / error → failed
   ├─ Try again T → _trash + cue the split's head slide
   ├─ Scratch F8  → _trash                                 /v3/post row: job chip · Download captioned ·
   └─ Esc / F4    → stays pending (strip in the chrome)    Retry · Pick the take (no folder) · PostProduction
                                                           reads the row instead of re-doing steps 1–3
```

Two drains exist on purpose and do not overlap: `/film` performs **only** the upload, immediately on
Keep (the file is in hand, exactly like `doKeep` today); `/v3/post` performs transcribe → burn → ready.
If `/film` closes mid-upload the row is still `kept` and `/v3/post` re-uploads when its folder is
granted, or offers the file picker when it is not. Every transition is a compare-and-set on the row's
`state`, so two tabs cannot double-advance.

### 3.2 Data model (all additive)

**`TakeRecord.pubKey?: string`** (`takes-store.ts:22-45`). Present ⇒ the record was banked by V3 for
that video (`<setId>` or `<setId>#N`). V3 writes records with `orientation: "9:16"`, `pubKey`, no
`target`, no `coverage`. `TakesInbox` lists only `!t.pubKey` (one unpinned line at :70/:256) so a V3
take never appears in the canvas inbox where F10 would attach it to a frame. No IndexedDB version bump.

**localStorage, reused, not added:** `sa-obs-addr`, `sa-obs-pass`, `sa-obs-on` (`TakesInbox.tsx:82-84`)
so the credentials Lee typed in the canvas panel carry over; `sa-film-active` and `sa-film-roll` unchanged.
**New:** `sa-film-cue` (§3.5, same shape as `sa-film-roll` plus `frameId`) and `sa-tab-id` in
`sessionStorage` (a random id per tab, the drain's `claimed_by`).

**`pubKeyFor(setId, takeIndex)`** — one definition in `plan.ts` (`takeIndex === 0 ? setId :
`${setId}#${takeIndex + 1}``), and `v3.post.tsx:136` switches to it. Today that expression lives inline
in the route; two copies will drift.

**`short_jobs`** — the hopper. One row per video (pubKey). Columns and the migration are in §4.3.
States, and what each means:

| state | means | who advances it |
| --- | --- | --- |
| `kept` | Lee pressed Keep; the file is named and measured, not uploaded | `/film` (upload) or `/v3/post` (upload with folder / picker) |
| `uploaded` | `take_url` is a public `canvas-media` URL | `/v3/post` drain: transcribe |
| `transcribed` | `take_transcripts` row exists at `blastoff/<pubKey>.take` | `/v3/post` drain: write `.ass`, upload it, `startCaptionBurn` |
| `burning` | `burn_job_id + burn_machine_id + burn_path` persisted | `/v3/post` drain: poll; 404 → re-submit (`burn_attempts` ≤ 3) |
| `ready` | `burned_url` is the captioned MP4 | nobody — terminal for the hopper. Posting is `set_publish_status`'s fact |
| `failed` | `error` says why; `failed_from` says where | Lee: Retry on `/v3/post` (→ `failed_from`) |

`posted` is **not** a hopper state. `set_publish_status` already owns "posted where" per pubKey and
`stageOf` already renders it; a second owner for the same fact is how checkboxes and reality diverge.

**Claims.** `claimed_by` / `claimed_at`; a claim older than `STALE_MS = 10 min` is free. Steps are
idempotent enough to redo: the transcript is keyed by path, a re-upload leaves an orphan raw file, a
re-burn leaves an orphan job. Accept the orphans; they cost cents and never block.

**Replacing a take.** Keep on a pubKey that already has a row is refused unless the modal sends
`replace: true` (it asks: "Split 2 already has a kept take, 2:41, captioned — Keep replaces it; the old
files stay in storage"). Replace resets the row to `kept`, clears every downstream column, and bumps
`take_generation`. The transcribe step passes `force: take_generation > 1` (`transcribe.functions.ts:56-58`
would otherwise return the previous take's words).

**Which split it was.** At STOPPED the main window reads the pop-out's last record
(`readFilmActive().qId`, `prompter-sync.ts:91-96`) and resolves it the way `previewIndex` does
(:225-230) to a frame index over `filmFrames(plan.frames)`, then to the `planTakes` entry containing
that frame. A stop on the outro that carries `cutAfter` belongs to the take before the cut, which is
right. If P2's `?take=N` has landed, prefer it; the modal shows the split label with ◂ ▸ to correct it
either way. Pure helper `takeIndexForNode(frames, qId): number | null` in
`blastoff/capture/take-decision.ts`, tested.

### 3.3 Modules

| File | New / edit | Owns |
| --- | --- | --- |
| `src/components/canvas/obs-bridge.ts` | edit | `export function dirName(p: string): string` — last directory segment, Windows or POSIX. **Must be a `function` declaration**: the TDZ ratchet baselines this file at exactly 1 arrow-const (`tdz-graph.test.ts` BASELINE) and fails if it grows |
| `src/components/canvas/takes-session.ts` | new | The headless extraction of `TakesInbox` (§3.4). Reachable from `CeqStudio` → in the ratchet's scope as a **new file = hard zero** arrow-consts at module scope. Every module-scope callable is `function` |
| `src/components/canvas/TakesInbox.tsx` | edit | Becomes a renderer over `useObsTakeSession`. Keeps every UI pin (§5.2) byte-for-byte; the logic pins move with the logic |
| `src/components/blastoff/plan.ts` | edit | `pubKeyFor`, `takeIndexForFrameId(takes, frameId)` |
| `src/components/blastoff/capture/obs.ts` | new | `useObsRecorder({ enabled, onStarted, onStopped })` — connect with the canvas keys, deps exactly `[on, tick]`, handlers via refs, exposes `{ status, detail, recording, lastStop, addr, setAddr, pass, setPass, on, connect, disconnect, retry }`. Imports only `canvas/obs-bridge`. The pop-out passes `enabled: false` |
| `src/components/blastoff/capture/take-decision.ts` | new, pure | `takeIndexForNode`, `decisionLabel`, `folderMismatch(outputPath, dirName)`, `mkvWarning(name)`, `STOP_SCAN_WAITS_MS` re-export, the decision reducer (`pending → kept | trashed`) |
| `src/components/blastoff/capture/TakeDecision.tsx` | new | The modal (§3.6). Rendered by `BlastOffCapture` only when `!popout.isPopout` |
| `src/components/blastoff/capture/prompter-sync.ts` | edit | `sa-film-cue` (`cueRecord`, `signalCue`, `useCueSignal`) — same shape and freshness rule as the roll; plus `minGapMs` on `isFreshRoll` (§3.5) |
| `src/components/blastoff/BlastOffCapture.tsx` | edit (after P1/P2) | Mounts `useObsRecorder` + `useV3TakeSession` in the main window, renders the OBS chip in the chrome and `TakeDecision`, gates the keydown handler on the modal, F4 stops signalling when the socket is connected |
| `src/components/blastoff/capture/v3-take-session.ts` | new | `useV3TakeSession({ set, frames, dir, onNote })`: on STOPPED → `awaitStoppedFile` → `saveTake({...pending, pubKey})` → `decision`; `keep(replace?)` / `tryAgain()` / `scratch()` / `leavePending()`; `pending: TakeRecord[]` (records with `pubKey` for this set, status pending) |
| `src/components/v3/short-jobs.ts` | new, pure + hook | `ShortJob` (camelCase mirror), `rowToJob`, `SHORT_JOB_STATES`, `TRANSITIONS`, `nextStep(job)`, `isStale`, `pickNext`, `transitionPatch(from,to,patch)` whitelist, `useShortJobsDrain({ enabled, dir, tabId })` |
| `src/lib/short-jobs.functions.ts` | new | The server functions (§3.7). Own file, like `publish-queue.functions.ts:6-8` explains for its own naming |
| `src/routes/v3.post.tsx` | edit | Loads `listShortJobs()`, passes `job` to `SetRow`, mounts the drain, adds the `Captioned` filter, hands `job` to `PostProduction` |
| `src/components/v3/PostProduction.tsx` | edit | Accepts `job?: ShortJob \| null`; with a row, steps 1–3 read from it (§3.8) |
| `src/components/blastoff/capture/HotkeysModal.tsx` | edit | A "Keep loop" group: F10 / T / F8 / Esc |
| `migration/supabase-migrations/20260909_0100_short_jobs.sql` | new | §4.3 |

Import direction: `blastoff/*` → `canvas/*` already exists (`BlastOffCapture.tsx:58-62`). Three canvas
files import from `blastoff` (`cards/BlastOffNodes.tsx`, `cards/CalloutCard.tsx`, `ReviewBoard.tsx`);
none of them may ever import `capture/obs.ts`, `capture/v3-take-session.ts` or `v3/short-jobs.ts`
(`import-cycles.test.ts` scans all of `src`; pin it explicitly, §5.3).

### 3.4 The headless extraction — `canvas/takes-session.ts`

Move, do not rewrite. The hook is the drawer's logic with the JSX cut off:

```ts
export const OBS_KEYS = { addr: "sa-obs-addr", pass: "sa-obs-pass", on: "sa-obs-on" } as const;
export const STOP_SCAN_WAITS_MS: readonly number[] = [400, 1200, 2500];
export function readObsPrefs(): { addr: string; pass: string; on: boolean }
/** Scan for the file OBS said it wrote, on the retry ladder; returns the NEW files (only `name` when given). */
export async function awaitStoppedFile(dir: DirHandle | null, name: string | undefined, known: () => TakeRecord[], waits = STOP_SCAN_WAITS_MS): Promise<ScannedFile[]>
/** The socket with the flashing-bug law baked in: deps are [on, tick] and nothing else. */
export function useObsSocket(o: { on: boolean; tick: number; addrRef: RefObject<string>; passRef: RefObject<string>; onStatus: (s: ObsStatus, d?: string) => void; onRecord: (e: ObsRecordEvent) => void }): void
/** TakesInbox's whole brain: ingest, keep, trash, restore, triage + keep-to buses, recycle stats. */
export function useObsTakeSession(o: { armed: TakeTarget | null; openFrameId: () => string | null; onUpload: TakesInboxProps["onUpload"]; onRecordStart: () => void; onRecycle?: (b) => void }): ObsTakeSession
export interface ObsTakeSession { takes; dir; grantFolder(): Promise<void>; status; detail; recording; note; setNote; bin; scan(): Promise<number>; keep(t, over?); trash(t); restore(t); obs: { addr; setAddr; pass; setPass; on; toggle(); retry(); } }
```

What moves verbatim (and the tests that pin it move with it, §5.2): the refs block (:89-99), `connectTick`
(:102), the folder restore (:110), `ingest` (:118-143), the OBS effect (:146-183), `doKeep` (:188-216),
`doTrash` (:218-224), `doRestore` (:226-232), both bus registrations (:237-254). `TakesInbox` keeps: the
`useState`s that are pure UI (`showRecycle`, `showObs`, `playing`, `transcribeOn`), `row`, the JSX.

`useObsSocket` is what `capture/obs.ts` also uses, so the "deps are only the explicit dial signals" law
has one implementation. `awaitStoppedFile` is what both worlds call on STOPPED, so the retry ladder has
one implementation. Both are React-free enough to unit-test with a fake `DirHandle`.

The V3 `useObsRecorder` does **not** use `useObsTakeSession` — it would drag in slate, coverage,
orientation and the armed target, none of which V3 has.

### 3.5 Roll on the real record start (lands after P2)

`useObsRecorder.onStarted` → `signalRoll(set.id)` (`prompter-sync.ts:167-169`). Why: today F4 rolls only
in the window that has focus (`BlastOffCapture.tsx:496-501`); with OBS focused, the recording starts and
nothing assembles. The socket sees every start.

The race: the same F4 press reaches the focused browser window **and** OBS. Two `signalRoll`s a few
hundred ms apart re-mount the cold open (`roll` bumps `run.id`, :396). Fix in two places, both pure and
tested:
- `isFreshRoll(rec, setId, now, seenAt, minGapMs = ROLL_MIN_GAP_MS /* 1500 */)` — a roll within
  `minGapMs` of the last one this window acted on is not fresh. `useRollSignal` records the acted-on
  `at` already (`seen.current`, :191); the gap check is one more line.
- In the main window's F4 handler: `if (!obs.connected) signalRoll(set.id)` — when the socket is up,
  the socket is the trigger and the key is just the key. The pop-out never has the socket, so its F4
  keeps rolling itself locally as today.

`sa-film-cue` (`{ setId, frameId, at }`, `CUE_FRESH_MS = 4000`, `useCueSignal(setId, enabled, onCue)`) is
what **Try again** uses to put the pop-out back on the split's head slide. Same freshness rule as the
roll, same "the writer never hears its own event" property (`prompter-sync.ts:178-183`). If P2 already
provides a way to cue the pop-out to a frame, reuse that and do not add the key.

### 3.6 The UI

**`/film` main window chrome (H toggles; never drawn in the pop-out):**
- `OBS ●` / `OBS ○` chip, coloured by status (connected mint, error rose, else muted), `title` =
  the `detail` line. Click → a small popover: address, password, Connect / Disconnect, Retry, the
  error line — the same four controls as `TakesInbox.tsx:325-338`, the same keys. No slate row.
- `Folder ✓` / `Grant folder` (the same button as `TakesInbox.tsx:341`), and the mismatch line when
  `dirName(lastStop.path) !== dir.name`.
- `Pending N` when V3 records for this set are pending (Esc'd decisions, or takes that landed while
  the window was closed and were found on the next scan). Click → re-open the decision for the newest.

**`TakeDecision` (main window only, gated `!popout.isPopout`, z above the phone):**
```
  Take landed · Split 2 — Liabilities ◂ ▸        2:41 · 2026-09-09 14-02-11.mp4 · 312 MB
  [ Keep  F10 ]   [ Try again  T ]   [ Scratch  F8 ]            Esc leaves it pending
  ┌ notes ──────────────────────────────────────────────────────────────────────
  │ · OBS is writing to "Videos"; the granted folder is "OBS-takes". Grant "Videos"   (mismatch only)
  │ · .mkv: it will burn, but the cover and the local transcript need MP4 — set OBS to MP4 (mkv only)
  │ · Split 2 already has a kept take (2:41, captioned). Keep REPLACES it.          (replace only)
  │ · Folder not granted — [Grant folder] to keep                                     (no dir only)
```
- Keep: disabled until the folder is granted (the Grant button is inside the modal, so the click is the
  gesture Chrome needs). Then, in order: `saveTake({...t, status:"kept", upload:{state:"queued"}})` →
  `keepShortTake({...})` (creates the `kept` row; refuses without `replace` when one exists) →
  `setFilmed({ setId: pubKey, filmed: true })` best-effort (`publish-queue.functions.ts:108-125`; the
  stage chip goes "filmed" on its own) → `uploadTake(file, onFrac)` with the percent in the chrome note
  (`TakesInbox.tsx:202-204` is the reason) → `advanceShortJob({ from:"kept", to:"uploaded", patch:{
  takePath, takeUrl } })`. The modal closes on the row write, not on the upload — the upload is a note.
- Try again: `moveToRecycle` → `saveTake({...t, status:"trashed"})` → `signalCue(set.id, headFrameId)`.
- Scratch: `moveToRecycle` → trashed. Note "Moved to _trash — restore from Explorer".
- Esc, or F4: the record stays `pending`, the modal closes; F4 then does what F4 does.
- Keys are handled in `BlastOffCapture`'s keydown **before** the review-overlay gate (:444-450): a real
  take outranks a rehearsal overlay. F10/F8 `preventDefault` (Chrome's F10 = menu bar). `T` is free
  (grep `"t"` in `BlastOffCapture.tsx` and `capture/*`: nothing).

**`/v3/post`:**
- Each row gets a job chip after the `StageChip`: `kept · uploading 42%` / `transcribing` / `burning ·
  3:10` / `captioned ✓` / `failed: <error>`. A `Download captioned` button when `ready`
  (`downloadUrlAs(burnedUrl, burnedName(takeFile))`), `Retry` when `failed`, `Pick the take file` when
  `kept` and the folder is not granted here (the existing `PostProduction` picker, which then uploads
  and advances the row).
- A fifth filter `Captioned` (job `ready`, stage not `posted`), beside the four in `FILTERS`.
- `useShortJobsDrain` mounted once on the page: lists every 15 s + `focus` + `online` (the
  `transcript-client.ts:110-120` shape), runs at most one step at a time, never two rows at once.
- The page's folder: `savedTakesFolder(false)` on mount; a `Grant folder` button in the header when a
  `kept`/`uploaded` row needs the local file and the grant is stale.

**`PostProduction` with a row:** step 1 shows `take_file · uploaded from the filming PC` and is done;
step 2 is done (it already reads `storedTranscript`, :89-95); step 3 shows `Download <name>.captioned.mp4`
from `burnedUrl`, `Burn it again` still works (uses `takeUrl` + a fresh `.ass`, then writes the new
`burnedUrl` back through `advanceShortJob({from:"ready", to:"ready"})`); `failed` shows the error and
`Retry`. Without a row the dialog is exactly today's six steps — the laptop-picks-a-file path stays.

### 3.7 Server functions — `src/lib/short-jobs.functions.ts`

All `createServerFn`, all `assertAdmin()` first, all fail loud on a missing table with the exact filename
(`isMissingSchema(e, /short_jobs/i)` → "Run migration/supabase-migrations/20260909_0100_short_jobs.sql
first."). Same `any`-typed `from("short_jobs")` escape hatch as `publish-queue.functions.ts:19-23` until
the generated types catch up.

```ts
listShortJobs(): Promise<Record<string /* pubKey */, ShortJobRow>>                      // GET; {} on missing table (a fresh install has kept nothing)
keepShortTake({ pubKey, setId, takeIndex, headFrameId, takeFile, takeBytes, takeMtimeMs, durationS, replace?: boolean })
  → { ok: true; row } | { ok: false; error: "exists" | string }                        // insert `kept`; with replace: reset + take_generation + 1
claimShortJob({ pubKey, by, staleMs }) → { ok; row? }                                     // update … where claimed_at is null or < now() - staleMs
advanceShortJob({ pubKey, from: State, to: State, patch }) → { ok: true; row } | { ok: false; error: "moved" | string }
  // update patch+{state:to, updated_at, claimed_by:null, claimed_at:null} where pub_key=? and state=from; 0 rows ⇒ "moved"
failShortJob({ pubKey, from, error }) → row                                                // state failed, failed_from=from
retryShortJob({ pubKey }) → row                                                            // failed → failed_from; error null; burn_attempts kept
```

`TRANSITIONS` (also the zod whitelist for `patch`, one table in `v3/short-jobs.ts` imported by the fn):

```
kept → uploaded        { takePath, takeUrl }
uploaded → transcribed { transcriptPath, transcriptReadyAt }
transcribed → burning  { assUrl, burnJobId, burnMachineId, burnPath }          burn_attempts += 1
burning → burning      same as above (re-submit after the worker's 404)        burn_attempts += 1, ≤ 3 else failed
burning → ready        { burnedUrl, burnedAt }
ready → ready          { burnedUrl, burnedAt }                                 (Burn it again)
* → failed             { error }                                               failed_from = *
failed → failed_from   {}                                                      (Retry)
```

### 3.8 The drain — `useShortJobsDrain`

```
tick():  if busy or !enabled or !online → return
         jobs = await listShortJobs(); job = pickNext(jobs, now)   // oldest kept_at among non-terminal, unclaimed or stale
         if !job → return
         if !(await claimShortJob({pubKey, by: tabId, staleMs})).ok → return
         switch nextStep(job):
           "upload":     file = dir ? await getFile(dir, job.takeFile) : null
                         if !file → release the claim, leave it (the row's chip offers the picker) ; return
                         url = await uploadTake(file, frac => setProgress(pubKey, frac))
                         advance(kept → uploaded, { takePath: pathOf(url), takeUrl: url })
           "transcribe": file = dir ? await getFile(dir, job.takeFile) : null
                         row = file && !isMkv(file.name)
                               ? await transcribeTakeFile(job.pubKey, file, note, job.takeGeneration > 1)
                               : await transcribeSmart(shortTranscriptPath(job.pubKey), job.takeUrl, job.takeFile, { force: job.takeGeneration > 1, onNote: note })
                         advance(uploaded → transcribed, { transcriptPath: row.take_path, transcriptReadyAt: now })
           "burn":       words = (await storedTranscript(job.pubKey))!.words
                         ass = shortCaptionFiles(words).ass ; assUrl = await uploadAss(job.takeFile, ass)
                         j = await startCaptionBurn({ data: { videoUrl: job.takeUrl, assUrl } })
                         advance(transcribed → burning, { assUrl, burnJobId: j.jobId, burnMachineId: j.machineId, burnPath: j.path })
           "poll":       r = await resolveWorkerRender({ data: { jobId, path: burnPath, machineId } })
                         done  → advance(burning → ready, { burnedUrl: r.fileUrl, burnedAt: now })
                         error → fail(burning, r.error)
                         404 "unknown job" (workerFetch throws with HTTP 404) → burn_attempts < 3 ? re-submit (burning → burning) : fail
                         else  → release the claim; poll again next tick (3 s while a burn is live, else 15 s)
         on any throw → failShortJob({ pubKey, from: job.state, error })
```

`pickNext` prefers `burning` rows (a poll is cheap and the worker sleeps after 5 min idle,
`config.ts:85`) over `kept`/`uploaded`/`transcribed`, then oldest first. The 20-minute budget in
`take-burn.ts:56` becomes `burn_attempts`+wall-clock on the row: a `burning` row older than 25 min with
no state change fails with "the burn is taking longer than twenty-five minutes — check the worker".

`transcribeSmart` in the fallback branch **does** re-download the take (§1.3 item 2); it runs only when
the local file is not reachable from this tab. The chip says "transcribing from the uploaded copy —
grant the folder to do this locally next time".

---

## 4. SQL LEE MUST RUN

Never auto-run. Pasted by hand into the Supabase SQL editor (`docs/SESSION-CONTEXT.md` §2). The code
gates loudly until it has run. **Re-check the high-water mark on the day** (folder listing and
`git log --all --name-only -- migration/supabase-migrations/`); if a later-dated file exists, rename
this one to sort after it.

### 4.1 File: `migration/supabase-migrations/20260909_0100_short_jobs.sql`

```sql
-- SHORT JOBS (2026-09-09) — the hopper. Lee's POST notes: "OBS keep-loop → hopper → posted to the
-- website". One row per Blast Off video (the /v3/post publish key: the set id, or "<setId>#N" for a
-- split — src/components/blastoff/plan.ts pubKeyFor), written the moment Lee presses Keep on the
-- OBS record-stop decision in the /film main window, and carried by the browser on /v3/post through
-- upload → transcript → burned captions. Every transition is a compare-and-set on `state`, so a
-- reload resumes and two tabs cannot double-advance (src/lib/short-jobs.functions.ts).
--
-- WHY A TABLE. PostProduction.tsx held the burned URL in React state and lost it on close; the Fly
-- render worker keeps its job map in memory (worker/src/server.ts) and forgets a job on restart, so
-- burn_job_id + burn_machine_id + burn_path live here and a 404 re-submits. Vercel cron is daily on
-- this plan — nothing server-side drives this; the browser does, one step at a time, off these rows.
--
-- NOT A PUBLISH RECORD. "posted where" stays on set_publish_status (20260906_0200), keyed the same
-- way. This table stops at `ready` (a captioned MP4 in canvas-media/blastoff-captioned/).
--
-- Additive, idempotent. RLS deny-by-default like every table this season; all access rides the
-- service-role server fns in src/lib/short-jobs.functions.ts (every one of them assertAdmin).
BEGIN;

create table if not exists public.short_jobs (
  pub_key             text primary key,
  set_id              text not null,
  take_index          integer not null default 0,
  head_frame_id       text null,
  state               text not null,
  failed_from         text null,
  -- the file OBS wrote, as the granted folder sees it (identity = name + size + mtime, takes-store.ts)
  take_file           text null,
  take_bytes          bigint null,
  take_mtime_ms       bigint null,
  duration_s          numeric null,
  take_generation     integer not null default 1,
  -- uploaded (canvas-media/blastoff-takes/)
  take_path           text null,
  take_url            text null,
  -- transcribed (take_transcripts.take_path = 'blastoff/<pub_key>.take')
  transcript_path     text null,
  transcript_ready_at timestamptz null,
  -- burning (Fly worker; the three fields resolveWorkerRender needs, persisted because the worker forgets)
  ass_url             text null,
  burn_job_id         text null,
  burn_machine_id     text null,
  burn_path           text null,
  burn_attempts       integer not null default 0,
  -- ready (canvas-media/blastoff-captioned/)
  burned_url          text null,
  burned_at           timestamptz null,
  -- bookkeeping
  error               text null,
  claimed_by          text null,
  claimed_at          timestamptz null,
  kept_at             timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint short_jobs_state_ck check (state in ('kept', 'uploaded', 'transcribed', 'burning', 'ready', 'failed')),
  constraint short_jobs_failed_from_ck check (failed_from is null or failed_from in ('kept', 'uploaded', 'transcribed', 'burning', 'ready'))
);

comment on table public.short_jobs is
  'The Blast Off hopper: one row per short (pub_key = /v3/post key), from Keep on the OBS record-stop to a captioned MP4. Driven by the browser on /v3/post one CAS step at a time. Authoring-only; never student-facing.';
comment on column public.short_jobs.state is
  'kept → uploaded → transcribed → burning → ready; failed with failed_from. Posting is set_publish_status''s fact, not this table''s.';

-- the drain: non-terminal rows oldest first; a set's videos in order
create index if not exists short_jobs_state_idx on public.short_jobs (state, kept_at);
create index if not exists short_jobs_set_idx on public.short_jobs (set_id, take_index);

alter table public.short_jobs enable row level security;
-- no policies: deny-by-default; service-role bypasses RLS.

COMMIT;

-- PROOF (SESSION-CONTEXT §2: a run that changed nothing looks exactly like one that succeeded)
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'short_jobs'
order by ordinal_position;
```

### 4.2 Nothing else

No change to `set_publish_status`, `take_transcripts`, `canvas_scenes`, or any storage bucket. The
three storage folders used (`blastoff-takes/`, `transcribe-audio/`, `blastoff-captioned/`) already
exist as prefixes in `canvas-media` (`take-burn.ts:44,49`, `take-transcript.ts:51`,
`render-worker.functions.ts:194`).

---

## 5. Build order — small, verifiable slices

Each slice: typecheck (`bun x tsc --noEmit`) + `bun test` green, one commit, files added by explicit
path. RISKY tier (CLAUDE.md) for S2 and S4. **Nothing OBS-touching can be verified without OBS
running** — a green build proves the socket nothing; S5–S8 end with a checklist Lee runs at the machine.

| # | Slice | Files | Verify |
| --- | --- | --- | --- |
| S0 | `assertAdmin()` at the top of every handler in `publish.functions.ts`, `render-worker.functions.ts`, `transcribe.functions.ts`, `talkthrough.functions.ts` | those four | New pin test: for each file, `createServerFn(` count === `assertAdmin()` count. Then open the canvas studio and `/v3/post` as Lee and upload one clip — both surfaces sit behind `AdminGate`, so nothing should change |
| S1 | `dirName` in `obs-bridge.ts` (function declaration) | `obs-bridge.ts`, `takes-inbox.test.ts` | Tests: Windows, POSIX, trailing separator, bare name → `""`. `tdz-graph.test.ts` still passes (baseline unchanged) |
| S2 | The extraction (§3.4): `takes-session.ts`; `TakesInbox.tsx` consumes it; **the eight pins repointed in the same commit** (§5.2); the `!t.pubKey` filter + its new pin | `takes-session.ts`, `TakesInbox.tsx`, 8 test files | `bun test` green with no pin deleted; `tdz-graph` zero arrow-consts in the new file; `import-cycles` green. Then the canvas studio: connect OBS, F9, F10, F8 once each — behaviour identical |
| S3 | `pubKeyFor` + `takeIndexForFrameId` in `plan.ts`; `v3.post.tsx:136` uses `pubKeyFor`; `take-decision.ts` pure helpers; `TakeRecord.pubKey` | `plan.ts`, `v3.post.tsx`, `take-decision.ts`, `takes-store.ts`, tests | `takes.test.ts` + `take-decision.test.ts` (§5.1) |
| S4 | Migration file; `v3/short-jobs.ts` (states, transitions, `nextStep`, `pickNext`, `transitionPatch`); `lib/short-jobs.functions.ts` | as named | `short-jobs.test.ts`; the migration/TS consistency pin (§5.3). **SQL LEE MUST RUN** listed in the report |
| S5 | `capture/obs.ts` (`useObsRecorder` over `useObsSocket`); the OBS chip + popover + folder button in the `/film` chrome, main window only | `obs.ts`, `BlastOffCapture.tsx` | Pins: mounted with `enabled: !popout.isPopout`; chip inside the `chrome &&` branch. At the machine: wrong password shows the 4009 line and stops retrying; OBS off shows the 1006 line and retries; Connect from `/film` with the canvas's saved password works without retyping |
| S6 | `v3-take-session.ts` + `TakeDecision.tsx`; keydown gate; Keep → row + `setFilmed` + upload; Try again / Scratch → `_trash` | `v3-take-session.ts`, `TakeDecision.tsx`, `BlastOffCapture.tsx`, `HotkeysModal.tsx` | At the machine, one split: F4, talk, F4 → the modal names the right split; Keep → `select * from short_jobs` shows `uploaded` with a URL; Scratch → the file is in `_trash`; Esc → `Pending 1` in the chrome |
| S7 | `/v3/post` lane + `useShortJobsDrain`; `PostProduction` reads the row | `v3.post.tsx`, `short-jobs.ts`, `PostProduction.tsx` | At the machine: leave `/v3/post` open after a Keep → the chip walks `transcribing → burning → captioned` without a click; close the tab mid-burn, reopen → it resumes from `burning` (job id persisted); `fly machines restart` mid-burn → re-submits once, then `ready` |
| S8 | STARTED → `signalRoll` with `ROLL_MIN_GAP_MS`; `sa-film-cue` for Try again; F4 stops signalling when connected | `prompter-sync.ts`, `obs.ts`, `BlastOffCapture.tsx`, `prompter-sync.test.ts` | Tests for `isFreshRoll` gap + `isFreshCue`. At the machine: focus OBS, press F4 → the pop-out assembles exactly once; Try again → the pop-out is on the split's head slide |

S5–S8 all edit `BlastOffCapture.tsx`, which P1/P2 are rewriting. **Do not start S5 until P1/P2 are on
main**; S0–S4 have no file overlap with them and can go first.

### 5.1 Tests to write (new)

- `canvas/takes-session.test.ts` — `awaitStoppedFile`: found on the 2nd tick (fake `values()` that
  yields the file after one call), never found → `[]`, `name` filters to that file only, `known` excludes
  an already-banked identity; `readObsPrefs` defaults to `OBS_DEFAULT_ADDRESS` / `""` / `false`.
- `takes-inbox.test.ts` additions — `dirName` cases; "V3 takes never show in the canvas inbox"
  (`expect(inbox).toContain("filter((t) => !t.pubKey")`).
- `blastoff/capture/take-decision.test.ts` — `takeIndexForNode`: a `ceq` node id, a `blast-<id>` id, the
  outro carrying `cutAfter` resolves to the take before the cut, an unknown id → `null`; `pubKeyFor(s,0)
  === s`, `pubKeyFor(s,1) === s + "#2"`; `folderMismatch` returns `null` when equal, the sentence when
  not; `mkvWarning`; the reducer: `pending` + keep → `kept`, + try/scratch → `trashed`, + esc → `pending`.
- `blastoff/takes.test.ts` additions — `takeIndexForFrameId` agrees with `planTakes` on a plan with a
  skipped frame inside a run (indices must match `blastoff.functions.ts:93`).
- `v3/short-jobs.test.ts` — `SHORT_JOB_STATES` equals the SQL check list (read the migration file as
  text, extract the `in (...)` list, compare); `TRANSITIONS` rejects `kept → burning`; `transitionPatch`
  strips keys not whitelisted for the pair; `nextStep` per state; `pickNext`: prefers `burning`, then
  oldest `kept_at`, skips a fresh claim, takes a stale one; burn attempt 4 → `failed`.
- `lib/short-jobs.functions.test.ts` (source pins, the repo's style) — every `createServerFn` in the file
  is followed by `assertAdmin()`; the missing-table message names
  `20260909_0100_short_jobs.sql` and that file exists.
- `blastoff/capture/prompter-sync.test.ts` additions — `isFreshRoll` with `minGapMs`: two rolls 200 ms
  apart → second not fresh, 2 s apart → fresh; the cue record round-trips; the cue never fires for
  another set.
- `blastoff/obs-keep-loop.test.ts` (source pins) — `BlastOffCapture.tsx`: `useObsRecorder({ enabled:
  !popout.isPopout`, `{!popout.isPopout && decision && (<TakeDecision`, F10/F8 handled with
  `e.preventDefault()`; `capture/obs.ts` contains `}, [on, tick]);` and no `useObsTakeSession`; no file
  under `src/components/canvas/` imports `blastoff/capture/obs`, `capture/v3-take-session` or
  `v3/short-jobs`.

### 5.2 The eight pinned test files — what moves where in S2

Every string listed as "moves" is asserted against `takes-session.ts` after S2 instead of
`TakesInbox.tsx`; nothing is deleted or loosened. Where a pin was a `not.toContain`, assert it on both
files.

| Test file | Line(s) | Pinned string | After S2 |
| --- | --- | --- | --- |
| `takes-inbox.test.ts` | :100 | `display: hidden ? "none" : undefined` | stays (UI) |
| | :105 | `STUDIO SURFACE ONLY` | stays; add the same banner to `takes-session.ts` and pin it there too |
| | :108-110 | slice `const ingest =` … `// OBS bridge` has no `onUpload`; `const doKeep` | moves |
| | :130-134 | `}, [obsOn, connectTick, ingest]);`, `openFrameRef.current()`, `onRecStartRef.current()`, not the old deps | moves (the string may become `}, [on, tick]);` inside `useObsSocket` — keep the `not.toContain` of the old dep list on **both** files) |
| | :164-165 | `if (!opts?.onlyName) {`, `const gone = missingRecords(currentTakes(), scanned);` | moves |
| | :168-169 | remove-row title, `dropTakeRecord(t.id)` | stays |
| | :172-173 | "Use THIS take as today's room tone" | stays |
| `filming-mode.test.ts` | :44 | one `<TakesInbox` mount in the studio | stays |
| | :58-63 | `className={inline ? …`, no ✕ on a docked rail, no `clipsPanel`/`cardClips` | stays; the two absences also asserted on `takes-session.ts` |
| `film-slate.test.ts` | :113-116 | `beginCoverage(openFrameRef.current());`, `const win = endCoverage();`, `coverageForFile(f.lastModified)` | moves |
| `orientation.test.ts` | :200 | `const rec = makeRecord(f, { orientation: orientation(),` | moves |
| `pipeline-scratch.test.ts` | :18-20, :24, :30-31, :79, :107-113 | scratch lane, play title, draggable, Trash title, recycle drawer | stays |
| | :44, :46, :53 | `setKeepToHandler((takeId, frameIds, at) => {`, `const t: TakeRecord = over?.frameIds.length`, `kind: over.frameIds.length > 1 ? "range" : "ceq"` | moves |
| `pipeline-timeline.test.ts` | :181 | `{inline && collapsed ? (` | stays |
| `pipeline-transcript.test.ts` | :49-51 | `enqueueTranscription(path, url, t.fileName);` after `upload: { state: "done"` | moves (ordering assertion included) |
| | :54 | `localStorage.setItem("sa-transcribe-on"` | stays |
| `pipeline-view.test.ts` | :60 | no `clipsPanel` | stays; also on `takes-session.ts` |

### 5.3 Consistency pins worth having from day one

- The SQL `check (state in (...))` list ⇔ `SHORT_JOB_STATES` (read the migration file).
- `pubKeyFor` is the only place `#${` is built for a publish key (grep `v3.post.tsx` for `"#"`
  after S3: zero hits outside the import).
- No canvas file imports the three V3 modules (above).

---

## 6. Hotkeys, after this lands

| Where | Key | Does |
| --- | --- | --- |
| OBS (global, Lee's binding) | F4 | start / stop the recording — the app never binds OBS's keys |
| `/film`, either window | F4 | also ROLL (cold open); with the socket connected, the socket rolls and the key is just the key |
| `/film` main window, decision up | F10 | Keep |
| | T | Try again (to `_trash`, cue the split's head slide) |
| | F8 | Scratch (to `_trash`) |
| | Esc / F4 | leave it pending |
| canvas studio (unchanged) | F9 / F10 / F8 | record (OBS) / keep / trash (`CeqPreviewer.tsx:2639-2640, :2685`) |

The `?` card (`HotkeysModal.tsx`, the "Take" group around :60-64) gets a "Keep loop" group with the
four rows. `popout.test.ts:55-60` pins the F4 cue text — leave `countdownCue` alone.

---

## 7. Do not build (and why)

1. **A directory watcher** (`FileSystemObserver`, or polling `values()` every second). Origin-trial API;
   and the STOPPED event already tells us the exact file. Scan on demand.
2. **A local helper process / Electron / a Node script that reads the OBS folder.** The granted-folder
   API already reads and moves files; the two-machine rule (`docs/TWO-MACHINES.md`) means the laptop has
   Chrome and OBS and nothing else installed.
3. **A server-driven hopper** (Vercel cron, a queue worker). Cron is daily on this plan
   (`docs/PROMPT-POSTING-YOUTUBE.md`); the Fly worker's job map is in memory. Durable rows + a browser
   drain is the design that survives what the infrastructure actually is.
4. **Persisting jobs inside the worker** (SQLite on Fly). The app already has Supabase; the row holds
   `burn_job_id + burn_machine_id + burn_path` and re-submits on 404. Two databases for one job is worse.
5. **`enqueueTranscription` for V3 takes.** §1.3 item 2 — it re-downloads the take and is a second
   durable queue. Call `transcribeTakeFile` from the drain.
6. **Auto-Keep** (banking the file without the decision). The canvas law "nothing uploads without an
   explicit Keep" (`takes-inbox.test.ts:107-111`) exists because a whole session once banked takes it
   should not have. The modal is the point.
7. **A `posted` state on `short_jobs`, or `stageOf` reading the hopper in v1.** `set_publish_status`
   owns posting; `stageOf` (`set-stage.ts:102-113`) has tests and two consumers. A job chip beside the
   stage chip says everything the lane needs. Revisit when Lee asks for "captioned" as a stage.
8. **Site auto-publish, Mux ingest at Keep, `shorts[]` on `StudentSet`.** Student-visible; P11's design;
   CLAUDE.md forbids unattended student-visible change. Explicit press on `/v3/post` only, and not in
   this package.
9. **Mounting the socket in the pop-out**, or a second main window, or a `BroadcastChannel` lock for
   the single-socket rule. The pop-out is the shot (`popout.ts:18-22`). Write the rule down (done);
   build the lock when it has actually bitten.
10. **Rewriting `roll` / F4 semantics.** P2 owns `BlastOffCapture.tsx:396`; this design adds one
    trigger and one debounce and nothing else.
11. **A keymap extraction (`capture/keymap.ts`).** Right idea, wrong package — it edits the same file
    as P2 and this.
12. **Retiring `PostProduction`'s file picker.** It is the path for a take that exists on a machine with
    no folder grant (and for the mkv-until-Lee-switches case).
13. **Deleting anything, ever.** `_trash` and Explorer.
14. **Changing `set_publish_status`'s key shape** to fix "add a cut above and every `#N` shifts". Real,
    already true today for captions and posted flags, and `head_frame_id` is on the row so a later
    re-key is possible. Not this package.

---

## 8. Open questions for Lee (do not guess; ask, then build)

1. **OBS recording format on the laptop** — MP4 (Hybrid MP4 on OBS 30+) or MKV? MP4 makes the cover grab
   and the local transcript work (`take-frame.ts:69`); MKV only burns. The runbook recommends MP4.
2. **Is F4 bound in OBS to a start/stop toggle, or start only?** The design assumes toggle (F4 ends the
   take and the modal appears). If it is start-only, the STOPPED event still arrives from whatever key
   stops it; only the runbook wording changes.
3. **Same recordings folder for the canvas world and V3?** Handled either way (`pubKey` separates the
   records), but a single folder means the canvas inbox and the V3 strip both scan it.
4. **Should Keep mark the split "filmed"?** The design says yes (`setFilmed(pubKey)` on Keep, cheap and
   reversible on `/v3/post`). Confirm.
5. **Whisper key and worker env on Vercel** — `OPENAI_WHISPER` (`transcribe.functions.ts:61-62`) and
   `RENDER_WORKER_URL/TOKEN` (`render-worker.functions.ts:17-23`) must be set or S7 fails loud at the
   first row. Not inspectable from the repo.

---

## 9. Where this document should be linked from (integrator: one line each, not done here)

- `docs/FILMING-WORKFLOW.md` — under "The loop", a line: "V3 Blast Off shorts have their own keep
  loop: `docs/DESIGN-OBS-KEEP-LOOP.md`; OBS setup for both worlds: `docs/OBS-WIRING.md`."
- `docs/PIPELINE-FILMING-CONTEXT.md` §5 (the OBS section) — a pointer to `docs/OBS-WIRING.md`.
- `docs/V3-PRODUCTION-HANDOFF.md` near the `/film` and `popout.ts` paragraphs (:613-620) — a pointer to
  this design.
