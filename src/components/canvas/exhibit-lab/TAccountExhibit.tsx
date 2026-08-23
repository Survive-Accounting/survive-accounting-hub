// THE T-ACCOUNT EXHIBIT — the ledger filling up, one transaction at a time.
//
// Lee's format, built in: the amounts are STAGGERED down the T in posting
// order (the story reads in time, not as two stacked columns), and EVERY
// amount carries a label — "Beg. balance", the transaction that put it there,
// "End. balance". Nothing in a T is an unexplained number.
//
// THE POSTING (the thing the old cards could never do): Tab posts the NEXT
// journal entry into every account it touches at once, and the rows that just
// landed flash gold. That is a JE posting to the ledger, live, on camera.
//
// Types, normal balances and which column the balance lands in all come from
// the rubric model — never re-derived here.
import { useCallback, useEffect, useRef, useState } from "react";

import { BIG_FONT } from "../theme";
import { money } from "./JournalEntryExhibit";
import { ledgerScenarios, postToTs, tBalanceRow, tRows, trialBalance, type TAccount, type TRow } from "./ledger-model";
import { ELEMENT_LABEL, signPair, tSides } from "./rubric-view";

const GOLD = "#FCA311";
const INK = "#F4EFE6";
const MUTE = "rgba(230,236,255,0.42)";
const DIM = "rgba(230,236,255,0.62)";
const RULE = "rgba(230,236,255,0.4)";
const T = "opacity 180ms ease, transform 180ms ease, color 180ms ease, background 180ms ease";

export interface TToggles {
  /** The label beside every amount — Lee's rule: no unexplained numbers. */
  labels: boolean;
  /** The ending balance under the rule. */
  balance: boolean;
  /** The rubric type + its (+/−) pair on the account header. */
  types: boolean;
  /** The trial-balance proof across the whole ledger. */
  trial: boolean;
}
export const T_ALL_OFF: TToggles = { labels: false, balance: false, types: false, trial: false };

