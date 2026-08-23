// THE JOURNAL ENTRY EXHIBIT — the entry, revealed one piece at a time.
//
// This is the sophisticated JE UX rebuilt for the Lab and wired to the rubric:
// every line knows its rubric TYPE, so the type chip, the (+/−) pair and the
// debit/credit side all come from the one source of truth the probes grade
// against — nothing is re-derived here.
//
// THE REVEAL (Lee's "one piece at a time"): the description, then each line's
// ACCOUNT, then its AMOUNT. Anything unrevealed prints ??? — present,
// unreadable, obviously pending. Tab walks forward, Shift+Tab back, ` blanks.
//
// SPOTLIGHT: click a line to light it and dim the rest — the same "one thing
// at a time" move the canvas exhibits use, without the canvas.
//
// MOTION LAW: layers stay mounted and animate opacity/transform only.
import { useCallback, useEffect, useRef, useState } from "react";

import { BIG_FONT } from "../theme";
import { MASK, jeLines, jePieces, jeTotals, pieceShown, type JeLine } from "./ledger-model";
import { acctType, scenarioById, type Scenario } from "./rubric-model";
import { ELEMENT_LABEL, signPair, tSides } from "./rubric-view";

const GOLD = "#FCA311";
const INK = "#F4EFE6";
const MUTE = "rgba(230,236,255,0.42)";
const DIM = "rgba(230,236,255,0.62)";
const RULE = "rgba(230,236,255,0.35)";
const T = "opacity 160ms ease, transform 160ms ease, color 160ms ease";

export const money = (n: number): string => n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export interface JeToggles {
  /** The rubric type chip beside each account (A · L · E · Revs · Exps). */
  types: boolean;
  /** That type's (+/−) pair, so the side reads as a consequence, not a rule. */
  signs: boolean;
  /** The Dr = Cr proof under the rule. */
  balance: boolean;
  /** Where each line POSTS — the debit/credit column it lands in. */
  posting: boolean;
}
export const JE_ALL_OFF: JeToggles = { types: false, signs: false, balance: false, posting: false };

/** A masked value: present, unreadable, obviously pending. */
function Masked({ shown, children, size }: { shown: boolean; children: React.ReactNode; size: number }) {
  return shown
    ? <span style={{ transition: T }}>{children}</span>
    : <span style={{ color: MUTE, letterSpacing: "0.1em", fontSize: size * 0.92, transition: T }}>{MASK}</span>;
}

/** The tiny T that shows which column a line posts into. */
function PostGlyph({ dr, size }: { dr: boolean; size: number }) {
  const w = Math.round(size * 1.5);
  return (
    <span style={{ display: "inline-block", width: w, verticalAlign: "middle" }} aria-hidden>
      <span style={{ display: "block", height: 1.5, background: RULE }} />
      <span style={{ display: "grid", gridTemplateColumns: "1fr 1.5px 1fr", height: size * 0.72 }}>
        <span style={{ background: dr ? GOLD : "transparent", opacity: dr ? 0.85 : 1, borderRadius: 2, margin: "2px 1px" }} />
        <span style={{ background: RULE }} />
        <span style={{ background: !dr ? GOLD : "transparent", opacity: !dr ? 0.85 : 1, borderRadius: 2, margin: "2px 1px" }} />
      </span>
    </span>
  );
}

export interface JeBoardProps {
  scenario: Scenario;
  /** 0 = blank, pieces.length = the whole entry. */
  reveal: number;
  toggles: JeToggles;
  /** Line index spotlighted, or null. */
  spot: number | null;
  onSpot: (i: number | null) => void;
}

