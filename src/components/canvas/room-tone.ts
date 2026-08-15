// ROOM TONE (smart stitch) — the session's recorded silence, the gap-fill
// source for dissect stitching. One per DAY: uploading again same-day
// replaces it; the stitcher automatically uses today's with zero per-CEQ
// steps. localStorage (single author, same call as templates/idea bank);
// the URL travels to the worker in the job payload.

export interface RoomTone {
  /** ISO date (YYYY-MM-DD) the tone was recorded/uploaded. */
  date: string;
  url: string;
  path: string;
  name?: string;
}

const KEY = "sa-room-tone";

export const isoDay = (d = new Date()): string => d.toISOString().slice(0, 10);

export function loadRoomTone(): RoomTone | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as RoomTone | null;
    return v && v.url && v.date ? v : null;
  } catch { return null; }
}

/** Same-day upload replaces; a new day simply supersedes (we keep only the
 *  latest — the files themselves stay in storage untouched). */
export function saveRoomTone(t: RoomTone): void {
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* blocked: session-only */ }
}

/** Today's tone or null — the stitcher falls back to the pink floor on null. */
export function todaysRoomTone(now = new Date()): RoomTone | null {
  const t = loadRoomTone();
  return t && t.date === isoDay(now) ? t : null;
}
