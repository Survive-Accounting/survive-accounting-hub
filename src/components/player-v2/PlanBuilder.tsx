// PLAYER V2 — THE FULL-SCREEN PLAN BUILDER (first-run experience, spec §4).
//
// Covers the application with a calm, one-decision-per-screen setup:
//   CHOOSE SCHOOL (only if unknown) → HOW DO YOU WANT TO STUDY? → WHAT ARE YOU AIMING FOR?
//   → YOUR EXAM 1 PLAN → START MY PLAN →
//
// No sidebar, no question counts, no curriculum map — the payoff screen shows a COMPACT topic
// list with plan indicators only. Two required planning questions (mode, goal); school is
// identity, syllabus is optional and appears only after the plan exists.
import { useEffect, useMemo, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { LeePortrait } from "@/components/site/Marketing";
import { SearchPicker } from "@/components/site/SearchPicker";
import { SCHOOLS, SyllabusModal, type School } from "@/routes/landing";
import { useCampus } from "@/lib/campus-context";
import { rememberCampus, SKIPPED } from "@/lib/campus-prefs";
import { track } from "@/lib/analytics";
import { readDoneSteps, type PathStep } from "@/lib/exam-path";
import {
  fmtPlus, fmtTilde, aTeaser, midMin, planIdentity, planSteps,
  planTopicRows, remainingSteps, sumMinutes, type PlanState, type StudyGoal, type StudyMode,
} from "./plan-model";

/** Future ~15–20s Lee intro (spec §5). Set to a Mux playback id when the video exists; null
 *  renders the clean text banner alone — no Coming-Soon UI, no redesign needed later. */
const PLAYER_V2_INTRO_PLAYBACK_ID: string | null = null;

const CARD: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1.5px solid var(--border-default)",
  borderRadius: 18,
  padding: "22px 18px",
  minHeight: 190,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  width: "100%",
  cursor: "pointer",
  color: "var(--brand-cream)",
};

