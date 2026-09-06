// /admin/production — THE BOTTLENECK REPORT (Lee, 2026-09-05): "generate reports about where
// bottlenecks may exist. Which step?" Reads what the Production Timer widget (ProductionTimer.tsx,
// mounted globally) has logged: total and average time per step across every set, and the total
// per set, worst first — the two questions Lee actually asked ("which step" and "which video ran
// long"). Cost lives beside it via the illustration library's own per-set total (Recraft only,
// today); Mux joins the same way once publishing is wired up.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AdminGate } from "@/components/AdminGate";
import { productionBottleneckReport, type BottleneckStep, type SetTotal } from "@/lib/production-time.functions";
import { fmtDuration, PRODUCTION_STEPS, STEP_LABEL } from "@/lib/production-time";

export const Route = createFileRoute("/admin/production")({
  component: () => <AdminGate><ProductionReport /></AdminGate>,
  head: () => ({ meta: [{ title: "Production report — Survive" }, { name: "robots", content: "noindex" }] }),
});

const GOLD = "#FCA311", CREAM = "#F4EFE6", MUTED = "#9AA3B8", EDGE = "rgba(244,239,230,0.16)", INK = "#0B0F1E", MINT = "#3BF5A0";

function ProductionReport() {
  const [steps, setSteps] = useState<BottleneckStep[] | null>(null);
  const [sets, setSets] = useState<SetTotal[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    productionBottleneckReport()
      .then((r) => { setSteps(r.steps); setSets(r.sets); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  const totalLogged = steps?.reduce((s, x) => s + x.totalSeconds, 0) ?? 0;
  const slowest = steps && steps.some((s) => s.sessions > 0) ? [...steps].filter((s) => s.sessions > 0).sort((a, b) => b.avgSeconds - a.avgSeconds)[0] : null;

  return (
    <div style={{ minHeight: "100vh", background: INK, color: CREAM, fontFamily: "'Rubik', system-ui, sans-serif", padding: "28px 20px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: GOLD }}>Production report</div>
        <h1 style={{ margin: "6px 0 4px", fontSize: 24, fontWeight: 800 }}>Where the time goes</h1>
        <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.5, maxWidth: 560 }}>
          Every session the timer widget has logged, on any Blast Off set — Talkthrough, Review, Film. Nothing here yet until the timer's been used a few times.
        </p>

        {err && <div style={{ marginTop: 20, padding: "10px 14px", border: "1px solid #FF9F4388", borderRadius: 10, fontSize: 13, color: "#FF9F43" }}>{err}</div>}
        {!steps && !err && <div style={{ marginTop: 20, fontSize: 13, color: MUTED }}>Loading…</div>}

        {steps && (
          <>
            {totalLogged === 0 ? (
              <div style={{ marginTop: 24, padding: "16px 18px", border: `1px dashed ${EDGE}`, borderRadius: 12, fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
                No timed sessions yet. Open a Blast Off set — Talkthrough, Review or Film — and the timer prompt shows up bottom-left; start it, work as normal, stop it when you move on. This page fills in from there.
              </div>
            ) : (
              <>
                {slowest && (
                  <div style={{ marginTop: 22, padding: "12px 16px", border: `1px solid ${GOLD}55`, borderRadius: 12, fontSize: 13.5, lineHeight: 1.5 }}>
                    <b style={{ color: GOLD }}>{STEP_LABEL[slowest.step]}</b> takes the longest on average — {fmtDuration(slowest.avgSeconds)} per session, across {slowest.sessions} session{slowest.sessions === 1 ? "" : "s"}.
                  </div>
                )}

                <div style={{ marginTop: 22, fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTED }}>By step</div>
                <div style={{ marginTop: 8, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
                  {PRODUCTION_STEPS.map((k) => {
                    const s = steps.find((x) => x.step === k)!;
                    return (
                      <div key={k} style={{ border: `1px solid ${EDGE}`, borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: MUTED }}>{STEP_LABEL[k]}</div>
                        <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{s.sessions ? fmtDuration(s.avgSeconds) : "—"}</div>
                        <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{s.sessions ? `avg of ${s.sessions} · ${fmtDuration(s.totalSeconds)} total` : "no sessions yet"}</div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: 26, fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTED }}>By set — longest first</div>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {(sets ?? []).map((s) => (
                    <div key={s.setId} style={{ border: `1px solid ${EDGE}`, borderRadius: 10, padding: "9px 12px", display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5 }}>{s.setName ?? s.setId}</span>
                      {s.topicName && <span style={{ fontSize: 11, color: MUTED }}>{s.topicName}</span>}
                      <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 800, color: MINT, fontVariantNumeric: "tabular-nums" }}>{fmtDuration(s.totalSeconds)}</span>
                      <span style={{ fontSize: 10.5, color: MUTED, width: "100%" }}>
                        {PRODUCTION_STEPS.filter((k) => s.bySteps[k]).map((k) => `${STEP_LABEL[k]} ${fmtDuration(s.bySteps[k]!)}`).join(" · ")}
                      </span>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 20, fontSize: 11, color: MUTED }}>Illustration spend is tracked per set already — open a set's Review → 🎨 Illustration → 📚 Library to see it. A combined time + cost view lands here once Mux is wired into Post.</div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
