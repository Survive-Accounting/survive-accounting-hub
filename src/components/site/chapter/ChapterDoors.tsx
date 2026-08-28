// THE CHAPTER PAGE'S TWO DOORS (2026-08-28) — /go/<school>/<chapter>.
//
// Same component as the homepage hero's doors (components/site/home-two-door/DoorCard), not a
// lookalike: same frame, same button geometry, same CTA tokens, same hover. What differs is only
// what the two doors ARE on this page:
//
//   LEFT  — the member who came to study. Boiling bolt, the course code as its HEADING, and the
//           same action the old "Start Exam 1 Free" CTA had (scroll to the player + tag the
//           member for chapter attribution).
//   RIGHT — anyone spreading it. Every member can, not just exec — the card sells the result
//           (the whole house gets the help) rather than the absence of a gate.
//
// ONE-CODE RULE (see two-door-copy.ts): the code lives in the LEFT DOOR'S HEADING here, so that
// card's support line does not repeat it; the RIGHT card spends its one use on its support line.
//
// ── COPY LAW ──────────────────────────────────────────────────────────────────────────────────
// DESCRIBE WHAT THEY GET, NEVER WHAT WE DON'T REQUIRE.
// Platform mechanics — "no account", "no permission needed", "no sign-up" — are facts about our
// plumbing, not benefits to a student. They also plant the idea that an account was a thing to
// worry about. This card used to read "Anyone in the house can share it. No account, no
// permission needed."; it now says what sharing DOES: everyone taking the course gets the help,
// and the house GPA goes up. Applies to every student-facing string on this page.
import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import {
  CHAPTER_BTN, DOOR_BTN_CLASS, DoorCard, DoorRow, SOLO_BTN,
} from "@/components/site/home-two-door/DoorCard";
import { nbspCode } from "@/lib/course-code";

/** The share-kit section's anchor — the right door's destination. */
export const SHARE_ANCHOR = "share-kit";

/** THE LEFT DOOR'S SUPPORT LINE, as data so both states are testable without a live chapter.
 *  `sponsored` must come from GoChapter.sponsored (a live, paid, unexpired seat pool) — there is
 *  no aspirational middle state: a chapter that merely CLAIMED its page is not sponsored. */
export const soloSupportLine = (sponsored: boolean, letters: string): { muted: string; strong: string } => ({
  muted: "Cram-style videos & practice.",
  strong: sponsored ? `Sponsored by ${letters} — every exam unlocked.` : "Exam 1 is free for the whole house.",
});

/** THE RIGHT DOOR'S SUPPORT LINE. Says what the house GETS (help, a better GPA) — never what we
 *  do not require of them; see the COPY LAW at the top of this file. This block's single use of
 *  the course code lives here, because the left block spends its one use on its heading. */
export const shareSupportLine = (code: string | null, letters: string): { muted: string; strong: string } => ({
  muted: code
    ? `Make sure everyone taking ${nbspCode(code)} has the help they need.`
    : "Make sure everyone in the house has the help they need.",
  strong: `Boost ${letters}'s house GPA.`,
});

export function ChapterDoors({ code, letters, sponsored, onStartExam, onShare }: {
  /** Verified course code for this campus, or null (then the heading degrades honestly). */
  code: string | null;
  /** Chapter shorthand for the sponsored line ("ΑΔΧ"). */
  letters: string;
  /** TRUE only for a live, paid, unexpired seat pool — see GoChapter.sponsored. Never aspirational. */
  sponsored: boolean;
  onStartExam: () => void;
  onShare: () => void;
}) {
  return (
    <DoorRow label="Study or spread the word">
      {/* LEFT DOOR — the member here to study. First in DOM, so it stacks first on mobile. */}
      <DoorCard
        icon={<span aria-hidden style={{ display: "block" }}><BoltBoil height={112} /></span>}
        title={code ? `Survive · ${nbspCode(code)}` : "Start studying"}
        button={
          <button type="button" onClick={onStartExam} className={DOOR_BTN_CLASS} style={SOLO_BTN}>
            Start cramming →
          </button>
        }
        support={
          <span className="text-[13px] leading-snug" style={{ maxWidth: "34ch" }}>
            <span style={{ color: "var(--text-muted)" }}>{soloSupportLine(sponsored, letters).muted} </span>
            <span className="font-bold" style={{ color: "var(--brand-cream)" }}>{soloSupportLine(sponsored, letters).strong}</span>
          </span>
        }
      />

      {/* RIGHT DOOR — spreading it. Deliberately open to every member, not just exec. */}
      <DoorCard
        icon={<FlyerMark height={112} />}
        title="Spread the word"
        button={
          <button type="button" onClick={onShare} className={DOOR_BTN_CLASS} style={CHAPTER_BTN}>
            Get the share kit →
          </button>
        }
        support={
          <span className="text-[13px] leading-snug" style={{ maxWidth: "34ch" }}>
            <span style={{ color: "var(--text-muted)" }}>{shareSupportLine(code, letters).muted} </span>
            <span className="font-bold" style={{ color: "var(--brand-cream)" }}>{shareSupportLine(code, letters).strong}</span>
          </span>
        }
      />
    </DoorRow>
  );
}

/** THE FLYER MARK — the right door's icon, drawn in the bolt's hand-drawn language: a jagged
 *  page fold, the bolt on the page, a QR-dot corner. Static, like the temple on the homepage:
 *  the boiling bolt opposite is the only living thing on screen. Strokes wear the cream token;
 *  the bolt fill and the two lit QR dots wear the brand crimson/accent tokens.
 *  Exported: the council page uses the same mark for its in-room door. */
export function FlyerMark({ height = 112 }: { height?: number }) {
  const w = Math.round(height * (84 / 96));
  return (
    <svg viewBox="0 0 84 96" width={w} height={height} fill="none" aria-hidden style={{ display: "block" }}>
      <path d="M18 8 L58 8 L70 20 L70 88 L18 88 Z"
        stroke="var(--brand-cream)" strokeWidth={4.5} strokeLinejoin="round" strokeLinecap="round" />
      <path d="M58 8 L58 20 L70 20"
        stroke="var(--brand-cream)" strokeWidth={4.5} strokeLinejoin="round" strokeLinecap="round" />
      <path d="M45 28 L34 47 L41 47 L31 64 L54 42 L46 42 L56 28 Z"
        fill="var(--cta-solo-bg)" stroke="var(--brand-cream)" strokeWidth={3} strokeLinejoin="round" />
      <circle cx="28" cy="76" r="2.4" fill="var(--accent)" />
      <circle cx="37" cy="76" r="2.4" fill="var(--brand-cream)" />
      <circle cx="28" cy="82" r="2.4" fill="var(--brand-cream)" />
      <circle cx="37" cy="82" r="2.4" fill="var(--accent)" />
    </svg>
  );
}