export function JeBoard({ scenario, reveal, toggles, spot, onSpot }: JeBoardProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 1280, h: 720 });
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => { const r = el.getBoundingClientRect(); if (r.width && r.height) setBox({ w: r.width, h: r.height }); };
    const ro = new ResizeObserver(measure);
    ro.observe(el); measure();
    return () => ro.disconnect();
  }, []);

  const lines = jeLines(scenario);
  const pieces = jePieces(lines);
  const size = Math.max(15, Math.min(40, box.w / 34));
  const tot = jeTotals(lines);
  const descShown = pieceShown(pieces, reveal, "desc", -1);
  const allShown = reveal >= pieces.length;

  const row = (l: JeLine, i: number) => {
    const acct = pieceShown(pieces, reveal, "account", i);
    const amt = pieceShown(pieces, reveal, "amount", i);
    const lit = spot === i;
    const dim = spot != null && !lit;
    const t = acctType(l.type);
    const p = signPair(l.type);
    return (
      <div key={`${l.account}-${i}`}
        onClick={() => onSpot(lit ? null : i)}
        style={{
          display: "grid", gridTemplateColumns: `${size * 1.2}px 1fr ${size * 5}px ${size * 5}px`,
          alignItems: "center", columnGap: size * 0.4, cursor: "pointer",
          padding: `${size * 0.16}px ${size * 0.3}px`, borderRadius: 8,
          background: lit ? "rgba(252,163,17,0.10)" : "transparent",
          opacity: dim ? 0.34 : 1, transform: lit ? "scale(1.015)" : "scale(1)",
          transition: T,
        }}
      >
        {/* the rubric type chip — this line's element, straight from the model */}
        <span style={{ opacity: toggles.types && acct ? 1 : 0, transition: T, justifySelf: "center", fontFamily: BIG_FONT, fontWeight: 900, fontSize: size * 0.6, color: GOLD, whiteSpace: "nowrap" }}>
          {ELEMENT_LABEL[l.type]}
        </span>
        <span style={{ fontSize: size, fontWeight: l.dr ? 800 : 600, color: INK, paddingLeft: l.dr ? 0 : size * 1.6, whiteSpace: "nowrap", transition: T }}>
          <Masked shown={acct} size={size}>{l.account}</Masked>
          {toggles.signs && acct && (
            <span style={{ marginLeft: size * 0.45, fontSize: size * 0.5, fontWeight: 900, color: DIM }}>({p.left}/{p.right})</span>
          )}
          {toggles.posting && acct && <span style={{ marginLeft: size * 0.45 }}><PostGlyph dr={l.dr} size={size * 0.7} /></span>}
        </span>
        <span style={{ textAlign: "right", fontSize: size, fontWeight: 800, color: INK, fontVariantNumeric: "tabular-nums" }}>
          {l.dr ? <Masked shown={amt} size={size}>{money(l.amount)}</Masked> : null}
        </span>
        <span style={{ textAlign: "right", fontSize: size, fontWeight: 800, color: INK, fontVariantNumeric: "tabular-nums" }}>
          {!l.dr ? <Masked shown={amt} size={size}>{money(l.amount)}</Masked> : null}
        </span>
        <span style={{ display: "none" }}>{t.label}</span>
      </div>
    );
  };

  return (
    <div ref={rootRef} style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <div style={{ width: "min(1100px, 88%)", display: "flex", flexDirection: "column", gap: size * 0.5 }}>
        {/* the transaction — the first piece revealed */}
        <div style={{ opacity: descShown ? 1 : 0, transform: descShown ? "translateY(0)" : "translateY(6px)", transition: T, fontSize: size * 0.86, fontWeight: 700, color: DIM, textAlign: "center", marginBottom: size * 0.3 }}>
          {scenario.text}
        </div>
        {/* column heads */}
        <div style={{ display: "grid", gridTemplateColumns: `${size * 1.2}px 1fr ${size * 5}px ${size * 5}px`, columnGap: size * 0.4, padding: `0 ${size * 0.3}px`, fontSize: size * 0.42, fontWeight: 900, letterSpacing: "0.2em", color: MUTE }}>
          <span /><span>ACCOUNT</span><span style={{ textAlign: "right" }}>DEBIT</span><span style={{ textAlign: "right" }}>CREDIT</span>
        </div>
        <div style={{ height: 2, background: RULE, borderRadius: 2 }} />
        {lines.map(row)}
        <div style={{ height: 1.5, background: RULE, borderRadius: 2, marginTop: size * 0.2 }} />
        {/* the Dr = Cr proof */}
        <div style={{
          display: "grid", gridTemplateColumns: `${size * 1.2}px 1fr ${size * 5}px ${size * 5}px`, columnGap: size * 0.4,
          padding: `0 ${size * 0.3}px`, fontSize: size * 0.72, fontWeight: 900, fontVariantNumeric: "tabular-nums",
          opacity: toggles.balance && allShown ? 1 : 0, transition: T,
          color: tot.balanced ? "#3BF5A0" : "#FF8B9E",
        }}>
          <span /><span style={{ fontSize: size * 0.5, letterSpacing: "0.16em" }}>{tot.balanced ? "IT BALANCES" : "OUT OF BALANCE"}</span>
          <span style={{ textAlign: "right" }}>{money(tot.dr)}</span>
          <span style={{ textAlign: "right" }}>{money(tot.cr)}</span>
        </div>
      </div>
    </div>
  );
}

