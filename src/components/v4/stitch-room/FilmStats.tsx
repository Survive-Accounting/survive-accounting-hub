// STATS AND THE LEDGER — pay per filmed slide. Lee, 2026-09-15: "videos completed today, this week, this month,
// all time … If I click one, it can show the today by default … if I click 'View ledger', it can show a log of
// each video, # of slides, pay amount, with a total at bottom."
import { useState } from "react";

import { clock, ledgerRows, money, videoTitle, PERIOD_LABEL, PERIODS, PAY_PER_SLIDE_CENTS, inPeriod, statsFor, type Period, type StitchRecord } from "@/lib/film-stitch";

import { ROOM } from "./room-theme";

export function FilmStats({ records, onOpen }: { records: readonly StitchRecord[]; onOpen?: (r: StitchRecord) => void }) {
  const [period, setPeriod] = useState<Period>("today");
  const [ledger, setLedger] = useState(false);
  const s = statsFor(records, period);
  const rows = ledgerRows(records.filter((r) => inPeriod(r, period)));
  const total = rows.reduce((n, r) => n + r.payCents, 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, color: ROOM.cream, fontFamily: ROOM.font }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
        {PERIODS.map((p) => {
          const x = statsFor(records, p);
          const on = p === period;
          return (
            <button key={p} type="button" onClick={() => setPeriod(p)} aria-pressed={on}
              style={{ all: "unset", cursor: "pointer", borderRadius: 12, padding: "10px 12px", background: on ? "rgba(252,163,17,0.12)" : ROOM.panel, border: `1px solid ${on ? ROOM.gold : ROOM.edge}` }}>
              <div style={{ fontSize: 11, letterSpacing: "0.12em", fontWeight: 800, color: on ? ROOM.gold : ROOM.muted }}>{PERIOD_LABEL[p].toUpperCase()}</div>
              <div style={{ fontSize: 24, fontWeight: 900, marginTop: 2 }}>{x.videos} <span style={{ fontSize: 12, color: ROOM.muted, fontWeight: 600 }}>video{x.videos === 1 ? "" : "s"}</span></div>
              <div style={{ fontSize: 13, color: ROOM.mint, fontWeight: 800 }}>{money(x.payCents)}</div>
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 18, alignItems: "baseline", flexWrap: "wrap", borderTop: `1px solid ${ROOM.edge}`, paddingTop: 12 }}>
        <div style={{ fontSize: 13, color: ROOM.muted }}>{PERIOD_LABEL[period]}</div>
        <div><b style={{ fontSize: 20 }}>{s.videos}</b> <span style={{ color: ROOM.muted }}>videos</span></div>
        <div><b style={{ fontSize: 20 }}>{s.slides}</b> <span style={{ color: ROOM.muted }}>slides filmed</span></div>
        <div><b style={{ fontSize: 20, color: ROOM.mint }}>{money(s.payCents)}</b> <span style={{ color: ROOM.muted }}>at {money(PAY_PER_SLIDE_CENTS)} a slide</span></div>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => setLedger((v) => !v)} style={{ font: "inherit", fontSize: 12, fontWeight: 800, padding: "6px 12px", borderRadius: 8, cursor: "pointer", border: `1px solid ${ROOM.gold}`, background: ledger ? ROOM.gold : "transparent", color: ledger ? "#14213D" : ROOM.gold }}>
          {ledger ? "Hide ledger" : "View ledger"}
        </button>
      </div>
      {ledger && (
        <div style={{ overflowX: "auto", border: `1px solid ${ROOM.edge}`, borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ color: ROOM.muted, fontSize: 11, letterSpacing: "0.08em", textAlign: "left" }}>
                {["Date", "Video", "Length", "Slides", "Pay", "Running"].map((h, i) => <th key={h} style={{ padding: "8px 10px", fontWeight: 800, textAlign: i >= 3 ? "right" : "left", borderBottom: `1px solid ${ROOM.edge}` }}>{h.toUpperCase()}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} style={{ padding: 14, color: ROOM.muted }}>No videos stitched {period === "all" ? "yet" : PERIOD_LABEL[period].toLowerCase()}.</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${ROOM.edge}55` }}>
                  <td style={{ padding: "7px 10px", color: ROOM.muted, whiteSpace: "nowrap" }}>{new Date(r.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                  <td style={{ padding: "7px 10px" }}>
                    {onOpen ? <button type="button" onClick={() => onOpen(r)} style={{ all: "unset", cursor: "pointer", fontWeight: 700 }}>{videoTitle(r.takeIndex, r.name)}</button> : <b>{videoTitle(r.takeIndex, r.name)}</b>}
                    <div style={{ fontSize: 11, color: ROOM.muted }}>{r.setName ?? r.setId}</div>
                  </td>
                  <td style={{ padding: "7px 10px", color: ROOM.muted }}>{clock(r.durationS)}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right" }}>{r.slides}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", color: ROOM.mint, fontWeight: 700 }}>{money(r.payCents)}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", color: ROOM.muted }}>{money(r.runningCents)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ padding: "9px 10px", fontWeight: 900 }}>Total · {PERIOD_LABEL[period].toLowerCase()}</td>
                  <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 900 }}>{rows.reduce((n, r) => n + r.slides, 0)}</td>
                  <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 900, color: ROOM.mint }}>{money(total)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
