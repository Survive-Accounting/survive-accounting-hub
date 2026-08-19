// CHAPTER ACCESS — share it now, buy it when you're ready.
//
// TERMINOLOGY. This concept was once called four things on one page: "Run FarmHouse", "Claim this
// page", "Claim this chapter", "Claim Beta Sigma Psi". Three were the same action and none said
// what you get. It is CHAPTER ACCESS everywhere now.
//
// TWO JOBS, IN THE ORDER PEOPLE DO THEM. Most visitors will never buy anything — they want to
// paste the link in the group chat. That is the first thing here, ungated, because a chapter
// spreading the link IS the product working. Buying comes second, for the one person in a hundred
// who is ready.
//
// The three benefit bullets that used to sit at the top are gone. "A real perk members actually
// use" is a claim; the dashboard underneath is the evidence, and showing the evidence is stronger
// than asserting the claim above it.
import { useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { useCampus } from "@/lib/campus-context";
import { ChapterAccessForm } from "@/components/site/ChapterAccessForm";
import { ChapterShare } from "@/components/site/ChapterShare";

/** Per-seat, per-semester. One place, quoted by the section and the FAQ alike. */
export const SEAT_PRICE = 100;
export const SEAT_MINIMUM = 10;

export function ChapterAccess({ id, chapterName, schoolSlug, chapterSlug, claimStatus }: {
  id: string;
  chapterName: string;
  schoolSlug: string;
  chapterSlug: string;
  claimStatus: "unclaimed" | "pending" | "claimed";
}) {
  const [open, setOpen] = useState(false);
  const { code } = useCampus();

  return (
    <section id={id} className="sa-anchor mx-auto w-full max-w-[640px] px-5 py-12" style={{ fontFamily: BRAND_SANS }}>
      {/* ── SHARE, ungated ─────────────────────────────────────────────────────────────────── */}
      <p className="text-center text-[11.5px] font-bold" style={{ color: "var(--text-muted)", letterSpacing: "0.16em" }}>
        SHARE WITH {chapterName.toUpperCase()}
      </p>
      <h2 className="mx-auto mt-3 max-w-[22ch] text-center text-[21px] font-black leading-[1.15] sm:text-[25px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.01em" }}>
        Send it to the group chat.
      </h2>
      <p className="mx-auto mt-2 max-w-[40ch] text-center text-[13.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
        Exam 1 is free for every member.
      </p>
      <div className="mt-5">
        <ChapterShare schoolSlug={schoolSlug} chapterSlug={chapterSlug} chapterName={chapterName} />
      </div>

      {/* ── BUY, second ────────────────────────────────────────────────────────────────────── */}
      <div className="mt-12 border-t pt-10" style={{ borderColor: "rgba(245,239,230,0.1)" }}>
        <p className="text-center text-[11.5px] font-bold" style={{ color: "var(--text-muted)", letterSpacing: "0.16em" }}>
          CHAPTER ACCESS
        </p>
        <h2 className="mx-auto mt-3 max-w-[24ch] text-center text-[21px] font-black leading-[1.15] sm:text-[25px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.01em" }}>
          Unlock the whole semester for the chapter.
        </h2>

        <DashboardPreview chapterName={chapterName} />

        <div className="mt-7 text-center">
          <p className="text-[16px] font-black" style={{ color: "var(--brand-cream)" }}>
          <span style={{ color: "var(--accent)" }}>${SEAT_PRICE} per seat, per semester</span>
        </p>
        <p className="mx-auto mt-2 max-w-[46ch] text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          {/* SEATS, NOT MEMBERS. "$100/member" invites a 150-man chapter to multiply by 150,
              get $15,000 and close the tab. Only the members actually taking the course need a
              seat, and naming the usual range turns an unbounded per-head fee into a number an
              academic budget can hold. */}
          You only buy seats for the members taking {code ?? "the course"} — usually 15–30 in a chapter.{" "}
          {SEAT_MINIMUM}-seat minimum, and Exam 1 stays free for everyone either way.
          </p>
        </div>

        <div className="mt-6">
          {claimStatus === "claimed" ? (
            <p className="text-center text-[13px]" style={{ color: "var(--text-muted)" }}>{chapterName} already has chapter access. ⚡</p>
          ) : claimStatus === "pending" ? (
            <p className="text-center text-[13px]" style={{ color: "var(--text-muted)" }}>A request for {chapterName} is already in — our team is reviewing it.</p>
          ) : open ? (
            <ChapterAccessForm schoolSlug={schoolSlug} chapterSlug={chapterSlug} chapterName={chapterName} onClose={() => setOpen(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mx-auto block w-full max-w-sm rounded-xl px-7 text-[16px] font-black transition-transform hover:scale-[1.02]"
              style={{ minHeight: 54, background: "var(--accent)", color: "#0B1220", boxShadow: "0 18px 44px -16px rgba(252,163,17,0.6)" }}
            >
              Request access for {chapterName}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/** WHAT THE EXEC GETS TO SEE.
 *
 *  Mirrors what /chapters/dashboard actually renders, so the promise and the product match. Values
 *  arrive through `stats` — undefined today, which renders dashes and a PREVIEW badge. When real
 *  per-chapter history exists it can be passed straight in and this becomes a live panel.
 *
 *  NEVER SAMPLE NUMBERS. A plausible "47 members" on a page naming a real chapter is a claim about
 *  that chapter, and would be a lie to the one person who knows the true figure.
 *
 *  "Lessons completed", not "Sets completed": a set is our word, not a word an exec has ever used.
 *  It is NOT "hours studied" — nothing in the app records watch time, and inventing an hours figure
 *  would be exactly the fabrication the dashes exist to avoid. */
export type ChapterStats = { membersJoined: number; activeThisWeek: number; lessonsCompleted: number };

function DashboardPreview({ chapterName, stats }: { chapterName: string; stats?: ChapterStats }) {
  const ROWS: Array<{ label: string; value?: number }> = [
    { label: "Members joined", value: stats?.membersJoined },
    { label: "Active this week", value: stats?.activeThisWeek },
    { label: "Lessons completed", value: stats?.lessonsCompleted },
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
        Once {chapterName} is set up, exec can keep track of usage here.
      </p>
    </div>
  );
}
