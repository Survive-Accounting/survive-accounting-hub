// Z-ORDER — one source of truth for node stacking. The bug this fixes: new nodes
// spawned/cloned/dealt/generated had no zIndex (=0) while any previously-touched
// card carried a high zIndex from toFront's ++counter, so fresh cards buried
// themselves under old ones. Now stacking is TIERED and monotonic:
//
//   container (zone/lesson) < frame < element (heading/text) < card < memo
//
// Within a tier, later-touched / later-created wins (a session counter). Tiers
// are spaced far enough apart that within-tier increments never cross into the
// next tier in a realistic session. Edges (arrows) and the spotlight/film
// overlays render in their own layers ABOVE nodes (RF SVG + fixed overlays), so
// they're not part of this node-z scheme.
import { isElementKind } from "./types";

export type ZTier = "container" | "frame" | "element" | "card" | "memo";

/** Tier bases — 100k apart so a within-tier counter can't leak into the tier
 *  above (a session won't touch 100k nodes). Containers sit at 0 (zones/lessons
 *  historically used -1; anything ≤ 0 stays below frames either way). */
export const Z_BASE: Record<ZTier, number> = {
  container: 0,
  frame: 100_000,
  element: 200_000,
  card: 300_000,
  memo: 400_000,
};
const TIER_SPAN = 100_000;

/** The transient SPOTLIGHT lift — above every tier (memo 400k) so a spotlit node
 *  of ANY kind (esp. a heading at the element tier, 200k) sits on top, never sunk
 *  behind a neighbouring card/memo/frame. (The old `4000` predated the 100k tiers
 *  and actually pushed a spotlit heading UNDER everything — the "behind the
 *  background" bug.) */
export const Z_SPOTLIGHT = 900_000;

export function zTierOf(type: string | undefined, kind: string | undefined): ZTier {
  if (type === "zone" || type === "lesson") return "container";
  if (type === "frame") return "frame";
  if (type === "memo" || kind === "memo") return "memo";
  if (isElementKind(kind)) return "element";
  return "card";
}

export function zBaseOf(type: string | undefined, kind: string | undefined): number {
  return Z_BASE[zTierOf(type, kind)];
}

// Monotonic within-tier counter. Primed above the highest loaded value so a
// freshly assigned z always beats everything already on canvas.
let seq = 1;
export function nextZ(type: string | undefined, kind: string | undefined): number {
  return zBaseOf(type, kind) + ++seq;
}
/** Keep the counter ahead of a loaded increment so new nodes stay on top. */
export function primeZ(increment: number): void {
  if (increment + 1 > seq) seq = increment + 1;
}

type ZNode = { id: string; type?: string; zIndex?: number; data?: { kind?: string } };

/** LOAD PASS: give every node a clean tiered z (old scenes used a flat ++counter
 *  with no tiers, so a memo could sit under a card). PRESERVES within-tier order
 *  by each node's current zIndex (so a deliberately-raised card stays raised
 *  relative to its tier peers), just re-bases each tier. Primes the session
 *  counter above the max increment. Pure. */
export function migrateZTiers<T extends ZNode>(nodes: T[]): T[] {
  const byTier = new Map<ZTier, T[]>();
  for (const n of nodes) {
    const tier = zTierOf(n.type, (n.data as { kind?: string } | undefined)?.kind);
    (byTier.get(tier) ?? byTier.set(tier, []).get(tier)!).push(n);
  }
  const zById = new Map<string, number>();
  let maxInc = 0;
  for (const [tier, list] of byTier) {
    list.sort((a, b) => (a.zIndex ?? -Infinity) - (b.zIndex ?? -Infinity));
    list.forEach((n, i) => { zById.set(n.id, Z_BASE[tier] + i + 1); maxInc = Math.max(maxInc, i + 1); });
  }
  primeZ(maxInc);
  return nodes.map((n) => ({ ...n, zIndex: zById.get(n.id) ?? n.zIndex }));
}
