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
  /** HIDDEN FROM THE SITE (2026-09-16, Lee: "#12 and #13 are repeats… remove those from the site"): posted, kept,
   *  not shown. The breathers page toggles it (learn-admin.functions setLearnHidden). */
  hidden?: boolean;
  kind?: string;
  state?: string;
  source?: string;
  takeIndex?: unknown;
  takeName?: unknown;
  meta?: { title?: unknown };
  render?: { muxPlaybackId?: string | null; durationS?: number | null };
  /** The cover kept ON the publication (2026-09-11): a posted video's thumbnail travels with the
   *  video, not with a seat number that a later split can move. */
  coverUrl?: unknown;
  /** The practice buttons the player shows when this part ends (2026-09-14, practice-cta.ts). */
  endCta?: unknown;
    /** "practice80" = the recap: locked until the other parts are watched and practice is 80% (2026-09-15). */
  gate?: unknown;
  /** THE ORDER ON /learn (2026-09-16, /learn/admin): Lee's drag order. Absent = takeIndex order. */
  order?: unknown;
}

export interface StudentShort {
  /** 0-based part order. */
  takeIndex: number;
  /** What the part is called: its split's name, else its title, else "". */
  name: string;
  /** Null for paid sets, like every playback id in the tree. */
  playbackId: string | null;
  runtimeSec: number | null;
  /** The cover Lee uploaded for THIS part on /v3/post (publish-cover.ts), or null. */
  coverUrl: string | null;
  /** "try" = practice first; "unlock" = finish practice to unlock the recap; null = no end screen. */
  endCta: "try" | "unlock" | null;
  /** "practice80" = this part waits for the videos and an 80% practice run (lib/practice-score.ts). */
  gate: "practice80" | null;
}

/** THE PART'S KEY — the publish key /v3/post writes ("<setId>" is part 1, "<setId>#N" is part N)
 *  and the key the student's progress is kept under, so a set with five parts has five checks. */
export function partKey(setId: string, takeIndex: number): string {
  return takeIndex <= 0 ? setId : `${setId}#${takeIndex + 1}`;
}
/** Back from a key to the set. */
export function setIdOfKey(key: string): string { return key.split("#")[0]; }

function nameOf(p: ShortPub): string {
  if (typeof p.takeName === "string" && p.takeName.trim()) return p.takeName.trim();
  if (typeof p.meta?.title === "string" && p.meta.title.trim()) return p.meta.title.trim();
  return "";
}

/** The set's posted parts, in order. Only shipped Blast Off publications with a playback id. */
export function shortsFrom(pubs: readonly ShortPub[] | undefined, paid: boolean): StudentShort[] {
  const out: StudentShort[] = [];
  for (const p of pubs ?? []) {
    if (p?.kind !== "blast" || p?.state !== "shipped" || p?.source !== "blastoff" || p.hidden === true) continue;
    const pid = p.render?.muxPlaybackId;
    if (typeof pid !== "string" || !pid) continue;
    out.push({
      takeIndex: typeof p.takeIndex === "number" && Number.isFinite(p.takeIndex) ? p.takeIndex : 0,
      name: nameOf(p),
      playbackId: paid ? null : pid,
      runtimeSec: p.render?.durationS != null ? Math.round(p.render.durationS) : null,
      coverUrl: typeof p.coverUrl === "string" && /^https?:\/\//i.test(p.coverUrl) ? p.coverUrl : null,
      endCta: p.endCta === "try" || p.endCta === "unlock" ? p.endCta : null,
      gate: p.gate === "practice80" ? "practice80" : null,
    });
  }
    const rank = new Map(out.map((s) => [s.takeIndex, orderOf({ order: (pubs ?? []).find((p) => (typeof p.takeIndex === "number" ? p.takeIndex : 0) === s.takeIndex)?.order, takeIndex: s.takeIndex })]));
  return out.sort((a, b) => (rank.get(a.takeIndex)! - rank.get(b.takeIndex)!) || a.takeIndex - b.takeIndex);
}

/** THE ORDER ON /learn: a publication's own `order` when Lee set one, else its takeIndex (both 0-based). */
export function orderOf(p: Pick<ShortPub, "order" | "takeIndex">): number {
  if (typeof p.order === "number" && Number.isFinite(p.order)) return p.order;
  return typeof p.takeIndex === "number" && Number.isFinite(p.takeIndex) ? p.takeIndex : 0;
}
