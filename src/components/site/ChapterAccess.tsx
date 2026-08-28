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
import { logGreekEvent } from "@/lib/greek-go.functions";

/** Per-member, per-semester. One place, quoted by the claim flow and the FAQ alike. */
export const SEAT_PRICE = 100;
export const SEAT_MINIMUM = 10;

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
  const { code } = useCampus();
  const courseLabel = code ?? "Intro Accounting";

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
        courseLabel={courseLabel}
      />

      {/* THE EXEC STRIP — one quiet row. The exec path is real but it is not what this page is
          about, and it must never outrank the share kit above it. */}
      <section className="mx-auto w-full max-w-[640px] px-5 pb-4">
        <button
          type="button"
          onClick={() => setClaimOpen(true)}
          className="flex w-full items-center justify-between gap-3 rounded-xl px-4 text-left transition-colors hover:bg-white/[0.04] focus-visible:ring-2"
          style={{ minHeight: 56, background: "rgba(0,0,0,0.18)", border: "1px solid var(--border-default)", fontFamily: BRAND_SANS, color: "var(--brand-cream)", cursor: "pointer" }}
        >
          <span className="text-[14px] font-bold">
            {claim === "claimed"
              ? "Chapter exec? Open your chapter dashboard →"
              : claim === "pending"
                ? "Chapter exec? A claim for this chapter is in review →"
                : "Chapter exec? Claim your chapter dashboard →"}
          </span>
          <span aria-hidden style={{ color: "var(--accent)" }}>›</span>
        </button>
      </section>

      {claimOpen && (
        <ClaimSheet
          chapterName={chapterName}
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

// ── THE SHARE KIT ─────────────────────────────────────────────────────────────────────────────
/** Three fat actions, in the order they get used, and nothing else. Every action hands out a
 *  URL stamped with where it came from. */
function ShareKitSection({ id, schoolSlug, chapterSlug, chapterName, letters, nickname, claimed, courseLabel }: {
  id: string;
  schoolSlug: string;
  chapterSlug: string;
  chapterName: string;
  letters?: string | null;
  nickname?: string | null;
  claimed: boolean;
  courseLabel: string;
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
      void logGreekEvent({ data: { kind: via === "link" ? "copy_link" : "copy_message", schoolSlug, chapterSlug, via } }).catch(() => {});
      window.setTimeout(() => setCopied((c) => (c === via ? null : c)), 2200);
    } catch { /* clipboard blocked in some in-app browsers — the visible URL below still works */ }
  };

  const ACTION = "flex w-full items-center justify-between gap-3 rounded-xl px-4 text-left text-[14.5px] font-black focus-visible:ring-2";
  const actionStyle: React.CSSProperties = {
    minHeight: 54, background: "var(--bg-surface)", border: "1px solid var(--border-default)",
    color: "var(--brand-cream)", cursor: "pointer",
  };
  const TIER_H = "text-[11.5px] font-black uppercase";
  const tierHStyle = { color: "var(--text-muted)", letterSpacing: "0.14em" } as const;

  return (
    <section id={id} className="sa-anchor mx-auto w-full max-w-[1040px] px-5 py-12" style={{ fontFamily: BRAND_SANS }}>
      <p className="text-center text-[11.5px] font-bold" style={{ color: "var(--text-muted)", letterSpacing: "0.16em" }}>
        SHARE KIT
      </p>
      <h2 className="mx-auto mt-3 max-w-[24ch] text-center text-[21px] font-black leading-[1.15] sm:text-[25px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.01em" }}>
        Get it to the whole house.
      </h2>

      {/* THREE TIERS, side by side on desktop and stacked on a phone (K2). They are the three
          rooms a chapter actually lives in: the group chat, the wall, and the meeting. Every one
          of them is usable by any member — sharing is never gated on a claim. */}
      <div className="mx-auto mt-8 grid w-full gap-6 lg:grid-cols-3 lg:gap-7">
        {/* TIER 1 — SEND IT. */}
        <div className="min-w-0">
          <p className={TIER_H} style={tierHStyle}>Send it</p>
          <div className="mt-3 flex flex-col gap-2.5">
            <button type="button" onClick={() => void copy("link")} className={ACTION} style={actionStyle}>
              <span>{copied === "link" ? copiedLabel : "Copy chapter link"}</span>
              <span aria-hidden style={{ color: "var(--accent)" }}>⧉</span>
            </button>
            <button type="button" onClick={() => void copy("groupme")} className={ACTION} style={actionStyle}>
              <span>{copied === "groupme" ? copiedLabel : "Copy GroupMe message"}</span>
              <span aria-hidden style={{ color: "var(--accent)" }}>⧉</span>
            </button>
            <button type="button" onClick={() => void copy("text")} className={ACTION} style={actionStyle}>
              <span>{copied === "text" ? copiedLabel : "Copy text message"}</span>
              <span aria-hidden style={{ color: "var(--accent)" }}>⧉</span>
            </button>
          </div>
          {/* The URL in plain sight: clipboard access is blocked in some in-app browsers, and a
              link nobody can read is a dead end. Shown WITHOUT a stamp — this one gets typed. */}
          <p className="mt-3 truncate text-[11.5px]" style={{ color: "var(--text-muted)" }}>{plain.replace("https://", "")}</p>
        </div>

        {/* TIER 2 — THE FLYER. */}
        <div className="min-w-0">
          <p className={TIER_H} style={tierHStyle}>The flyer</p>
          <FlyerBlock
            schoolSlug={schoolSlug}
            chapterSlug={chapterSlug}
            chapterName={chapterName}
            subtitle="Print it and post it in the chapter house."
          />
        </div>

        {/* TIER 3 — THE MEETING SLIDE. Same generator as the council partner kit. */}
        <div className="min-w-0">
          <p className={TIER_H} style={tierHStyle}>The meeting slide</p>
          <SlideBlock
            schoolSlug={schoolSlug}
            chapterSlug={chapterSlug}
            chapterName={chapterName}
          />
        </div>
      </div>
    </section>
  );
}

