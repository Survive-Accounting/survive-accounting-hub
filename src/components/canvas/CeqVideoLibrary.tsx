// VIDEO LIBRARY (Lee — CEQ Studio) — the leftmost collapsible panel: every PUBLISHED
// lesson video (has a Mux playback id), grouped Course → Chapter/Topic. Each row: name,
// Free/Paid badge, duration, publish date, an inline play, and a "View in Mux" link.
// A "$" header toggle (off by default) adds per-row ENCODING (one-time) + STORAGE
// (/mo) ESTIMATES from the stored duration × the rates in mux-rates.ts, plus header
// totals. Delivery/streaming cost is watch-time based and deliberately NOT estimated.
import { useMemo, useState } from "react";
import { useNodes } from "@xyflow/react";
import { ChevronDown, ChevronRight, DollarSign, ExternalLink, Play, Video } from "lucide-react";

import { fmtDur } from "./ceq-takes";
import { encodingEst, muxAssetUrl, storageEstPerMonth, usd } from "./mux-rates";
import { NEON } from "./theme";
import type { LessonBox } from "./types";

const fmtDate = (ms?: number) => { if (!ms) return "—"; try { return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch { return "—"; } };

export function CeqVideoLibrary({ open, onToggle, costOn, onToggleCost }: { open: boolean; onToggle: () => void; costOn: boolean; onToggleCost: () => void }) {
  const nodes = useNodes();
  const [playing, setPlaying] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const vids = useMemo(() => nodes
    .filter((n) => n.type === "lesson" && !!(n.data as { muxPlaybackId?: string | null }).muxPlaybackId)
    .map((n) => { const d = n.data as unknown as LessonBox; return { id: n.id, name: d.label || "Lesson", paid: (d.access ?? "FREE") === "PAID", playbackId: d.muxPlaybackId as string, assetId: d.muxAssetId ?? null, duration: d.muxDurationS, publishedAt: d.muxPublishedAt, course: d.videoCourse || "Course", chapter: d.videoChapter || d.topic || "—" }; }), [nodes]);

  // group Course → Chapter (stable order by first appearance).
  const groups = useMemo(() => {
    const byCourse = new Map<string, Map<string, typeof vids>>();
    for (const v of vids) {
      if (!byCourse.has(v.course)) byCourse.set(v.course, new Map());
      const ch = byCourse.get(v.course)!;
      if (!ch.has(v.chapter)) ch.set(v.chapter, []);
      ch.get(v.chapter)!.push(v);
    }
    return [...byCourse.entries()].map(([course, chs]) => ({ course, chapters: [...chs.entries()].map(([chapter, rows]) => ({ chapter, rows })) }));
  }, [vids]);

  const totalEnc = vids.reduce((s, v) => s + encodingEst(v.duration), 0);
  const totalStore = vids.reduce((s, v) => s + storageEstPerMonth(v.duration), 0);
  const toggleGroup = (k: string) => setCollapsed((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  if (!open) {
    return (
      <button className="flex w-8 shrink-0 flex-col items-center gap-2 rounded-lg py-2" style={{ border: `1px solid ${NEON.borderSoft}`, background: "rgba(0,0,0,0.2)", color: NEON.cyan }} onClick={onToggle} title="Show the video library">
        <Video className="h-4 w-4" />
        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ writingMode: "vertical-rl" }}>Videos ({vids.length})</span>
      </button>
    );
  }

  return (
    <div className="flex min-h-0 w-52 shrink-0 flex-col overflow-hidden rounded-lg" style={{ border: `1px solid ${NEON.borderSoft}`, background: "rgba(0,0,0,0.2)" }}>
      <div className="flex shrink-0 items-center gap-1.5 border-b px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ borderColor: NEON.borderSoft, color: NEON.cyan }}>
        <Video className="h-3 w-3" /> Videos <span style={{ color: NEON.muted }}>({vids.length})</span>
        <button className="ml-auto grid h-5 w-5 place-items-center rounded" style={{ color: costOn ? "#3BF5A0" : NEON.muted, border: `1px solid ${costOn ? "rgba(59,245,160,0.5)" : NEON.borderSoft}` }} onClick={onToggleCost} title="Toggle cost estimates"><DollarSign className="h-3 w-3" /></button>
        <button className="grid h-5 w-5 place-items-center rounded" style={{ color: NEON.muted }} onClick={onToggle} title="Collapse the video library"><ChevronRight className="h-3.5 w-3.5" /></button>
      </div>
      {costOn && vids.length > 0 && (
        <div className="shrink-0 border-b px-2 py-1 text-[8.5px] leading-snug" style={{ borderColor: NEON.borderSoft, color: NEON.muted }}>
          <span style={{ color: "#3BF5A0" }}>Encoding to date: {usd(totalEnc)}</span> · <span style={{ color: NEON.yellow }}>Storage: {usd(totalStore)}/mo</span> <span className="opacity-70">(estimate)</span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {vids.length === 0 && <div className="px-1.5 py-2 text-[9.5px] italic" style={{ color: NEON.muted }}>No published videos yet — publish a set (Free/Full) and it appears here.</div>}
        {groups.map((g) => (
          <div key={g.course} className="mb-1">
            <div className="px-0.5 pt-1 text-[9px] font-bold uppercase tracking-wider" style={{ color: NEON.yellow }}>{g.course}</div>
            {g.chapters.map((ch) => { const key = `${g.course}␟${ch.chapter}`; const col = collapsed.has(key); return (
              <div key={key}>
                <button className="flex w-full items-center gap-1 px-0.5 py-0.5 text-left text-[9px] font-bold uppercase" style={{ color: NEON.muted }} onClick={() => toggleGroup(key)}>{col ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} {ch.chapter} <span className="opacity-60">({ch.rows.length})</span></button>
                {!col && ch.rows.map((v) => (
                  <div key={v.id} className="ml-2">
                    <div className="flex items-center gap-1 rounded px-1 py-0.5">
                      <button className="grid h-4 w-4 shrink-0 place-items-center" style={{ color: playing === v.id ? NEON.yellow : NEON.muted }} onClick={() => setPlaying((p) => (p === v.id ? null : v.id))} title="Play"><Play className="h-3 w-3" /></button>
                      <span className="min-w-0 flex-1 truncate text-[10px]" style={{ color: NEON.text }} title={v.name}>{v.name}</span>
                      <span className="shrink-0 rounded px-1 text-[7px] font-bold uppercase" style={v.paid ? { color: "#FF8B9E", border: "1px solid rgba(255,92,108,0.5)" } : { color: "#3BF5A0", border: "1px solid rgba(59,245,160,0.5)" }}>{v.paid ? "Paid" : "Free"}</span>
                      {v.assetId && <a href={muxAssetUrl(v.assetId)} target="_blank" rel="noreferrer" className="grid h-4 w-4 shrink-0 place-items-center" style={{ color: NEON.cyan }} title="View in Mux"><ExternalLink className="h-3 w-3" /></a>}
                    </div>
                    <div className="ml-5 flex items-center gap-2 text-[8px] tabular-nums" style={{ color: NEON.muted }}>
                      <span>{fmtDur(v.duration)}</span><span>{fmtDate(v.publishedAt)}</span>
                      {costOn && <span title="Encoding estimate (one-time)" style={{ color: "#3BF5A0" }}>enc {usd(encodingEst(v.duration))}</span>}
                      {costOn && <span title="Storage estimate per month" style={{ color: NEON.yellow }}>{usd(storageEstPerMonth(v.duration))}/mo</span>}
                    </div>
                    {playing === v.id && <div className="ml-5 my-1"><video controls playsInline autoPlay poster={`https://image.mux.com/${v.playbackId}/thumbnail.jpg?time=1`} src={`https://stream.mux.com/${v.playbackId}/high.mp4`} style={{ width: "100%", borderRadius: 6, background: "#000", aspectRatio: "16 / 9" }} /></div>}
                  </div>
                ))}
              </div>
            ); })}
          </div>
        ))}
      </div>
      {costOn && <div className="shrink-0 border-t px-2 py-1 text-[8px] italic leading-snug" style={{ borderColor: NEON.borderSoft, color: NEON.muted }}>Estimates only. Delivery billed on watch time — not shown.</div>}
    </div>
  );
}
