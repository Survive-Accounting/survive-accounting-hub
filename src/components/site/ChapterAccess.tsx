// CHAPTER PAGE — SHARE KIT + SCHOLARSHIP CHAIR CALLOUT (rebuilt 2026-09-09, was the 3-tier
// SHARE KIT of 2026-08-28).
//
// WHAT CHANGED AND WHY. The three-tier "Send it / Put it up / Run it for the house" layout
// treated a member sharing a free exam and a scholarship chair pursuing chapter sponsorship as
// equally weighted doors. They are not the same job, and giving them equal size buried the one
// thing that matters most to a member (share it, fast) inside the same visual language as an
// exec decision. This is now TWO very different pieces, in order of who is reading:
//
//   1. ONE compact utility panel — every sharing action a member needs (GroupMe, text, link,
//      flyer, slide), because those are all the same task: get free Exam 1 in front of the
//      chapter. No separate giant card per action.
//   2. ONE clearly distinct, more prominent callout for the scholarship chair — "claim your
//      chapter dashboard", not "buy something". Pricing is named but never itemized here; the
//      approval materials (sample invoice, exec walkthrough) stay inside the claim flow / the
//      chapter-kit ZIP, never on the public page. See partner-kit.server.ts.
//
// THE PUBLIC ZIP LINK IS GONE (2026-09-09). "Download the whole kit (ZIP)" pointed a browsing
// member at exec-purchasing material (a sample invoice, a fund-the-rest-of-semester walkthrough)
// that has nothing to do with sharing a free exam. The ZIP GENERATOR IS UNTOUCHED — see
// /api/chapter-kit/$school/$chapter (routes/api.chapter-kit.$school.$chapter.tsx) and
// chapterKitZip() in lib/partner-kit.server.ts — it is simply no longer linked from here. The
// natural home for it is inside the claimed chapter-exec experience (an "Exec Approval Kit"),
// which does not exist yet; wiring that up is intentionally out of scope for this pass.
//
// ATTRIBUTION: each path stamps a distinct `via` on the /go URL it hands out
// (link | groupme | text | flyer | slide), and the page's visit log records it. No new analytics
// system — the same expand_events row, carrying where the visitor came from. Unchanged by this
// rebuild.
import { useEffect, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { useCampus } from "@/lib/campus-context";
import { FlyerBlock } from "@/components/site/FlyerBlock";
import { ChapterAccessForm } from "@/components/site/ChapterAccessForm";
import { chapterShortName, chapterTextMessage, chapterUrl, groupMeMessage, type ShareVia } from "@/components/site/ChapterShare";
import { SlideBlock } from "@/components/site/SlideBlock";
import { logGreekEvent } from "@/lib/greek-go.functions";
import { scrollToId } from "@/lib/ui-scroll";

/** Per-member, per-semester. One place, quoted by the claim flow and the FAQ alike. */
export const SEAT_PRICE = 100;
export const SEAT_MINIMUM = 10;
/** What ONE student pays for the same access on their own. The chapter rate is a discount off
 *  this, and saying so is the whole of benefit line 3 — never quote one without the other. */
export const INDIVIDUAL_PRICE = 150;

type ClaimState = "unclaimed" | "pending" | "claimed";

/** Fired by any "Chapter exec?" control: opens the claim flow. (The old CTAs dispatched this to
 *  expand accordion step 02; it now opens the claim modal, so every existing caller still works.) */
export const OPEN_CLAIM_EVENT = "sa:open-claim";
export const openClaimStep = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_CLAIM_EVENT)); };

