// THE SETUP CHECKLIST — the four things that make /learn stop being generic.
//
// ── WHY IT IS A CHECKLIST AND NOT A SETTINGS PAGE ─────────────────────────────────────────────
// These are the same four facts a settings page would hold, arranged so that not having done them
// LOOKS LIKE something to finish. A student who has told us their professor gets a course
// outline matched to their section; one who hasn't gets the generic one and never learns that the
// better version existed. A row of empty checkboxes and a count badge says that; four labelled
// inputs on a settings screen do not.
//
// ── WHY LOCALSTORAGE, AND WHAT THAT COSTS ─────────────────────────────────────────────────────
// This pass is not allowed to write a migration, so the checklist is per-device and disposable.
// That is fine for the badge and the sense of progress, and NOT fine as a record: the syllabus
// row in particular records only that a file was chosen, because there is nowhere to put the file
// itself yet. The item says so in its own description rather than implying an upload happened.
// When the table lands, this module is the seam to move.
import { useCallback, useEffect, useState } from "react";

export type SetupItemId = "school" | "course" | "professor" | "syllabus";

export type SetupItem = {
  id: SetupItemId;
  label: string;
  /** What the student gets for doing it — never a restatement of the label. */
  why: string;
};

export const SETUP_ITEMS: SetupItem[] = [
  { id: "school", label: "Your school", why: "Chapter numbering and order match your campus's book." },
  { id: "course", label: "Your course", why: "AC 210 and ACCY 201 are not the same exam." },
  { id: "professor", label: "Your professor", why: "Two sections of one course test different things." },
  { id: "syllabus", label: "Send your syllabus", why: "Lee matches the plan to your actual exam dates." },
];

const KEY = "sa-learn-setup";

type SetupState = Partial<Record<SetupItemId, boolean>>;

function read(): SetupState {
  try {
    if (typeof window === "undefined") return {};
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as SetupState;
  } catch { return {}; }
}

function write(s: SetupState): void {
  try { if (typeof window !== "undefined") window.localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

/** How many items are still open. Pure, so the badge can be tested without a browser. */
export function remainingCount(state: SetupState): number {
  return SETUP_ITEMS.filter((i) => !state[i.id]).length;
}

export function useSetupChecklist(): {
  state: SetupState;
  remaining: number;
  toggle: (id: SetupItemId) => void;
  /** The item most recently checked, for the one-shot tick animation. Cleared after it plays. */
  justChecked: SetupItemId | null;
} {
  // Starts EMPTY and corrects in an effect. Reading localStorage during render would make the
  // server and the client disagree, and a hydration mismatch in this app means the interactive
  // tree never attaches — every button on the page silently stops working.
  const [state, setState] = useState<SetupState>({});
  const [justChecked, setJustChecked] = useState<SetupItemId | null>(null);

  useEffect(() => { setState(read()); }, []);

  useEffect(() => {
    if (!justChecked) return;
    const t = window.setTimeout(() => setJustChecked(null), 620);
    return () => window.clearTimeout(t);
  }, [justChecked]);

  const toggle = useCallback((id: SetupItemId) => {
    // Read → decide → write, outside the updater. Firing setJustChecked from inside a state
    // updater would be a side effect during the render phase, which React is allowed to run
    // twice; the tick would then fire twice in StrictMode and not at all in a bailout.
    setState((prev) => {
      const nowChecked = !prev[id];
      const next = { ...prev, [id]: nowChecked };
      write(next);
      // Only a CHECK animates. Unchecking is not progress and should not be celebrated.
      if (nowChecked) queueMicrotask(() => setJustChecked(id));
      return next;
    });
  }, []);

  return { state, remaining: remainingCount(state), toggle, justChecked };
}
