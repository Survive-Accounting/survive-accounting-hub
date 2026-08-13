// PURE CEQ helpers extracted for the regression guard — behaviour lifted verbatim
// from CeqStudio (ingest filename matching) and study_.canvas ceqStep (the walk
// transition), so the tests pin the REAL logic, not a reimplementation.

/** Batch-ingest filename → question number. "1.03"→3 (topic.question), "q3"→3,
 *  leading "03"→3; null when nothing matches (the row falls to deck order). */
export const ingestNumOf = (name: string): number | null => {
  const base = name.replace(/\.[a-z0-9]+$/i, "");
  let m = /(?:^|[^0-9])(\d+)\.(\d{1,2})(?:[^0-9]|$)/.exec(base);
  if (m) return Number(m[2]);
  m = /(?:^|[^a-z0-9])q\s*(\d{1,2})(?:[^0-9]|$)/i.exec(base);
  if (m) return Number(m[1]);
  m = /^(\d{1,2})(?:[^0-9]|$)/.exec(base);
  if (m) return Number(m[1]);
  return null;
};

/** The ingest ASSIGNMENT core: explicit number matches claim their question first
 *  (natural-sorted names, first wins), leftovers fall back BY DECK ORDER onto
 *  questions with no clips. Returns name → questionId (null = unmatched/skip). */
export function matchIngestNames(names: string[], questions: { id: string; hasClips: boolean }[]): Map<string, string | null> {
  const sorted = [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const taken = new Set<string>();
  const out = new Map<string, string | null>();
  for (const n of sorted) {
    const num = ingestNumOf(n);
    if (num != null && num >= 1 && num <= questions.length && !taken.has(questions[num - 1].id)) { out.set(n, questions[num - 1].id); taken.add(questions[num - 1].id); }
    else out.set(n, null);
  }
  for (const n of sorted) {
    if (out.get(n) !== null) continue;
    const free = questions.find((q) => !q.hasClips && !taken.has(q.id));
    if (free) { out.set(n, free.id); taken.add(free.id); }
  }
  return out;
}

/** The Enter/Shift+Enter walk transition (ceqStep's core): first Enter RESOLVES,
 *  further Enters reveal; back hides, past item 1 UN-RESOLVES; past either end no-op. */
export function walkTransition(wasResolved: boolean, shown: number, chainLen: number, dir: 1 | -1): { resolved: boolean; shown: number; action: "resolve" | "reveal" | "hide" | "unresolve" | "noop" } {
  if (dir > 0) {
    if (!wasResolved) return { resolved: true, shown: 0, action: "resolve" };
    if (shown < chainLen) return { resolved: true, shown: shown + 1, action: "reveal" };
    return { resolved: wasResolved, shown, action: "noop" };
  }
  if (shown > 0) return { resolved: wasResolved, shown: shown - 1, action: "hide" };
  if (wasResolved) return { resolved: false, shown: 0, action: "unresolve" };
  return { resolved: wasResolved, shown, action: "noop" };
}

/** Shift+` MEMO SWEEP semantics: reveals cleared, resolution KEPT. */
export const sweepState = (choices: { resolved?: boolean; chainShown?: number }[]): { resolved?: boolean; chainShown: number }[] =>
  choices.map((c) => ({ ...c, chainShown: 0 }));