/** ONE T — staggered rows, labels outboard, the balance under the rule. */
function TCard({ t, postedIds, justPosted, toggles, size, lit, dim, onClick }: {
  t: TAccount;
  /** Scenario ids posted so far — a row appears when its transaction lands. */
  postedIds: ReadonlySet<string>;
  justPosted: string | null;
  toggles: TToggles;
  size: number;
  lit: boolean; dim: boolean;
  onClick: () => void;
}) {
  const rows = tRows(t).filter((r) => r.kind !== "post" || postedIds.has(rowScenario(r, t) ?? ""));
  const bal = tBalanceRow(liveBalance(t, postedIds));
  const p = signPair(t.type);
  const normalDr = tSides(t.type).normal === "left";
  const cell = (r: TRow, i: number, side: "dr" | "cr") => {
    if (r.side !== side) return <span key={i} />;
    const fresh = r.kind === "post" && justPosted != null && rowScenario(r, t) === justPosted;
    return (
      <span key={i} style={{
        display: "flex", alignItems: "baseline", gap: size * 0.3, justifyContent: side === "dr" ? "flex-end" : "flex-start",
        flexDirection: side === "dr" ? "row" : "row-reverse",
        padding: `${size * 0.08}px 0`, transition: T,
        color: fresh ? GOLD : INK,
      }}>
        {toggles.labels && (
          <span style={{ fontSize: size * 0.42, color: fresh ? GOLD : MUTE, maxWidth: size * 7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: side === "dr" ? "right" : "left", transition: T }}>
            {r.label}
          </span>
        )}
        <span style={{ fontSize: size * 0.62, fontWeight: 800, fontVariantNumeric: "tabular-nums", transition: T }}>{money(r.amount)}</span>
      </span>
    );
  };
  return (
    <div onClick={onClick} style={{
      display: "flex", flexDirection: "column", cursor: "pointer",
      width: "100%", maxWidth: size * 13, // a T stretched to a grid column stops reading as a T
      opacity: dim ? 0.3 : 1, transform: lit ? "scale(1.02)" : "scale(1)", transition: T,
      padding: size * 0.3, borderRadius: 12,
      background: lit ? "rgba(252,163,17,0.07)" : "transparent",
    }}>
      {/* account name + (optionally) its rubric type and pair */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: size * 0.35, marginBottom: size * 0.18 }}>
        <span style={{ fontFamily: BIG_FONT, fontWeight: 900, fontSize: size * 0.78, color: INK, whiteSpace: "nowrap" }}>{t.account}</span>
        <span style={{ opacity: toggles.types ? 1 : 0, transition: T, fontSize: size * 0.46, fontWeight: 900, color: GOLD, whiteSpace: "nowrap" }}>
          {ELEMENT_LABEL[t.type]} <span style={{ color: DIM }}>({p.left}/{p.right})</span>
        </span>
      </div>
      {/* the T */}
      <div style={{ height: 2, background: RULE, borderRadius: 2 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2px 1fr", minHeight: size * 2.6 }}>
        <div style={{ display: "flex", flexDirection: "column", paddingRight: size * 0.3 }}>{rows.map((r, i) => cell(r, i, "dr"))}</div>
        <div style={{ background: RULE }} />
        <div style={{ display: "flex", flexDirection: "column", paddingLeft: size * 0.3 }}>{rows.map((r, i) => cell(r, i, "cr"))}</div>
      </div>
      {/* the ending balance, under its own rule, on its own side */}
      <div style={{ opacity: toggles.balance ? 1 : 0, transition: T, display: "grid", gridTemplateColumns: "1fr 2px 1fr" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", paddingRight: size * 0.3 }}>
          {bal.side === "dr" && <><span style={{ height: 2, background: normalDr ? GOLD : RULE, width: "62%", borderRadius: 2, marginBottom: 3 }} />{cell(bal, 0, "dr")}</>}
        </div>
        <div />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", paddingLeft: size * 0.3 }}>
          {bal.side === "cr" && <><span style={{ height: 2, background: !normalDr ? GOLD : RULE, width: "62%", borderRadius: 2, marginBottom: 3 }} />{cell(bal, 0, "cr")}</>}
        </div>
      </div>
    </div>
  );
}

/** Which transaction produced a row (posts carry their scenario id). */
function rowScenario(r: TRow, t: TAccount): string | null {
  if (r.kind !== "post") return null;
  const p = t.posts.find((x) => x.label === r.label && x.amount === r.amount && x.dr === (r.side === "dr"));
  return p?.scenarioId ?? null;
}

/** The account as it stands after only the posted transactions — so the
 *  balance counts up WITH the story instead of jumping to the end. */
function liveBalance(t: TAccount, postedIds: ReadonlySet<string>): TAccount {
  const posts = t.posts.filter((p) => p.scenarioId && postedIds.has(p.scenarioId));
  const normalDr = tSides(t.type).normal === "left";
  const drTotal = (normalDr ? t.opening : 0) + posts.filter((p) => p.dr).reduce((s, p) => s + p.amount, 0);
  const crTotal = (normalDr ? 0 : t.opening) + posts.filter((p) => !p.dr).reduce((s, p) => s + p.amount, 0);
  const net = drTotal - crTotal;
  return { ...t, posts, drTotal, crTotal, balance: Math.abs(net), side: net >= 0 ? "dr" : "cr" };
}

export interface TBoardProps {
  scenarios: ReturnType<typeof ledgerScenarios>;
  /** How many transactions have been posted (0 = an empty ledger). */
  posted: number;
  toggles: TToggles;
  spot: string | null;
  onSpot: (account: string | null) => void;
}

export function TBoard({ scenarios, posted, toggles, spot, onSpot }: TBoardProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 1280, h: 720 });
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => { const r = el.getBoundingClientRect(); if (r.width && r.height) setBox({ w: r.width, h: r.height }); };
    const ro = new ResizeObserver(measure); ro.observe(el); measure();
    return () => ro.disconnect();
  }, []);

  const all = postToTs(scenarios);
  const postedIds = new Set(scenarios.slice(0, posted).map((s) => s.id));
  const justPosted = posted > 0 ? scenarios[posted - 1].id : null;
  // Only accounts the posted transactions have touched — the ledger grows.
  const shown = all.filter((t) => t.posts.some((p) => p.scenarioId && postedIds.has(p.scenarioId)));
  const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(Math.max(1, shown.length)))));
  const size = Math.max(15, Math.min(34, box.w / (cols * 13)));
  const live = shown.map((t) => liveBalance(t, postedIds));
  const tb = trialBalance(live);

  return (
    <div ref={rootRef} style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: size * 0.6, overflow: "hidden", padding: "2%" }}>
      {/* the transaction that just posted — the caption for what you're watching */}
      <div style={{ opacity: justPosted ? 1 : 0, transition: T, fontSize: size * 0.62, fontWeight: 700, color: DIM, textAlign: "center" }}>
        {justPosted ? scenarios[posted - 1].text : " "}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: `${size * 0.8}px ${size * 1.2}px`, width: "100%", justifyItems: "center" }}>
        {shown.map((t) => (
          <TCard key={t.account} t={t} postedIds={postedIds} justPosted={justPosted} toggles={toggles} size={size}
            lit={spot === t.account} dim={spot != null && spot !== t.account}
            onClick={() => onSpot(spot === t.account ? null : t.account)} />
        ))}
        {!shown.length && <span style={{ fontSize: size * 0.7, color: MUTE, fontStyle: "italic" }}>An empty ledger — Tab posts the first entry.</span>}
      </div>
      {/* the trial balance: the proof the ledger still balances */}
      <div style={{ opacity: toggles.trial && shown.length ? 1 : 0, transition: T, display: "flex", alignItems: "baseline", gap: size * 0.6, fontSize: size * 0.6, fontWeight: 900, fontVariantNumeric: "tabular-nums", color: tb.balanced ? "#3BF5A0" : "#FF8B9E" }}>
        <span style={{ fontSize: size * 0.44, letterSpacing: "0.18em" }}>TRIAL BALANCE</span>
        <span>{money(tb.dr)}</span><span style={{ color: MUTE }}>=</span><span>{money(tb.cr)}</span>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────── wrapper

