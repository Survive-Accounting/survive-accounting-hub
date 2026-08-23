// PROBE LIBRARY (Exhibit Lab v2, §2) — the atom of the system.
//
// A PROBE is a reusable QUESTION MOVE: a first-class object with a stable id,
// a name, a short student-facing phrasing, and what it asks. An EXHIBIT is a
// SURFACE; a probe RUNS on it. Nothing here knows about any exhibit — an
// exhibit declares which probes it can run (see exhibit-adapters in the two
// exhibit files) and turns the probe into concrete steps.
//
// Vocabulary (locked): Exhibit · Exhibit Lab · Probe · Cheat Code · The Survive
// Method. The canon lives at /SURVIVE-METHOD.md.

export type ProbeId =
  | "four_questions"
  | "rewind"
  | "fast_forward"
  | "statement_check"
  | "year_end_cross"
  | "accrual_or_deferral"
  | "date_check"
  | "what_if_we_dont"
  | "show_me_the_math"
  | "flip_it";

export interface Probe {
  id: ProbeId;
  name: string;
  /** What the probe asks, in author words (the spec's "The ask"). */
  ask: string;
  /** Short STUDENT-FACING phrasing — what the screen says when this probe fires. */
  student: string;
}

/** The ten seeded probes, in canon order. Ids are STABLE — a CEQ, a Frame or
 *  another exhibit references `exhibit + probe` by these strings forever. */
export const PROBES: readonly Probe[] = [
  { id: "four_questions", name: "The Four Questions", ask: "Type of account? → Which specific account? → Increase or decrease (Dr/Cr)? → Anything else affected?", student: "What type of account is this?" },
  { id: "rewind", name: "Rewind", ask: "What was the original entry that came before this one?", student: "What came right before this?" },
  { id: "fast_forward", name: "Fast-Forward", ask: "What entry comes next in this series?", student: "What comes next?" },
  { id: "statement_check", name: "Statement Check", ask: "Which financial statement(s) does this hit, and how is it presented?", student: "Which statement does this land on?" },
  { id: "year_end_cross", name: "Year-End Cross", ask: "We crossed year-end — what adjusting entry is needed?", student: "We just crossed year-end. What adjusts?" },
  { id: "accrual_or_deferral", name: "Accrual or Deferral?", ask: "Which is it, and why?", student: "Accrual or deferral — and why?" },
  { id: "date_check", name: "Date Check", ask: "What date did this happen, and what does that change?", student: "What date — and what does that change?" },
  { id: "what_if_we_dont", name: "What If We Don't?", ask: "If this entry is skipped, what's overstated and what's understated?", student: "If we skip this entry, what's over- and understated?" },
  { id: "show_me_the_math", name: "Show Me the Math", ask: "Compute the amount (proration, P×R×T, straight-line, etc.).", student: "Show me the math — what's the amount?" },
  { id: "flip_it", name: "Flip It", ask: "Same transaction, opposite timing/side — mirror it. What changes?", student: "Flip it — what changes?" },
] as const;

export const PROBE_IDS: readonly ProbeId[] = PROBES.map((p) => p.id);

export function probeById(id: string): Probe | undefined {
  return PROBES.find((p) => p.id === id);
}

// ---------------------------------------------------------------- exhibits

/** The exhibits the Lab knows. Formulas stays DEFERRED — not registered here. */
export type ExhibitId = "cycle" | "rubric" | "je" | "taccount" | "statements";

export const EXHIBITS: readonly { id: ExhibitId; name: string; blurb: string }[] = [
  { id: "cycle", name: "The Accounting Cycle", blurb: "The nine steps around the oval — definitions, self-test, build." },
  { id: "rubric", name: "The Rubric", blurb: "A = L + E | Revs & Exps — types, signs, normal balances, movements." },
  { id: "je", name: "Journal Entry", blurb: "The entry revealed one piece at a time — ??? until it is not." },
  { id: "taccount", name: "T-Accounts", blurb: "The ledger filling up: staggered, labelled, one entry per keypress." },
  { id: "statements", name: "Financial Statements", blurb: "Where it lands — IS → R/E bridge → BS, and the A = L + E tie-out." },
] as const;

// ------------------------------------------------------ the reference shape

/** EXHIBIT + PROBE REFERENCE (§2, §7) — the addressable unit a CEQ, a Frame,
 *  or another exhibit will later summon as a prerequisite callback. BUILT NOW,
 *  CONSUMED BY NOTHING YET: this pass writes and reads it only inside the Lab's
 *  filming queue. Keep it JSON-plain — it will ride in scene JSON one day. */
export interface ExhibitProbeRef {
  exhibit: ExhibitId;
  probe: ProbeId;
  /** Step ids toggled OFF for this run (§4: "skip questions the video isn't about"). */
  stepsOff?: string[];
  /** Exhibit-specific seed (e.g. which rubric scenario, which cycle step). */
  seed?: Record<string, string | number | boolean>;
}

/** Canonical string form, e.g. "rubric:four_questions" — stable, greppable. */
export const refKey = (r: ExhibitProbeRef): string => `${r.exhibit}:${r.probe}`;

export function parseRefKey(key: string): ExhibitProbeRef | null {
  const [exhibit, probe] = key.split(":");
  if (!EXHIBITS.some((e) => e.id === exhibit) || !probeById(probe ?? "")) return null;
  return { exhibit: exhibit as ExhibitId, probe: probe as ProbeId };
}
