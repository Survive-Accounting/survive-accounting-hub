// CHAPTER ACCESS — one cohesive onboarding section: share → claim → see it working.
//
// This replaced two stacked sections ("Share with <chapter>" and a separate buy/request block)
// that made the same page pitch the same exec twice. It is now a single 3-step accordion, in the
// order an exec actually proceeds: spread the link (free, day one), claim the page (free — an
// officer identifying themselves, NOT a purchase gate), then watch whether members use it.
// Full-semester seats are a later conversion and appear only as secondary pricing inside step 2.
//
// ONE claim state drives everything (see `claim` below): step 1's GroupMe copy, step 2's
// form-vs-completed card, and step 3's preview-vs-live dashboard all read the same value, so the
// page can never say "partnered with us" in one breath and "claim this page" in the next.
//
// ACCESSIBILITY: real <button> headers with aria-expanded/aria-controls, panels are labelled
// regions, exactly one step open at a time, and the open/close animation collapses to an instant
// toggle under prefers-reduced-motion (grid-rows transition + motion-reduce:transition-none).
import { useEffect, useId, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { useCampus } from "@/lib/campus-context";
import { getChapterDashboard } from "@/lib/greek-chapters.functions";
import { goPath } from "@/lib/greek-go.functions";
import { supabase } from "@/integrations/supabase/client";
import { ChapterAccessForm } from "@/components/site/ChapterAccessForm";
import { ChapterShare } from "@/components/site/ChapterShare";

/** Per-member, per-semester. One place, quoted by the section and the FAQ alike. */
export const SEAT_PRICE = 100;
export const SEAT_MINIMUM = 10;

/** The dashboard stats this section can show. null = not instrumented yet — rendered as an honest
 *  empty state, NEVER a sample number. studyHours and questionsCompleted have no data source
 *  today (nothing records watch time; practice attempts live in localStorage); the fields exist
 *  so wiring them later is a value, not a redesign. */
export type ChapterUsageStats = {
  membersJoined: number | null;
  studyHours: number | null;
  questionsCompleted: number | null;
};

type ClaimState = "unclaimed" | "pending" | "claimed";

export function ChapterAccess({ id, chapterName, schoolSlug, chapterSlug, letters, nickname, claimStatus }: {
  id: string;
  chapterName: string;
  schoolSlug: string;
  chapterSlug: string;
  /** Roster shorthand ("ATO") when GreekIntel has it — feeds the claimed GroupMe message. */
  letters?: string | null;
  /** Roster nickname ("ADPi") — what students call the chapter; preferred in share copy. */
  nickname?: string | null;
  claimStatus: ClaimState;
}) {
  // THE claim source of truth for this page. Seeded from the loader's value and advanced locally
  // when a claim submits, so the section reflects reality without a reload. Nothing else on the
  // page re-derives claim state.
  const [claim, setClaim] = useState<ClaimState>(claimStatus);
  const [open, setOpen] = useState(0); // step index; -1 = all collapsed
  const { code } = useCampus();
  const courseLabel = code ?? "Intro Accounting";

  const steps: Array<{ title: string; desc: string; status?: string; body: React.ReactNode }> = [
    {
      title: "Share it with the house",
      desc: "Send the chapter link, drop it in GroupMe, or print a flyer for the house.",
      body: (
        <ChapterShare
          schoolSlug={schoolSlug}
          chapterSlug={chapterSlug}
          chapterName={chapterName}
          letters={letters}
          nickname={nickname}
          claimed={claim === "claimed"}
          courseLabel={courseLabel}
        />
      ),
    },
    {
      title: "Claim this page",
      desc: "An exec can claim the page to manage chapter access and track usage.",
      status: claim === "claimed" ? "✓ Page claimed" : claim === "pending" ? "In review" : undefined,
      body: <ClaimStep chapterName={chapterName} schoolSlug={schoolSlug} chapterSlug={chapterSlug} claim={claim} onPending={() => setClaim("pending")} />,
    },
    {
      title: "See your chapter studying",
      desc: "Track how members are using the free Exam 1 resources.",
      body: <UsageStep chapterName={chapterName} schoolSlug={schoolSlug} chapterSlug={chapterSlug} claimed={claim === "claimed"} active={open === 2} />,
    },
  ];

  return (
    <section id={id} className="sa-anchor mx-auto w-full max-w-[640px] px-5 py-12" style={{ fontFamily: BRAND_SANS }}>
      <p className="text-center text-[11.5px] font-bold" style={{ color: "var(--text-muted)", letterSpacing: "0.16em" }}>
        CHAPTER ACCESS
      </p>
      <h2 className="mx-auto mt-3 max-w-[24ch] text-center text-[21px] font-black leading-[1.15] sm:text-[25px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.01em" }}>
        Set up chapter access in 3 steps.
      </h2>

      <div className="mt-7 flex flex-col gap-3">
        {steps.map((s, i) => (
          <StepCard
            key={s.title}
            n={i + 1}
            title={s.title}
            desc={s.desc}
            status={s.status}
            open={open === i}
            onToggle={() => setOpen((o) => (o === i ? -1 : i))}
          >
            {s.body}
          </StepCard>
        ))}
      </div>
    </section>
  );
}