export function ChapterAccess({ id, chapterName, schoolSlug, chapterSlug, letters, nickname, claimStatus }: {
  id: string;
  chapterName: string;
  schoolSlug: string;
  chapterSlug: string;
  /** Roster shorthand ("ATO") when GreekIntel has it — feeds the GroupMe message. */
  letters?: string | null;
  /** Roster nickname ("ADPi") — what students call the chapter; preferred in share copy. */
  nickname?: string | null;
  claimStatus: ClaimState;
}) {
  // THE claim source of truth for this page: seeded from the loader, advanced locally on submit.
  const [claim, setClaim] = useState<ClaimState>(claimStatus);
  const [claimOpen, setClaimOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setClaimOpen(true);
    window.addEventListener(OPEN_CLAIM_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CLAIM_EVENT, onOpen);
  }, []);

  // ── K4.2 — THE DEEP LINK ────────────────────────────────────────────────────────────────────
  // ?claim=1 (what goes in an email to an exec) and #claim (the anchor alias) both land on the
  // strip, open the sheet, and mark the strip so the eye lands where the link promised. One shot
  // per load: re-opening the sheet after they close it would be a trap, not a convenience.
  const [highlight, setHighlight] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const wants = q.get("claim") === "1" || window.location.hash === "#claim";
    if (!wants) return;
    setHighlight(true);
    // After paint: the section has to exist before it can be scrolled to.
    const t = window.setTimeout(() => {
      scrollToId("claim");
      setClaimOpen(true);
    }, 60);
    return () => window.clearTimeout(t);
  }, []);

  // THE HIGHLIGHT OUTLIVES THE SHEET. It used to clear on a 2.6s timer from page load — but the
  // same deep link opens the sheet 60ms in, and the sheet is a full-screen overlay, so the ring
  // spent its whole life behind the thing it was meant to point at and was gone by the time the
  // exec closed it. Now it clears 2.6s after the sheet closes, which is the first moment anyone
  // can actually see it.
  useEffect(() => {
    if (!highlight || claimOpen) return;
    const off = window.setTimeout(() => setHighlight(false), 2600);
    return () => window.clearTimeout(off);
  }, [highlight, claimOpen]);
  const { code } = useCampus();
  const courseLabel = code ?? "Intro Accounting";
  const shortName = chapterShortName(chapterName, letters, nickname);

  // K4.3 — shown once per session, after the visitor has actually shared something.
  const [nudge, setNudge] = useState(false);
  const onShared = () => {
    if (shareNudgeSeen(schoolSlug, chapterSlug)) return;
    markShareNudge(schoolSlug, chapterSlug);
    setNudge(true);
  };

  return (
    <>
      <ShareKitSection
        id={id}
        schoolSlug={schoolSlug}
        chapterSlug={chapterSlug}
        chapterName={chapterName}
        letters={letters}
        nickname={nickname}
        claimState={claim}
        courseLabel={courseLabel}
        onShared={onShared}
        onClaim={() => setClaimOpen(true)}
        highlight={highlight}
      />

      {/* THE NUDGE. A card under the kit, dismissible, never blocking — and never shown to a
          chapter that already claimed, who would only be told to do what they have done. */}
      {nudge && claim === "unclaimed" && (
        <section className="mx-auto w-full max-w-[640px] px-5 pb-2">
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl px-4 py-3"
            style={{ background: "rgba(252,163,17,0.08)", border: "1px solid rgba(252,163,17,0.35)", fontFamily: BRAND_SANS }}
          >
            <span className="min-w-0 flex-1 text-[13.5px] leading-snug" style={{ color: "var(--brand-cream)" }}>
              Running this for {shortName}?{" "}
              <button
                type="button"
                onClick={() => { setNudge(false); setClaimOpen(true); }}
                className="font-bold underline underline-offset-4"
                style={{ background: "none", border: 0, padding: 0, color: "var(--accent)", cursor: "pointer" }}
              >
                Claim the chapter dashboard — see who signs up. →
              </button>
            </span>
            <button
              type="button"
              onClick={() => setNudge(false)}
              aria-label="Dismiss"
              className="shrink-0 rounded-full px-1.5 hover:bg-white/10"
              style={{ color: "var(--text-muted)", background: "none", border: 0, cursor: "pointer", minHeight: 28 }}
            >
              ×
            </button>
          </div>
        </section>
      )}

      {claimOpen && (
        <ClaimSheet
          chapterName={chapterName}
          shortName={shortName}
          schoolSlug={schoolSlug}
          chapterSlug={chapterSlug}
          claim={claim}
          onPending={() => setClaim("pending")}
          onClose={() => setClaimOpen(false)}
        />
      )}
    </>
  );
}