// ── THE CLAIM FLOW ────────────────────────────────────────────────────────────────────────────
/** The exec's sheet: the same claim form as before, unchanged, plus the two things that used to
 *  sit in public — the price and the dashboard reassurance — now shown only to the person they
 *  are for, after they have said they are an exec by opening this. */
function ClaimSheet({ chapterName, schoolSlug, chapterSlug, claim, onPending, onClose }: {
  chapterName: string;
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
        aria-label="Claim your chapter"
        className="w-full max-w-[420px] rounded-t-2xl p-5 sm:rounded-2xl"
        style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-default)", boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)", paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))", fontFamily: BRAND_SANS }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-[17px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Claim your chapter</h3>
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
              <p className="mb-3 text-center text-[13.5px] font-bold leading-relaxed" style={{ color: "var(--brand-cream)" }}>
                Claiming is free. Exam 1 stays free for every member.
              </p>
            )}
            <ChapterAccessForm
              schoolSlug={schoolSlug}
              chapterSlug={chapterSlug}
              chapterName={chapterName}
              onClose={onClose}
              onDone={() => { setSubmitted(true); onPending(); }}
            />
            {!submitted && (
              <>
                {/* WHAT THE EXEC GETS — the old public "See your chapter studying" section, reduced
                    to the one line an exec actually needs before typing their number. */}
                <p className="mt-3 text-center text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                  You&apos;ll get a dashboard showing how the house is using it.
                </p>
                {/* THE PRICE LIVES HERE AND NOWHERE ELSE (2026-08-28). It is only ever relevant to
                    an exec, and it was previously on the public page where every member met it. */}
                <div className="mt-3 rounded-xl px-4 py-3.5 text-center" style={{ background: "rgba(0,0,0,0.18)", border: "1px solid var(--border-default)" }}>
                  <p className="text-[11.5px] font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Later, if you want it</p>
                  <p className="mt-1.5 text-[16px] font-black" style={{ color: "var(--accent)" }}>${SEAT_PRICE} per member, per semester</p>
                  <p className="mt-0.5 text-[12px] font-bold" style={{ color: "var(--text-muted)" }}>{SEAT_MINIMUM}-seat minimum</p>
                  <p className="mx-auto mt-2 max-w-[42ch] text-[12.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    Full-semester access unlocks Exams 2, 3, and the Final for the members your chapter sponsors.
                  </p>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
