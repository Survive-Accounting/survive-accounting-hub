// COVERAGE LOG — which frames were actually on screen while OBS rolled.
//
// P0 BUG 1 (Lee's real session, 08-18): every kept take wore an "11 FRAMES"
// badge, every take attached to one early frame, auto-advance never fired.
// Three stacked defects produced that:
//
//   1. The badge was never coverage. It rendered the sticky ARMED target's
//      label ("11 frames" for a whole-set range), so a stale arm from earlier
//      masqueraded as coverage on every row.
//   2. Coverage only existed on the EVENT ingest path. A take whose file
//      finalized after the 3 quick retries (400/1200/2500ms) banked later via
//      Scan — with the armed target attached and NO coverage at all. Attach
//      precedence (coverage → armed → open) then fell to armed's 11 ids:
//      patchQ(ids[0]) every time, and auto-advance saw last === final frame ⇒
//      "that was the last frame in the set" ⇒ never advanced.
//   3. Even event-path coverage was polluted: the record-start handler captured
//      liveFrames BEFORE calling the reset, so take N's coverage was
//      visited(N−1) ∪ visited(N).
//
// THE MODEL NOW — one module-level log, same pattern as the slate (film-slate)
// and for the same reason: the studio window and the capture popout are ONE
// React tree, and every ingest path (event, scan, manual) must read the same
// truth.
//
//   record-start  → beginCoverage()            (reset FIRST, then seed)
//   navigation    → logCoverageFrame(qId)      (only while a window is open)
//   record-stop   → endCoverage()              (returns visited; RETAINS the
//                                               closed window for late files)
//   scan ingest   → coverageForFile(mtimeMs)   (a file that finalized late
//                                               still gets its take's window)
//
// The capture window needs no special handling: it is a portal of the same
// tree, so qId — what both windows render — is the one navigation signal.
// There is no BroadcastChannel and none is needed.

export interface CoverageWindow {
  startedAt: string;   // ISO
  stoppedAt: string;   // ISO — "" while still open
  frameIds: string[];  // in VISIT order; consumers map to spine order
}

let open: CoverageWindow | null = null;
/** Closed windows, newest first — retained so a slow-to-finalize file scanned
 *  minutes later can still be matched to the take that produced it. */
const closed: CoverageWindow[] = [];
const RETAIN = 12;

/** GRACE: a file's mtime is its FINALIZE time, which lands after record-stop —
 *  sometimes well after for long takes. Generous on purpose: matching a take
 *  to the wrong window mis-attaches one clip (fixable in one drag); matching
 *  nothing at all re-creates the bug this module exists to kill. */
export const FILE_MATCH_GRACE_MS = 90_000;

export function beginCoverage(seedFrameId?: string | null): void {
  open = { startedAt: new Date().toISOString(), stoppedAt: "", frameIds: seedFrameId ? [seedFrameId] : [] };
}

/** Append a visited frame. No-op when no window is open — navigation between
 *  takes must never accumulate (that accumulation was defect #3's fuel). */
export function logCoverageFrame(frameId: string | null | undefined): void {
  if (!open || !frameId) return;
  if (!open.frameIds.includes(frameId)) open.frameIds.push(frameId);
}

/** Close the window and return it. Retained for late-file matching. */
export function endCoverage(): CoverageWindow | null {
  if (!open) return null;
  open.stoppedAt = new Date().toISOString();
  const w = open;
  open = null;
  closed.unshift(w);
  if (closed.length > RETAIN) closed.length = RETAIN;
  return w;
}

export const coverageOpen = (): boolean => open !== null;

/** The window a file with this mtime was recorded in, if any. A file finalizes
 *  at/after its take's stop, so match mtime ∈ [start, stop + grace]. Newest
 *  window wins when grace periods overlap (short back-to-back takes). */
export function coverageForFile(mtimeMs: number): CoverageWindow | null {
  for (const w of closed) {
    const start = Date.parse(w.startedAt);
    const stop = Date.parse(w.stoppedAt);
    if (mtimeMs >= start && mtimeMs <= stop + FILE_MATCH_GRACE_MS) return w;
  }
  return null;
}

/** Human label for a coverage span, in SPINE order — "Q3" or "Q3–Q6". The
 *  label map comes from the caller (the studio knows the spine); ids missing
 *  from it (deleted frames) are dropped rather than shown as ghosts. */
export function coverageLabel(frameIds: string[] | undefined, spineOrder: string[], labelOf: (id: string) => string | undefined): string | null {
  if (!frameIds?.length) return null;
  const set = new Set(frameIds);
  const inSpine = spineOrder.filter((id) => set.has(id));
  if (!inSpine.length) return null;
  const first = labelOf(inSpine[0]);
  if (!first) return null;
  if (inSpine.length === 1) return first;
  const last = labelOf(inSpine[inSpine.length - 1]);
  return last ? `${first}–${last}` : first;
}

/** Test seam. */
export function __resetCoverage(): void {
  open = null;
  closed.length = 0;
}