/** THE POST-SHARE NUDGE (K4.3). Someone who just shared is, right now, the most likely person
 *  on the page to be the one running this for their house — so this is the one moment worth
 *  asking. Rules, all of them deliberate:
 *    · ONCE PER SESSION. A second share is someone doing the thing we want; interrupting it
 *      twice would punish them for it.
 *    · NEVER BLOCKING. A card under the kit, not a modal — the share they just made must not
 *      need dismissing before it can be repeated.
 *    · Dismissal is remembered for the session, not forever: a new visit is a new conversation. */
const NUDGE_KEY = "sa-share-nudge";
function shareNudgeSeen(school: string, chapter: string): boolean {
  try { return sessionStorage.getItem(`${NUDGE_KEY}:${school}/${chapter}`) === "1"; } catch { return true; }
}
function markShareNudge(school: string, chapter: string): void {
  try { sessionStorage.setItem(`${NUDGE_KEY}:${school}/${chapter}`, "1"); } catch { /* private mode */ }
}

// ── THE SHARE PANEL + THE SCHOLARSHIP CHAIR CALLOUT ──────────────────────────────────────────
/** ONE compact utility panel for a member (share, print, slide — the same task, one task), then
 *  ONE clearly distinct callout for the scholarship chair. Every action still hands out a URL
 *  stamped with where it came from — the attribution scheme is unchanged. */
