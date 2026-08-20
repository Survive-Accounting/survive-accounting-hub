// SHARE IT WITH THE HOUSE — step 1 of chapter onboarding. Available to anyone, on day one,
// with nothing claimed: the moment a chapter is most likely to spread the link is the minute
// they first see the page, and nothing here costs anything or exposes anything private.
//
// THE GROUPME MESSAGE DEPENDS ON CLAIM STATE. An unclaimed chapter's message must not say the
// chapter "partnered" with us — nobody agreed to anything, and a member would rightly ask who
// wrote that. Claimed pages get the partnership framing under the chapter's own shorthand.
// Neither message mentions professors or promises campus-specific mapping: campuses onboard
// faster than maps do, and copy that outruns the product is how trust is spent.
//
// Every action logs to expand_events via logGreekEvent ("greek_<kind>:<school>/<chapter>").
// Logging is fire-and-forget — analytics must never break a share.
import { useState } from "react";

import { BRAND_SANS } from "@/components/canvas/brand";
import { FlyerBlock } from "@/components/site/FlyerBlock";
import { logGreekEvent } from "@/lib/greek-go.functions";

/** One place, so the copied link and the printed flyer can never disagree. */
export const chapterUrl = (schoolSlug: string, chapterSlug: string) =>
  `https://surviveaccounting.com/go/${schoolSlug}/${chapterSlug}`;

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
 *  Roster `letters` wins when it is short plain ASCII — including the multi-word forms the
 *  roster really stores ("Phi Psi", "Phi Tau"), which are used verbatim; a single lowercase
 *  token ("ato") is uppercased because that is how initialisms are written. Without usable
 *  letters, a 3+-word name made only of safely-initialed Greek words initials itself (Alpha Tau
 *  Omega → ATO, Kappa Kappa Gamma → KKG); anything else — two-word names ("Sigma Nu"),
 *  Phi/Psi names, FarmHouse, Acacia — reads better in full than under an invented abbreviation,
 *  so it stays the display name. */
export function chapterShortName(chapterName: string, letters?: string | null): string {
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

export function ChapterShare({ schoolSlug, chapterSlug, chapterName, letters, claimed, courseLabel }: {
  schoolSlug: string;
  chapterSlug: string;
  chapterName: string;
  letters?: string | null;
  /** Approved chapters get the partnership GroupMe copy; pending stays on the unclaimed copy. */
  claimed: boolean;
  /** The course code when verified ("ACG 2021"), else a plain-English fallback. */
  courseLabel: string;
}) {
  const [copied, setCopied] = useState<"link" | "text" | null>(null);
  const url = chapterUrl(schoolSlug, chapterSlug);

  const track = (kind: "copy_link" | "copy_message") => {
    void logGreekEvent({ data: { kind, schoolSlug, chapterSlug } }).catch(() => {});
  };

  const copy = async (kind: "link" | "text") => {
    const text = kind === "link"
      ? url
      : groupMeMessage({ claimed, shortName: chapterShortName(chapterName, letters), courseLabel, url });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      track(kind === "link" ? "copy_link" : "copy_message");
      window.setTimeout(() => setCopied((c) => (c === kind ? null : c)), 1800);
    } catch { /* clipboard blocked — the field below still shows the URL */ }
  };

  const BTN: React.CSSProperties = {
    minHeight: 46, background: "rgba(245,239,230,0.06)",
    border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)",
  };

  return (
    <div className="mx-auto w-full max-w-sm" style={{ fontFamily: BRAND_SANS }}>
      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => void copy("link")} className="w-full rounded-xl px-4 text-[14px] font-bold focus-visible:ring-2" style={BTN}>
          {copied === "link" ? "Link copied ⚡" : "Copy chapter link"}
        </button>
        <button type="button" onClick={() => void copy("text")} className="w-full rounded-xl px-4 text-[14px] font-bold focus-visible:ring-2" style={BTN}>
          {copied === "text" ? "Message copied ⚡" : "Copy GroupMe message"}
        </button>
      </div>
      {/* The real generated flyer — preview, download, print. Hides itself (title included) if
          the flyer endpoint cannot render, so no label ever points at a missing thing. */}
      <FlyerBlock
        schoolSlug={schoolSlug}
        chapterSlug={chapterSlug}
        chapterName={chapterName}
        title="Print flyer for the house"
        subtitle="Download a print-ready flyer with your chapter QR code."
      />
      {/* The URL in plain sight: clipboard access is blocked in some in-app browsers, and a link
          nobody can read is a dead end. */}
      <p className="mt-2 truncate text-center text-[11.5px]" style={{ color: "var(--text-muted)" }}>{url.replace("https://", "")}</p>
    </div>
  );
}
