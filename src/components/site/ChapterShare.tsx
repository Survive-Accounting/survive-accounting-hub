// CHAPTER SHARE — the vocabulary every sharing surface speaks: the canonical /go URL (with its
// attribution stamp), the chapter's natural short name, and the GroupMe message. Pure functions
// only; the UI that uses them is the /go page's share kit (see ChapterAccess).
//
// THE GROUPME MESSAGE IS ONE LOCKED TEMPLATE for every chapter — see the note on it below for why
// the old claim-dependent "partnered with" variant is gone. It mentions no professor and promises
// no campus-specific mapping: campuses onboard faster than maps do, and copy that outruns the
// product is how trust is spent.
//
// Every action logs to expand_events via logGreekEvent ("greek_<kind>:<school>/<chapter>").
// Logging is fire-and-forget — analytics must never break a share.
/** WHERE A SHARED LINK CAME FROM. Each path hands out a distinct stamp so we learn what actually
 *  spreads. "flyer" is encoded by the printed QR itself (see flyerTarget). */
export type ShareVia = "link" | "groupme" | "text" | "flyer" | "slide";

/** One place, so the copied link, the printed flyer and the visit log can never disagree. */
export const chapterUrl = (schoolSlug: string, chapterSlug: string, via?: ShareVia) =>
  `https://surviveaccounting.com/go/${schoolSlug}/${chapterSlug}${via ? `?via=${via}` : ""}`;

/** Greek-letter words whose Latin initial is how houses ACTUALLY abbreviate them. Chi maps to X
 *  ("Alpha Chi Omega" → "AXO"). Phi and Psi are deliberately ABSENT: their real-world shorthands
 *  are never initials ("Phi Delta Theta" is "Phi Delt", not "FDT"; "Sigma Phi Epsilon" is
 *  "SigEp", not "SFE"), so a name containing either keeps its full display name instead of
 *  getting an abbreviation no house uses. */
const GREEK_INITIAL: Record<string, string> = {
  alpha: "A", beta: "B", gamma: "G", delta: "D", epsilon: "E", zeta: "Z", eta: "H",
  theta: "T", iota: "I", kappa: "K", lambda: "L", mu: "M", nu: "N", xi: "X",
  omicron: "O", pi: "P", rho: "R", sigma: "S", tau: "T", upsilon: "U",
  chi: "X", omega: "O",
};

/** The chapter's natural short name for a text message.
 *
 *  The roster `nickname` — what students actually call the chapter ("ADPi", "Pike"), collected
 *  per-chapter by the 66-campus import — wins outright when present.
 *
 *  Otherwise roster `letters` wins when it is short plain ASCII — including the multi-word forms
 *  the roster really stores ("Phi Psi", "Phi Tau"), which are used verbatim; a single lowercase
 *  token ("ato") is uppercased because that is how initialisms are written. Without usable
 *  letters, a 3+-word name made only of safely-initialed Greek words initials itself (Alpha Tau
 *  Omega → ATO, Kappa Kappa Gamma → KKG); anything else — two-word names ("Sigma Nu"),
 *  Phi/Psi names, FarmHouse, Acacia — reads better in full than under an invented abbreviation,
 *  so it stays the display name. */
export function chapterShortName(chapterName: string, letters?: string | null, nickname?: string | null): string {
  const nick = (nickname ?? "").trim();
  if (nick) return nick;
  const l = (letters ?? "").trim();
  if (/^[A-Za-z]{2,8}$/.test(l)) return l === l.toLowerCase() || l === l.toUpperCase() ? l.toUpperCase() : l;
  if (/^[A-Za-z]{2,10}(?: [A-Za-z]{2,10}){1,2}$/.test(l)) return l;
  const words = chapterName.trim().split(/\s+/);
  if (words.length >= 3 && words.every((w) => GREEK_INITIAL[w.toLowerCase()])) {
    return words.map((w) => GREEK_INITIAL[w.toLowerCase()]).join("");
  }
  return chapterName;
}

/** THE GROUPME MESSAGE — LOCKED TEMPLATE (2026-08-28). Do not rewrite; only the course code and
 *  the link are substituted, and the blank line before "Start studying here:" is part of it.
 *
 *  ONE MESSAGE FOR EVERY CHAPTER, claimed or not. The old copy had a second variant for claimed
 *  chapters that said the chapter "partnered with Survive Accounting" — an endorsement nobody
 *  actually agreed to, whose appearance depended on state the reader could not see. `claimed` is
 *  still accepted so existing callers compile, and is deliberately ignored. */
export function groupMeMessage(opts: { claimed?: boolean; shortName?: string; courseLabel: string; url: string }): string {
  return [
    `For anyone taking ${opts.courseLabel} — Survive Accounting has free cram videos + practice exams to help you ace your exams. Go check them out!`,
    "",
    "Start studying here:",
    opts.url,
  ].join("\n");
}

// The ChapterShare COMPONENT (the old accordion step-01 UI) was removed 2026-08-28 — the share
// kit on the /go page replaced it. The helpers above stayed: the URL builder, the short-name
// rule and the GroupMe copy are used by the share kit, the flyer, the OG card and /go/demo.

/** THE TEXT MESSAGE — the same offer as the GroupMe post, trimmed for SMS. One thumb-length
 *  message a member sends a friend directly; the GroupMe one is written for a whole group chat. */
export function chapterTextMessage(opts: { courseLabel: string; url: string }): string {
  return `Free ${opts.courseLabel} cram videos + practice exams — Exam 1 is free. ${opts.url}`;
}
