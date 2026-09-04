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
import { useEffect } from "react";

import type { BlastFrame } from "../plan";

export const FILM_ACTIVE_KEY = "sa-film-active";

/** The record the Studio writes and the prompter reads — the same three fields. */
export interface FilmActive { setId: string; qId: string | null; at: number }

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

export function filmActiveRecord(setId: string, qId: string | null, at: number = Date.now()): FilmActive {
  return { setId, qId, at };
}

/** Write the record. False when storage is unavailable (private mode, a
 *  sandboxed frame) — the prompter simply does not follow then; nothing else
 *  depends on it. */
export function publishFilmActive(setId: string, qId: string | null): boolean {
  try { localStorage.setItem(FILM_ACTIVE_KEY, JSON.stringify(filmActiveRecord(setId, qId))); return true; } catch { return false; }
}

/** The slot BlastOffCapture calls: publish on every frame change, by frame id. */
export function useCapturePrompterSync(setId: string, frameId: string | null): void {
  useEffect(() => { publishFilmActive(setId, filmNodeIdForFrameId(frameId)); }, [setId, frameId]);
}

/** The richer variant: publish the DOCUMENTED node id — the CEQ node for a set
 *  card, blast-<id> for an insert — exactly what the Studio writes for the
 *  same slide. Prefer it wherever the frame itself is at hand. */
export function useCapturePrompterSyncFrame(setId: string, frame: FilmFrameRef | null | undefined): void {
  const qId = filmNodeId(frame);
  useEffect(() => { publishFilmActive(setId, qId); }, [setId, qId]);
}