/** How far the reveal can go — exported so the wrapper can clamp + label. */
export const jeSteps = (sc: Scenario): number => jePieces(jeLines(sc)).length;

// ───────────────────────────────────────────────────────────── wrapper

export function JournalEntryExhibit({ seed }: { seed?: Record<string, string | number | boolean> }) {
  const scenario = scenarioById(String(seed?.scenario ?? "supplies-cash"));
  const steps = jeSteps(scenario);
  const [reveal, setReveal] = useState(0);
  const [spot, setSpot] = useState<number | null>(null);
  const [toggles, setToggles] = useState<JeToggles>({ ...JE_ALL_OFF, balance: true });
  const stepsRef = useRef(steps); stepsRef.current = steps;

  const flip = useCallback((k: keyof JeToggles) => setToggles((t) => ({ ...t, [k]: !t[k] })), []);
  useEffect(() => { setReveal(0); setSpot(null); }, [scenario.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.key === "Tab") { e.preventDefault(); setReveal((r) => Math.max(0, Math.min(stepsRef.current, r + (e.shiftKey ? -1 : 1)))); return; }
      if (e.key === "`") { e.preventDefault(); setReveal(0); setSpot(null); return; }
      if (e.key === "Escape") { e.preventDefault(); setSpot(null); return; }
      if (e.code === "Digit7") { e.preventDefault(); flip("types"); return; }
      if (e.code === "Digit8") { e.preventDefault(); flip("signs"); return; }
      if (e.code === "Digit9") { e.preventDefault(); flip("balance"); return; }
      if (e.code === "Digit0") { e.preventDefault(); flip("posting"); return; }
      if (e.code === "KeyA") { e.preventDefault(); setReveal(stepsRef.current); return; } // show it all
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flip]);

  const CHIP = "rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide";
  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden">
      <JeBoard scenario={scenario} reveal={reveal} toggles={toggles} spot={spot} onSpot={setSpot} />
      <div className="absolute bottom-2 left-2 flex flex-wrap items-center gap-1.5" data-lab-chrome>
        <span className={CHIP} style={{ color: "#0B1322", background: GOLD }}>{reveal}/{steps}</span>
        {([["types", "types 7"], ["signs", "(+/−) 8"], ["balance", "balance 9"], ["posting", "posts 0"]] as const).map(([k, label]) => (
          <button key={k} className={CHIP} style={{ color: toggles[k] ? "#0B1322" : MUTE, background: toggles[k] ? "#3BF5A0" : "transparent", border: `1px solid rgba(230,236,255,0.18)` }} onClick={() => flip(k)}>{label}</button>
        ))}
        <span className="text-[9px]" style={{ color: MUTE }}>Tab reveal · ` blank · A all · click a line to spotlight</span>
      </div>
    </div>
  );
}
