// CHAIR LANDING — the contract shared by the /s/ share routes and /learn (Build 2, section 1).
//
// A scholarship chair or council exec opens a /s/<campus>/<chapter> or /s/<campus>/council link.
// When CHAIR_LANDS_ON_PLATFORM is on, that route redirects her onto /learn with the params below,
// and /learn mounts the floating share panel over the real product. When it is off, the /s/ route
// renders the current share screen unchanged.
//
// Client-safe: no server imports. The URL builder and the parser live together so a link this file
// writes is always a link this file can read back.

/** Which share the chair arrived to make. `chapter` = one house's page; `council` = a whole
 *  council's chapters, branded to that council. */
export type ChairMode = "chapter" | "council";

/** The chair context, once parsed off a /learn URL. `school` is always a campus slug; exactly one
 *  of `chapter`/`council` is set, matching `mode`. */
export type ChairContext = {
  mode: ChairMode;
  school: string;
  chapter: string | null;
  council: string | null;
};

/** The /learn search keys that carry chair context. Namespaced so they can never collide with the
 *  student-facing deep-link keys (`campus`, `topic`, `set`, `stage`, `demo`). */
export type ChairSearch = {
  chair?: ChairMode;
  chairSchool?: string;
  chairChapter?: string;
  chairCouncil?: string;
};

/** Read chair search off a validated /learn search object. Returns null unless the shape is
 *  internally consistent — `chair=chapter` needs a chapter, `chair=council` needs a council — so a
 *  half-formed URL renders plain /learn rather than a broken panel. */
export function chairContextFrom(s: ChairSearch): ChairContext | null {
  const school = (s.chairSchool ?? "").trim();
  if (!school) return null;
  if (s.chair === "chapter") {
    const chapter = (s.chairChapter ?? "").trim();
    return chapter ? { mode: "chapter", school, chapter, council: null } : null;
  }
  if (s.chair === "council") {
    // A council slug is OPTIONAL: with ?c= the panel scopes to that council's chapters, without it
    // the panel shows every chapter on the campus (the council page's own fallback).
    const council = (s.chairCouncil ?? "").trim();
    return { mode: "council", school, council: council || null, chapter: null };
  }
  return null;
}

/** validateSearch helper for the four chair keys — folded into /learn's own validator. */
export function validateChairSearch(s: Record<string, unknown>): ChairSearch {
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const chair = s.chair === "chapter" || s.chair === "council" ? s.chair : undefined;
  return chair
    ? { chair, chairSchool: str(s.chairSchool), chairChapter: str(s.chairChapter), chairCouncil: str(s.chairCouncil) }
    : {};
}

/** Build the /learn URL a /s/ route redirects a chair to. Preserves any contact ref already on the
 *  incoming link so attribution survives the hop onto the platform. */
export function chairLearnPath(ctx: ChairContext, ref?: string | null): string {
  const p = new URLSearchParams();
  p.set("chair", ctx.mode);
  p.set("chairSchool", ctx.school);
  if (ctx.mode === "chapter" && ctx.chapter) p.set("chairChapter", ctx.chapter);
  if (ctx.mode === "council" && ctx.council) p.set("chairCouncil", ctx.council);
  if (ref) p.set("ref", ref);
  return `/learn?${p.toString()}`;
}
