// THE CHAIN PREVIEW (Lee, 2026-09-16: "Let me view a preview of the entire chain of videos in a topic from
// breathers, so I can test it out before it's posted."): the topic's posted videos in the order students get
// them, set after set, with the breathers between — THIS set's from the page's draft (unsaved edits included),
// the other sets' as saved. The same Mux streams the site plays; nothing here posts or saves anything.
import { useEffect, useMemo, useRef, useState } from "react";

import { BreatherCard } from "@/components/learn/BreatherCard";
import { V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { breatherPosition, studentBreathers, type Breather, type StudentBreather } from "@/lib/breathers";
import type { SequenceVideo } from "@/lib/breathers.functions";
import { fetchStudentTree, type StudentTopic } from "@/lib/student.functions";

import { clock } from "./quick-post";

const MINT = "#3BF5A0";

interface Item { key: string; setId: string; setName: string; name: string; playbackId: string | null; runtimeSec: number | null; index: number; of: number; breather: StudentBreather | null }

/** The topic's chain: every set's posted parts in site order, each with the breather that follows it. */
export function chainOf(topic: StudentTopic, setId: string, videos: readonly SequenceVideo[], draft: readonly Breather[]): Item[] {
  const out: Item[] = [];
  for (const set of topic.sets) {
    const shorts = set.shorts ?? [];
    if (!shorts.length) continue;
    const breathers = set.id === setId ? studentBreathers(videos.map((v) => v.pubKey), draft) : (set.breathers ?? []);
    shorts.forEach((sh, i) => out.push({
      key: `${set.id}:${sh.takeIndex}`, setId: set.id, setName: set.name, name: sh.name || `Video ${i + 1}`, playbackId: sh.playbackId, runtimeSec: sh.runtimeSec,
      index: i, of: shorts.length, breather: breathers.find((b) => b.afterIndex === i) ?? null,
    }));
  }
  return out;
}

export function ChainPreview({ setId, videos, draft, onClose }: { setId: string; videos: readonly SequenceVideo[]; draft: readonly Breather[]; onClose: () => void }) {
  const [topic, setTopic] = useState<StudentTopic | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    fetchStudentTree({ data: {} }).then((courses) => {
      if (!on) return;
      const topics = courses.flatMap((c) => (c.topics.length ? c.topics : c.units.flatMap((u) => u.topics)));
      setTopic(topics.find((t) => t.sets.some((s) => s.id === setId)) ?? null);
    }).catch((e) => { if (on) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { on = false; };
  }, [setId]);
  const items = useMemo(() => (topic ? chainOf(topic, setId, videos, draft) : []), [topic, setId, videos, draft]);
  const [i, setI] = useState(0);
  const [started, setStarted] = useState(false);
  // Open on this set's first video, once the chain is known.
  useEffect(() => { if (items.length && !started) { setI(Math.max(0, items.findIndex((x) => x.setId === setId))); setStarted(true); } }, [items, setId, started]);
  const [breather, setBreather] = useState<Item | null>(null);
  const [muted, setMuted] = useState(false);
  const cur = items[i];
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // The stream, the way the site plays it (CramPlayer.tsx): hls.js first, native HLS only where hls.js can't run.
  useEffect(() => {
    const v = video.current;
    const pid = cur?.playbackId;
    if (!v || !pid) return;
    let hls: { destroy: () => void } | null = null;
    let cancelled = false;
    const src = `https://stream.mux.com/${pid}.m3u8`;
    void import("hls.js").then(({ default: Hls }) => {
      if (cancelled || !video.current) return;
      if (Hls.isSupported()) { const h = new Hls(); h.loadSource(src); h.attachMedia(video.current); hls = h; }
      else video.current.src = src;
      void video.current.play().catch(() => { /* the controls invite the tap */ });
    }).catch(() => setErr("The video player could not load."));
    return () => { cancelled = true; hls?.destroy(); };
  }, [cur?.key, cur?.playbackId]);
  // A paid set's playback is withheld from the tree, like it is for students: the preview says so and moves on.
  useEffect(() => {
    if (!cur || cur.playbackId || breather) return;
    const t = window.setTimeout(() => setI((n) => Math.min(items.length - 1, n + 1)), 1500);
    return () => window.clearTimeout(t);
  }, [cur, breather, items.length]);
  const go = (n: number) => { setBreather(null); setI(Math.max(0, Math.min(items.length - 1, n))); };
  const onEnded = () => {
    if (i >= items.length - 1) return;
    if (cur?.breather) setBreather(cur); else go(i + 1);
  };
  const btn: React.CSSProperties = { font: "inherit", fontSize: 12.5, fontWeight: 800, padding: "6px 12px", borderRadius: 8, cursor: "pointer", border: `1px solid ${V3_EDGE}`, background: "transparent", color: V3_CREAM };
  return (
    <div role="dialog" aria-label="Preview the chain" style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(3,6,14,0.94)", color: V3_CREAM, display: "flex", flexDirection: "column", fontFamily: "'Rubik', system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: `1px solid ${V3_EDGE}` }}>
        <b style={{ fontFamily: V3_DISPLAY, fontSize: 20 }}>Preview the chain</b>
        <span style={{ color: V3_MUTED, fontSize: 13 }}>{topic ? `${topic.name} · ${items.length} videos in the order students get them · nothing posts from here` : topic === null ? "This set isn't in a live topic." : "Loading the topic…"}</span>
        <span style={{ flex: 1 }} />
        <button type="button" style={btn} onClick={() => setMuted((m) => !m)}>{muted ? "🔇 Muted" : "🔊 Sound on"}</button>
        <button type="button" style={{ ...btn, borderColor: V3_GOLD, color: V3_GOLD }} onClick={onClose}>✕ Close (Esc)</button>
      </div>
      {err && <div style={{ padding: "8px 18px", color: "#FF6B6B", fontSize: 13 }}>{err}</div>}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 20, padding: 18 }}>
        {/* THE PHONE: the video, the breather over it when one is up */}
        <div style={{ position: "relative", height: "100%", aspectRatio: "9 / 16", maxWidth: "45vw", background: "#000", borderRadius: 16, overflow: "hidden", border: `1px solid ${V3_EDGE}`, flex: "none" }}>
          {cur?.playbackId
            ? <video key={cur.key} ref={video} controls playsInline muted={muted} onEnded={onEnded} style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />
            : <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 24, textAlign: "center", color: V3_MUTED, fontSize: 14 }}>{cur ? `"${cur.setName}" is a paid set — its stream is withheld here, like it is for a student. Skipping ahead…` : "No posted videos in this topic yet."}</div>}
          {breather && (
            <div style={{ position: "absolute", inset: 0 }}>
              <BreatherCard key={breather.key} heading={breather.breather!.heading} body={breather.breather!.body} position={breatherPosition(breather.index, breather.of)} onDone={() => go(i + 1)} />
            </div>
          )}
          {cur && (
            <div style={{ position: "absolute", left: 10, top: 10, fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: V3_GOLD, background: "rgba(0,0,0,0.55)", padding: "4px 8px", borderRadius: 6, pointerEvents: "none" }}>
              {cur.setName.toUpperCase()} · {cur.index + 1} / {cur.of}
            </div>
          )}
        </div>
        {/* THE CHAIN: every video, the breathers between, in order */}
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {items.map((it, n) => (
            <div key={it.key}>
              {(n === 0 || items[n - 1].setId !== it.setId) && <div style={{ fontSize: 11, letterSpacing: "0.14em", fontWeight: 800, color: V3_MUTED, padding: n === 0 ? "2px 6px 6px" : "14px 6px 6px" }}>{it.setName.toUpperCase()}{it.setId === setId ? " · THIS PAGE'S DRAFT BREATHERS" : ""}</div>}
              <button type="button" onClick={() => go(n)}
                style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 9, background: n === i ? "rgba(252,163,17,0.12)" : "rgba(255,255,255,0.03)", border: `1px solid ${n === i ? V3_GOLD : V3_EDGE}` }}>
                <span style={{ width: 22, textAlign: "right", fontWeight: 900, color: n === i ? V3_GOLD : V3_MUTED }}>{n === i ? "▶" : it.index + 1}</span>
                <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
                {!it.playbackId && <span style={{ fontSize: 11, color: V3_MUTED }}>paid · withheld</span>}
                <span style={{ fontSize: 12, color: V3_MUTED }}>{clock(it.runtimeSec)}</span>
              </button>
              {it.breather && (
                <div style={{ margin: "4px 0 2px 32px", padding: "6px 10px", borderLeft: `2px solid ${MINT}`, fontSize: 12.5, color: V3_MUTED }}>
                  <b style={{ color: MINT }}>breather</b> · {it.breather.heading} — {it.breather.body.length > 90 ? `${it.breather.body.slice(0, 88)}…` : it.breather.body}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