const H1: React.CSSProperties = { fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", fontSize: 24, fontWeight: 900, letterSpacing: "0.02em", textTransform: "uppercase" };

type BuilderStep = "school" | "mode" | "goal" | "plan";

export function PlanBuilder({ allSteps, onStart, onChooseAsIGo }: {
  /** The canonical available steps, published up from the mounted player (may still be loading). */
  allSteps: PathStep[];
  onStart: (plan: PlanState) => void;
  onChooseAsIGo: () => void;
}) {
  const campus = useCampus();
  const [schoolAnswered, setSchoolAnswered] = useState(false);
  const [mode, setMode] = useState<Exclude<StudyMode, "choose_as_i_go"> | null>(null);
  const [goal, setGoal] = useState<StudyGoal | null>(null);
  const step: BuilderStep = !campus.school && !schoolAnswered ? "school" : !mode ? "mode" : !goal ? "goal" : "plan";

  return (
    // z-230: above every piece of site chrome (header 200, floating CTAs 190) but BELOW the
    // portal layers the builder itself opens — the school picker's dropdown (239/240) and the
    // syllabus modal — which must render over this overlay, not under it.
    <div className="fixed inset-0 z-[230] overflow-y-auto" style={{ background: "var(--bg-page)", fontFamily: BRAND_SANS }} role="dialog" aria-label="Build tonight's plan">
      <div className="mx-auto flex min-h-full w-full max-w-[820px] flex-col items-center justify-center px-5 py-10">
        {step === "school" && <SchoolStep onDone={() => setSchoolAnswered(true)} />}
        {step === "mode" && <ModeStep allSteps={allSteps} onPick={(m) => setMode(m)} onChooseAsIGo={onChooseAsIGo} />}
        {step === "goal" && <GoalStep onBack={() => setMode(null)} onPick={(g) => setGoal(g)} />}
        {step === "plan" && mode && goal && (
          <PlanPayoff allSteps={allSteps} mode={mode} goal={goal} onBack={() => setGoal(null)} onStart={onStart} />
        )}
      </div>
    </div>
  );
}

// ── A. CHOOSE SCHOOL (only if unknown) ────────────────────────────────────────────────────────
function SchoolStep({ onDone }: { onDone: () => void }) {
  const campus = useCampus();
  const items = useMemo(() => SCHOOLS.map((s: School) => ({ value: s.id, label: s.name, meta: s.codeVerified ? s.code : undefined, aliases: s.aliases })), []);
  return (
    <div className="w-full max-w-[440px] text-center">
      <h1 style={H1}>Choose your school</h1>
      <p className="mt-2 text-[14px]" style={{ color: "var(--text-muted)" }}>So your plan speaks your course&apos;s language.</p>
      <div className="mt-6 text-left">
        <SearchPicker items={items} value={null} placeholder="Pick your school" searchPlaceholder="Search schools…" onPick={(id) => { campus.setSessionSchool(id); track("school_selected", { campus_id: id }); onDone(); }} ariaLabel="Choose your school" />
      </div>
      <button
        type="button"
        onClick={() => { rememberCampus(SKIPPED); onDone(); }}
        className="mt-5 text-[13.5px] font-bold underline underline-offset-4"
        style={{ color: "var(--text-muted)", minHeight: 44, background: "none", border: 0, cursor: "pointer" }}
      >
        Skip for now →
      </button>
    </div>
  );
}

// ── B. HOW DO YOU WANT TO STUDY? ──────────────────────────────────────────────────────────────
/** The cumulative-depth stage list every mode card carries (spec §7): dim at rest, illuminated
 *  on hover/focus of its card — Practice lights Cram + Practice, Full Review lights all three. */
function StageDots({ stages, comingSoon }: { stages: string[]; comingSoon?: boolean }) {
  return (
    <div className="sa-v2-stages mt-3 flex flex-col items-center gap-1">
      {stages.map((s) => (
        <span key={s} className="sa-v2-stage text-[13px] font-bold" style={{ color: "var(--brand-cream)" }}>
          <span aria-hidden className="sa-v2-dot" style={{ color: "var(--accent)" }}>●</span> {s}
          {comingSoon && s === "Review" && <span className="ml-1 text-[11px] font-bold" style={{ color: "var(--text-muted)" }}>· Coming soon</span>}
        </span>
      ))}
    </div>
  );
}

function ModeStep({ allSteps, onPick, onChooseAsIGo }: {
  allSteps: PathStep[];
  onPick: (m: Exclude<StudyMode, "choose_as_i_go">) => void;
  onChooseAsIGo: () => void;
}) {
  useEffect(() => { track("study_mode_viewed"); }, []);
  const done = readDoneSteps();
  // Estimates come from the real published content (goal-b filter as the representative cut).
  const est = (m: Exclude<StudyMode, "choose_as_i_go">) => {
    const steps = remainingSteps(planSteps(allSteps, { mode: m, goal: "b", overrides: {}, createdAt: 0 }), done);
    return steps.length ? fmtTilde(sumMinutes(steps)) : null;
  };
  const reviewExists = allSteps.some((s) => s.kind === "review_video");
  const cramEst = est("cram");
  const cards: Array<{ m: Exclude<StudyMode, "choose_as_i_go">; title: string; line: string; stages: string[]; est: string | null; disabled: boolean; note?: string }> = [
    { m: "cram", title: "Cram", line: "Cram Blasts only. Fastest route.", stages: ["Cram"], est: cramEst, disabled: !cramEst, note: !cramEst ? "Coming soon" : undefined },
    { m: "practice", title: "Practice", line: "See it. Then do it.", stages: ["Cram", "Practice"], est: est("practice"), disabled: !est("practice") },
    { m: "full_review", title: "Full Review", line: "The comprehensive route.", stages: ["Cram", "Practice", "Review"], est: reviewExists ? est("full_review") : null, disabled: !reviewExists, note: !reviewExists ? "Coming soon" : undefined },
  ];
  return (
    <div className="w-full text-center">
      <IntroBanner />
      <h1 style={H1}>How do you want to study?</h1>
      <div className="mx-auto mt-6 grid w-full max-w-[760px] gap-3 sm:grid-cols-3 sm:gap-4">
        {cards.map((c) => (
          <button
            key={c.m}
            type="button"
            disabled={c.disabled}
            onClick={() => { track("study_mode_selected", { mode: c.m }); onPick(c.m); }}
            className="sa-v2-card focus-visible:ring-2"
            style={{ ...CARD, ...(c.disabled ? { opacity: 0.55, cursor: "default" } : {}) }}
            aria-label={c.disabled ? `${c.title} — coming soon` : c.title}
          >
            <span className="text-[19px] font-black uppercase" style={{ fontFamily: BRAND_DISPLAY, letterSpacing: "0.04em" }}>{c.title}</span>
            <StageDots stages={c.stages} comingSoon={c.disabled && c.m === "full_review"} />
            <span className="mt-2 text-[13px]" style={{ color: "var(--text-muted)" }}>{c.line}</span>
            <span className="flex-1" />
            {c.disabled ? (
              <span className="mt-3 text-[12.5px] font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{c.note}</span>
            ) : (
              <span className="mt-3 text-[12.5px] font-bold" style={{ color: "var(--brand-cream)", opacity: 0.85 }}>
                <span style={{ color: "var(--text-muted)" }}>Estimated time</span><br />{c.est ?? "—"}
              </span>
            )}
          </button>
        ))}
      </div>
      {/* Quiet escape hatch — deliberately NOT a fourth card (spec §8). */}
      <button
        type="button"
        onClick={() => { track("study_mode_selected", { mode: "choose_as_i_go" }); onChooseAsIGo(); }}
        className="mt-6 text-[13.5px] font-bold underline underline-offset-4"
        style={{ color: "var(--text-muted)", minHeight: 44, background: "none", border: 0, cursor: "pointer" }}
      >
        I&apos;ll choose as I go →
      </button>
    </div>
  );
}

/** Optional Lee intro slot (spec §5) — text banner today, video-ready without redesign. */
function IntroBanner() {
  return (
    <div className="mx-auto mb-7 flex w-full max-w-[480px] items-center gap-4 rounded-2xl p-4 text-left" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
      <LeePortrait width={56} caption={false} />
      <p className="text-[13.5px] leading-snug" style={{ color: "var(--brand-cream)", opacity: 0.9 }}>
        I&apos;ll build you a path. Pick how deep you want to go and what you&apos;re shooting for — you can change it anytime.
        {PLAYER_V2_INTRO_PLAYBACK_ID && null /* future: in-pane video, same slot */}
      </p>
    </div>
  );
}

// ── C. WHAT ARE YOU AIMING FOR? ───────────────────────────────────────────────────────────────
function GoalStep({ onPick, onBack }: { onPick: (g: StudyGoal) => void; onBack: () => void }) {
  useEffect(() => { track("goal_viewed"); }, []);
  const cards: Array<{ g: StudyGoal; title: string; line: string }> = [
    { g: "pass", title: "Just Pass", line: "Prioritize what matters most." },
    { g: "b", title: "Solid B", line: "Cover the core exam material." },
    { g: "a", title: "Go for an A", line: "Leave as little out as possible." },
  ];
  return (
    <div className="w-full text-center">
      <h1 style={H1}>What are you aiming for?</h1>
      <div className="mx-auto mt-6 grid w-full max-w-[760px] gap-3 sm:grid-cols-3 sm:gap-4">
        {cards.map((c) => (
          <button key={c.g} type="button" onClick={() => { track("goal_selected", { goal: c.g }); onPick(c.g); }} className="sa-v2-card focus-visible:ring-2" style={{ ...CARD, minHeight: 150 }}>
            <span className="text-[19px] font-black uppercase" style={{ fontFamily: BRAND_DISPLAY, letterSpacing: "0.04em" }}>{c.title}</span>
            <span className="mt-2 text-[13px]" style={{ color: "var(--text-muted)" }}>{c.line}</span>
          </button>
        ))}
      </div>
      {/* Prioritization, never a grade promise (spec §9). */}
      <p className="mt-5 text-[13px]" style={{ color: "var(--text-muted)" }}>I&apos;ll prioritize your plan around this.</p>
      <BackLink onClick={onBack} />
    </div>
  );
}

// ── D. YOUR EXAM 1 PLAN — the payoff (spec §13/§14/§15) ───────────────────────────────────────
function PlanPayoff({ allSteps, mode, goal, onBack, onStart }: {
  allSteps: PathStep[];
  mode: Exclude<StudyMode, "choose_as_i_go">;
  goal: StudyGoal;
  onBack: () => void;
  onStart: (plan: PlanState) => void;
}) {
  const campus = useCampus();
  const [plan, setPlan] = useState<PlanState>({ mode, goal, overrides: {}, createdAt: Date.now() });
  useEffect(() => { setPlan((p) => ({ ...p, mode, goal })); }, [mode, goal]);
  const planned = useMemo(() => planSteps(allSteps, plan), [allSteps, plan]);
  const done = readDoneSteps();
  const remaining = remainingSteps(planned, done);
  const minutes = sumMinutes(remaining);
  const rows = planTopicRows(allSteps, planned, plan);
  const teaser = aTeaser(allSteps, plan);
  const [sylOpen, setSylOpen] = useState(false);
  const [sylGone, setSylGone] = useState(false);
  const schoolObj = useMemo<School | null>(() => (campus.school ? SCHOOLS.find((s: School) => s.id === campus.school!.id) ?? null : null), [campus.school]);

  useEffect(() => {
    track("plan_generated", { mode: plan.mode, goal: plan.goal ?? undefined, estimated_minutes: Math.round(midMin(minutes)), included_step_count: planned.length });
    track("syllabus_prompt_shown");
    // Once, for THIS generated plan identity — not per keystroke of state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.mode, plan.goal]);

  return (
    <div className="w-full max-w-[480px] text-center">
      <h1 style={H1}>Your Exam 1 plan</h1>
      <p className="mt-2 text-[15px] font-black tracking-wide" style={{ color: "var(--accent)" }}>{planIdentity(plan)}</p>
      <p className="mt-3 text-[13px]" style={{ color: "var(--text-muted)" }}>Estimated time</p>
      <p className="text-[19px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>{fmtTilde(minutes)}</p>

      {/* The compact map — plan indicators only, never counts (spec §13). */}
      <div className="mt-5 flex flex-col gap-1.5 rounded-2xl p-4 text-left" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
        {rows.map((r) => {
          const inPlan = r.cram || r.practice || r.review === "in" || r.review === "coming";
          return (
            <div key={r.topicKey} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5" style={{ opacity: inPlan ? 1 : 0.45 }}>
              <span className="text-[13.5px] font-bold" style={{ color: "var(--brand-cream)" }}>{r.topicName}</span>
              <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                {r.cram && <span className="mr-2">Cram <span style={{ color: "var(--accent)" }}>✓</span></span>}
                {r.practice && <span className="mr-2">Practice <span style={{ color: "var(--accent)" }}>✓</span></span>}
                {r.review === "in" && <span>Review <span style={{ color: "var(--accent)" }}>✓</span></span>}
                {r.review === "coming" && <span>Review · Coming soon</span>}
                {!inPlan && <span>Not in this plan</span>}
              </span>
            </div>
          );
        })}
      </div>

      {/* TAKE IT TO AN A — restrained teaser, only when A isn't already the goal (spec §14). */}
      {teaser && (
        <div className="mt-4 rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
          <p className="text-[13px] font-black uppercase tracking-wide" style={{ color: "var(--brand-cream)" }}>Take it to an A</p>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            {teaser.count} step{teaser.count === 1 ? "" : "s"} beyond the core plan · {fmtPlus(teaser.minutes)}
          </p>
          <button
            type="button"
            onClick={() => { track("plan_changed", { from_mode: plan.mode, to_mode: plan.mode, from_goal: plan.goal ?? undefined, to_goal: "a" }); setPlan((p) => ({ ...p, goal: "a" })); }}
            className="mt-2 text-[13px] font-black underline underline-offset-4"
            style={{ color: "var(--accent)", minHeight: 40, background: "none", border: 0, cursor: "pointer" }}
          >
            Add it →
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => onStart(plan)}
        className="mt-5 w-full rounded-xl text-[15.5px] font-black transition-transform hover:scale-[1.01] focus-visible:ring-2"
        style={{ minHeight: 54, background: "var(--accent)", color: "#0B1220", boxShadow: "0 18px 44px -16px rgba(252,163,17,0.55)" }}
      >
        Start my plan →
      </button>

      {/* Optional syllabus personalization — after the plan, never before it (spec §15). */}
      {!sylGone && (
        <div className="mt-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
          Want me to match this closer to your class?{" "}
          <button type="button" onClick={() => { track("syllabus_upload_clicked"); setSylOpen(true); }} className="font-bold underline underline-offset-4" style={{ color: "var(--brand-cream)", background: "none", border: 0, cursor: "pointer", minHeight: 40 }}>
            Upload your syllabus →
          </button>{" "}
          <button type="button" onClick={() => { track("syllabus_prompt_skipped"); setSylGone(true); }} className="underline underline-offset-4" style={{ color: "var(--text-muted)", background: "none", border: 0, cursor: "pointer", minHeight: 40 }}>
            Not now
          </button>
        </div>
      )}

      <BackLink onClick={onBack} />
      {sylOpen && <SyllabusModal school={schoolObj} onClose={() => setSylOpen(false)} />}
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-5 text-[13px] font-bold" style={{ color: "var(--text-muted)", minHeight: 44, background: "none", border: 0, cursor: "pointer" }}>
      ← Back
    </button>
  );
}

/** Builder + HUD shared card interactions — restrained lift/glow, reduced-motion safe (§31). */
export const PLAYER_V2_CSS = `
.sa-v2-card { transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease; }
.sa-v2-card:hover:not(:disabled), .sa-v2-card:focus-visible { transform: translateY(-3px); border-color: var(--accent); box-shadow: 0 22px 50px -24px rgba(252,163,17,0.35); }
.sa-v2-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
/* Cumulative stages: dim at rest, ILLUMINATED with the card — hovering Practice lights Cram +
   Practice; hovering Full Review lights all three. */
.sa-v2-card .sa-v2-stage { opacity: 0.5; transition: opacity 160ms ease; }
.sa-v2-card:hover:not(:disabled) .sa-v2-stage, .sa-v2-card:focus-visible .sa-v2-stage { opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  .sa-v2-card, .sa-v2-card:hover:not(:disabled), .sa-v2-card:focus-visible { transform: none; transition: none; }
  .sa-v2-card .sa-v2-stage { opacity: 1; transition: none; }
}
`;
