// TEST MODE (08-23) — the guided-run wrapper for the student experience. Opt-in only, never
// touches real analytics.
//
// ACTIVATION (either):
//   • URL: `?feedback=1&t=<tester-name>&email=<tester@email>&testmode=1` — sticks to sa-test-mode
//   • localStorage `sa-test-mode` — persists across reloads until Start-over or ?testmode=0
//
// SHAPE: `useTestMode()` returns { enabled, tester, session, ... }. Any component with `isTest`
// prop is wired to that flag. A tiny event bus lets any component say "I did X" so the drawer
// checklist can auto-detect step completion without needing to know about every surface. Every
// event is also POSTed to `test_mode_activity` (best-effort) so the admin console can watch a
// run end-to-end.
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

// ---- storage keys -------------------------------------------------------------------------------
export const TEST_MODE_KEY = "sa-test-mode";           // {tester, session, activatedAt}
export const TEST_STEPS_KEY = "sa-test-steps";         // Record<StepId, {done: boolean, at: number, meta?: unknown}>
export const TEST_DRAWER_KEY = "sa-test-drawer-open";  // "1" | "0"

export type Tester = { name: string | null; email: string | null };

export interface TestModeState {
  enabled: boolean;
  tester: Tester;
  /** UUID for this tester session — every test_mode_activity row carries it. */
  session: string;
  activatedAt: number;
}

const EMPTY: TestModeState = { enabled: false, tester: { name: null, email: null }, session: "", activatedAt: 0 };

function readStored(): TestModeState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(TEST_MODE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<TestModeState> | null;
    if (!parsed || parsed.enabled !== true) return EMPTY;
    return {
      enabled: true,
      tester: { name: parsed.tester?.name ?? null, email: parsed.tester?.email ?? null },
      session: typeof parsed.session === "string" && parsed.session ? parsed.session : cryptoRandom(),
      activatedAt: parsed.activatedAt ?? Date.now(),
    };
  } catch { return EMPTY; }
}

function cryptoRandom(): string {
  try { return crypto.randomUUID(); } catch { return "anon-" + Math.random().toString(16).slice(2); }
}

function write(state: TestModeState): void {
  try { localStorage.setItem(TEST_MODE_KEY, JSON.stringify(state)); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent("sa-test-mode-change"));
}

/** Parse the tester URL params. Non-destructive: returns null if not present. */
export function parseTestModeFromUrl(url: string | URL): TestModeState | null {
  const u = typeof url === "string" ? new URL(url, "http://x") : url;
  const testmode = u.searchParams.get("testmode");
  const feedback = u.searchParams.get("feedback");
  const on = testmode === "1" || feedback === "1";
  const off = testmode === "0";
  if (off) return { ...EMPTY };
  if (!on) return null;
  return {
    enabled: true,
    tester: { name: u.searchParams.get("t"), email: u.searchParams.get("email") },
    session: cryptoRandom(),
    activatedAt: Date.now(),
  };
}

// ---- external store hook (SSR-safe) ------------------------------------------------------------
function subscribe(cb: () => void) {
  window.addEventListener("sa-test-mode-change", cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener("sa-test-mode-change", cb); window.removeEventListener("storage", cb); };
}

export function useTestMode(): TestModeState & {
  activate: (t?: Partial<Tester>) => void;
  deactivate: () => void;
  resetRun: () => void;
} {
  const state = useSyncExternalStore(subscribe, readStored, () => EMPTY);
  const activate = useCallback((t?: Partial<Tester>) => {
    const cur = readStored();
    const next: TestModeState = {
      enabled: true,
      tester: { name: t?.name ?? cur.tester.name, email: t?.email ?? cur.tester.email },
      session: cur.session || cryptoRandom(),
      activatedAt: cur.activatedAt || Date.now(),
    };
    write(next);
  }, []);
  const deactivate = useCallback(() => { try { localStorage.removeItem(TEST_MODE_KEY); } catch { /* ignore */ } window.dispatchEvent(new CustomEvent("sa-test-mode-change")); }, []);
  const resetRun = useCallback(() => {
    const cur = readStored();
    const next: TestModeState = { ...cur, session: cryptoRandom(), activatedAt: Date.now() };
    try { localStorage.removeItem(TEST_STEPS_KEY); } catch { /* ignore */ }
    write(next);
    window.dispatchEvent(new CustomEvent("sa-test-run-reset"));
  }, []);
  return { ...state, activate, deactivate, resetRun };
}

// ---- URL parser wired to storage on mount (call once at __root) --------------------------------
export function bootstrapTestModeFromUrl(): void {
  if (typeof window === "undefined") return;
  const parsed = parseTestModeFromUrl(window.location.href);
  if (parsed == null) return;
  if (!parsed.enabled) { try { localStorage.removeItem(TEST_MODE_KEY); } catch { /* ignore */ } window.dispatchEvent(new CustomEvent("sa-test-mode-change")); return; }
  const cur = readStored();
  const merged: TestModeState = {
    enabled: true,
    tester: { name: parsed.tester.name ?? cur.tester.name, email: parsed.tester.email ?? cur.tester.email },
    session: cur.session || parsed.session,
    activatedAt: cur.activatedAt || parsed.activatedAt,
  };
  write(merged);
  // Strip the query params from the URL so a copy-paste of the current URL doesn't re-arm test
  // mode on a real student. Localstorage keeps the arming.
  try {
    const u = new URL(window.location.href);
    ["feedback", "t", "email", "testmode"].forEach((k) => u.searchParams.delete(k));
    window.history.replaceState({}, "", u.toString());
  } catch { /* ignore */ }
}

