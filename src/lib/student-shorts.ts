// A SET'S PARTS FOR STUDENTS — the Blast Off videos posted to the site (short-publication.ts), read
// back for the student tree (student.functions.ts). Pure. docs/DESIGN-SITE-PUBLISH.md §4.4.
//
// A set filmed as several splits has several parts, in `takeIndex` order. The tree hands them to
// the player as `shorts`. Until the player walks parts (the /learn session's job — design doc §4.5,
// slice S5), the set's own video is part 1 and it plays in 9:16. Lee, 2026-09-11: a new vertical
// video may replace a set's old one.
//
// Paid sets keep their parts listed but every playback id withheld, the tree's rule for every id
// (getSetPlayback re-checks the grant).
//
// Module-scope callables are function declarations (the render-path TDZ rule).

/** Just what this file reads off a publication — its own shape, so there is no import back into
 *  student.functions.ts. */
export interface ShortPub {
  id?: string;
  kind?: string;
  state?: string;
  source?: string;
  takeIndex?: unknown;
  takeName?: unknown;
  meta?: { title?: unknown };
  render?: { muxPlaybackId?: string | null; durationS?: number | null };
}

export interface StudentShort {
  /** 0-based part order. */
  takeIndex: number;
  /** What the part is called: its split's name, else its title, else "". */
  name: string;
  /** Null for paid sets, like every playback id in the tree. */
  playbackId: string | null;
  runtimeSec: number | null;
}

function nameOf(p: ShortPub): string {
  if (typeof p.takeName === "string" && p.takeName.trim()) return p.takeName.trim();
  if (typeof p.meta?.title === "string" && p.meta.title.trim()) return p.meta.title.trim();
  return "";
}

/** The set's posted parts, in order. Only shipped Blast Off publications with a playback id. */
export function shortsFrom(pubs: readonly ShortPub[] | undefined, paid: boolean): StudentShort[] {
  const out: StudentShort[] = [];
  for (const p of pubs ?? []) {
    if (p?.kind !== "blast" || p?.state !== "shipped" || p?.source !== "blastoff") continue;
    const pid = p.render?.muxPlaybackId;
    if (typeof pid !== "string" || !pid) continue;
    out.push({
      takeIndex: typeof p.takeIndex === "number" && Number.isFinite(p.takeIndex) ? p.takeIndex : 0,
      name: nameOf(p),
      playbackId: paid ? null : pid,
      runtimeSec: p.render?.durationS != null ? Math.round(p.render.durationS) : null,
    });
  }
  return out.sort((a, b) => a.takeIndex - b.takeIndex);
}
