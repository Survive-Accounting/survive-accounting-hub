// PLAYER V2 — THE IN-PLAYER PLAN HUD (2026-08-27).
//
// Everything the running player shows ABOUT the plan: the header strip (identity · progress ·
// time left — never database size, spec §17), the Change-Plan sheet (§23), the Go-Deeper sheet
// (§20/§22), the V2 topic-complete card (§21), and the beta tester panel (§37).
//
// All of it is preview-only code, reached exclusively through the PlannerV2Bridge the
// /preview/exam1 route passes into LandingPage.
import { useEffect, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { track } from "@/lib/analytics";
import { pathProgress, PATH_POS_KEY, PATH_STARTED_KEY, PATH_STEPS_KEY, type PathStep } from "@/lib/exam-path";
import { useDismiss } from "@/lib/use-dismiss";
import {
  addDepth, depthOptions, fmtPlus, fmtTilde, goalLabel, modeLabel, planIdentity,
  planSteps, remainingSteps, sumMinutes, V2_PLAN_KEY, midMin,
  type PlanState, type PlannerV2Ctx, type StudyGoal, type StudyMode,
} from "./plan-model";

// ── E. PLAN STRIP — Exam 1 · N% · [bar] · PRACTICE · SOLID B · ~58 min left ──────────────────
export function PlanStrip({ ctx, plan, onPlanChange }: {
  ctx: PlannerV2Ctx;
  plan: PlanState;
  onPlanChange: (next: PlanState) => void;
}) {
  const [changeOpen, setChangeOpen] = useState(false);
  const [deeperFor, setDeeperFor] = useState<{ key: string; name: string } | null>(null);
  const prog = pathProgress(ctx.steps, ctx.done);
  const left = sumMinutes(remainingSteps(ctx.steps, ctx.done));
  const browsing = plan.mode === "choose_as_i_go";
  const deeper = ctx.curTopicKey && !browsing ? depthOptions(ctx.allSteps, plan, ctx.curTopicKey).some((o) => o.available) : false;
  return (
    <div className="border-b px-3 py-2" style={{ borderColor: "var(--border-default)", background: "rgba(0,0,0,0.22)", fontFamily: BRAND_SANS }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-[12.5px] font-black" style={{ color: "var(--brand-cream)" }}>Exam 1 · {prog.pct}%</span>
        <span aria-hidden className="h-[3px] min-w-[70px] flex-1 overflow-hidden rounded-full" style={{ background: "rgba(245,239,230,0.14)" }}>
          <span className="block h-full rounded-full" style={{ width: `${prog.pct}%`, background: "var(--accent)", transition: "width 300ms ease" }} />
        </span>
        {/* The clickable plan identity (spec §23). */}
        <button
          type="button"
          onClick={() => setChangeOpen(true)}
          className="rounded-md px-1.5 text-[12px] font-black tracking-wide underline-offset-4 hover:underline focus-visible:ring-2"
          style={{ color: "var(--accent)", minHeight: 32, background: "none", border: 0, cursor: "pointer" }}
          title="Change plan"
        >
          {planIdentity(plan)}
        </button>
        {!browsing && (
          <span className="text-[12.5px] font-bold" style={{ color: "var(--brand-cream)", opacity: 0.85 }}>
            ~{fmtLeft(midMin(left))} left
          </span>
        )}
        {deeper && ctx.curTopicKey && ctx.curTopicName && (
          <button
            type="button"
            onClick={() => { track("topic_depth_opened", { topic: ctx.curTopicKey ?? undefined }); setDeeperFor({ key: ctx.curTopicKey!, name: ctx.curTopicName! }); }}
            className="ml-auto text-[12px] font-bold underline underline-offset-4 focus-visible:ring-2"
            style={{ color: "var(--text-muted)", minHeight: 32, background: "none", border: 0, cursor: "pointer" }}
          >
            Go deeper on this topic →
          </button>
        )}
      </div>
      {changeOpen && <ChangePlanSheet ctx={ctx} plan={plan} onPlanChange={onPlanChange} onClose={() => setChangeOpen(false)} />}
      {deeperFor && <GoDeeperSheet ctx={ctx} plan={plan} topicKey={deeperFor.key} topicName={deeperFor.name} onPlanChange={onPlanChange} onClose={() => setDeeperFor(null)} />}
    </div>
  );
}

const fmtLeft = (mins: number): string => {
  const m = Math.max(5, Math.round(mins / 5) * 5);
  const h = Math.floor(m / 60);
  return h ? `${h} hr ${String(m % 60).padStart(2, "0")} min` : `${m} min`;
};

// ── shared sheet chrome ───────────────────────────────────────────────────────────────────────
function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  const panelRef = useDismiss<HTMLDivElement>(onClose, { enabled: true });
  return (
    <div className="fixed inset-0 z-[270] flex items-end justify-center sm:items-center sm:px-4" style={{ background: "rgba(5,8,16,0.72)" }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={label} className="w-full max-w-[380px] rounded-t-2xl p-5 sm:rounded-2xl" style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-default)", boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)", paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))", fontFamily: BRAND_SANS }}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-[16px] font-black uppercase tracking-wide" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>{label}</h3>
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/10" style={{ color: "var(--brand-cream)", background: "none", border: 0, cursor: "pointer" }} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── H. CHANGE PLAN (spec §23) — recalculates the remaining path, preserves completed work ────
function ChangePlanSheet({ ctx, plan, onPlanChange, onClose }: {
  ctx: PlannerV2Ctx;
  plan: PlanState;
  onPlanChange: (next: PlanState) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Exclude<StudyMode, "choose_as_i_go">>(plan.mode === "choose_as_i_go" ? "practice" : plan.mode);
  const [goal, setGoal] = useState<StudyGoal>(plan.goal ?? "b");
  const reviewExists = ctx.allSteps.some((s) => s.kind === "review_video");
  const tentative: PlanState = { ...plan, mode, goal };
  const left = sumMinutes(remainingSteps(planSteps(ctx.allSteps, tentative), ctx.done));
  const radio = (checked: boolean) => (
    <span aria-hidden className="mr-2 inline-block h-[14px] w-[14px] rounded-full align-[-2px]" style={{ border: `2px solid ${checked ? "var(--accent)" : "var(--text-muted)"}`, background: checked ? "var(--accent)" : "transparent" }} />
  );
  const ROW = "flex w-full items-center rounded-lg px-2 text-left text-[14px] font-bold";
  return (
    <Sheet label="Your plan" onClose={onClose}>
      <p className="mb-1 text-[11.5px] font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Study mode</p>
      {(["cram", "practice", "full_review"] as const).map((m) => {
        const disabled = m === "full_review" && !reviewExists;
        return (
          <button key={m} type="button" disabled={disabled} onClick={() => setMode(m)} className={ROW} style={{ minHeight: 42, color: "var(--brand-cream)", background: "none", border: 0, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1 }}>
            {radio(mode === m)} {modeLabel(m)}{disabled && <span className="ml-2 text-[11.5px] font-bold" style={{ color: "var(--text-muted)" }}>· Coming soon</span>}
          </button>
        );
      })}
      <p className="mb-1 mt-3 text-[11.5px] font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Goal</p>
      {(["pass", "b", "a"] as const).map((g) => (
        <button key={g} type="button" onClick={() => setGoal(g)} className={ROW} style={{ minHeight: 42, color: "var(--brand-cream)", background: "none", border: 0, cursor: "pointer" }}>
          {radio(goal === g)} {goalLabel(g)}
        </button>
      ))}
      <p className="mt-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>Estimated remaining: <b style={{ color: "var(--brand-cream)" }}>{fmtTilde(left)}</b></p>
      <button
        type="button"
        onClick={() => {
          track("plan_changed", { from_mode: plan.mode, to_mode: mode, from_goal: plan.goal ?? undefined, to_goal: goal });
          onPlanChange({ ...plan, mode, goal });
          onClose();
        }}
        className="mt-4 w-full rounded-xl text-[14.5px] font-black focus-visible:ring-2"
        style={{ minHeight: 48, background: "var(--accent)", color: "#0B1220", border: 0, cursor: "pointer" }}
      >
        Update my plan
      </button>
      <p className="mt-2 text-center text-[11.5px]" style={{ color: "var(--text-muted)" }}>Completed work always stays complete.</p>
    </Sheet>
  );
}

// ── G. GO DEEPER (spec §20/§22) — local depth for ONE topic, with its time cost ──────────────
function GoDeeperSheet({ ctx, plan, topicKey, topicName, onPlanChange, onClose }: {
  ctx: PlannerV2Ctx;
  plan: PlanState;
  topicKey: string;
  topicName: string;
  onPlanChange: (next: PlanState) => void;
  onClose: () => void;
}) {
  const [added, setAdded] = useState<string | null>(null);
  const opts = depthOptions(ctx.allSteps, plan, topicKey);
  const leftAfter = (next: PlanState) => sumMinutes(remainingSteps(planSteps(ctx.allSteps, next), ctx.done));
  return (
    <Sheet label={`Go deeper on ${topicName}`} onClose={onClose}>
      <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
        Your plan: <b style={{ color: "var(--brand-cream)" }}>{modeLabel(plan.mode)}</b>
      </p>
      {added ? (
        <p className="mt-3 text-[13.5px] font-bold" style={{ color: "var(--brand-cream)" }}>
          {added} added to {topicName} ✓<br />
          <span className="font-normal" style={{ color: "var(--text-muted)" }}>New estimate: {fmtTilde(leftAfter(plan))} remaining</span>
        </p>
      ) : (
        <>
          <p className="mb-1 mt-3 text-[11.5px] font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Add for this topic</p>
          {opts.map((o) => (
            <button
              key={o.stage}
              type="button"
              disabled={!o.available}
              onClick={() => {
                const next = addDepth(plan, topicKey, o.stage);
                track("topic_depth_added", { topic: topicKey, added_depth: o.stage, estimated_minutes_added: o.minutes ? Math.round(midMin(o.minutes)) : undefined });
                onPlanChange(next);
                setAdded(o.label);
              }}
              className="mt-1.5 flex w-full items-center justify-between rounded-xl px-3 text-left text-[14px] font-black"
              style={{ minHeight: 48, background: o.available ? "var(--bg-surface)" : "transparent", border: "1px solid var(--border-default)", color: "var(--brand-cream)", cursor: o.available ? "pointer" : "default", opacity: o.available ? 1 : 0.55 }}
            >
              <span>+ {o.label}</span>
              <span className="text-[12px] font-bold" style={{ color: "var(--text-muted)" }}>
                {o.available && o.minutes ? fmtPlus(o.minutes) : "Coming soon"}
              </span>
            </button>
          ))}
          {opts.length === 0 && <p className="mt-2 text-[13px]" style={{ color: "var(--text-muted)" }}>This topic is already at full depth in your plan.</p>}
        </>
      )}
    </Sheet>
  );
}

// ── F. V2 TOPIC COMPLETE — Continue stays the obvious action (spec §21) ──────────────────────
export function V2TopicComplete({ ctx, plan, onPlanChange }: {
  ctx: PlannerV2Ctx & { topicName: string; topicKey: string | null; pct: number; next: PathStep; onContinue: () => void };
  plan: PlanState;
  onPlanChange: (next: PlanState) => void;
}) {
  const [deeperOpen, setDeeperOpen] = useState(false);
  const browsing = plan.mode === "choose_as_i_go";
  const hasDepth = !browsing && !!ctx.topicKey && depthOptions(ctx.allSteps, plan, ctx.topicKey).some((o) => o.available);
  return (
    <div className="sa-reveal grid w-full place-items-center px-4 py-10" style={{ minHeight: "min(56.25vw, 300px)", background: "var(--sa-surface-2)", fontFamily: BRAND_SANS }}>
      <div className="w-full max-w-xs text-center">
        <p className="text-[19px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>{ctx.topicName} complete ✓</p>
        <p className="mt-1.5 text-[13.5px]" style={{ color: "var(--text-muted)" }}>Nice. You handled the stuff you really shouldn&apos;t miss.</p>
        <p className="mt-3 text-[12.5px] font-black" style={{ color: "var(--accent)" }}>Exam 1 · {ctx.pct}%</p>
        <button type="button" onClick={ctx.onContinue} className="mt-4 w-full rounded-xl text-[14.5px] font-black" style={{ minHeight: 50, background: "var(--accent)", color: "#0B1220", border: 0, cursor: "pointer" }}>
          {browsing ? `Continue → ${ctx.next.topicName}` : `Continue in ${modeLabel(plan.mode)} mode →`}
        </button>
        {hasDepth && (
          <button
            type="button"
            onClick={() => { track("topic_depth_opened", { topic: ctx.topicKey ?? undefined }); setDeeperOpen(true); }}
            className="mt-2.5 text-[13px] font-bold underline underline-offset-4"
            style={{ color: "var(--text-muted)", minHeight: 40, background: "none", border: 0, cursor: "pointer" }}
          >
            Go deeper on this topic →
          </button>
        )}
      </div>
      {deeperOpen && ctx.topicKey && (
        <GoDeeperSheet ctx={ctx} plan={plan} topicKey={ctx.topicKey} topicName={ctx.topicName} onPlanChange={onPlanChange} onClose={() => setDeeperOpen(false)} />
      )}
    </div>
  );
}

// ── BETA PANEL (spec §37) — repeatable fresh first-runs without DevTools ─────────────────────
/** Every localStorage key the fresh-first-run reset clears. Mirrors the live player's
 *  Reset-intro list; NEVER touches accounts, entitlements, or server rows. */
const BETA_RESET_KEYS = [
  V2_PLAN_KEY, PATH_STEPS_KEY, PATH_STARTED_KEY, PATH_POS_KEY,
  "sa-landing-school", "sa-landing-prof", "sa-landing-prof-skip",
  "sa-prof-prompt", "sa-syllabus-prompt", "sa-practice-coverage", "sa-resume",
  "sa-two-set-ask", "sa-cram-auto",
];
const clearCookies = () => { for (const c of ["sa-school", "sa-prof-skip"]) document.cookie = `${c}=; Max-Age=0; path=/`; };

export function BetaPanel({ plan }: { plan: PlanState | null }) {
  const [open, setOpen] = useState(false);
  const wipe = (keys: string[], alsoCookies: boolean) => {
    try { keys.forEach((k) => localStorage.removeItem(k)); if (alsoCookies) clearCookies(); } catch { /* ignore */ }
    window.location.reload();
  };
  const BTN = "mt-2 w-full rounded-xl text-left text-[13px] font-bold px-3";
  const btnStyle: React.CSSProperties = { minHeight: 44, background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--brand-cream)", cursor: "pointer" };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-[250] rounded-full px-3 text-[11px] font-black tracking-widest"
        style={{ minHeight: 36, background: "var(--bg-overlay)", border: "1px solid var(--accent)", color: "var(--accent)", cursor: "pointer" }}
        aria-label="Beta testing panel"
      >
        BETA
      </button>
      {open && (
        <Sheet label="Beta testing" onClose={() => setOpen(false)}>
          <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            Current plan: <b style={{ color: "var(--brand-cream)" }}>{plan ? planIdentity(plan) : "none (first run)"}</b>
          </p>
          <button type="button" className={BTN} style={btnStyle} onClick={() => wipe(BETA_RESET_KEYS, true)}>
            Reset to fresh first run<br /><span className="font-normal" style={{ color: "var(--text-muted)" }}>Clears plan, progress, school, prompts. Reloads.</span>
          </button>
          <button type="button" className={BTN} style={btnStyle} onClick={() => wipe([V2_PLAN_KEY, PATH_STARTED_KEY, PATH_POS_KEY], false)}>
            Reset plan only (keep completed work)<br /><span className="font-normal" style={{ color: "var(--text-muted)" }}>Re-runs the plan builder; done steps survive.</span>
          </button>
          <button type="button" className={BTN} style={btnStyle} onClick={() => wipe([V2_PLAN_KEY, PATH_STARTED_KEY, PATH_POS_KEY, "sa-landing-school", "sa-landing-prof", "sa-landing-prof-skip"], true)}>
            Forget school + plan (keep completed work)<br /><span className="font-normal" style={{ color: "var(--text-muted)" }}>Tests the unknown-school first run.</span>
          </button>
          <p className="mt-3 text-[11.5px]" style={{ color: "var(--text-muted)" }}>Local browser state only — never accounts, purchases, or server data.</p>
        </Sheet>
      )}
    </>
  );
}
