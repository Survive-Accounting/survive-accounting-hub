// THE FINANCIAL STATEMENTS EXHIBIT — where the ledger lands, and why.
//
// Built from the SAME posted balances the T-account exhibit shows, so this is
// not a third data model: journal entries post to T-accounts, T-account
// balances become these statements. The R/E panel sits between the two big
// statements because that is exactly what the rubric says it is — THE BRIDGE:
// net income leaves the income statement, walks through retained earnings, and
// arrives inside equity on the balance sheet.
//
// REVEAL: one panel-piece per Tab — revenues, expenses, net income, the
// bridge, assets, claims, then the A = L + E tie-out.
import { useCallback, useEffect, useRef, useState } from "react";

import { BIG_FONT } from "../theme";
import { money } from "./JournalEntryExhibit";
import { balanceSheet, incomeStatement, ledgerScenarios, netIncome, postToTs, retainedEarnings, type StatementRow } from "./ledger-model";

const GOLD = "#FCA311";
const GOOD = "#3BF5A0";
const INK = "#F4EFE6";
const MUTE = "rgba(230,236,255,0.42)";
const DIM = "rgba(230,236,255,0.62)";
const RULE = "rgba(230,236,255,0.35)";
const T = "opacity 180ms ease, transform 180ms ease";

/** The authored build: one piece per Tab. */
export const ST_STEPS = ["blank", "revenues", "expenses", "net income", "the bridge", "assets", "claims", "A = L + E"] as const;
export const ST_LAST = ST_STEPS.length - 1;

const at = (step: number, n: number): boolean => step >= n;