function ShareKitSection({ id, schoolSlug, chapterSlug, chapterName, letters, nickname, claimState, courseLabel, onShared, onClaim, highlight }: {
  id: string;
  schoolSlug: string;
  chapterSlug: string;
  chapterName: string;
  letters?: string | null;
  nickname?: string | null;
  /** Full claim state — the callout says something different for each. */
  claimState: ClaimState;
  courseLabel: string;
  /** Fires on ANY completed share — copy, flyer download/print, slide download (K4.3). */
  onShared: () => void;
  onClaim: () => void;
  /** ?claim=1 landed here — ring the callout so an emailed link points at something visible. */
  highlight: boolean;
}) {
  const [copied, setCopied] = useState<ShareVia | null>(null);
  // Names the chapter the link is FOR — a share is an act of doing something for the chapter,
  // and the confirmation should say so (K1.4). "chapter", never "house" — the same word has to
  // read right for a fraternity and a sorority.
  const shortName = chapterShortName(chapterName, letters, nickname);
  const copiedLabel = `Copied. Go share it with ${shortName}!`;
  const plain = chapterUrl(schoolSlug, chapterSlug);
  // THE REAL GREEK LETTERS ("ΣΧ"), when the roster has them — what the claim CTA is personalized
  // with. Falls back to the same short-name derivation ChapterDoors uses when the roster only has
  // a nickname or full chapter name (see chapterShortName).
  const ctaLetters = (letters ?? "").trim() || shortName;

  const copy = async (via: Extract<ShareVia, "link" | "groupme" | "text">) => {
    const url = chapterUrl(schoolSlug, chapterSlug, via);
    const text = via === "link" ? url
      : via === "groupme" ? groupMeMessage({ courseLabel, url })
      : chapterTextMessage({ courseLabel, url });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(via);
      onShared();
      void logGreekEvent({ data: { kind: via === "link" ? "copy_link" : "copy_message", schoolSlug, chapterSlug, via } }).catch(() => {});
      window.setTimeout(() => setCopied((c) => (c === via ? null : c)), 2200);
    } catch { /* clipboard blocked in some in-app browsers — the visible URL below still works */ }
  };

  const ACTION = "flex w-full items-center justify-center gap-2 rounded-xl px-3 text-center text-[13.5px] font-black focus-visible:ring-2";
  const ACTION_STYLE: React.CSSProperties = {
    minHeight: 46, background: "rgba(0,0,0,0.22)", border: "1px solid var(--border-default)", color: "var(--brand-cream)",
  };

  const claimCta = claimState === "claimed"
    ? "Open your dashboard →"
    : claimState === "pending"
      ? "Your claim is in review →"
      : `Claim ${ctaLetters}'s dashboard →`;

  return (
    <section id={id} className="sa-anchor mx-auto w-full max-w-[640px] px-5 py-12" style={{ fontFamily: BRAND_SANS }}>
      {/* SECTION HEADING — the whole section's promise, before either audience-specific piece. */}
      <p className="text-center text-[11.5px] font-bold" style={{ color: "var(--text-muted)", letterSpacing: "0.16em" }}>
        SHARE EXAM 1
      </p>
      <h2 className="mx-auto mt-3 max-w-[26ch] text-center text-[21px] font-black leading-[1.15] sm:text-[25px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.01em" }}>
        Make sure your whole chapter has this.
      </h2>
      <p className="mx-auto mt-2 max-w-[38ch] text-center text-[14px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
        Exam 1 is free for everyone. Send it to your GroupMe, chapter chat, or scholarship chair.
      </p>

      {/* SECTION A — the compact member utility panel. One panel, not three cards: sending,
          printing and downloading are all the same task (share free Exam 1), so they share one
          surface instead of competing for equal-sized real estate. */}
      <div className="mt-7 rounded-2xl p-5 sm:p-6" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
        <h3 className="text-[15.5px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
          Share the free Exam 1 prep
        </h3>
        <p className="mt-1 text-[13.5px]" style={{ color: "var(--text-muted)" }}>
          Send it to your chapter in a few seconds.
        </p>

        {/* PRIMARY SHARING ACTIONS — the three ways a member actually sends this on. */}
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button type="button" onClick={() => void copy("groupme")} className={ACTION} style={ACTION_STYLE}>
            {copied === "groupme" ? copiedLabel : "Copy GroupMe post"}
          </button>
          <button type="button" onClick={() => void copy("text")} className={ACTION} style={ACTION_STYLE}>
            {copied === "text" ? copiedLabel : "Copy text message"}
          </button>
          <button type="button" onClick={() => void copy("link")} className={ACTION} style={ACTION_STYLE}>
            {copied === "link" ? copiedLabel : "Copy link"}
          </button>
        </div>

        {/* SECONDARY ASSETS — printable, not typed. FlyerBlock/SlideBlock in `compact` mode
            already render one primary action plus an understated "Preview it" link each, which is
            exactly the "don't let previews dominate" shape this panel wants — untouched here. */}
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <FlyerBlock
            compact
            schoolSlug={schoolSlug}
            chapterSlug={chapterSlug}
            chapterName={chapterName}
            onShared={onShared}
          />
          <SlideBlock
            compact
            schoolSlug={schoolSlug}
            chapterSlug={chapterSlug}
            chapterName={chapterName}
            onShared={onShared}
          />
        </div>

        {/* The chapter URL, subtly, in plain sight below the tools: clipboard access is blocked
            in some in-app browsers, and a link nobody can read is a dead end. */}
        <p className="mt-3 truncate text-center text-[11px]" style={{ color: "var(--text-muted)" }}>{plain.replace("https://", "")}</p>
      </div>

      {/* SECTION B — THE SCHOLARSHIP CHAIR CALLOUT. Clearly distinct from the panel above: a
          stronger accent border/background says "this is a different decision", not "buy
          something" — a claim, not a purchase. Carries the id="claim" anchor and the ?claim=1
          highlight the old exec tier owned, so every outreach link already sent still lands on
          something that lights up. Routes through the SAME onClaim → ClaimSheet flow as before;
          only the presentation and copy changed. No invoice, no ZIP, no line-item pricing here —
          those stay inside the claim flow (see ClaimSheet below) and the chapter-kit ZIP. */}
      <div
        id="claim"
        className="sa-anchor mt-5 rounded-2xl p-5 text-center sm:p-6"
        style={{
          background: "rgba(252,163,17,0.08)", border: "1.5px solid var(--accent)",
          ...(highlight ? { outline: "2px solid var(--accent)", outlineOffset: 3 } : null),
        }}
      >
        <p className="text-[11.5px] font-bold" style={{ color: "var(--accent)", letterSpacing: "0.16em" }}>
          SCHOLARSHIP CHAIR?
        </p>
        <h3 className="mx-auto mt-2 max-w-[22ch] text-[18px] font-black leading-[1.2]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
          Claim your chapter dashboard.
        </h3>
        <p className="mx-auto mt-2 max-w-[34ch] text-[13.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Give members access, share exam prep, and sponsor the full semester from one place.
        </p>
        <button
          type="button"
          onClick={onClaim}
          className="mx-auto mt-4 flex w-full items-center justify-center rounded-xl px-3 text-[14.5px] font-black focus-visible:ring-2 sm:w-auto sm:px-8"
          style={{ minHeight: 50, background: "var(--cta-chapter-bg)", color: "var(--cta-chapter-fg)", border: "none" }}
        >
          {claimCta}
        </button>
        <p className="mt-3 text-[12px]" style={{ color: "var(--text-muted)" }}>
          Chapter pricing available for the full semester.
        </p>
        <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-muted)", opacity: 0.8 }}>
          You&apos;ll also get everything you need to take Survive to exec.
        </p>
      </div>
    </section>
  );
}

