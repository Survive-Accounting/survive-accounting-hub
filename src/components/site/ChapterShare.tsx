// CHAPTER SHARE — the vocabulary every sharing surface speaks: the canonical /go URL (with its
// attribution stamp), the chapter's natural short name, and the GroupMe message. Pure functions
// only; the UI that uses them is the /go page's share kit (see ChapterAccess).
//
// THE GROUPME MESSAGE DEPENDS ON CLAIM STATE. An unclaimed chapter's message must not say the
// chapter "partnered" with us — nobody agreed to anything, and a member would rightly ask who
// wrote that. Claimed pages get the partnership framing under the chapter's own shorthand.
// Neither message mentions professors or promises campus-specific mapping: campuses onboard
// faster than maps do, and copy that outruns the product is how trust is spent.
//
// Every action logs to expand_events via logGreekEvent ("greek_<kind>:<school>/<chapter>").
// Logging is fire-and-forget — analytics must never break a share.
/** WHERE A SHARED LINK CAME FROM. Each path hands out a distinct stamp so we learn what actually
 *  spreads. "flyer" is encoded by the printed QR itself (see flyerTarget). */
export type ShareVia = "link" | "groupme" | "flyer";

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

/** The message someone actually pastes into GroupMe. Written to be forwarded verbatim. */
export function groupMeMessage(opts: { claimed: boolean; shortName: string; courseLabel: string; url: string }): string {
  const { claimed, shortName, courseLabel, url } = opts;
  return claimed
    ? `Hey everyone — ${shortName} partnered with Survive Accounting to help boost our chapter GPA in ${courseLabel}. There are cram videos + practice exams available — go check them out!\nStart studying here:\n${url}`
    : `For anyone taking ${courseLabel} — Survive Accounting has free cram videos + practice exams to help you ace your exams. Go check them out!\nStart studying here:\n${url}`;
}

// The ChapterShare COMPONENT (the old accordion step-01 UI) was removed 2026-08-28 — the share
// kit on the /go page replaced it. The helpers above stayed: the URL builder, the short-name
// rule and the GroupMe copy are used by the share kit, the flyer, the OG card and /go/demo.
