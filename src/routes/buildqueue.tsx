// /buildqueue — what the build machine has on its plate, for Lee and King. Fast-track requests
// and Lee's own queue, newest first: who asked, what, where it is (queued · building · built ·
// failed · done), the preview link and the checklist once built. Ctrl+F (or the button) opens a
// new fast-track request from here.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AdminGate, getAdminWho } from "@/components/AdminGate";
import { FAST_TRACK_DAILY_LIMIT, FAST_TRACK_GUIDELINES } from "@/lib/fast-track";
import { fastTrackAllowanceFn, listBuildQueue, type QueueRow } from "@/lib/fast-track.functions";

export const Route = createFileRoute("/buildqueue")({
  head: () => ({ meta: [{ title: "Build queue — Survive" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: () => <AdminGate><BuildQueue /></AdminGate>,
});

const GOLD = "#FCA311", CREAM = "#F4EFE6", MUTED = "#9AA3B8", EDGE = "rgba(244,239,230,0.14)", INK = "#0B0F1E", MINT = "#3BF5A0", SKY = "#7DD3FC", ORANGE = "#FF9F43";
const STATE_COLOR: Record<QueueRow["state"], string> = { queued: MUTED, building: SKY, built: MINT, failed: ORANGE, done: MUTED };
const STATE_WORD: Record<QueueRow["state"], string> = { queued: "queued", building: "building now", built: "built · preview ready", failed: "failed", done: "live" };

function BuildQueue() {
  const who = getAdminWho() ?? "lee";
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null | undefined>(undefined);
  const [open, setOpen] = useState<string | null>(null);
  const load = () => {
    listBuildQueue().then((r) => { setRows(r.rows); setErr(null); }).catch((e) => setErr((e as Error).message));
    fastTrackAllowanceFn({ data: { who } }).then((a) => setLeft(a.left)).catch(() => {});
  };
  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [who]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ minHeight: "100vh", background: INK, color: CREAM, fontFamily: "'Rubik', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 18px 80px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Build queue</h1>
          <span style={{ fontSize: 12.5, color: MUTED }}>the build machine's plate · refreshes every minute</span>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={() => window.dispatchEvent(new Event("sa:fasttrack"))}
            style={{ font: "inherit", fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 9, border: 0, background: GOLD, color: INK, cursor: "pointer" }}>⚡ Fast track a change</button>
        </div>
        <div style={{ marginTop: 6, fontSize: 12.5, color: MUTED }}>
          {who === "lee" ? "You: no daily limit." : `You (${who}): ${left === undefined ? "…" : left === null ? "no daily limit" : `${left} of ${FAST_TRACK_DAILY_LIMIT} fast-track requests left today`}. Resets at midnight Chicago.`}
          {" "}Ctrl+F on any internal page opens the same request.
        </div>

        <details style={{ marginTop: 14, border: `1px solid ${EDGE}`, borderRadius: 10, padding: "10px 14px" }}>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: GOLD }}>What fits on the fast track</summary>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.55, opacity: 0.92 }}>
            {FAST_TRACK_GUIDELINES.map((g, i) => <li key={i} style={{ margin: "3px 0" }}>{g}</li>)}
          </ul>
        </details>

        {err && <div style={{ marginTop: 14, color: ORANGE, fontSize: 13 }}>{err}</div>}
        {rows === null && !err && <div style={{ marginTop: 18, color: MUTED, fontSize: 13 }}>Loading…</div>}
        {rows && rows.length === 0 && <div style={{ marginTop: 18, color: MUTED, fontSize: 13 }}>Nothing on the plate. Ctrl+F on a page to send the first one.</div>}

        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {rows?.map((r) => {
            const isOpen = open === r.id;
            return (
              <div key={r.id} style={{ border: `1px solid ${EDGE}`, borderRadius: 12, background: "rgba(255,255,255,0.025)" }}>
                <button type="button" onClick={() => setOpen(isOpen ? null : r.id)} style={{ width: "100%", textAlign: "left", background: "transparent", border: 0, color: CREAM, padding: "12px 14px", cursor: "pointer", font: "inherit", display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center" }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: STATE_COLOR[r.state], whiteSpace: "nowrap" }}>{STATE_WORD[r.state]}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: MUTED }}>{r.lane === "fast_track" ? "⚡ fast track" : "queue"} · {r.by} · {new Date(r.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{r.path ? ` · ${r.path}` : ""}</span>
                  </span>
                  <span style={{ color: MUTED, fontSize: 12 }}>{isOpen ? "▴" : "▾"}</span>
                </button>
                {isOpen && (
                  <div style={{ padding: "0 14px 14px", fontSize: 13, lineHeight: 1.5 }}>
                    <div style={{ whiteSpace: "pre-wrap", color: CREAM, opacity: 0.92, borderTop: `1px solid ${EDGE}`, paddingTop: 10 }}>{r.body}</div>
                    {r.state === "building" && <div style={{ marginTop: 8, color: SKY }}>The build machine is on it. Usually 10–40 minutes.</div>}
                    {r.previewUrl && <div style={{ marginTop: 8 }}>Preview: <a href={r.previewUrl} target="_blank" rel="noreferrer" style={{ color: GOLD }}>{r.previewUrl}</a></div>}
                    {r.branch && <div style={{ marginTop: 4, fontSize: 12, color: MUTED }}>branch {r.branch}{r.sha ? ` @ ${r.sha.slice(0, 8)}` : ""}{r.builtAt ? ` · built ${new Date(r.builtAt).toLocaleString()}` : ""}</div>}
                    {r.runError && <div style={{ marginTop: 8, color: ORANGE }}>Stopped: {r.runError}</div>}
                    {r.checklist.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTED, fontWeight: 700 }}>Testing checklist</div>
                        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{r.checklist.map((c, i) => <li key={i} style={{ margin: "3px 0" }}>{c.replace(/^- \[ \]\s*/, "")}</li>)}</ul>
                      </div>
                    )}
                    {r.report && <details style={{ marginTop: 8 }}><summary style={{ cursor: "pointer", color: MUTED, fontSize: 12 }}>the build's report</summary><div style={{ whiteSpace: "pre-wrap", fontSize: 12, color: MUTED, marginTop: 6 }}>{r.report}</div></details>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