export function TAccountExhibit({ seed }: { seed?: Record<string, string | number | boolean> }) {
  const scenarios = ledgerScenarios(typeof seed?.ledger === "string" ? String(seed.ledger).split(",") : undefined);
  const [posted, setPosted] = useState(0);
  const [spot, setSpot] = useState<string | null>(null);
  const [toggles, setToggles] = useState<TToggles>({ ...T_ALL_OFF, labels: true, balance: true });
  const maxRef = useRef(scenarios.length); maxRef.current = scenarios.length;
  const flip = useCallback((k: keyof TToggles) => setToggles((t) => ({ ...t, [k]: !t[k] })), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.key === "Tab") { e.preventDefault(); setPosted((p) => Math.max(0, Math.min(maxRef.current, p + (e.shiftKey ? -1 : 1)))); return; }
      if (e.key === "`") { e.preventDefault(); setPosted(0); setSpot(null); return; }
      if (e.key === "Escape") { e.preventDefault(); setSpot(null); return; }
      if (e.code === "Digit7") { e.preventDefault(); flip("labels"); return; }
      if (e.code === "Digit8") { e.preventDefault(); flip("types"); return; }
      if (e.code === "Digit9") { e.preventDefault(); flip("balance"); return; }
      if (e.code === "Digit0") { e.preventDefault(); flip("trial"); return; }
      if (e.code === "KeyA") { e.preventDefault(); setPosted(maxRef.current); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flip]);

  const CHIP = "rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide";
  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden">
      <TBoard scenarios={scenarios} posted={posted} toggles={toggles} spot={spot} onSpot={setSpot} />
      <div className="absolute bottom-2 left-2 flex flex-wrap items-center gap-1.5" data-lab-chrome>
        <span className={CHIP} style={{ color: "#0B1322", background: GOLD }}>posted {posted}/{scenarios.length}</span>
        {([["labels", "labels 7"], ["types", "types 8"], ["balance", "balance 9"], ["trial", "trial 0"]] as const).map(([k, label]) => (
          <button key={k} className={CHIP} style={{ color: toggles[k] ? "#0B1322" : MUTE, background: toggles[k] ? "#3BF5A0" : "transparent", border: "1px solid rgba(230,236,255,0.18)" }} onClick={() => flip(k)}>{label}</button>
        ))}
        <span className="text-[9px]" style={{ color: MUTE }}>Tab posts the next entry · ` empty · A all · click a T to spotlight</span>
      </div>
    </div>
  );
}