// ── THE CLAIM FLOW ────────────────────────────────────────────────────────────────────────────
/** The exec's sheet: the same claim form as before, unchanged, plus the two things that used to
 *  sit in public — the price and the dashboard reassurance — now shown only to the person they
 *  are for, after they have said they are an exec by opening this. */
function ClaimSheet({ chapterName, shortName, schoolSlug, chapterSlug, claim, onPending, onClose }: {
  chapterName: string;
  /** The chapter as students say it ("ADPi") — what the benefit lines address. */
  shortName: string;
  schoolSlug: string;
  chapterSlug: string;
  claim: ClaimState;
  onPending: () => void;
  onClose: () => void;
}) {
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[240] flex items-end justify-center overflow-y-auto sm:items-center sm:px-4" style={{ background: "rgba(5,8,16,0.72)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Get your academic exec dashboard"
        className="w-full max-w-[420px] rounded-t-2xl p-5 sm:rounded-2xl"
        style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-default)", boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)", paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))", fontFamily: BRAND_SANS }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="pr-2 text-[17px] font-black leading-tight" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Get your academic exec dashboard</h3>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/10" style={{ color: "var(--brand-cream)", background: "none", border: 0, cursor: "pointer" }}>×</button>
        </div>

        {claim === "claimed" ? (
          <div className="rounded-xl p-4 text-center" style={{ background: "rgba(252,163,17,0.08)", border: "1px solid rgba(252,163,17,0.35)" }}>
            <p className="text-[14px] font-black" style={{ color: "var(--brand-cream)" }}>✓ Page claimed</p>
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              {chapterName} has a verified chapter admin. Exec manages access and usage from the{" "}
              <a href="/chapters/dashboard" className="font-bold underline underline-offset-2" style={{ color: "var(--accent)" }}>chapter dashboard</a>.
            </p>
          </div>
        ) : claim === "pending" && !submitted ? (
          <div className="rounded-xl p-4 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
            <p className="text-[14px] font-black" style={{ color: "var(--brand-cream)" }}>A claim is in review.</p>
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              Someone from {chapterName} already claimed this page — we&apos;re verifying their chapter role now.
            </p>
          </div>
        ) : (
          <>
            {!submitted && (
              <>
                <p className="mb-3 text-[13px] leading-snug" style={{ color: "var(--text-muted)" }}>
                  See {shortName}&apos;s usage and manage access for Exams 2, 3 &amp; the Final.{" "}
                  <span className="font-bold" style={{ color: "var(--brand-cream)" }}>Setting it up is free</span>{" "}
                  — Exam 1 stays free for every member either way.
                </p>
              </>
            )}
            <ChapterAccessForm
              bare
              schoolSlug={schoolSlug}
              chapterSlug={chapterSlug}
              chapterName={chapterName}
              shortName={shortName}
              onClose={onClose}
              onDone={() => { setSubmitted(true); onPending(); }}
            />
            {/* The pricing CARD is gone (K3.5) — the deal now lives in benefit line 3 above the
                form, where it reads as something the chapter GETS rather than a rate card bolted
                to the bottom of a free action. Price still appears ONLY in this claim context. */}
          </>
        )}
      </div>
    </div>
  );
}
