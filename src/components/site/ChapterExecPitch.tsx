// THE EXEC PITCH — the chapter argument, on the page where it can actually be acted on.
//
// All of this copy used to live on the /chapters portal, in front of everyone. That was the wrong
// room twice over: a visitor to the portal has not said who they are or which chapter they belong
// to, so a pitch there is aimed at nobody in particular; and the person it was written for — an
// exec deciding whether to spend chapter money — only reaches that decision on their OWN chapter's
// page, where the numbers are about their house.
//
// ORDER IS THE ARGUMENT: problem, then what the chapter gets, then proof they can see it working,
// then the price, then the ask. Pricing sits after the case, never before it — a number shown to
// someone who has not yet agreed there is a problem is just an objection with a dollar sign.
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";

/** Per-seat, per-semester. Stated once, here, on the exec path only. */
export const SEAT_PRICE = 100;
export const SEAT_MINIMUM = 10;

const BENEFITS = [
  "A real perk members actually use",
  "See who's using it — no guessing",
  "Exam 1 is free for your whole chapter",
];

export function ChapterExecPitch({ chapterName, claimForm }: {
  chapterName: string;
  /** The existing claim form, passed in so this component stays presentational. */
  claimForm?: React.ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-[640px] px-5 pt-6" style={{ fontFamily: BRAND_SANS }}>
      <h2 className="text-[22px] font-black leading-[1.15] sm:text-[26px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.01em" }}>
        Intro accounting is quietly wrecking your chapter&apos;s GPA.
      </h2>
      <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "var(--brand-cream)", opacity: 0.88 }}>
        Dozens of your members take it every semester — business, finance, and accounting majors all
        hitting the same wall at once. Give them a tutor, all at once.
      </p>

      <div className="mt-6 flex flex-col gap-2">
        {BENEFITS.map((b) => (
          <div key={b} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: "rgba(245,239,230,0.04)", border: "1px solid rgba(245,239,230,0.1)" }}>
            <span aria-hidden style={{ color: "var(--accent)" }}>⚡</span>
            <span className="text-[13.5px]" style={{ color: "var(--brand-cream)" }}>{b}</span>
          </div>
        ))}
      </div>

      <DashboardPeek chapterName={chapterName} />

      {/* THE PRICE, after the case and before the ask. */}
      <p className="mt-6 text-[14px]" style={{ color: "var(--brand-cream)" }}>
        Seats are <span className="font-black" style={{ color: "var(--accent)" }}>${SEAT_PRICE}/member per semester</span>, {SEAT_MINIMUM} minimum.
      </p>
      <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
        Exam 1 stays free for everyone either way — seats unlock Exams 2, 3 and the Final.
      </p>

      {claimForm && <div className="mt-5">{claimForm}</div>}
    </section>
  );
}

/** WHAT THE EXEC GETS TO SEE — a still of the real dashboard.
 *
 *  Mirrors the three figures /chapters/dashboard actually renders (members joined, active this
 *  week, sets completed) rather than inventing prettier ones, so the promise and the product match.
 *  The numbers are shown as em-dashes, NOT as sample data: a fake "47 members" on a page that names
 *  a real chapter reads as a claim about that chapter, and would be a lie to the one person who
 *  knows exactly how many members they have. */
function DashboardPeek({ chapterName }: { chapterName: string }) {
  const STATS = [
    { label: "Members joined", hint: "who used your link" },
    { label: "Active this week", hint: "still studying" },
    { label: "Sets completed", hint: "across the chapter" },
  ];
  return (
    <div className="mt-6 rounded-2xl p-4" style={{ background: "rgba(245,239,230,0.05)", border: "1px solid rgba(245,239,230,0.12)" }}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[12px] font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Your dashboard
        </span>
        <span className="rounded-full px-2 py-0.5 text-[10.5px] font-black uppercase tracking-wide" style={{ background: "rgba(252,163,17,0.14)", color: "var(--accent)" }}>
          Preview
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {STATS.map((s) => (
          <div key={s.label} className="rounded-xl px-2.5 py-3 text-center" style={{ background: "rgba(0,0,0,0.18)" }}>
            <div className="text-[20px] font-black leading-none" style={{ color: "var(--brand-cream)", opacity: 0.45 }} aria-hidden>—</div>
            <div className="mt-1.5 text-[11px] font-bold leading-tight" style={{ color: "var(--brand-cream)" }}>{s.label}</div>
            <div className="mt-0.5 text-[10px] leading-tight" style={{ color: "var(--text-muted)" }}>{s.hint}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px]" style={{ color: "var(--text-muted)" }}>
        Once {chapterName} is yours you get the roster, a flyer &amp; slide kit, and these numbers for real.
      </p>
    </div>
  );
}