function Panel({ title, shown, accent, children, size }: { title: string; shown: boolean; accent?: string; children: React.ReactNode; size: number }) {
  return (
    <div style={{
      opacity: shown ? 1 : 0, transform: shown ? "translateY(0)" : "translateY(10px)", transition: T,
      display: "flex", flexDirection: "column", gap: size * 0.22,
      padding: size * 0.6, borderRadius: 14, minWidth: 0,
      background: "rgba(255,255,255,0.035)", border: `1px solid ${accent ?? "rgba(230,236,255,0.14)"}`,
    }}>
      <div style={{ fontFamily: BIG_FONT, fontWeight: 900, fontSize: size * 0.72, color: accent ?? INK, letterSpacing: "0.01em", whiteSpace: "nowrap" }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ r, size, shown }: { r: StatementRow; size: number; shown: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", gap: size * 0.6, alignItems: "baseline",
      opacity: shown ? 1 : 0, transition: T,
      paddingLeft: r.indent ? size * 0.7 : 0,
      borderTop: r.rule ? `1px solid ${RULE}` : undefined, paddingTop: r.rule ? size * 0.18 : 0, marginTop: r.rule ? size * 0.1 : 0,
    }}>
      <span style={{ fontSize: size * 0.5, color: DIM, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
      <span style={{ fontSize: size * 0.54, fontWeight: 800, color: INK, fontVariantNumeric: "tabular-nums" }}>
        {r.amount < 0 ? `(${money(-r.amount)})` : money(r.amount)}
      </span>
    </div>
  );
}

function Total({ label, value, size, accent, shown }: { label: string; value: number; size: number; accent: string; shown: boolean }) {
  return (
    <div style={{ opacity: shown ? 1 : 0, transition: T, display: "flex", justifyContent: "space-between", gap: size * 0.6, alignItems: "baseline", borderTop: `2px solid ${accent}`, marginTop: size * 0.25, paddingTop: size * 0.22 }}>
      <span style={{ fontSize: size * 0.46, fontWeight: 900, letterSpacing: "0.14em", color: accent, whiteSpace: "nowrap" }}>{label.toUpperCase()}</span>
      <span style={{ fontSize: size * 0.66, fontWeight: 900, color: accent, fontVariantNumeric: "tabular-nums" }}>{value < 0 ? `(${money(-value)})` : money(value)}</span>
    </div>
  );
}

/** The arrow that carries a number from one statement into the next. */
function BridgeArrow({ shown, label, size }: { shown: boolean; label: string; size: number }) {
  return (
    <div style={{ opacity: shown ? 1 : 0, transition: T, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, alignSelf: "center" }}>
      <span style={{ fontSize: size * 0.38, fontWeight: 900, letterSpacing: "0.14em", color: GOLD, whiteSpace: "nowrap" }}>{label}</span>
      <svg width={size * 2.2} height={size * 0.7} viewBox="0 0 44 14" fill="none" aria-hidden>
        <path d="M1 7 h34" stroke={GOLD} strokeWidth="2" strokeLinecap="round" />
        <path d="M33 2 l8 5 l-8 5" stroke={GOLD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    </div>
  );
}

export interface StatementsBoardProps {
  scenarios: ReturnType<typeof ledgerScenarios>;
  /** 0 = blank … ST_LAST = the tie-out. */
  reveal: number;
}

export function StatementsBoard({ scenarios, reveal }: StatementsBoardProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 1280, h: 720 });
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => { const r = el.getBoundingClientRect(); if (r.width && r.height) setBox({ w: r.width, h: r.height }); };
    const ro = new ResizeObserver(measure); ro.observe(el); measure();
    return () => ro.disconnect();
  }, []);

  const ts = postToTs(scenarios);
  const ni = netIncome(ts);
  const is = incomeStatement(ts);
  const re = retainedEarnings(ts);
  const bs = balanceSheet(ts);
  const stacked = box.h > box.w;
  const size = Math.max(16, Math.min(38, box.w / (stacked ? 16 : 30)));

  const revRows = is.rows.filter((r) => !r.rule && !r.indent);
  const expRows = is.rows.filter((r) => r.rule || r.indent);

  return (
    <div ref={rootRef} style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: "2%" }}>
      <div style={{ display: "flex", flexDirection: stacked ? "column" : "row", alignItems: stacked ? "stretch" : "flex-start", gap: size * 0.5, width: "100%", justifyContent: "center" }}>
        {/* INCOME STATEMENT */}
        <Panel title="Income Statement" shown={at(reveal, 1)} size={size} accent={at(reveal, 3) ? (ni < 0 ? "#FF8B9E" : GOOD) : undefined}>
          {revRows.map((r, i) => <Row key={i} r={r} size={size} shown={at(reveal, 1)} />)}
          {expRows.map((r, i) => <Row key={i} r={r} size={size} shown={at(reveal, 2)} />)}
          {/* a net LOSS must never wear the success colour — an exhibit that
              paints a loss green teaches the wrong reflex */}
          <Total label={ni < 0 ? "Net loss" : "Net income"} value={ni} size={size} accent={ni < 0 ? "#FF8B9E" : GOOD} shown={at(reveal, 3)} />
        </Panel>

        <BridgeArrow shown={at(reveal, 4)} label={ni < 0 ? "NET LOSS" : "NET INCOME"} size={size} />

        {/* THE BRIDGE — R/E, exactly what the rubric calls it */}
        <Panel title="Retained Earnings" shown={at(reveal, 4)} size={size} accent={GOLD}>
          {re.rows.map((r, i) => <Row key={i} r={r} size={size} shown={at(reveal, 4)} />)}
          <Total label="Ending R/E" value={re.total} size={size} accent={GOLD} shown={at(reveal, 4)} />
        </Panel>

        <BridgeArrow shown={at(reveal, 6)} label="INTO EQUITY" size={size} />

        {/* BALANCE SHEET */}
        <Panel title="Balance Sheet" shown={at(reveal, 5)} size={size} accent={at(reveal, 7) && bs.balanced ? GOOD : undefined}>
          <div style={{ fontSize: size * 0.4, fontWeight: 900, letterSpacing: "0.18em", color: MUTE }}>ASSETS</div>
          {bs.assets.rows.map((r, i) => <Row key={i} r={r} size={size} shown={at(reveal, 5)} />)}
          <Total label={bs.assets.totalLabel} value={bs.assets.total} size={size} accent={INK} shown={at(reveal, 5)} />
          <div style={{ opacity: at(reveal, 6) ? 1 : 0, transition: T, fontSize: size * 0.4, fontWeight: 900, letterSpacing: "0.18em", color: MUTE, marginTop: size * 0.3 }}>LIABILITIES + EQUITY</div>
          {bs.claims.rows.map((r, i) => <Row key={i} r={r} size={size} shown={at(reveal, 6)} />)}
          <Total label={bs.claims.totalLabel} value={bs.claims.total} size={size} accent={INK} shown={at(reveal, 6)} />
        </Panel>
      </div>

      {/* THE TIE-OUT — the last beat: it balances, and you can see why. */}
      <div style={{
        position: "absolute", bottom: "4%", left: 0, right: 0, textAlign: "center",
        opacity: at(reveal, 7) ? 1 : 0, transform: at(reveal, 7) ? "translateY(0)" : "translateY(8px)", transition: T,
        fontFamily: BIG_FONT, fontWeight: 900, fontSize: size * 0.8, color: bs.balanced ? GOOD : "#FF8B9E",
        fontVariantNumeric: "tabular-nums",
      }}>
        {money(bs.assets.total)} = {money(bs.claims.total)}
        <span style={{ fontSize: size * 0.44, letterSpacing: "0.18em", marginLeft: size * 0.5, color: MUTE }}>A = L + E</span>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────── wrapper

export function StatementsExhibit({ seed }: { seed?: Record<string, string | number | boolean> }) {
  const scenarios = ledgerScenarios(typeof seed?.ledger === "string" ? String(seed.ledger).split(",") : undefined);
  const [reveal, setReveal] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.key === "Tab") { e.preventDefault(); setReveal((r) => Math.max(0, Math.min(ST_LAST, r + (e.shiftKey ? -1 : 1)))); return; }
      if (e.key === "`") { e.preventDefault(); setReveal(0); return; }
      if (e.code === "KeyA") { e.preventDefault(); setReveal(ST_LAST); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const CHIP = "rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide";
  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden">
      <StatementsBoard scenarios={scenarios} reveal={reveal} />
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5" data-lab-chrome>
        <span className={CHIP} style={{ color: "#0B1322", background: GOLD }}>{reveal}/{ST_LAST} · {ST_STEPS[reveal]}</span>
        <span className="text-[9px]" style={{ color: MUTE }}>Tab builds the statements · ` blank · A all</span>
      </div>
    </div>
  );
}
