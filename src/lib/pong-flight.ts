// ACCOUNTING PONG — ball flights. Pure: a flight is a function of time (ms
// since the tap) that returns where to draw the ball, so the component just
// samples it every frame. A correct tap always sinks. A wrong tap picks one of
// four misses so it feels like a real game of beer pong (Lee, 2026-09-16):
//   rim   — clips the rim and bounces off the table
//   swirl — swirls around the inside of the cup and pops back out
//   skip  — skips across two or three cup rims before falling off
//   stuck — wedges between two cups and just sits there. A bummer. Like real life.

export interface Pt { x: number; y: number }
export interface CupGeo { id: string; c: Pt; r: number }
export interface BallFrame { x: number; y: number; scale: number; opacity: number }
export type FlightKind = "sink" | "rim" | "swirl" | "skip" | "stuck";
export type MissKind = Exclude<FlightKind, "sink">;
export interface SfxCue { at: number; sfx: "rim" | "plop" }

export interface Flight {
  kind: FlightKind;
  /** ms until the ball is gone, or comes to rest. */
  total: number;
  /** Stuck balls stay drawn after `total`. */
  rests: boolean;
  /** ms when the ball reaches the target cup. */
  hitAt: number;
  cues: SfxCue[];
  at(t: number): BallFrame | null;
}

/** Ball flight to the cup: 150–220 ms per the brief. */
export const FLIGHT_MS = 190;

const MISS_WEIGHTS: [MissKind, number][] = [["rim", 3], ["swirl", 2], ["skip", 2], ["stuck", 1]];
export const MISS_KINDS: MissKind[] = MISS_WEIGHTS.map(([k]) => k);

export function pickMissKind(r: () => number): MissKind {
  const total = MISS_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let roll = r() * total;
  for (const [k, w] of MISS_WEIGHTS) { roll -= w; if (roll < 0) return k; }
  return "rim";
}

interface Seg { dur: number; f: (u: number) => BallFrame }

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const bump = (u: number) => 4 * u * (1 - u); // 0 → 1 → 0
const unit = (from: Pt, to: Pt): Pt => {
  const dx = to.x - from.x, dy = to.y - from.y, d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d };
};
const add = (p: Pt, v: Pt, k = 1): Pt => ({ x: p.x + v.x * k, y: p.y + v.y * k });

/** Parabolic hop from → to. `lift` is the apparent height in px; the ball also
 *  grows at the apex (closer to the camera in a top-down view). */
function arc(from: Pt, to: Pt, dur: number, lift: number, s0: number, s1: number, fade = false): Seg {
  return {
    dur,
    f: (u) => ({
      x: lerp(from.x, to.x, u),
      y: lerp(from.y, to.y, u) - lift * bump(u),
      scale: lerp(s0, s1, u) + 0.22 * bump(u) * (lift / 40),
      opacity: fade ? (u < 0.55 ? 1 : 1 - (u - 0.55) / 0.45) : 1,
    }),
  };
}

function orbit(center: Pt, r0: number, r1: number, a0: number, turns: number, dur: number, s0: number, s1: number): Seg {
  return {
    dur,
    f: (u) => {
      const a = a0 + turns * Math.PI * 2 * u;
      const r = lerp(r0, r1, u);
      return { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r, scale: lerp(s0, s1, u), opacity: 1 };
    },
  };
}

function drop(at: Pt, dur: number, s0: number, s1: number): Seg {
  return { dur, f: (u) => ({ x: at.x, y: at.y + 3 * u, scale: lerp(s0, s1, u), opacity: 1 - u * u }) };
}

function compose(kind: FlightKind, segs: Seg[], hitAt: number, cues: SfxCue[], rests = false): Flight {
  const total = segs.reduce((s, x) => s + x.dur, 0);
  const last = segs[segs.length - 1];
  return {
    kind, total, rests, hitAt, cues,
    at(t) {
      if (t < 0) return null;
      let acc = 0;
      for (const s of segs) {
        if (t < acc + s.dur) return s.f((t - acc) / s.dur);
        acc += s.dur;
      }
      return rests && last ? last.f(1) : null;
    },
  };
}

