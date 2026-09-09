// THE TELEPROMPTER SYNC — the capture surface publishes the active slide the
// way the Studio does, so /v3/teleprompter?set=<set id> on Lee's other monitor
// follows the slide he is filming with nothing to click.
//
// THE CONTRACT (read off CeqStudio.tsx and routes/v3.teleprompter.tsx, 09-04):
// localStorage "sa-film-active" holds { setId, qId, at }. The prompter keeps
// the record whose setId is its own ?set= (the deck id — BoothSetInfo.id here)
// and resolves qId with frameForNode: a set card by its CEQ node id
// (frame.ceqId), and any frame by the node id the canvas sync writes for it,
// "blast-<frame id>". It listens for the cross-window `storage` event AND
// polls the key every 500 ms, so a plain write is the whole publish — there
// is no custom event to raise. prompter-sync.test.ts pins both ends.
//
// THE SECOND READER (2026-09-07): the /film MAIN window. Lee: "I am planning to pop out the
// capture window and be looking at that when I'm recording live… but the /film window is still
// open and has the slides right there too… I would prefer with capture window having a 10 second
// countdown… like we're on slide 0 at that point. and once that countdown starts, we have the
// /film on slide one… BUT, when countdown hits, we advance /film to slide 2… this will help me
// to see *what slide comes next* so I can have some really smooth transitions in mind." So the
// same record grew two OPTIONAL flags the pop-out alone writes — `popout: true` (this record is
// the take, running in the 9:16 window) and `countdown: true` (the 10 s count is on; qId is
// null, "slide 0") — plus a heartbeat: the pop-out rewrites `at` every 2 s, so the main window
// treats a popout record newer than 5 s as "the take is live" and shows the slide AFTER the
// pop-out's, dimmed. The main window stops publishing its own slide while that record is live —
// two writers on one key would fight, and the pop-out is the one that films. Never the other
// direction: the pop-out never follows the main window. The Studio and the teleprompter ignore
// the flags (they read setId/qId/at only, and a null qId reads as "no slide up yet").
import { useEffect, useState } from "react";

import type { BlastFrame } from "../plan";

export const FILM_ACTIVE_KEY = "sa-film-active";

/** The record the Studio writes and the prompter reads — the same three fields, plus the
 *  pop-out's two optional flags (absent, never false, when they don't apply). */
export interface FilmActive {
  setId: string;
  qId: string | null;
  at: number;
  /** Written by the 9:16 pop-out only: this record is the live take. */
  popout?: true;
  /** Written by the pop-out during its 10 s countdown ("slide 0" — qId is null then). */
  countdown?: true;
  /** THE NUMBER ITSELF (2026-09-08). Lee: "So, will students see the 3 2 1?" — they would have.
   *  The count drew INSIDE the pop-out, and the pop-out's client area is exactly what OBS
   *  window-captures, so every take opened on a 3-2-1. The digits left the shot and ride this
   *  field instead, to the windows Lee looks at. Seconds left, 10 → 1; absent unless `countdown`. */
  count?: number;
  /** THE MAP (2026-09-07): on a cluster frame, the SHOT being walked (0-based) — the prompter
   *  shows that shot's `note` as the line. Absent on every other frame kind. */
  shot?: number;
}

/** The pop-out's flags, as the publish helpers take them — and the map's shot. */
export interface FilmActiveFlags { popout?: boolean; countdown?: boolean; count?: number; shot?: number }

/** A pop-out record older than this is a closed (or frozen) pop-out — the main window goes back
 *  to its own slide. Two heartbeats and change. */
export const POPOUT_STALE_MS = 5000;
/** How often the pop-out rewrites `at` while it is open, frame change or not. */
export const POPOUT_HEARTBEAT_MS = 2000;

export type FilmFrameRef = Pick<BlastFrame, "id" | "kind" | "ceqId">;

/** The canvas node id the prompter resolves a plan frame from: a set card IS
 *  its CEQ node; every other frame is the "blast-<frame id>" node. */
export function filmNodeId(frame: FilmFrameRef | null | undefined): string | null {
  if (!frame) return null;
  return frame.kind === "ceq" && frame.ceqId ? frame.ceqId : `blast-${frame.id}`;
}

/** The frame-id-only node id. frameForNode accepts "blast-<frame id>" for a
 *  set card as well as an insert, so this resolves every frame kind (pinned). */
export const filmNodeIdForFrameId = (frameId: string | null): string | null => (frameId ? `blast-${frameId}` : null);

export function filmActiveRecord(setId: string, qId: string | null, at: number = Date.now(), flags: FilmActiveFlags = {}): FilmActive {
  // The flags are ADDED only when true (the shot only when it is a number) — the Studio's
  // three-field shape stays the shape.
  const counting = !!flags.countdown;
  return { setId, qId, at, ...(flags.popout ? { popout: true as const } : {}), ...(counting ? { countdown: true as const } : {}), ...(counting && typeof flags.count === "number" ? { count: flags.count } : {}), ...(typeof flags.shot === "number" ? { shot: flags.shot } : {}) };
}

/** Write the record. False when storage is unavailable (private mode, a
 *  sandboxed frame) — the prompter simply does not follow then; nothing else
 *  depends on it. */
