// GAMER MODE — the site's playground skin (Lee, 2026-09-15: "a playground version of the entire site,
// maybe just like gamer mode … let me click around and see how this would look").
//
// A per-browser switch, never a separate copy of the pages: /playground turns it on (or ?gamer=1 on any
// page), ?gamer=0 or the floating pill turns it off. With it off nothing changes anywhere — every
// effect is scoped under html.gm and every hook in the pages is an inert data-gm-* attribute.

const KEY = "sa-gamer-mode";
export const GAMER_EVENT = "sa-gamer-mode";

export function readGamerMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location.search).get("gamer");
    if (q === "1") window.localStorage.setItem(KEY, "1");
    if (q === "0") window.localStorage.removeItem(KEY);
    return window.localStorage.getItem(KEY) === "1";
  } catch { return false; }
}

export function setGamerMode(on: boolean): void {
  try { if (on) window.localStorage.setItem(KEY, "1"); else window.localStorage.removeItem(KEY); } catch { /* storage blocked */ }
  try { window.dispatchEvent(new CustomEvent(GAMER_EVENT)); } catch { /* ignore */ }
}

// ── the lightning ─────────────────────────────────────────────────────────────────────────────

export interface Pt { x: number; y: number }

/** A jagged bolt from a to b: midpoint displacement, `depth` rounds, `rough` × segment length. */
export function boltPath(a: Pt, b: Pt, rough = 0.22, depth = 5, rnd: () => number = Math.random): Pt[] {
  let pts: Pt[] = [a, b];
  for (let d = 0; d < depth; d++) {
    const next: Pt[] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i];
      const dx = q.x - p.x, dy = q.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const off = (rnd() - 0.5) * len * rough;
      next.push({ x: (p.x + q.x) / 2 + (-dy / len) * off, y: (p.y + q.y) / 2 + (dx / len) * off }, q);
    }
    pts = next;
  }
  return pts;
}

export const toPathD = (pts: readonly Pt[]): string => pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

/** The point a bolt should land on: the target's top edge, a little in from the side facing the source. */
export function strikePoint(from: Pt, rect: { left: number; top: number; width: number; height: number }): Pt {
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const x = Math.max(rect.left + 14, Math.min(rect.left + rect.width - 14, cx + (from.x - cx) * 0.25));
  const y = from.y < cy ? rect.top + 2 : rect.top + rect.height - 2;
  return { x, y };
}
