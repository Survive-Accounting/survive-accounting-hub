// THE PRODUCTION UI PREFERENCE — how loudly the run widget (components/v3/ProductionTimer.tsx)
// asks. Pure: no React, no clock, no network; the widget at the root and the ⚙ in the V3 shell
// (components/v3/Shell.tsx) read the same three words off the same key.
//
// Lee, 2026-09-09: "every click I can remove, remove" — the "Ready to start …?" dialogs and
// the performance tracking move into a Settings menu, and the DEFAULT is quiet: time silently,
// ask nothing. `full` is the 2026-09-07 behaviour (a dialog on every step) for when he wants
// the checklist in his face; `off` mounts nothing and writes no production_time_log row at all.
//
// Per browser (localStorage), like the top bar's collapsed state (Shell.tsx BAR_KEY): the
// laptop that films and the PC that builds may disagree, and should. A browser that can't
// read storage (a private window, SSR) is quiet — the default, never a louder mode by accident.
//
// Hoisted function declarations throughout, per tdz-graph.test.ts.
import { runStepFromPath, RUN_STEPS, type ProductionRun, type RunStepId } from "./production-run";

export type ProductionUi = "full" | "quiet" | "off";

export const PRODUCTION_UI_KEY = "sa-production-ui";
/** window event, detail = the new ProductionUi. The widget is mounted once at the root and the
 *  gear that changes the pref lives in the shell: the window is what the two share. */
export const PRODUCTION_UI_EVENT = "sa:production-ui";
export const PRODUCTION_UI_DEFAULT: ProductionUi = "quiet";

/** The radio, in the order the gear lists it. The labels ARE the copy (the spec's, verbatim). */
export const PRODUCTION_UI_OPTIONS: readonly { value: ProductionUi; label: string }[] = [
  { value: "full", label: "Full (ask at every step)" },
  { value: "quiet", label: "Quiet (time silently)" },
  { value: "off", label: "Off (no timing)" },
];

/** A stored value, defended: anything but the three words (a typo, an old spelling, null from
 *  a browser that never stored one) is quiet. */
export function parseProductionUi(raw: string | null): ProductionUi {
  return raw === "full" || raw === "quiet" || raw === "off" ? raw : PRODUCTION_UI_DEFAULT;
}

/** The pref, or quiet when storage can't be read. */
export function readProductionUi(): ProductionUi {
  try { return parseProductionUi(localStorage.getItem(PRODUCTION_UI_KEY)); } catch { return PRODUCTION_UI_DEFAULT; }
}

/** Store the pref and tell every listener in this window. A browser that refuses storage still
 *  gets the event, so the change holds until the tab closes and forgets on reload. */
export function writeProductionUi(v: ProductionUi): void {
  try { localStorage.setItem(PRODUCTION_UI_KEY, v); } catch { /* forgets on reload */ }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<ProductionUi>(PRODUCTION_UI_EVENT, { detail: v }));
}

/** The gear's "Iterate (time to beat)" link: this set's Step 5 when the URL names a set, else
 *  the cross-set report (/admin/production) — the same numbers without a set to hang them on. */
export function iterateHref(pathname: string): string {
  const p = runStepFromPath(pathname);
  return p?.kind === "set" ? `/v3/${p.topicSlug}/${p.setSlug}/blast-off/improve` : "/admin/production";
}

/** A run in hand that /v3/post can time: running, with Cross-post not yet decided. The
 *  full-mode modal's two branches (ready / pick-post) fold into this one question in quiet. */
export function postUsable(run: ProductionRun | null | undefined): run is ProductionRun {
  return !!run && run.status === "running" && (run.steps.post.status === "pending" || run.steps.post.status === "running");
}

/** QUIET MODE'S ANSWER TO "which set is this for?" — /v3/post is cross-set, and the full-mode
 *  modal asks. Quiet doesn't: of every running run still waiting for Cross-post, the one whose
 *  Rehearse & Film finished most recently (a run that never filmed falls back to when it
 *  started) is the set Lee just filmed. Null when nothing is waiting — then nothing starts. */
export function defaultPostRun(runs: readonly ProductionRun[]): ProductionRun | null {
  const waiting = runs.filter((r) => r.status === "running" && r.steps.post.status === "pending");
  let best: ProductionRun | null = null, bestAt = "";
  for (const r of waiting) {
    const at = r.steps.film.endedAt ?? r.startedAt;
    if (!best || at > bestAt) { best = r; bestAt = at; }
  }
  return best;
}

/** The steps before `step` (in run order) that are still running — what landing on a later
 *  step finishes silently in quiet mode. Pure, so the rule is testable without a widget. */
export function earlierRunningSteps(run: ProductionRun, step: RunStepId): RunStepId[] {
  const out: RunStepId[] = [];
  for (const s of RUN_STEPS) {
    if (s === step) break;
    if (run.steps[s].status === "running") out.push(s);
  }
  return out;
}
