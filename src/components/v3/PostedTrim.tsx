// TRIM WHAT'S POSTED (Lee, 2026-09-14: "how to trim again? My goal is to trim the outro off of most
// of these. It's repetitive."). Every video on the set, playing from the site, with its end time —
// suggested from the transcript where the sign-off starts ("I hope this helped…"). Press Trim and
// the host cuts a new copy; students get it once it's ready. Undo puts the full video back.
// Server doors: startPostedTrim / resolvePostedTrim / undoPostedTrim (lib/quick-post.functions.ts).
import { useEffect, useRef, useState } from "react";

import { V3_CREAM, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { listSitePosts, resolvePostedTrim, startPostedTrim, undoPostedTrim, type SitePostView } from "@/lib/quick-post.functions";

import { clock } from "./quick-post";

const MINT = "#7BD3A8";
const RED = "#FF8A7A";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const btn = (strong = false): React.CSSProperties => ({
  padding: "6px 12px", borderRadius: 8, border: `1px solid ${strong ? V3_GOLD : V3_EDGE}`, cursor: "pointer",
  background: strong ? V3_GOLD : "transparent", color: strong ? "#14213D" : V3_CREAM, fontWeight: 800, fontSize: 12.5,
});

type RowState = { s: "idle" } | { s: "working"; note: string } | { s: "done"; note: string } | { s: "error"; error: string };

export function PostedTrim({ setId }: { setId: string }) {
  const [posts, setPosts] = useState<SitePostView[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ends, setEnds] = useState<Record<string, string>>({});
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [bulk, setBulk] = useState(false);

  const load = async () => {
    try {
      const r = await listSitePosts({ data: { setId } });
      if (!r.ok) { setErr(r.error); return; }
      setErr(null); setPosts(r.posts);
      setEnds((prev) => {
        const n = { ...prev };
        for (const p of r.posts) if (n[p.pubKey] == null && p.trimAtS != null && !p.untrimmed) n[p.pubKey] = String(p.trimAtS);
        return n;
      });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  useEffect(() => { void load(); }, [setId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setRow = (k: string, st: RowState) => setStates((m) => ({ ...m, [k]: st }));
  const trim = async (p: SitePostView) => {
    const endS = Number(ends[p.pubKey]);
    if (!Number.isFinite(endS) || endS < 1) { setRow(p.pubKey, { s: "error", error: "Set an end time first." }); return; }
    setRow(p.pubKey, { s: "working", note: "Cutting on the video host…" });
    const r = await startPostedTrim({ data: { setId, pubKey: p.pubKey, endS } }).catch((e) => ({ ok: false as const, error: String(e?.message ?? e) }));
    if (!r.ok) { setRow(p.pubKey, { s: "error", error: r.error }); return; }
    for (let i = 0; i < 180; i++) {
      await wait(5000);
      const x = await resolvePostedTrim({ data: { setId, pubKey: p.pubKey, assetId: r.assetId } }).catch((e) => ({ state: "error" as const, error: String(e?.message ?? e) }));
      if (x.state === "done") { setRow(p.pubKey, { s: "done", note: `Trimmed to ${clock(x.durationS)} — live on the site.` }); await load(); return; }
      if (x.state === "error") {
        if (/changed while saving/i.test(x.error)) { await wait(1500 + Math.random() * 2000); continue; }
        setRow(p.pubKey, { s: "error", error: x.error }); return;
      }
    }
    setRow(p.pubKey, { s: "error", error: "Still processing after 15 minutes — press Trim again." });
  };
  const undo = async (p: SitePostView) => {
    setRow(p.pubKey, { s: "working", note: "Putting the full video back…" });
    const r = await undoPostedTrim({ data: { setId, pubKey: p.pubKey } }).catch((e) => ({ ok: false as const, error: String(e?.message ?? e) }));
    if (!r.ok) { setRow(p.pubKey, { s: "error", error: r.error }); return; }
    setRow(p.pubKey, { s: "done", note: "Full video is back." });
    await load();
  };
  const ready = (posts ?? []).filter((p) => !p.untrimmed && Number(ends[p.pubKey]) >= 1);
  const trimAll = async () => {
    setBulk(true);
    try { await Promise.all(ready.map((p) => trim(p))); } finally { setBulk(false); }
  };

  return (
    <div style={{ color: V3_CREAM }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: V3_MUTED, maxWidth: 640, lineHeight: 1.5 }}>
          Each end time is where your sign-off starts, from the transcript. Play the last seconds to check, nudge it, then Trim.
          The trimmed copy replaces the video for students when it's ready; Undo brings the full one back.
        </div>
        <span style={{ flex: 1 }} />
        <button type="button" style={{ ...btn(true), opacity: bulk || !ready.length ? 0.55 : 1 }} disabled={bulk || !ready.length} onClick={() => void trimAll()}>
          {bulk ? "Trimming…" : `Trim all ${ready.length} with end times`}
        </button>
      </div>
      {err && <div style={{ color: RED, fontSize: 13 }}>{err}</div>}
      {!posts && !err && <div style={{ color: V3_MUTED }}>Loading…</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {posts?.map((p) => <Row key={p.pubKey} p={p} end={ends[p.pubKey] ?? ""} onEnd={(v) => setEnds((m) => ({ ...m, [p.pubKey]: v }))} st={states[p.pubKey] ?? { s: "idle" }} onTrim={() => void trim(p)} onUndo={() => void undo(p)} busy={bulk} />)}
      </div>
    </div>
  );
}

function Row({ p, end, onEnd, st, onTrim, onUndo, busy }: { p: SitePostView; end: string; onEnd: (v: string) => void; st: RowState; onTrim: () => void; onUndo: () => void; busy: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [armed, setArmed] = useState(false);
  // The site's own stream, through hls.js (Chrome can't play HLS natively). Loaded on first play.
  const arm = async () => {
    if (armed || !p.playbackId || !ref.current) return;
    setArmed(true);
    const src = `https://stream.mux.com/${p.playbackId}.m3u8`;
    const v = ref.current;
    if (v.canPlayType("application/vnd.apple.mpegurl")) { v.src = src; return; }
    const { default: Hls } = await import("hls.js");
    const h = new Hls(); h.loadSource(src); h.attachMedia(v);
    await new Promise<void>((res) => h.on(Hls.Events.MANIFEST_PARSED, () => res()));
  };
  const playBeforeCut = async () => {
    const v = ref.current; const e = Number(end);
    if (!v || !Number.isFinite(e)) return;
    await arm();
    v.currentTime = Math.max(0, e - 3); void v.play();
    const stop = () => { if (v.currentTime >= e) { v.pause(); v.removeEventListener("timeupdate", stop); } };
    v.addEventListener("timeupdate", stop);
  };
  const working = st.s === "working";
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", border: `1px solid ${st.s === "error" ? RED : st.s === "done" ? MINT : V3_EDGE}`, borderRadius: 10, padding: 8, flexWrap: "wrap" }}>
      <video ref={ref} controls muted={false} playsInline preload="none" poster={p.coverUrl ?? (p.playbackId ? `https://image.mux.com/${p.playbackId}/thumbnail.webp?width=160` : undefined)}
        onPlay={() => void arm()} style={{ width: 96, height: 170, background: "#000", borderRadius: 6, objectFit: "cover" }} />
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>{p.takeIndex + 1}. {p.title}</div>
        <div style={{ fontSize: 12, color: V3_MUTED }}>
          {p.untrimmed ? `Trimmed · ${clock(p.durationS)} (was ${clock(p.untrimmed.durationS)})` : `Full video · ${clock(p.durationS)}`}
        </div>
        <div style={{ fontSize: 12.5, marginTop: 4, color: st.s === "error" ? RED : st.s === "done" ? MINT : V3_GOLD }}>
          {st.s === "working" && st.note}{st.s === "done" && st.note}{st.s === "error" && st.error}
        </div>
      </div>
      {!p.untrimmed ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, color: V3_MUTED, display: "flex", gap: 6, alignItems: "center" }}>
            End at
            <input type="number" step="0.1" min="1" value={end} onChange={(e) => onEnd(e.target.value)} disabled={working || busy}
              style={{ width: 72, background: "rgba(0,0,0,0.25)", color: V3_CREAM, border: `1px solid ${V3_EDGE}`, borderRadius: 8, padding: "5px 7px", fontSize: 13 }} />
            s {Number(end) > 0 ? `(${clock(Number(end))}, cuts ${clock((p.durationS ?? 0) - Number(end))})` : ""}
          </label>
          <button type="button" style={btn()} disabled={!Number(end) || working} onClick={() => void playBeforeCut()}>▶ 3 s before the cut</button>
          <button type="button" style={btn()} disabled={working} onClick={() => { const v = ref.current; if (v && v.currentTime > 0) onEnd(v.currentTime.toFixed(1)); }} title="Pause the video where it should end, then press">End here</button>
          <button type="button" style={{ ...btn(true), opacity: working || busy || !Number(end) ? 0.55 : 1 }} disabled={working || busy || !Number(end)} onClick={onTrim}>{working ? "Working…" : "Trim"}</button>
        </div>
      ) : (
        <button type="button" style={btn()} disabled={working} onClick={onUndo}>Undo trim</button>
      )}
    </div>
  );
}