const instant = (kind: FlightKind, cues: SfxCue[]): Flight =>
  ({ kind, total: 0, rests: false, hitAt: 0, cues, at: () => null });

export interface FlightOpts {
  /** Reduced motion: no flight, sound only. */
  reduced?: boolean;
}

export function makeFlight(kind: FlightKind, launch: Pt, cup: CupGeo, neighbors: CupGeo[], r: () => number, opts: FlightOpts = {}): Flight {
  const T = FLIGHT_MS;
  if (opts.reduced) return instant(kind, [{ at: 0, sfx: kind === "sink" ? "plop" : "rim" }]);

  const toLaunch = unit(cup.c, launch);           // from the cup back toward the player
  const rimPt = add(cup.c, toLaunch, cup.r * 0.95);
  const side = r() < 0.5 ? -1 : 1;
  const approach = arc(launch, kind === "sink" ? cup.c : rimPt, T, 40, 1, 0.85);

  switch (kind) {
    case "sink":
      return compose("sink", [arc(launch, cup.c, T, 40, 1, 0.82), drop(cup.c, 150, 0.82, 0.5)], T, [{ at: T, sfx: "plop" }]);

    case "rim": {
      const off = { x: cup.c.x + side * (50 + r() * 70), y: cup.c.y + 80 + r() * 70 };
      return compose("rim", [approach, arc(rimPt, off, 380, 28, 0.85, 0.7, true)], T, [{ at: T, sfx: "rim" }]);
    }

    case "swirl": {
      const a0 = Math.atan2(toLaunch.y, toLaunch.x);
      const turns = 1.4;
      const edge = add(cup.c, toLaunch, cup.r * 0.66);
      const swirlDur = 560;
      const aEnd = a0 + turns * Math.PI * 2;
      const exit = { x: cup.c.x + Math.cos(aEnd) * cup.r * 0.42, y: cup.c.y + Math.sin(aEnd) * cup.r * 0.42 };
      const out = { x: cup.c.x + side * (40 + r() * 60), y: cup.c.y + 60 + r() * 60 };
      return compose("swirl", [
        arc(launch, edge, T, 40, 1, 0.85),
        orbit(cup.c, cup.r * 0.66, cup.r * 0.42, a0, turns, swirlDur, 0.85, 0.72),
        arc(exit, out, 320, 24, 0.72, 0.62, true),
      ], T, [{ at: T, sfx: "rim" }, { at: T + 300, sfx: "rim" }]);
    }

    case "skip": {
      const segs: Seg[] = [approach];
      const cues: SfxCue[] = [{ at: T, sfx: "rim" }];
      let cur = rimPt;
      let at = T;
      const pool = neighbors.slice().sort(() => r() - 0.5);
      const hops = Math.min(pool.length, 2 + (r() < 0.5 ? 1 : 0));
      for (let i = 0; i < hops; i++) {
        const n = pool[i];
        const target = add(n.c, unit(n.c, cur), n.r * 0.9);
        segs.push(arc(cur, target, 160, 26, 0.85, 0.8));
        at += 160;
        cues.push({ at, sfx: "rim" });
        cur = target;
      }
      const off = { x: cur.x + side * (40 + r() * 50), y: cur.y + 70 + r() * 50 };
      segs.push(arc(cur, off, 300, 20, 0.8, 0.68, true));
      return compose("skip", segs, T, cues);
    }

    case "stuck": {
      if (!neighbors.length) return makeFlight("rim", launch, cup, neighbors, r, opts);
      const n = neighbors.slice().sort((a, b) => Math.hypot(a.c.x - cup.c.x, a.c.y - cup.c.y) - Math.hypot(b.c.x - cup.c.x, b.c.y - cup.c.y))[0];
      const wedge = { x: (cup.c.x + n.c.x) / 2, y: (cup.c.y + n.c.y) / 2 };
      return compose("stuck", [approach, arc(rimPt, wedge, 140, 18, 0.85, 0.7)], T, [{ at: T, sfx: "rim" }, { at: T + 140, sfx: "rim" }], true);
    }
  }
}
