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

/** WHERE A TAKE REACHES (2026-09-16). Lee: "sometimes I will go backwards with a take to recall something. It's
 *  screwing up the takes." The take covers its first slide through the furthest slide FORWARD of it that the
 *  pop-out showed while recording; slides behind the start (a look back) are never covered. Stopping on a look-back
 *  leaves the take on the slides it actually filmed. */
export function furthestForward(frameIds: readonly string[], fromId: string, walked: readonly string[]): string {
  const a = frameIds.indexOf(fromId);
  if (a < 0) return fromId;
  let best = a;
  for (const id of walked) { const k = frameIds.indexOf(id); if (k > best) best = k; }
  return frameIds[best];
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
// 4 since 2026-09-14: nine 1080p takes in one join ran the 2 GB worker out of memory ("ffmpeg exited 137").
export const STITCH_CHUNK = 4;

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

// ── RECOVERY (Lee, 2026-09-15: "I think that scrapping removed takes I liked just now? Can you check that?") ──
// The take lists live in this browser; the recordings and the pop-out's per-roll slide log (take_logs) don't. A
// kept recording is matched to its roll by start time (OBS names files by it), and the roll's arrivals — the
// slides the pop-out walked while it recorded — give back the take's first and last slide.

/** OBS's default file name, "2026-09-15 14-40-16.mp4", as a local time in ms; null for any other name. */
export function obsFileTime(name: string): number | null {
  const m = /(\d{4})-(\d{2})-(\d{2})[ _](\d{2})-(\d{2})-(\d{2})/.exec(name);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

export interface RollLog { rolled_at: string; arrivals: { frameId: string; atMs: number }[] }

/** Takes for one video, rebuilt from its recordings and the roll logs. A file with no roll within `slackMs`, or a
 *  roll that didn't start on one of this video's slides, gives nothing. `durationS` (when known) drops the slide
 *  the pop-out moved to after the recording stopped. */
export function recoverTakes(frameIds: readonly string[], logs: readonly RollLog[], files: readonly { name: string; durationS: number | null }[], slackMs = 3000): PunchTake[] {
  const inVideo = new Set(frameIds);
  // rolls that share a start (a split change mid-roll writes two rows) are one roll
  const rolls = new Map<number, { frameId: string; atMs: number }[]>();
  for (const l of logs) {
    const at = Date.parse(l.rolled_at);
    if (!Number.isFinite(at)) continue;
    rolls.set(at, [...(rolls.get(at) ?? []), ...l.arrivals]);
  }
  const starts = [...rolls.keys()];
  const out: PunchTake[] = [];
  for (const f of files) {
    const t = obsFileTime(f.name);
    if (t == null) continue;
    let best: number | null = null;
    for (const s of starts) if (Math.abs(s - t) <= slackMs && (best == null || Math.abs(s - t) < Math.abs(best - t))) best = s;
    if (best == null) continue;
    const endMs = f.durationS != null ? f.durationS * 1000 - 400 : Infinity;
    const walked = [...rolls.get(best)!].sort((a, b) => a.atMs - b.atMs).filter((a) => a.atMs < Math.max(endMs, 1));
    if (!walked.length || walked[0].atMs > 2500 || !inVideo.has(walked[0].frameId)) continue;
    const mine = walked.filter((a) => inVideo.has(a.frameId));
    const order = (id: string) => frameIds.indexOf(id);
    const last = mine.reduce((m, a) => (order(a.frameId) > order(m.frameId) ? a : m), mine[0]);
    out.push({ file: f.name, fromId: walked[0].frameId, toId: order(last.frameId) >= order(walked[0].frameId) ? last.frameId : walked[0].frameId, at: best });
  }
  return out;
}