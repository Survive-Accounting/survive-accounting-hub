// CHAPTER PAGE — SHARE KIT + EXEC STRIP (rebuilt 2026-08-28).
//
// WHAT CHANGED AND WHY. This used to be a 3-step "Set up chapter access" accordion (share →
// claim → dashboard preview) that framed the whole page around an EXEC doing paperwork. But the
// page's biggest job is spreading: every member can share, on day one, with nothing claimed.
// So the accordion is retired and the page reads:
//
//     headline + two doors → player → SHARE KIT → exec strip → testimonials → Meet your tutor
//
// The share kit is the right door's destination: THREE TIERS side by side (K2) — send it, the
// flyer, the meeting slide — because those are the three rooms a chapter lives in. The exec path
// is ONE quiet row, and the price, which is only ever for the exec, lives inside the claim flow,
// so a member browsing the page never meets a number.
//
// ATTRIBUTION: each path stamps a distinct `via` on the /go URL it hands out
// (link | groupme | text | flyer | slide), and the page's visit log records it. No new analytics
// system — the same expand_events row, carrying where the visitor came from.
import { useEffect, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { useCampus } from "@/lib/campus-context";
import { FlyerBlock } from "@/components/site/FlyerBlock";
import { ChapterAccessForm } from "@/components/site/ChapterAccessForm";
import { chapterShortName, chapterTextMessage, chapterUrl, groupMeMessage, type ShareVia } from "@/components/site/ChapterShare";
import { SlideBlock } from "@/components/site/SlideBlock";
import { TIER_ACTION, TierCard, TierRow } from "@/components/site/home-two-door/DoorCard";
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
        claimed={claim === "claimed"}
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

// ── THE SHARE KIT ─────────────────────────────────────────────────────────────────────────────
/** Three fat actions, in the order they get used, and nothing else. Every action hands out a
 *  URL stamped with where it came from. */
function ShareKitSection({ id, schoolSlug, chapterSlug, chapterName, letters, nickname, claimed, claimState, courseLabel, onShared, onClaim, highlight }: {
  id: string;
  schoolSlug: string;
  chapterSlug: string;
  chapterName: string;
  letters?: string | null;
  nickname?: string | null;
  claimed: boolean;
  /** Full claim state — the exec tier says something different for each. */
  claimState: ClaimState;
  courseLabel: string;
  /** Fires on ANY completed share — copy, flyer download/print, slide download (K4.3). */
  onShared: () => void;
  onClaim: () => void;
  /** ?claim=1 landed here — ring the exec tier so an emailed link points at something visible. */
  highlight: boolean;
}) {
  const [copied, setCopied] = useState<ShareVia | null>(null);
  // Names the chapter the link is FOR — a share is an act of doing something for the house,
  // and the confirmation should say so (K1.4).
  const shortName = chapterShortName(chapterName, letters, nickname);
  const copiedLabel = `Copied. Go share it with ${shortName}!`;
  const plain = chapterUrl(schoolSlug, chapterSlug);

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

  const ACTION = "flex w-full items-center justify-center gap-2 px-3 text-center focus-visible:ring-2";

  return (
    <section id={id} className="sa-anchor mx-auto w-full max-w-[1040px] px-5 py-12" style={{ fontFamily: BRAND_SANS }}>
      <p className="text-center text-[11.5px] font-bold" style={{ color: "var(--text-muted)", letterSpacing: "0.16em" }}>
        SHARE KIT
      </p>
      <h2 className="mx-auto mt-3 max-w-[24ch] text-center text-[21px] font-black leading-[1.15] sm:text-[25px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.01em" }}>
        Make sure the whole house has this.
      </h2>

      {/* THREE TIER DOORS — the same door language as the hero, one size down, so the page reads
          as a staircase: two big doors (study / spread) then three smaller ones (how to spread).
          They are the three rooms a chapter lives in — the group chat, the house, the meeting —
          and then the exec's room. Every sharing action is usable by any member; only the last
          tier is for an exec, which is why it is last. */}
      <TierRow>
        {/* TIER 1 — SEND IT. */}
        <TierCard
          icon={<SendMark />}
          title="Send it"
          blurb="Into the group chat, or straight to one person."
        >
          <button type="button" onClick={() => void copy("link")} className={ACTION} style={TIER_ACTION}>
            {copied === "link" ? copiedLabel : "Copy the link"}
          </button>
          <button type="button" onClick={() => void copy("groupme")} className={ACTION} style={TIER_ACTION}>
            {copied === "groupme" ? copiedLabel : "Copy a GroupMe post"}
          </button>
          <button type="button" onClick={() => void copy("text")} className={ACTION} style={TIER_ACTION}>
            {copied === "text" ? copiedLabel : "Copy a text message"}
          </button>
          {/* The URL in plain sight: clipboard access is blocked in some in-app browsers, and a
              link nobody can read is a dead end. Shown WITHOUT a stamp — this one gets typed. */}
          <p className="truncate text-[11px]" style={{ color: "var(--text-muted)" }}>{plain.replace("https://", "")}</p>
        </TierCard>

        {/* TIER 2 — PUT IT UP. The printed flyer and the meeting slide do the same job (put it in
            front of a room), so they share a tier and free the third one for the exec. Both render
            compact here: actions only, no preview thumbnail, with "Preview it" as a quiet link. */}
        <TierCard
          icon={<PostMark />}
          title="Put it up"
          blurb="On the wall, and on the screen at chapter."
        >
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
        </TierCard>

        {/* TIER 3 — THE EXEC'S DOOR. Replaces the grey "Chapter exec?" strip that used to sit
            above the kit, where it read as an admin bar on a marketing page.
            THE PRICE IS NOW PUBLIC HERE, reversing the earlier rule that "a member browsing the
            page never meets a number" — Lee's call, and the reasoning holds: by this point the
            reader has scrolled past every free thing on offer, so the number reads as the upgrade
            at the end of a staircase rather than a toll at the door. Both numbers are shown,
            because the Greek rate IS the pitch and one price alone is not a deal. */}
        <ExecTier
          shortName={shortName}
          claimState={claimState}
          highlight={highlight}
          onClaim={onClaim}
        />
      </TierRow>
    </section>
  );
}

