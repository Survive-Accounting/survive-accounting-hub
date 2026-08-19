// CHAPTER ACCESS — the exec offer, in one section, under one name.
//
// TERMINOLOGY. This concept was called four different things on one page: "Run FarmHouse",
// "Claim this page", "Claim this chapter", "Claim Beta Sigma Psi". Three of those are the same
// action and none of them say what you get. It is CHAPTER ACCESS everywhere now, and the button
// says "Set up <Org> access" — a thing you buy for your chapter, not a page you lay claim to.
//
// This section no longer re-argues the case. The hero makes it once; repeating "Intro accounting
// hurts chapter GPA" here only pushed the product further down. What is left is what an exec
// actually needs after they have agreed: what the chapter gets, proof they can see it working,
// the price, and the way to start.
import { useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { ChapterAccessForm } from "@/components/site/ChapterAccessForm";

/** Per-seat, per-semester. One place, quoted by the section and the FAQ alike. */
export const SEAT_PRICE = 100;
export const SEAT_MINIMUM = 10;

const INCLUDED = [
  "A real perk members actually use",
  "See who's using it — no guessing",
  "Private roster, flyer & slide kit",
];

export function ChapterAccess({ id, chapterName, schoolSlug, chapterSlug, claimStatus }: {
  id: string;
  chapterName: string;
  schoolSlug: string;
  chapterSlug: string;
  claimStatus: "unclaimed" | "pending" | "claimed";
}) {
  const [open, setOpen] = useState(false);

  return (
    <section id={id} className="sa-anchor mx-auto w-full max-w-[640px] px-5 py-12" style={{ fontFamily: BRAND_SANS }}>
      <p className="text-center text-[11.5px] font-bold" style={{ color: "var(--text-muted)", letterSpacing: "0.16em" }}>
        CHAPTER ACCESS
      </p>
      <h2 className="mt-3 text-center text-[22px] font-black leading-[1.15] sm:text-[26px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.01em" }}>
        Give the whole chapter the full semester.
      </h2>

      {/* NO BOX. The brief asks for whitespace over containers, so these are lines with a bolt,
          not three more cards inside a card. */}
      <ul className="mx-auto mt-6 flex max-w-sm flex-col gap-2.5">
        {INCLUDED.map((b) => (
          <li key={b} className="flex items-start gap-2.5 text-[14px]" style={{ color: "var(--brand-cream)" }}>
            <span aria-hidden className="shrink-0" style={{ color: "var(--accent)" }}>⚡</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <DashboardPreview chapterName={chapterName} />

      {/* THE PRICE, plainly, after the case. */}
      <div className="mt-7 text-center">
        <p className="text-[16px] font-black" style={{ color: "var(--brand-cream)" }}>
          <span style={{ color: "var(--accent)" }}>${SEAT_PRICE}/member per semester</span> · {SEAT_MINIMUM}-seat minimum
        </p>
        <p className="mx-auto mt-2 max-w-[44ch] text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Exam 1 stays free for everyone. Chapter access unlocks the rest of the semester.
        </p>
      </div>

      <div className="mt-6">
        {claimStatus === "claimed" ? (
          <p className="text-center text-[13px]" style={{ color: "var(--text-muted)" }}>{chapterName} already has chapter access. ⚡</p>
        ) : claimStatus === "pending" ? (
          <p className="text-center text-[13px]" style={{ color: "var(--text-muted)" }}>Someone from {chapterName} has already started this — Lee is reviewing it.</p>
        ) : open ? (
          <ChapterAccessForm
            schoolSlug={schoolSlug}
            chapterSlug={chapterSlug}
            chapterName={chapterName}
            onClose={() => setOpen(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mx-auto block w-full max-w-sm rounded-xl px-7 text-[16px] font-black transition-transform hover:scale-[1.02]"
            style={{ minHeight: 54, background: "var(--accent)", color: "#0B1220", boxShadow: "0 18px 44px -16px rgba(252,163,17,0.6)" }}
          >
            Set up {chapterName} access
          </button>
        )}
      </div>
    </section>
  );
}

/** WHAT THE EXEC GETS TO SEE.
 *
 *  Mirrors the three figures /chapters/dashboard actually renders, so the promise and the product
 *  match. Values come in through `stats` — undefined today, which renders dashes and a PREVIEW
 *  badge. When real per-chapter history exists it can be passed straight in and this becomes a
 *  live panel with no redesign.
 *
 *  NEVER SAMPLE NUMBERS. A plausible "47 members" on a page that names a real chapter is a claim
 *  about that chapter, and would be a lie to the one person who knows the true figure. */
export type ChapterStats = { membersJoined: number; activeThisWeek: number; setsCompleted: number };

function DashboardPreview({ chapterName, stats }: { chapterName: string; stats?: ChapterStats }) {
  const ROWS: Array<{ label: string; value?: number }> = [
    { label: "Members joined", value: stats?.membersJoined },
    { label: "Active this week", value: stats?.activeThisWeek },
    { label: "Sets completed", value: stats?.setsCompleted },
  ];
  const isPreview = !stats;
  return (
    <div className="mt-7 rounded-2xl p-4" style={{ background: "rgba(245,239,230,0.05)", border: "1px solid rgba(245,239,230,0.12)" }}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[12px] font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Exec dashboard</span>
        {isPreview && (
          <span className="rounded-full px-2 py-0.5 text-[10.5px] font-black uppercase tracking-wide" style={{ background: "rgba(252,163,17,0.14)", color: "var(--accent)" }}>
            Preview
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {ROWS.map((r) => (
          <div key={r.label} className="rounded-xl px-2 py-3 text-center" style={{ background: "rgba(0,0,0,0.18)" }}>
            <div className="text-[20px] font-black leading-none" style={{ color: "var(--brand-cream)", opacity: r.value == null ? 0.4 : 1 }}>
              {r.value == null ? <span aria-label="no data yet">—</span> : r.value.toLocaleString()}
            </div>
            <div className="mt-1.5 text-[11px] font-bold leading-tight" style={{ color: "var(--brand-cream)" }}>{r.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
        Once {chapterName} is set up, exec gets the roster, sharing kit, and live usage numbers here.
      </p>
    </div>
  );
}
