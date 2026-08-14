// RUN LETTERS (film-prep tool 5) — pure, no React. A RUN is a contiguous span of
// frames captured in ONE take, carried as the `run` letter on each frame's card.
// The readiness check reports gaps, the strip draws the letter + bracket, the rail
// draws the segments, and rehearsal fires an interstitial at each boundary — but
// until now nothing could SET a letter, so every frame in Exam 1 reads unlettered.
//
// The write is deliberately split out here so the interesting parts (which letter
// is next, what "fill down" does to a half-lettered set, when an assignment
// quietly puts one run in two places) are testable without mounting the Studio.
//
// SCOPE: letters are per-SET. Every set starts over at A — the strip, the rail and
// the readiness counts are all per-set, and takes attach to frames, not to a
// globally unique letter.
//
// WARN, NEVER BLOCK: an assignment always applies. A selection that isn't
// contiguous, or a letter that ends up in two separate spans, is legal — Lee films
// out of order sometimes — so it comes back as a warning string for the toast
// rather than a refusal.

/** The only two fields any of this needs; frames arrive in strip order. */
export interface RunFrame {
  id: string;
  run?: string;
}

/** A contiguous span sharing one letter. `run: null` = an unlettered span. */
export interface RunSegment {
  run: string | null;
  start: number;
  count: number;
  ids: string[];
}

/** One frame's new letter (`null` clears it). Only CHANGED frames are returned. */
export interface RunAssignment {
  id: string;
  run: string | null;
}

export interface RunChange {
  changes: RunAssignment[];
  /** Human sentences for the toast — empty when the assignment is unremarkable. */
  warnings: string[];
}

/** Trim + upper, or null for "no letter". Keeps "a", " A " and "A" one run. */
export const normRun = (r: string | null | undefined): string | null => {
  const s = (r ?? "").trim().toUpperCase();
  return s || null;
};

/** Spreadsheet-style labels so a set can exceed 26 runs: A…Z, AA, AB, … */
export function runLabelAt(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** Contiguous segments in strip order — the same grouping the rail draws. */
export function runSegments(frames: RunFrame[]): RunSegment[] {
  const segs: RunSegment[] = [];
  frames.forEach((f, i) => {
    const run = normRun(f.run);
    const last = segs[segs.length - 1];
    if (last && last.run === run) {
      last.count += 1;
      last.ids.push(f.id);
    } else {
      segs.push({ run, start: i, count: 1, ids: [f.id] });
    }
  });
  return segs;
}

/** Letters already used in this set, in first-appearance order. */
export function usedRunLetters(frames: RunFrame[]): string[] {
  const seen: string[] = [];
  for (const f of frames) {
    const r = normRun(f.run);
    if (r && !seen.includes(r)) seen.push(r);
  }
  return seen;
}

/** The first label this set hasn't used yet — what the ⋮ menu's "Next" offers. */
export function nextRunLetter(frames: RunFrame[]): string {
  const used = new Set(usedRunLetters(frames));
  for (let i = 0; ; i++) {
    const label = runLabelAt(i);
    if (!used.has(label)) return label;
  }
}

/** How many separate spans carry `letter` (2+ means the run is split). */
const spansOf = (frames: RunFrame[], letter: string): number =>
  runSegments(frames).filter((s) => s.run === letter).length;

/**
 * Stamp `letter` (or clear, with null) onto `ids`.
 *
 * Returns only the frames that actually change, so the caller can build ONE
 * undoable composite and report a count that means something.
 */
export function assignRunTo(frames: RunFrame[], ids: Iterable<string>, letter: string | null): RunChange {
  const want = normRun(letter);
  const target = new Set(ids);
  const changes: RunAssignment[] = [];
  for (const f of frames) {
    if (!target.has(f.id)) continue;
    if (normRun(f.run) === want) continue; // already there — not a change, not an undo step
    changes.push({ id: f.id, run: want });
  }

  const warnings: string[] = [];
  if (want && changes.length) {
    // Contiguity is judged over the SELECTION as the strip orders it, not over
    // click order — shift-click already gives a range, so a gap here is real.
    const picked = frames.map((f, i) => (target.has(f.id) ? i : -1)).filter((i) => i >= 0);
    const gaps = picked.filter((i, n) => n > 0 && i !== picked[n - 1] + 1).length;
    if (gaps > 0) warnings.push(`The selection isn't one span — run ${want} lands in ${gaps + 1} pieces.`);

    // …and the result can be split even when the selection wasn't, by landing
    // apart from frames that already carry this letter.
    const after = frames.map((f) => (target.has(f.id) ? { id: f.id, run: want } : f));
    const spans = spansOf(after, want);
    if (spans > 1 && gaps === 0) warnings.push(`Run ${want} is now in ${spans} places in this set.`);
  }
  return { changes, warnings };
}

/**
 * FILL DOWN — the 256-frame accelerator. Every unlettered frame inherits the
 * letter of the frame above it, so Lee only marks the SPLIT POINTS and one click
 * finishes the set.
 *
 * Leading unlettered frames have nothing above them. They inherit from the first
 * lettered frame BELOW instead (fill up), because the alternative — handing them
 * a fresh letter — puts a B above an A and reads like a mistake. A set with no
 * letters at all becomes one run: A.
 */
export function fillDownRuns(frames: RunFrame[]): RunChange {
  const firstLettered = frames.find((f) => normRun(f.run));
  const lead = normRun(firstLettered?.run) ?? "A";
  const changes: RunAssignment[] = [];
  let carry: string | null = null;
  for (const f of frames) {
    const r = normRun(f.run);
    if (r) {
      carry = r;
      continue;
    }
    const run = carry ?? lead;
    changes.push({ id: f.id, run });
  }
  return { changes, warnings: [] };
}
