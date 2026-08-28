// PLAYER V2 "TONIGHT'S PLAN" — the preview composition (/preview/exam1, 2026-08-27).
//
// Renders the REAL LandingPage/player with the plannerV2 bridge switched on, plus:
//   • the full-screen PlanBuilder overlay on first run (no stored plan),
//   • the floating BETA tester panel (repeatable fresh first-runs, spec §37).
//
// HOW THE BUILDER LEARNS THE CONTENT: the player mounts underneath the overlay and derives the
// canonical step list exactly as it always has (buildPath over the resolved map). The bridge's
// filterSteps sees that list on every player render and publishes it up (deferred, so no
// setState-during-render), which is what lets the mode cards show estimates from REAL published
// content instead of a second data pipeline.
//
// WHY location.reload() ON START: plan + campus + path-started are all persisted local-first.
// Reloading lets the player boot through its normal returning-student path (started → resume →
// first unfinished plan step) instead of teaching the live player a second way to start. One
// beat of navy between "Start my plan" and the player is an acceptable preview cost for zero
// extra surface area in production code.
import { useEffect, useMemo, useRef, useState } from "react";

import { LandingPage } from "@/routes/landing";
import { CampusProvider } from "@/lib/campus-context";
import { track } from "@/lib/analytics";
import { setPathStarted, type PathStep } from "@/lib/exam-path";
import { midMin, planSteps, readPlan, remainingSteps, sumMinutes, writePlan, type PlannerV2Bridge, type PlanState } from "./plan-model";
import { PlanBuilder, PLAYER_V2_CSS } from "./PlanBuilder";
import { BetaPanel, PlanStrip, V2TopicComplete } from "./PlanHud";
import { readDoneSteps } from "@/lib/exam-path";

export function PlayerV2Preview() {
  // Plan state is read after mount (localStorage; SSR must not guess). Until `ready`, an opaque
  // cover prevents a flash of the wrong first screen.
  const [ready, setReady] = useState(false);
  const [plan, setPlan] = useState<PlanState | null>(null);
  useEffect(() => { setPlan(readPlan()); setReady(true); track("player_v2_opened"); }, []);

  // The canonical steps, published up from the mounted player (see header note).
  const [allSteps, setAllSteps] = useState<PathStep[]>([]);
  const stepsSig = useRef("");

  const updatePlan = (next: PlanState) => { writePlan(next); setPlan(next); };

  const bridge = useMemo<PlannerV2Bridge>(() => ({
    filterSteps: (steps) => {
      const sig = steps.map((s) => s.id).join(",");
      if (sig && sig !== stepsSig.current) {
        stepsSig.current = sig;
        setTimeout(() => setAllSteps(steps), 0);
      }
      return plan ? planSteps(steps, plan) : steps;
    },
    planStrip: (ctx) => (plan ? <PlanStrip ctx={ctx} plan={plan} onPlanChange={updatePlan} /> : null),
    topicCompleteCard: (ctx) => (plan ? <V2TopicComplete ctx={ctx} plan={plan} onPlanChange={updatePlan} /> : null),
    onMapBrowse: () => track("map_browsed"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [plan]);

  const startPlan = (p: PlanState) => {
    writePlan(p);
    setPathStarted();
    const planned = remainingSteps(planSteps(allSteps, p), readDoneSteps());
    track("plan_started", { mode: p.mode, goal: p.goal ?? undefined, estimated_minutes: Math.round(midMin(sumMinutes(planned))), included_step_count: planned.length });
    window.location.reload();
  };
  const chooseAsIGo = () => {
    writePlan({ mode: "choose_as_i_go", goal: null, overrides: {}, createdAt: Date.now() });
    window.location.reload();
  };

  return (
    // The OUTER CampusProvider serves the plan builder + beta panel (LandingPage mounts its own
    // inner one for the player — same storage underneath, and the reload-on-start hands the
    // builder's school pick to the player through that storage). Without this the builder's
    // useCampus() hits the no-provider fallback: school stays null and setSessionSchool no-ops.
    <CampusProvider urlSchoolSlug={null} accountCampusId={null} initialCode={null} initialStoredId={null}>
      <style>{PLAYER_V2_CSS}</style>
      <LandingPage plannerV2={bridge} />
      {!ready && <div aria-hidden className="fixed inset-0 z-[230]" style={{ background: "var(--bg-page, #0D1730)" }} />}
      {ready && !plan && <PlanBuilder allSteps={allSteps} onStart={startPlan} onChooseAsIGo={chooseAsIGo} />}
      {ready && <BetaPanel plan={plan} />}
    </CampusProvider>
  );
}