/** One accordion card. The header is a real button (keyboard + screen-reader native); the panel
 *  is a labelled region. Height animates via the grid 0fr→1fr trick — fast, no measuring — and
 *  motion-reduce turns it into an instant toggle. */
function StepCard({ n, title, desc, status, open, onToggle, children }: {
  n: number;
  title: string;
  desc: string;
  /** Small right-aligned state chip ("✓ Page claimed") shown even while collapsed. */
  status?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const uid = useId();
  const panelId = `step-panel-${uid}`;
  const headId = `step-head-${uid}`;
  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{
        // Slightly elevated navy over the page, per the surface ladder; the open card gains a
        // restrained orange edge so the active step reads at a glance without shouting.
        background: "var(--sa-surface-2, rgba(245,239,230,0.05))",
        border: `1px solid ${open ? "rgba(252,163,17,0.45)" : "rgba(245,239,230,0.12)"}`,
        transition: "border-color 160ms",
      }}
    >
      <h3 className="m-0">
        <button
          type="button"
          id={headId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left focus-visible:ring-2 sm:px-5"
          style={{ minHeight: 64, color: "var(--brand-cream)" }}
        >
          <span
            aria-hidden
            className="shrink-0 text-[13px] font-black tabular-nums"
            style={{ color: open ? "var(--accent)" : "var(--text-muted)", letterSpacing: "0.08em" }}
          >
            {String(n).padStart(2, "0")}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15.5px] font-black leading-tight">{title}</span>
            <span className="mt-0.5 block text-[12.5px] leading-snug" style={{ color: "var(--text-muted)" }}>{desc}</span>
          </span>
          {status && (
            <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black" style={{ background: "rgba(252,163,17,0.14)", color: "var(--accent)" }}>
              {status}
            </span>
          )}
          <span
            aria-hidden
            className="shrink-0 transition-transform motion-reduce:transition-none"
            style={{ color: "var(--accent)", fontSize: 12, transform: open ? "rotate(180deg)" : "none" }}
          >
            ▾
          </span>
        </button>
      </h3>
      <div
        id={panelId}
        role="region"
        aria-labelledby={headId}
        className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden">
          {/* inert (not `hidden`): a closed card leaves the tab order and the a11y tree without
              leaving layout, so the collapse still has content to animate over — `hidden` would
              blank it on the first frame and turn the close into a jump cut. */}
          <div className="px-4 pb-5 pt-1 sm:px-5" inert={!open}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/** STEP 2 — claim. NOT a purchase gate: claiming is free and the pricing is secondary context so
 *  an exec knows what the later conversation costs before giving their number. */
function ClaimStep({ chapterName, schoolSlug, chapterSlug, claim, onPending }: {
  chapterName: string;
  schoolSlug: string;
  chapterSlug: string;
  claim: ClaimState;
  onPending: () => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  // Whether THIS visitor submitted the claim: their pending state keeps the form's own "you're
  // almost set" card; someone else's pending claim gets the third-person line instead.
  const [submitted, setSubmitted] = useState(false);

  if (claim === "claimed") {
    return (
      <div className="mx-auto max-w-sm rounded-xl p-4 text-center" style={{ background: "rgba(252,163,17,0.08)", border: "1px solid rgba(252,163,17,0.35)" }}>
        <p className="text-[14px] font-black" style={{ color: "var(--brand-cream)" }}>✓ Page claimed</p>
        <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          {chapterName} has a verified chapter admin. Exec manages access and usage from the{" "}
          <a href="/chapters/dashboard" className="font-bold underline underline-offset-2" style={{ color: "var(--accent)" }}>chapter dashboard</a>.
        </p>
      </div>
    );
  }

  if (claim === "pending" && !submitted) {
    return (
      <div className="mx-auto max-w-sm rounded-xl p-4 text-center" style={{ background: "rgba(245,239,230,0.05)", border: "1px solid rgba(245,239,230,0.14)" }}>
        <p className="text-[14px] font-black" style={{ color: "var(--brand-cream)" }}>A claim is in review.</p>
        <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          Someone from {chapterName} already claimed this page — we&apos;re verifying their chapter role now.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4">
      {/* After this visitor's own submission the form's "You're almost set." card stands alone —
          repeating the pitch and pricing above a done deal would bury the confirmation. The form
          keeps its tree position either way so its internal done state survives the switch. */}
      {!submitted && (
        <>
          <p className="text-center text-[14px] font-bold leading-relaxed" style={{ color: "var(--brand-cream)" }}>
            Claiming this page is free. Exam 1 stays free for every member.
          </p>

          {/* Pricing is SECONDARY — context for the later seats conversation, not a checkout. */}
          <div className="rounded-xl px-4 py-3.5 text-center" style={{ background: "rgba(0,0,0,0.18)", border: "1px solid rgba(245,239,230,0.1)" }}>
            <p className="text-[11.5px] font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Full-semester chapter access</p>
            <p className="mt-1.5 text-[16px] font-black" style={{ color: "var(--accent)" }}>${SEAT_PRICE} per member, per semester</p>
            <p className="mt-0.5 text-[12px] font-bold" style={{ color: "var(--text-muted)" }}>{SEAT_MINIMUM}-seat minimum</p>
            <p className="mx-auto mt-2 max-w-[42ch] text-[12.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Full-semester access unlocks Exams 2, 3, and the Final for the members your chapter sponsors.
            </p>
          </div>
        </>
      )}

      {formOpen || submitted ? (
        <ChapterAccessForm
          schoolSlug={schoolSlug}
          chapterSlug={chapterSlug}
          chapterName={chapterName}
          onClose={() => setFormOpen(false)}
          onDone={() => { setSubmitted(true); onPending(); }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="w-full rounded-xl px-7 text-[16px] font-black transition-transform hover:scale-[1.02] focus-visible:ring-2"
          style={{ minHeight: 54, background: "var(--accent)", color: "#0B1220", boxShadow: "0 18px 44px -16px rgba(252,163,17,0.6)" }}
        >
          Claim This Page ⚡
        </button>
      )}
    </div>
  );
}

/** STEP 3 — the dashboard. Three rules, in order of importance:
 *
 *  NEVER SAMPLE NUMBERS. A plausible "47 members" on a page naming a real chapter is a claim
 *  about that chapter, and would be a lie to the one person who knows the true figure. Missing
 *  metrics render as an em-dash with honest "not tracked yet" copy.
 *
 *  REAL NUMBERS ONLY FOR THE VERIFIED ADMIN. When the chapter is claimed and the signed-in
 *  visitor's session resolves (getChapterDashboard, magic-link JWT vs admin_email) to THIS
 *  chapter, the panel goes live with the real member count. Everyone else sees the preview.
 *
 *  Study hours and practice questions have NO data source today (nothing records watch time;
 *  practice attempts are client-local) — they render the empty state even for the admin, and
 *  light up when instrumentation lands, via ChapterUsageStats. */
function UsageStep({ chapterName, schoolSlug, chapterSlug, claimed, active }: {
  chapterName: string;
  schoolSlug: string;
  chapterSlug: string;
  claimed: boolean;
  /** The step is expanded — the admin lookup runs lazily, never for a visitor who never opens it. */
  active: boolean;
}) {
  const [live, setLive] = useState<ChapterUsageStats | null>(null);

  useEffect(() => {
    if (!claimed || !active || live) return;
    let on = true;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return; // signed out — preview stands
        const d = await getChapterDashboard({ data: { accessToken: token } });
        // Admin of a DIFFERENT chapter sees this page's preview, not their own numbers.
        if (!d || d.url !== goPath(schoolSlug, chapterSlug)) return;
        if (on) setLive({ membersJoined: d.membersJoined, studyHours: null, questionsCompleted: null });
      } catch { /* preview stands */ }
    })();
    return () => { on = false; };
  }, [claimed, active, live, schoolSlug, chapterSlug]);

  // "not tracked yet" is UNCONDITIONAL on the two uninstrumented metrics: a bare em-dash in the
  // preview would read as "data exists behind the lock", which is a claim the product can't keep.
  const ROWS: Array<{ label: string; value: number | null; note?: string }> = [
    { label: "Members joined", value: live?.membersJoined ?? null },
    { label: "Total study hours", value: live?.studyHours ?? null, note: "not tracked yet" },
    { label: "Practice questions completed", value: live?.questionsCompleted ?? null, note: "not tracked yet" },
  ];

  return (
    <div className="mx-auto max-w-sm">
      <div className="rounded-2xl p-4" style={{ background: "rgba(0,0,0,0.18)", border: "1px solid rgba(245,239,230,0.12)" }}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-[12px] font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Exec dashboard</span>
          <span className="rounded-full px-2 py-0.5 text-[10.5px] font-black uppercase tracking-wide" style={{ background: "rgba(252,163,17,0.14)", color: "var(--accent)" }}>
            {live ? "Live" : "Preview"}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {ROWS.map((r) => (
            <div key={r.label} className="rounded-xl px-2 py-3 text-center" style={{ background: "rgba(245,239,230,0.05)" }}>
              <div className="text-[20px] font-black leading-none" style={{ color: "var(--brand-cream)", opacity: r.value == null ? 0.4 : 1 }}>
                {r.value == null ? <span aria-label={r.note ?? "no data yet"}>—</span> : r.value.toLocaleString()}
              </div>
              <div className="mt-1.5 text-[11px] font-bold leading-tight" style={{ color: "var(--brand-cream)" }}>{r.label}</div>
              {r.note && <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>{r.note}</div>}
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          {live ? (
            <>Full roster and seat controls live on the{" "}
              <a href="/chapters/dashboard" className="font-bold underline underline-offset-2" style={{ color: "var(--accent)" }}>chapter dashboard</a>.</>
          ) : claimed ? (
            <>The verified exec for {chapterName} can sign in to see live numbers here and on the chapter dashboard.</>
          ) : (
            <>Once {chapterName} is claimed, its exec tracks usage here — starting with the free Exam 1 resources, before any seats are bought.</>
          )}
        </p>
      </div>
      <p className="mt-3 text-center text-[12.5px]" style={{ color: "var(--text-muted)" }}>
        See whether members are actually using the resources before exam day.
      </p>
    </div>
  );
}