// ---- STEPS — the 9-step checklist definition ---------------------------------------------------
export const STEP_IDS = [
  "land",       // 1 · Land on the homepage/campus/Greek page
  "school",     // 2 · Pick a school (or arrive on a route-locked school)
  "professor",  // 3 · Match a professor (OR intentionally Skip)
  "start",      // 4 · Start Exam 1 — open a set
  "ceq",        // 5 · Complete a CEQ set (≥1 correct + ≥1 incorrect + ≥1 unanswered)
  "notify",     // 6 · Contextual coming-soon notify submitted
  "save",       // 7 · Save progress magic link requested (+ signed-in return)
  "buy",        // 8 · Buy paid content via Stripe test checkout
  "return",     // 9 · Verify return state (signed-in progress + entitlement)
] as const;
export type StepId = typeof STEP_IDS[number];

export const STEP_TITLES: Record<StepId, string> = {
  land:      "Land on the page",
  school:    "Pick a school",
  professor: "Match a professor (or Skip)",
  start:     "Start Exam 1",
  ceq:       "Complete a CEQ set",
  notify:    "Test contextual coming-soon notify",
  save:      "Save progress",
  buy:       "Buy paid content",
  return:    "Verify return state",
};

export const STEP_HINTS: Record<StepId, string> = {
  land:      "The homepage, a campus page, or a Greek chapter page — anywhere the player mounts.",
  school:    "Pick from the picker, or land on /<school> where the URL names it.",
  professor: "Pick one, write in a name, or hit Skip. Exercise both paths across different runs.",
  start:     "Click a topic, then a set. Practice opens immediately.",
  ceq:       "Answer ≥1 correctly, ≥1 incorrectly. Open Q# to check the colour states.",
  notify:    "Click a muted Cram or Review pill, or a locked paid set. Submit; a [TEST] email lands.",
  save:      "Click Save. Check the tester email for the sign-in link and click through.",
  buy:       "Open a paid exam and pay with a test card (Phase B — coming with Stripe wiring).",
  return:    "Refresh — you're still signed in, your set state is remembered, entitlement holds.",
};

export interface StepState { done: boolean; at: number; meta?: unknown }
export type StepMap = Partial<Record<StepId, StepState>>;

function readSteps(): StepMap {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(TEST_STEPS_KEY) ?? "{}") as StepMap; } catch { return {}; }
}
function writeSteps(m: StepMap): void {
  try { localStorage.setItem(TEST_STEPS_KEY, JSON.stringify(m)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent("sa-test-steps-change"));
}

/** MARK a step complete (idempotent). Also fires activity to the server. */
export function markStep(id: StepId, meta?: unknown): void {
  if (typeof window === "undefined") return;
  const m = readSteps();
  if (m[id]?.done) return;
  m[id] = { done: true, at: Date.now(), meta };
  writeSteps(m);
  void logTestEvent({ step: id, event: "step_complete", meta });
}

/** RESET progress (used by "Start over"). */
export function resetSteps(): void {
  try { localStorage.removeItem(TEST_STEPS_KEY); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent("sa-test-steps-change"));
}

// ---- steps hook -------------------------------------------------------------------------------
export function useTestSteps(): { steps: StepMap; markStep: typeof markStep; resetSteps: typeof resetSteps; completed: number; total: number; currentIndex: number } {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick((n) => n + 1);
    window.addEventListener("sa-test-steps-change", on);
    window.addEventListener("sa-test-run-reset", on);
    return () => { window.removeEventListener("sa-test-steps-change", on); window.removeEventListener("sa-test-run-reset", on); };
  }, []);
  return useMemo(() => {
    void tick;
    const steps = readSteps();
    const done = STEP_IDS.filter((id) => steps[id]?.done);
    const currentIndex = STEP_IDS.findIndex((id) => !steps[id]?.done);
    return { steps, markStep, resetSteps, completed: done.length, total: STEP_IDS.length, currentIndex: currentIndex < 0 ? STEP_IDS.length : currentIndex };
  }, [tick]);
}

// ---- SERVER LOG — best-effort insert into test_mode_activity -----------------------------------
export interface LogEvent {
  step?: StepId | null;
  event: string;              // 'step_complete' | 'click' | 'notify_submit' | 'magic_link_sent' | 'test_grant' | 'error' | ...
  status?: "ok" | "warn" | "error";
  detail?: string;
  meta?: unknown;
}

export async function logTestEvent(e: LogEvent): Promise<void> {
  const state = readStored();
  if (!state.enabled) return;
  try {
    const mod = await import("@/lib/test-mode.functions");
    await mod.logTestModeActivity({ data: {
      sessionKey: state.session,
      testerEmail: state.tester.email,
      testerName: state.tester.name,
      step: e.step ?? null,
      event: e.event,
      status: e.status ?? "ok",
      detail: e.detail ?? null,
      meta: (e.meta ?? null) as unknown,
    }});
  } catch { /* the drawer still shows the step; a network hiccup shouldn't wedge the run */ }
}
