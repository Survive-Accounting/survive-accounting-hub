// FILM-READINESS CHECK (film-prep tool 1) — pure, read-only. "Ready to film?" runs
// these over a set's frames and the panel renders pass/fail lists; every failure
// links to its frame. Fixes happen in the editor, never here.
//
// The exhibit check is a PROXY (reported to Lee): the master sheet flags frames
// needs_exhibit ("T" = T-account, "TB" = trial balance), but there is no formal
// exhibit-object linkage on a card yet — so a flagged frame passes when it has at
// least one chained memo (the exhibit usually rides the chain). Flagged frames
// with an empty chain are the ones worth a look before OBS opens.

export interface ReadinessCard {
  id: string;
  prompt: string;
  noteOnly?: boolean;
  choices: { text: string; correct?: boolean }[];
  exhibit?: string;
  run?: string;
  shorthand?: string;
  /** DISSECT (P5): moments + which moment ids the card's takes cover. */
  dissect?: { on: boolean; moments: { id: string; label: string; waived?: boolean }[] };
  takeMomentIds?: string[];
  /** Total chain items across the card's choices (the exhibit proxy). */
  chainCount: number;
}

export interface ReadinessFail {
  id: string;
  label: string;
}

export interface ReadinessCheck {
  key: string;
  label: string;
  ok: boolean;
  fails: ReadinessFail[];
}

export interface ReadinessReport {
  checks: ReadinessCheck[];
  counts: { ceq: number; notes: number; runs: number };
  ready: boolean;
}

const short = (c: ReadinessCard, n: number): string => {
  const s = (c.shorthand || c.prompt || "").trim();
  return `Q${n} · ${s.slice(0, 44) || "(empty)"}`;
};

export function checkFilmReadiness(cards: ReadinessCard[]): ReadinessReport {
  const ceqs = cards.filter((c) => !c.noteOnly);
  const notes = cards.filter((c) => c.noteOnly);
  // student numbering: CEQ frames only (notes are breath, not questions)
  const numOf = new Map<string, number>();
  ceqs.forEach((c, i) => numOf.set(c.id, i + 1));
  const q = (c: ReadinessCard) => short(c, numOf.get(c.id) ?? 0);

  const oneCorrect: ReadinessFail[] = [];
  const emptyStem: ReadinessFail[] = [];
  const thinChoices: ReadinessFail[] = [];
  const exhibitGaps: ReadinessFail[] = [];
  const runGaps: ReadinessFail[] = [];
  const dissectGaps: ReadinessFail[] = [];
  const shorthandGaps: ReadinessFail[] = [];

  for (const c of ceqs) {
    const correct = c.choices.filter((ch) => ch.correct).length;
    if (correct !== 1) oneCorrect.push({ id: c.id, label: `${q(c)} — ${correct === 0 ? "no" : correct} correct marked` });
    if (!c.prompt.trim()) emptyStem.push({ id: c.id, label: q(c) });
    const filled = c.choices.filter((ch) => ch.text.trim()).length;
    if (filled < 2 || filled < c.choices.length) thinChoices.push({ id: c.id, label: `${q(c)} — ${filled}/${c.choices.length} choices filled` });
    if (c.exhibit && c.chainCount === 0) exhibitGaps.push({ id: c.id, label: `${q(c)} — flagged "${c.exhibit}", no memos chained` });
    if (c.dissect?.on) {
      // DISSECT (P5): a dissected CEQ is clip-sequenced, not run-covered — it is
      // EXEMPT from the run-letter check; instead every planned moment must be
      // covered by a tagged take or explicitly waived.
      const covered = new Set(c.takeMomentIds ?? []);
      for (const m of c.dissect.moments) if (!m.waived && !covered.has(m.id)) dissectGaps.push({ id: c.id, label: `${q(c)} — moment "${m.label || "(unnamed)"}" has no take (waive it or film it)` });
      if (c.dissect.moments.length === 0) dissectGaps.push({ id: c.id, label: `${q(c)} — dissect is ON but has no planned moments` });
    } else if (!c.run?.trim()) runGaps.push({ id: c.id, label: q(c) });
    if (!c.shorthand?.trim()) shorthandGaps.push({ id: c.id, label: q(c) });
  }

  const runs = new Set(ceqs.map((c) => c.run?.trim()).filter((r): r is string => !!r));
  const checks: ReadinessCheck[] = [
    { key: "correct", label: "Every CEQ frame has exactly one correct choice", ok: oneCorrect.length === 0, fails: oneCorrect },
    { key: "stems", label: "No empty stems", ok: emptyStem.length === 0, fails: emptyStem },
    { key: "choices", label: "No empty choice slots, at least 2 choices", ok: thinChoices.length === 0, fails: thinChoices },
    { key: "exhibits", label: "Exhibit-flagged frames have something attached (chain proxy)", ok: exhibitGaps.length === 0, fails: exhibitGaps },
    { key: "runs", label: "Run letter set on every CEQ frame (dissected CEQs exempt)", ok: runGaps.length === 0, fails: runGaps },
    { key: "dissect", label: "Dissected CEQs: every planned moment filmed or waived", ok: dissectGaps.length === 0, fails: dissectGaps },
    { key: "shorthand", label: "Shorthand on every CEQ frame", ok: shorthandGaps.length === 0, fails: shorthandGaps },
  ];
  return {
    checks,
    counts: { ceq: ceqs.length, notes: notes.length, runs: runs.size },
    ready: checks.every((c) => c.ok),
  };
}
