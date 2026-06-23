// /je — Journal Entry Scenario Engine (prototype).
//
// The centerpiece: the student toggles a condition and the entry + every downstream
// projection (ledger, statements, equation) re-derive LIVE. Flipping gain↔loss or
// perpetual↔periodic changes the entry and ripples through everything. No incumbent
// does this — they hardcode each problem.
//
// Crude UI on purpose. Correctness and the data model matter now; polish comes later.
// All projections come from the pure engine in src/lib/je-engine.ts ("one truth, many
// views"). Amounts are ??? everywhere in Phase 1.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { fetchAccountMeta, fetchPrinciples, fetchScenarios } from "@/lib/je-api";
import {
  deriveEquationEffect,
  deriveLedger,
  deriveStatementEffects,
  resolveComputationPath,
  resolveVariant,
  tracePostingsToStatementLine,
  type Dir,
  type EngineLine,
  type EntryTemplate,
  type ScenarioDoc,
} from "@/lib/je-engine";

export const Route = createFileRoute("/je")({ component: JePrototype });

const lineKey = (entryId: string, lineId: string) => `${entryId}:${lineId}`;

function defaultConditions(doc: ScenarioDoc): Record<string, string> {
  const c: Record<string, string> = {};
  for (const axis of doc.axes) c[axis.key] = axis.options[0]?.value ?? "";
  return c;
}