export function publishFilmActive(setId: string, qId: string | null, flags: FilmActiveFlags = {}): boolean {
  try { localStorage.setItem(FILM_ACTIVE_KEY, JSON.stringify(filmActiveRecord(setId, qId, Date.now(), flags))); return true; } catch { return false; }
}

/** Read the record back (the main window's side). Null when absent, unparsable or not a record. */
export function readFilmActive(): FilmActive | null {
  try {
    const v = JSON.parse(localStorage.getItem(FILM_ACTIVE_KEY) ?? "null") as FilmActive | null;
    return v && typeof v === "object" && typeof v.setId === "string" && typeof v.at === "number" ? v : null;
  } catch { return null; }
}

/** The slot BlastOffCapture calls: publish on every frame change, by frame id. */
export function useCapturePrompterSync(setId: string, frameId: string | null): void {
  useEffect(() => { publishFilmActive(setId, filmNodeIdForFrameId(frameId)); }, [setId, frameId]);
}

export interface PublishOptions extends FilmActiveFlags {
  /** The main window while the pop-out's take is live: write nothing (the pop-out drives). */
  paused?: boolean;
}

/** The richer variant: publish the DOCUMENTED node id — the CEQ node for a set
 *  card, blast-<id> for an insert — exactly what the Studio writes for the
 *  same slide. Prefer it wherever the frame itself is at hand.
 *
 *  With `popout` the record carries the flag AND is re-written every
 *  POPOUT_HEARTBEAT_MS so the main window can tell a live pop-out from a closed
 *  one; on pagehide the pop-out writes one last record WITHOUT the flag, so the
 *  main window comes back to its own slide at once rather than after the
 *  stale timeout. */
export function useCapturePrompterSyncFrame(setId: string, frame: FilmFrameRef | null | undefined, opts: PublishOptions = {}): void {
  const qId = filmNodeId(frame);
  const { paused = false, popout = false, countdown = false, count, shot } = opts;
  useEffect(() => {
    if (paused) return;
    const write = () => publishFilmActive(setId, qId, { popout, countdown, count, shot });
    write();
    if (!popout) return;
    const t = window.setInterval(write, POPOUT_HEARTBEAT_MS);
    const onHide = () => publishFilmActive(setId, qId, { shot });
    window.addEventListener("pagehide", onHide);
    return () => { window.clearInterval(t); window.removeEventListener("pagehide", onHide); };
  }, [setId, qId, paused, popout, countdown, count, shot]);
}

// ---------------------------------------------------------------- the main window's side

/** What the main window knows about the take running in the pop-out. */
export interface PopoutTake {
  /** The pop-out's node id (see filmNodeId); null during the countdown. */
  qId: string | null;
  countdown: boolean;
  /** Seconds left in the pop-out's count, or null when it isn't counting. The MAIN window draws
   *  this number — the pop-out no longer can, because the pop-out is the shot. */
  count: number | null;
}

/** Is this record a LIVE pop-out take for this set? Null unless it carries the popout flag,
 *  is this set's, and was written within POPOUT_STALE_MS of `now`. */
export function popoutTake(rec: FilmActive | null, setId: string, now: number): PopoutTake | null {
  if (!rec || rec.popout !== true || rec.setId !== setId) return null;
  if (now - rec.at > POPOUT_STALE_MS || rec.at - now > POPOUT_STALE_MS) return null;
  const countdown = rec.countdown === true;
  return { qId: countdown ? null : rec.qId, countdown, count: countdown && typeof rec.count === "number" ? rec.count : null };
}

/** The slide the MAIN window shows while the pop-out's take is live — the one AFTER the
 *  pop-out's (Lee: "this will help me to see what slide comes next"):
 *    · countdown → 0 (slide 1, "we have the /film on slide one");
 *    · the pop-out on frame k → k + 1, which is frames.length on the last slide ("— end —");
 *    · a node id no frame of this plan matches → null (the main window keeps its own slide). */
export function previewIndex(frames: readonly FilmFrameRef[], take: PopoutTake): number | null {
  if (take.countdown) return 0;
  if (!take.qId) return null;
  const k = frames.findIndex((f) => filmNodeId(f) === take.qId || `blast-${f.id}` === take.qId);
  return k < 0 ? null : k + 1;
}

const sameTake = (a: PopoutTake | null, b: PopoutTake | null): boolean => (a === b) || (!!a && !!b && a.qId === b.qId && a.countdown === b.countdown && a.count === b.count);

/** The main window's listener: the live pop-out take, or null. Hears the cross-window `storage`
 *  event (a write in the pop-out lands here at once) and polls every second (that is how a
 *  record goes STALE when the pop-out stops writing). Off (always null) when `enabled` is false —
 *  the pop-out itself never listens. */
export function usePopoutTake(setId: string, enabled: boolean): PopoutTake | null {
  const [take, setTake] = useState<PopoutTake | null>(null);
  useEffect(() => {
    if (!enabled) { setTake(null); return; }
    const tick = () => setTake((prev) => { const next = popoutTake(readFilmActive(), setId, Date.now()); return sameTake(prev, next) ? prev : next; });
    tick();
    const t = window.setInterval(tick, 1000);
    window.addEventListener("storage", tick);
    return () => { window.clearInterval(t); window.removeEventListener("storage", tick); };
  }, [setId, enabled]);
  return take;
}