// ── TIER 3 — THE EXEC'S DOOR ──────────────────────────────────────────────────────────────────
/** Carries the id="claim" anchor and the ?claim=1 highlight the old exec strip owned, so every
 *  outreach link already sent still lands on something that lights up. */
function ExecTier({ shortName, claimState, highlight, onClaim }: {
  shortName: string;
  claimState: ClaimState;
  highlight: boolean;
  onClaim: () => void;
}) {
  const cta = claimState === "claimed"
    ? "Open your dashboard →"
    : claimState === "pending"
      ? "Your claim is in review →"
      : "Get your academic exec dashboard →";
  return (
    <div
      id="claim"
      className="sa-anchor flex min-w-0"
      style={{
        borderRadius: 16,
        ...(highlight ? { outline: "2px solid var(--accent)", outlineOffset: 3 } : null),
      }}
    >
      <TierCard
        icon={<ExecMark />}
        title="Run it for the house"
        blurb={<>See who is actually studying, and cover every exam for {shortName}.</>}
      >
        {/* ── THE NUMBERS ARE GONE FROM THIS PAGE (2026-08-31) ──────────────────────────────
            This block showed "$150 $100/member · Greek rate". That was a deliberate reversal of
            the earlier "a member never meets a number" rule, and it is being reversed back —
            Lee's call again, and the reasoning is stronger the second time:

            /go/<campus>/<chapter> IS THE MEMBER'S PAGE. It is what gets pasted into a chapter
            group chat, so the reader is overwhelmingly a member, not an exec. A member who has
            just been told Exam 1 is free and then meets a per-seat rate has to work out whether
            the free thing was really free. She does not need the deal in her head; that
            conversation belongs to the scholarship chair, who reaches it through the claim flow
            below and — once build 2 lands — through the chair tour, which is the ONE place
            pricing appears in the Greek flow.

            SEAT_PRICE and INDIVIDUAL_PRICE are still exported and still used by the chapter
            dashboard and the FAQ. Nothing about the deal changed; only who meets it unasked. */}
        <p className="text-[12.5px] leading-snug" style={{ color: "var(--text-muted)" }}>
          <span className="font-black" style={{ color: "var(--accent)" }}>Greek rate</span> — every exam,
          all semester, at a chapter price.
        </p>
        <button
          type="button"
          onClick={onClaim}
          className="flex w-full items-center justify-center px-3 text-center focus-visible:ring-2"
          style={{ ...TIER_ACTION, background: "var(--cta-chapter-bg)", color: "var(--cta-chapter-fg)", border: "none" }}
        >
          {cta}
        </button>
      </TierCard>
    </div>
  );
}

// ── TIER MARKS ────────────────────────────────────────────────────────────────────────────────
// Half-size, in the same hand-drawn language as the doors above them: cream strokes, round caps,
// one accent highlight each. Static — the flag on the door's house is the only motion in this
// column, and a tier that also moved would fight it.
const MARK = { stroke: "var(--brand-cream)", strokeWidth: 3.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function SendMark() {
  return (
    <svg viewBox="0 0 56 48" width={56} height={48} fill="none" aria-hidden style={{ display: "block" }}>
      <path d="M6 10 L38 10 L38 32 L20 32 L12 40 L12 32 L6 32 Z" {...MARK} />
      <path d="M14 18 L30 18" {...MARK} />
      <path d="M14 25 L25 25" {...MARK} />
      <path d="M42 8 L50 16 L42 24" stroke="var(--accent)" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PostMark() {
  return (
    <svg viewBox="0 0 56 48" width={56} height={48} fill="none" aria-hidden style={{ display: "block" }}>
      <path d="M12 10 L38 10 L44 16 L44 42 L12 42 Z" {...MARK} />
      <path d="M38 10 L38 16 L44 16" {...MARK} />
      <path d="M19 24 L37 24" {...MARK} />
      <path d="M19 32 L31 32" {...MARK} />
      <circle cx="28" cy="6" r="3.2" fill="var(--accent)" />
    </svg>
  );
}

function ExecMark() {
  return (
    <svg viewBox="0 0 56 48" width={56} height={48} fill="none" aria-hidden style={{ display: "block" }}>
      <path d="M10 40 L10 28" {...MARK} />
      <path d="M22 40 L22 20" {...MARK} />
      <path d="M34 40 L34 12" {...MARK} />
      <path d="M5 44 L47 44" {...MARK} />
      <path d="M41 24 L50 13" stroke="var(--accent)" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M42 11 L51 12 L50 21" stroke="var(--accent)" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