function JePrototype() {
  const scenariosQuery = useQuery({ queryKey: ["je-scenarios"], queryFn: fetchScenarios, retry: 1 });
  const coaQuery = useQuery({ queryKey: ["je-coa"], queryFn: fetchAccountMeta, retry: 1, staleTime: 300_000 });
  const principlesQuery = useQuery({ queryKey: ["je-principles"], queryFn: fetchPrinciples, retry: 1, staleTime: 300_000 });

  const scenarios = scenariosQuery.data ?? [];
  const coa = coaQuery.data ?? [];
  const principles = principlesQuery.data ?? [];
  const principleLabel = useMemo(() => new Map(principles.map((p) => [p.key, p])), [principles]);

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const activeScenario = scenarios.find((s) => s.slug === selectedSlug) ?? scenarios[0] ?? null;

  const [conditions, setConditions] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [activeLineKey, setActiveLineKey] = useState<string | null>(null);
  const [highlightAccount, setHighlightAccount] = useState<string | null>(null);

  // When the active scenario changes, reset the toggles to each axis's first option and
  // clear all UI state. (Runs on first load too, once scenarios arrive.)
  useEffect(() => {
    if (!activeScenario) return;
    setConditions(defaultConditions(activeScenario.doc));
    setRevealed(new Set());
    setActiveLineKey(null);
    setHighlightAccount(null);
  }, [activeScenario?.slug]);

  const variant = activeScenario ? resolveVariant(activeScenario.doc, conditions) : null;
  const entries: EntryTemplate[] = variant?.entries ?? [];
  const compPath = variant ? resolveComputationPath(variant, conditions) : null;

  const ledger = useMemo(() => deriveLedger(entries, coa), [entries, coa]);
  const statementEffects = useMemo(() => deriveStatementEffects(entries, coa), [entries, coa]);
  const equation = useMemo(() => deriveEquationEffect(entries, coa), [entries, coa]);

  // Reverse lookup → bidirectional highlight. Clicking a ledger/statement line (or an
  // entry line) sets `highlightAccount`; trace() finds the exact entry postings behind it.
  const highlightRefs = useMemo(() => {
    if (!highlightAccount) return new Set<string>();
    return new Set(
      tracePostingsToStatementLine(entries, coa, highlightAccount).map((r) => lineKey(r.entryId, r.lineId)),
    );
  }, [highlightAccount, entries, coa]);

  // Ordered reveal cells (reading order): for each line, the account cell then its amount cell.
  const cellOrder = useMemo(() => {
    const ids: string[] = [];
    for (const e of entries) {
      for (const l of e.lines) {
        ids.push(`${lineKey(e.id, l.id)}:account`);
        ids.push(`${lineKey(e.id, l.id)}:amount`);
      }
    }
    return ids;
  }, [entries]);

  const revealNext = () => {
    const next = cellOrder.find((id) => !revealed.has(id));
    if (next) setRevealed((prev) => new Set(prev).add(next));
  };
  const revealAll = () => setRevealed(new Set(cellOrder));
  const resetReveal = () => setRevealed(new Set());
  const revealAccountsOnly = () => setRevealed(new Set(cellOrder.filter((id) => id.endsWith(":account"))));

  const selectLine = (entryId: string, line: EngineLine) => {
    setActiveLineKey(lineKey(entryId, line.id));
    setHighlightAccount(line.account);
  };
  const toggleHighlight = (account: string) =>
    setHighlightAccount((cur) => (cur === account ? null : account));

  const activeLine: EngineLine | null = useMemo(() => {
    if (!activeLineKey) return null;
    for (const e of entries) for (const l of e.lines) if (lineKey(e.id, l.id) === activeLineKey) return l;
    return null;
  }, [activeLineKey, entries]);

  if (scenariosQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (scenariosQuery.isError) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center text-sm">
        <h1 className="text-lg font-bold">Couldn't load scenarios</h1>
        <p className="mt-1 text-muted-foreground">
          Run migration <code>0021_je_scenarios.sql</code> against the database, then refresh.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
        ← Home
      </Link>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">Journal Entry Scenario Engine</h1>
      <p className="text-sm text-muted-foreground">
        Toggle a condition — the entry, ledger, statements, and the accounting equation all re-derive live.
        Amounts are <code>???</code> on purpose; the pedagogy lives in the structure.
      </p>

      {/* Scenario picker */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {scenarios.map((s) => (
          <button
            key={s.slug}
            onClick={() => setSelectedSlug(s.slug)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium transition",
              activeScenario?.slug === s.slug
                ? "border-[#14213D] bg-[#14213D]/5 font-semibold"
                : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
            )}
          >
            {s.title}
          </button>
        ))}
      </div>

      {!activeScenario ? (
        <p className="mt-6 text-sm text-muted-foreground">No scenarios seeded yet.</p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {/* LEFT COLUMN */}
          <div className="space-y-4">
            {/* Event + condition toggles */}
            <Panel title="Event">
              <p className="text-sm text-foreground/90">{activeScenario.doc.event}</p>

              {/* Principles in play */}
              {(activeScenario.doc.principleKeys ?? []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {(activeScenario.doc.principleKeys ?? []).map((k) => {
                    const p = principleLabel.get(k);
                    return (
                      <span
                        key={k}
                        title={p?.short_desc ?? undefined}
                        className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {p?.label ?? k}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Condition toggles — one control per axis */}
              <div className="mt-3 space-y-2">
                {activeScenario.doc.axes.map((axis) => (
                  <div key={axis.key} className="flex flex-wrap items-center gap-2">
                    <span className="w-32 shrink-0 text-xs font-semibold text-muted-foreground">{axis.label}</span>
                    <div className="flex flex-wrap gap-1">
                      {axis.options.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setConditions((c) => ({ ...c, [axis.key]: opt.value }))}
                          className={cn(
                            "rounded-md border px-2.5 py-1 text-xs font-medium transition",
                            conditions[axis.key] === opt.value
                              ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
                              : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            {/* The entry as a reveal grid */}
            <Panel
              title="Journal Entry"
              right={
                <div className="flex flex-wrap gap-1">
                  <MiniBtn onClick={revealNext}>Reveal next</MiniBtn>
                  <MiniBtn onClick={revealAccountsOnly}>Accounts only</MiniBtn>
                  <MiniBtn onClick={revealAll}>Reveal all</MiniBtn>
                  <MiniBtn onClick={resetReveal}>Reset</MiniBtn>
                </div>
              }
            >
              {!variant ? (
                <p className="text-sm italic text-muted-foreground">This combination isn't built yet.</p>
              ) : (
                <div className="space-y-3">
                  {variant.label && (
                    <div className="text-xs font-semibold text-muted-foreground">{variant.label}</div>
                  )}
                  {entries.map((entry) => (
                    <div key={entry.id}>
                      {entry.caption && (
                        <div className="mb-1 text-[11px] font-medium text-muted-foreground">{entry.caption}</div>
                      )}
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            <th className="py-1 text-left font-semibold">Account</th>
                            <th className="w-24 py-1 text-right font-semibold">Dr</th>
                            <th className="w-24 py-1 text-right font-semibold">Cr</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entry.lines.map((l) => {
                            const k = lineKey(entry.id, l.id);
                            const highlighted = highlightRefs.has(k);
                            const isActive = activeLineKey === k;
                            return (
                              <tr
                                key={l.id}
                                className={cn(
                                  "border-t border-border/50",
                                  highlighted && "bg-amber-100/70 dark:bg-amber-900/30",
                                  isActive && !highlighted && "bg-muted/40",
                                )}
                              >
                                <td className={cn("py-1", l.side === "credit" && "pl-6")}>
                                  <RevealCell
                                    revealed={revealed.has(`${k}:account`)}
                                    onClick={() => {
                                      setRevealed((p) => new Set(p).add(`${k}:account`));
                                      selectLine(entry.id, l);
                                    }}
                                  >
                                    <span className="font-medium">{l.account}</span>
                                  </RevealCell>
                                </td>
                                <td className="py-1 text-right tabular-nums">
                                  {l.side === "debit" && (
                                    <RevealCell
                                      revealed={revealed.has(`${k}:amount`)}
                                      onClick={() => {
                                        setRevealed((p) => new Set(p).add(`${k}:amount`));
                                        selectLine(entry.id, l);
                                      }}
                                    >
                                      {l.label?.trim() || "???"}
                                    </RevealCell>
                                  )}
                                </td>
                                <td className="py-1 text-right tabular-nums">
                                  {l.side === "credit" && (
                                    <RevealCell
                                      revealed={revealed.has(`${k}:amount`)}
                                      onClick={() => {
                                        setRevealed((p) => new Set(p).add(`${k}:amount`));
                                        selectLine(entry.id, l);
                                      }}
                                    >
                                      {l.label?.trim() || "???"}
                                    </RevealCell>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* Why panel */}
            <Panel title="Why this account / side">
              {activeLine ? (
                <div className="space-y-2 text-sm">
                  <div className="font-semibold">
                    {activeLine.account}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      ({activeLine.side === "debit" ? "Debit" : "Credit"})
                    </span>
                  </div>
                  {activeLine.why && <p className="text-foreground/90">{activeLine.why}</p>}
                  {activeLine.trap && (
                    <p className="rounded-md border border-rose-200 bg-rose-50 p-2 text-[13px] text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200">
                      <span className="font-semibold">Trap: </span>
                      {activeLine.trap}
                    </p>
                  )}
                  {(activeLine.principleKeys ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(activeLine.principleKeys ?? []).map((k) => (
                        <span key={k} className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                          {principleLabel.get(k)?.label ?? k}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm italic text-muted-foreground">
                  Click a line in the entry to see why that account and side were chosen.
                </p>
              )}
            </Panel>

            {/* Computation path (same entry, different how/why of the amount) */}
            {compPath && (
              <Panel title="How the amount is computed">
                <p className="text-sm text-foreground/90">{compPath.narration}</p>
                {compPath.steps && compPath.steps.length > 0 && (
                  <ol className="mt-2 space-y-1">
                    {compPath.steps.map((s, i) => (
                      <li key={i} className="flex gap-2 text-[13px]">
                        <span className="tabular-nums text-muted-foreground">{i + 1}.</span>
                        <span>
                          <span className="font-medium">{s.label}</span>
                          {s.formulaText && (
                            <span className="ml-2 font-mono text-xs text-muted-foreground">{s.formulaText}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </Panel>
            )}
          </div>

          {/* RIGHT COLUMN — live projections */}
          <div className="space-y-4">
            {/* Ledger / T-accounts */}
            <Panel title="Ledger (T-accounts)" subtitle="Derived from the entry — click an account to trace it.">
              {ledger.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">No postings.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {ledger.map((acct) => (
                    <button
                      key={acct.account}
                      onClick={() => toggleHighlight(acct.account)}
                      className={cn(
                        "rounded-md border p-2 text-left transition",
                        highlightAccount === acct.account
                          ? "border-amber-400 bg-amber-100/60 dark:bg-amber-900/30"
                          : "border-border bg-muted/20 hover:border-foreground",
                      )}
                    >
                      <div className="border-b-2 border-foreground/70 pb-0.5 text-center text-[11px] font-semibold">
                        {acct.account}
                        {acct.normalBalance && (
                          <span className="ml-1 text-[9px] font-normal text-muted-foreground">
                            (nb: {acct.normalBalance === "debit" ? "Dr" : "Cr"})
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 text-[10px]">
                        <div className="space-y-0.5 border-r-2 border-foreground/70 p-1">
                          {acct.debits.map((p, i) => (
                            <div key={i} className="text-right tabular-nums">{p.label?.trim() || "???"}</div>
                          ))}
                        </div>
                        <div className="space-y-0.5 p-1">
                          {acct.credits.map((p, i) => (
                            <div key={i} className="text-right tabular-nums">{p.label?.trim() || "???"}</div>
                          ))}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Panel>

            {/* Statement effects */}
            <Panel title="Statement effects" subtitle="Click a line to trace it back to the entry.">
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Income statement
                  </div>
                  {statementEffects.income.length === 0 ? (
                    <p className="text-xs italic text-muted-foreground">No income-statement accounts move.</p>
                  ) : (
                    statementEffects.income.map((e) => (
                      <StatementRow
                        key={e.account}
                        account={e.account}
                        dir={e.dir}
                        tag={e.accountType}
                        active={highlightAccount === e.account}
                        onClick={() => toggleHighlight(e.account)}
                      />
                    ))
                  )}
                </div>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Balance sheet
                  </div>
                  {statementEffects.balanceSheet.length === 0 ? (
                    <p className="text-xs italic text-muted-foreground">No balance-sheet accounts move.</p>
                  ) : (
                    statementEffects.balanceSheet.map((e) => (
                      <StatementRow
                        key={e.account}
                        account={e.account}
                        dir={e.dir}
                        tag={e.accountType}
                        active={highlightAccount === e.account}
                        onClick={() => toggleHighlight(e.account)}
                      />
                    ))
                  )}
                </div>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Cash flow
                  </div>
                  {statementEffects.cashFlow.touchesCash ? (
                    <div className="flex items-center gap-2 text-sm">
                      <span>Cash</span>
                      <DirArrow dir={statementEffects.cashFlow.dir} />
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                        {statementEffects.cashFlow.classification ?? "—"}
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs italic text-muted-foreground">This entry doesn't touch Cash.</p>
                  )}
                </div>
              </div>
            </Panel>

            {/* Accounting equation */}
            <Panel title="Accounting equation">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <EquationCell label="Assets" dir={equation.assets} />
                <span className="text-lg font-bold text-muted-foreground">=</span>
                <EquationCell label="Liabilities" dir={equation.liabilities} />
                <span className="text-lg font-bold text-muted-foreground">+</span>
                <EquationCell label="Equity" dir={equation.equity} />
                <span
                  className={cn(
                    "ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    equation.balanced === true && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
                    equation.balanced === false && "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
                    equation.balanced === "unknown" && "bg-muted text-muted-foreground",
                  )}
                >
                  {equation.balanced === true ? "balances" : equation.balanced === false ? "out of balance" : "balance: unknown (no amounts yet)"}
                </span>
              </div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ small presentational helpers ============

function Panel({ title, subtitle, right, children }: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-start gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </section>
  );
}

function MiniBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-foreground hover:text-foreground"
    >
      {children}
    </button>
  );
}

function RevealCell({ revealed, onClick, children }: {
  revealed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded px-1 text-left transition hover:bg-muted",
        revealed ? "" : "italic text-muted-foreground/50",
      )}
    >
      {revealed ? children : "???"}
    </button>
  );
}

function DirArrow({ dir }: { dir: Dir }) {
  const glyph = dir === "up" ? "↑" : dir === "down" ? "↓" : dir === "unknown" ? "?" : "·";
  return (
    <span
      className={cn(
        "font-bold",
        dir === "up" && "text-emerald-600",
        dir === "down" && "text-rose-600",
        (dir === "none" || dir === "unknown") && "text-muted-foreground",
      )}
    >
      {glyph}
    </span>
  );
}

function StatementRow({ account, dir, tag, active, onClick }: {
  account: string;
  dir: Dir;
  tag?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-sm transition",
        active ? "bg-amber-100/70 dark:bg-amber-900/30" : "hover:bg-muted/50",
      )}
    >
      <DirArrow dir={dir} />
      <span>{account}</span>
      {tag && <span className="ml-auto text-[10px] text-muted-foreground">{tag.replace(/_/g, " ")}</span>}
    </button>
  );
}

function EquationCell({ label, dir }: { label: string; dir: Dir }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1">
      <span className="font-medium">{label}</span>
      <DirArrow dir={dir} />
    </span>
  );
}
