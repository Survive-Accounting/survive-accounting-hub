// /buildqueue — what the build machine has on its plate, for Lee and King. Fast-track requests
// and Lee's own queue, newest first: who asked, what, where it is (queued · building · built ·
// failed · done), the preview link and the checklist once built. Ctrl+F (or the button) opens a
// new fast-track request from here.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AdminGate, getAdminWho } from "@/components/AdminGate";
import { FAST_TRACK_DAILY_LIMIT, FAST_TRACK_GUIDELINES, fmtBuildTime, fmtCost, fmtStamp } from "@/lib/fast-track";
import { cancelFastTrack, fastTrackAllowanceFn, listBuildQueue, rateFastTrack, revertFastTrack, type QueueRow } from "@/lib/fast-track.functions";

export const Route = createFileRoute("/buildqueue")({
  head: () => ({ meta: [{ title: "Build queue — Survive" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: () => <AdminGate><BuildQueue /></AdminGate>,
});

const GOLD = "#FCA311", CREAM = "#F4EFE6", MUTED = "#9AA3B8", EDGE = "rgba(244,239,230,0.14)", INK = "#0B0F1E", MINT = "#3BF5A0", SKY = "#7DD3FC", ORANGE = "#FF9F43";
const STATE_COLOR: Record<QueueRow["state"], string> = { queued: MUTED, building: SKY, built: MINT, failed: ORANGE, done: MUTED };
const STATE_WORD: Record<QueueRow["state"], string> = { queued: "queued", building: "building now", built: "built · preview ready", failed: "failed", done: "live" };
/** The word on the row — cancelled and reverted win over the runner's state. */
const wordOf = (r: QueueRow): string => r.cancelled ? "cancelled" : r.reverted ? "reverted" : STATE_WORD[r.state];
const colorOf = (r: QueueRow): string => r.cancelled || r.reverted ? MUTED : STATE_COLOR[r.state];

const smallBtn = (color: string): React.CSSProperties => ({ font: "inherit", fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 8, border: `1px solid ${color}88`, background: "transparent", color, cursor: "pointer" });

function BuildQueue() {
  const who = getAdminWho() ?? "lee";
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null | undefined>(undefined);
  const [open, setOpen] = useState<string | null>(null);
  const [runner, setRunner] = useState<{ online: boolean; seenAt: string | null } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [rate, setRate] = useState<{ id: string; rating: "up" | "down" | null; note: string } | null>(null);
  const load = () => {
    listBuildQueue().then((r) => { setRows(r.rows); setRunner({ online: r.runnerOnline, seenAt: r.runnerSeenAt }); setErr(null); }).catch((e) => setErr((e as Error).message));
    fastTrackAllowanceFn({ data: { who } }).then((a) => setLeft(a.left)).catch(() => {});
  };
  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [who]);   // eslint-disable-line react-hooks/exhaustive-deps
  // THE LINKS IN THE EMAILS (2026-09-05): /buildqueue?cancel=<id> while queued, ?revert=<id> once
  // built. Acted on once, then the address is cleaned so a refresh does not repeat it.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const cancel = q.get("cancel"), revert = q.get("revert");
    if (!cancel && !revert) return;
    const done = (m: string) => { setBanner(m); window.history.replaceState(null, "", "/buildqueue"); load(); };
    if (cancel) cancelFastTrack({ data: { id: cancel } }).then((r) => done(r.message)).catch((e) => done((e as Error).message));
    else if (revert) revertFastTrack({ data: { id: revert, who } }).then((r) => done(r.message)).catch((e) => done((e as Error).message));
  }, [who]);   // eslint-disable-line react-hooks/exhaustive-deps
  const cancel = (r: QueueRow) => { if (window.confirm(`Cancel “${r.title}”? It won't be built.`)) cancelFastTrack({ data: { id: r.id } }).then((x) => { setBanner(x.message); load(); }); };
  const revert = (r: QueueRow) => { if (window.confirm(`Revert “${r.title}”? It comes off the plate and Lee gets a note not to merge it (or to undo it).`)) revertFastTrack({ data: { id: r.id, who } }).then((x) => { setBanner(x.message); load(); }); };
  const saveRate = () => {
    if (!rate || !rate.rating || rate.note.trim().length < 3) return;
    rateFastTrack({ data: { id: rate.id, rating: rate.rating, note: rate.note.trim() } }).then(() => { setRate(null); load(); }).catch((e) => setErr((e as Error).message));
  };

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
          {runner && <span> · <span style={{ color: runner.online ? MINT : ORANGE }}>{runner.online ? "build machine is up" : "build machine is off"}</span>{!runner.online && runner.seenAt ? ` (last seen ${fmtStamp(runner.seenAt)})` : ""}{!runner.online ? " — requests wait on the list until it's back" : ""}</span>}
        </div>
        {banner && <div style={{ marginTop: 10, padding: "8px 12px", border: `1px solid ${GOLD}66`, borderRadius: 10, fontSize: 13 }}>{banner} <button type="button" onClick={() => setBanner(null)} style={{ background: "none", border: 0, color: MUTED, cursor: "pointer" }}>×</button></div>}

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
                  <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: colorOf(r), whiteSpace: "nowrap" }}>{wordOf(r)}</span>
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
                    {(r.costUsd || r.buildSeconds || r.model) && (
                      <div style={{ marginTop: 6, fontSize: 12, color: MUTED }}>
                        {r.model ? `${r.model} · ` : ""}{fmtBuildTime(r.buildSeconds)} · est. {fmtCost(r.costUsd)}{r.playground ? ` · landed on ${r.playground}` : ""}
                      </div>
                    )}
                    {r.lane === "fast_track" && !r.cancelled && !r.reverted && (
                      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        {r.state === "queued" && <button type="button" onClick={() => cancel(r)} style={smallBtn(ORANGE)}>Cancel</button>}
                        {(r.state === "built" || r.state === "failed" || r.state === "done") && <button type="button" onClick={() => revert(r)} style={smallBtn(ORANGE)}>Revert</button>}
                        {(r.state === "built" || r.state === "failed") && !r.rating && rate?.id !== r.id && <button type="button" onClick={() => setRate({ id: r.id, rating: null, note: "" })} style={smallBtn(GOLD)}>Rate it</button>}
                        {r.rating && <span style={{ fontSize: 12, color: r.rating === "up" ? MINT : ORANGE }}>{r.rating === "up" ? "👍" : "👎"}{r.ratingNote ? ` “${r.ratingNote}”` : ""}</span>}
                      </div>
                    )}
                    {rate?.id === r.id && (
                      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button type="button" onClick={() => setRate({ ...rate, rating: "up" })} style={{ ...smallBtn(MINT), background: rate.rating === "up" ? MINT : "transparent", color: rate.rating === "up" ? INK : MINT }}>👍 good</button>
                          <button type="button" onClick={() => setRate({ ...rate, rating: "down" })} style={{ ...smallBtn(ORANGE), background: rate.rating === "down" ? ORANGE : "transparent", color: rate.rating === "down" ? INK : ORANGE }}>👎 not right</button>
                        </div>
                        <textarea value={rate.note} onChange={(e) => setRate({ ...rate, note: e.target.value })} rows={2} placeholder="One line: what worked, what didn't."
                          style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", color: CREAM, border: `1px solid ${EDGE}`, borderRadius: 8, padding: "8px 10px", font: "inherit", fontSize: 13 }} />
                        <div><button type="button" onClick={saveRate} disabled={!rate.rating || rate.note.trim().length < 3} style={{ ...smallBtn(GOLD), background: GOLD, color: INK, opacity: !rate.rating || rate.note.trim().length < 3 ? 0.5 : 1 }}>Save the checkout</button></div>
                      </div>
                    )}
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
