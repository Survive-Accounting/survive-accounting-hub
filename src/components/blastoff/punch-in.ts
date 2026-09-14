// PUNCH-IN FILMING — the rules, pure. PunchIn.tsx is the panel.
//
// Lee, 2026-09-14: "For film, I'd love to do it this way… connect OBS folder… I just punch in and out for
// each slide, unless I want to set up a speed run. So, when I'm filming, just show ONE slide at a time.
// Popout has the window capture. The /film page will just show the next slide coming up. I'll punch in F4
// (the start recording key in OBS) punch out when done. I'll leave plenty of pause between. I will use F3
// to scrap a take and start over. When I hit F3, let it ask me to scrap, press F3 to confirm… But make it
// CTRL Z able anyway… as soon as I finish a split, I want to hit a button to preview it (this will
// automatically edit out pauses, paste everything together, etc)… I can click post right away… One slide
// at a time, one split at a time… using OBS websocket, so it's grabbing the video file autonomously."
// And: "it'd be useful to be able to punch in and overwrite specific slides if there's an improvement".
//
// A TAKE is one OBS recording: the file, and the slides that were on screen from the moment it started to
// the moment it stopped. Walking slides while recording makes a range — that IS the speed run.

export interface PunchTake {
  /** The recording's file name in the OBS folder. */
  file: string;
  /** The slide on screen when recording started, and when it stopped. */
  fromId: string;
  toId: string;
  at: number;
}

/** The slide to put up after a take: the one after the last slide it covered, or null past the end. */
export function nextAfter(frameIds: readonly string[], take: Pick<PunchTake, "toId">): string | null {
  const k = frameIds.indexOf(take.toId);
  return k >= 0 && k + 1 < frameIds.length ? frameIds[k + 1] : null;
}

/** A take's slide range as indexes (from ≤ to), or null when either end is no longer in the split. */
export function rangeOf(frameIds: readonly string[], take: Pick<PunchTake, "fromId" | "toId">): { from: number; to: number } | null {
  const a = frameIds.indexOf(take.fromId), b = frameIds.indexOf(take.toId);
  if (a < 0 || b < 0) return null;
  return { from: Math.min(a, b), to: Math.max(a, b) };
}

/** THE CUT, IN ORDER: the takes that make the video. A newer take wins any slide it covers (punching in
 *  again overwrites), so each slide is filmed once; the picks come back in slide order. */
export function pickTakes(frameIds: readonly string[], takes: readonly PunchTake[]): { take: PunchTake; from: number; to: number }[] {
  const covered = new Set<number>();
  const picked: { take: PunchTake; from: number; to: number }[] = [];
  for (const t of [...takes].sort((a, b) => b.at - a.at)) {
    const r = rangeOf(frameIds, t);
    if (!r) continue;
    let clash = false;
    for (let k = r.from; k <= r.to; k++) if (covered.has(k)) { clash = true; break; }
    if (clash) continue;
    for (let k = r.from; k <= r.to; k++) covered.add(k);
    picked.push({ take: t, ...r });
  }
  return picked.sort((a, b) => a.from - b.from);
}

/** Which slides no kept take covers — shown before a preview, never a block. */
export function uncovered(frameIds: readonly string[], takes: readonly PunchTake[]): number[] {
  const covered = new Set<number>();
  for (const p of pickTakes(frameIds, takes)) for (let k = p.from; k <= p.to; k++) covered.add(k);
  return frameIds.map((_, k) => k).filter((k) => !covered.has(k));
}

/** HOW MANY TAKES ONE JOIN TAKES. Lee, 2026-09-14: "Let's increase that just in case. We will use this tool
 *  for longer videos in the future." The worker decodes every clip of a join at once, so a long video is
 *  joined in batches of this many, and the batches are joined last — no ceiling on takes per video. */
export const STITCH_CHUNK = 20;

/** The takes in joins of at most `size`, in order. */
export function chunks<T>(items: readonly T[], size = STITCH_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Where a split's takes are kept on this browser. */
export const punchKey = (setId: string, takeIndex: number): string => `sa-punch:${setId}#${takeIndex}`;

export function readTakes(raw: string | null): PunchTake[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((t): t is PunchTake => !!t && typeof t.file === "string" && typeof t.fromId === "string" && typeof t.toId === "string" && typeof t.at === "number") : [];
  } catch { return []; }
}
