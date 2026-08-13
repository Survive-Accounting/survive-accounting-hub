// VIDEOS TAB (Lee — CEQ Studio) — the product view: every PUBLISHED lesson video
// (has a Mux playback id) on the SAME Obsidian outline grammar as the other tabs:
// Course → Topic (the real courses/chapters spine) → groups (CEQ Free / CEQ Paid /
// Short Promo) → video rows with publish-status dots, inline play, Mux link. The "$"
// toggle adds per-row ENCODING (one-time) + STORAGE (/mo) ESTIMATES from mux-rates.ts
// plus header totals. Delivery cost is watch-time based and deliberately NOT shown.
// Videos whose stored course/chapter strings match no spine row land under "Unfiled".
import { useMemo, useState } from "react";
import { useNodes } from "@xyflow/react";
import { ChevronDown, ChevronRight, DollarSign, ExternalLink, Play, Video } from "lucide-react";

import { courseLabel, topicLabel, type CourseOption } from "@/lib/je-api";
import { fmtDur } from "./ceq-takes";
import { encodingEst, muxAssetUrl, storageEstPerMonth, usd } from "./mux-rates";
import { NEON } from "./theme";
import type { LessonBox } from "./types";

const fmtDate = (ms?: number) => { if (!ms) return "—"; try { return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch { return "—"; } };

type Vid = { id: string; name: string; paid: boolean; short: boolean; playbackId: string; assetId: string | null; duration?: number; publishedAt?: number; course: string; chapter: string };

/** Match a video's stored course string to a spine course (name/code, ci). */
export const vidCourseMatch = (courses: CourseOption[], courseStr: string): CourseOption | undefined =>
  courses.find((c) => [c.course_name, c.code].some((s) => (s ?? "").trim().toLowerCase() === courseStr.trim().toLowerCase()));
/** Match a video's stored chapter/topic string to a spine chapter ("Ch N" → number, else name ci). */
export const vidTopicMatch = (c: CourseOption, chapterStr: string): CourseOption["chapters"][number] | undefined => {
  const m = /ch\s*\.?\s*(\d+)/i.exec(chapterStr);
  if (m) { const t = c.chapters.find((ch) => ch.number === Number(m[1])); if (t) return t; }
  return c.chapters.find((ch) => (ch.name ?? "").trim().toLowerCase() === chapterStr.trim().toLowerCase());
};

/** One video row (name · Free/Paid · status dot · play · Mux link · costs). */
function VidRow({ v, costOn, playing, setPlaying }: { v: Vid; costOn: boolean; playing: string | null; setPlaying: (fn: (p: string | null) => string | null) => void }) {
  return (
    <div className="ml-2">
      <div className="flex items-center gap-1 rounded px-1 py-0.5">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "#3BF5A0" }} title="Published" />
        <button className="grid h-4 w-4 shrink-0 place-items-center" style={{ color: playing === v.id ? NEON.yellow : NEON.muted }} onClick={() => setPlaying((p) => (p === v.id ? null : v.id))} title="Play"><Play className="h-3 w-3" /></button>
        <span className="min-w-0 flex-1 truncate text-[10px]" style={{ color: NEON.text }} title={v.name}>{v.name}</span>
        {v.assetId && <a href={muxAssetUrl(v.assetId)} target="_blank" rel="noreferrer" className="grid h-4 w-4 shrink-0 place-items-center" style={{ color: NEON.cyan }} title="View in Mux"><ExternalLink className="h-3 w-3" /></a>}
      </div>
      <div className="ml-5 flex items-center gap-2 text-[8px] tabular-nums" style={{ color: NEON.muted }}>
        <span>{fmtDur(v.duration)}</span><span>{fmtDate(v.publishedAt)}</span>
        {costOn && <span title="Encoding estimate (one-time)" style={{ color: "#3BF5A0" }}>enc {usd(encodingEst(v.duration))}</span>}
        {costOn && <span title="Storage estimate per month" style={{ color: NEON.yellow }}>{usd(storageEstPerMonth(v.duration))}/mo</span>}
      </div>
      {playing === v.id && <div className="ml-5 my-1"><video controls playsInline autoPlay poster={`https://image.mux.com/${v.playbackId}/thumbnail.jpg?time=1`} src={`https://stream.mux.com/${v.playbackId}/high.mp4`} style={{ width: "100%", borderRadius: 6, background: "#000", aspectRatio: "16 / 9" }} /></div>}
    </div>
  );
}

export function CeqVideoLibrary({ courses, costOn, onToggleCost }: { courses: CourseOption[]; costOn: boolean; onToggleCost: () => void }) {
  const nodes = useNodes();
  const [playing, setPlaying] = useState<string | null>(null);
  // COLLAPSED BY DEFAULT — absent key = closed (was an inverted "collapsed" set, i.e.
  // everything open). Still component-local, exactly as before: the Videos tab unmounts
  // on tab switch, so this is a per-visit view state, not a persisted preference.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const vids = useMemo(() => nodes
    .filter((n) => n.type === "lesson" && !!(n.data as { muxPlaybackId?: string | null }).muxPlaybackId)
    .map((n) => { const d = n.data as unknown as LessonBox; return { id: n.id, name: d.label || "Lesson", paid: (d.access ?? "FREE") === "PAID", short: false, playbackId: d.muxPlaybackId as string, assetId: d.muxAssetId ?? null, duration: d.muxDurationS, publishedAt: d.muxPublishedAt, course: d.videoCourse || "Course", chapter: d.videoChapter || d.topic || "—" } as Vid; }), [nodes]);

  // Spine placement: courseId → topicId → vids; misses go to "Unfiled".
  const { byTopic, unfiled } = useMemo(() => {
    const byTopic = new Map<string, Vid[]>();
    const unfiled: Vid[] = [];
    for (const v of vids) {
      const c = vidCourseMatch(courses, v.course);
      const t = c ? vidTopicMatch(c, v.chapter) : undefined;
      if (t) { const l = byTopic.get(t.id) ?? []; l.push(v); byTopic.set(t.id, l); } else unfiled.push(v);
    }
    return { byTopic, unfiled };
  }, [vids, courses]);

  const totalEnc = vids.reduce((s, v) => s + encodingEst(v.duration), 0);
  const totalStore = vids.reduce((s, v) => s + storageEstPerMonth(v.duration), 0);
  const toggle = (k: string) => setExpanded((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  /** The Free / Paid / Short Promo groups under one topic (only non-empty render). */
  const groupsOf = (rows: Vid[]) => [
    { label: "CEQ Free", rows: rows.filter((v) => !v.paid && !v.short) },
    { label: "CEQ Paid", rows: rows.filter((v) => v.paid && !v.short) },
    { label: "Short Promo", rows: rows.filter((v) => v.short) },
  ].filter((g) => g.rows.length > 0);

  return (
    <>
      <div className="flex shrink-0 items-center gap-1.5 border-b px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ borderColor: NEON.borderSoft, color: NEON.cyan }}>
        <Video className="h-3 w-3" /> Videos <span style={{ color: NEON.muted }}>({vids.length})</span>
        <button className="ml-auto grid h-5 w-5 place-items-center rounded" style={{ color: costOn ? "#3BF5A0" : NEON.muted, border: `1px solid ${costOn ? "rgba(59,245,160,0.5)" : NEON.borderSoft}` }} onClick={onToggleCost} title="Toggle cost estimates"><DollarSign className="h-3 w-3" /></button>
      </div>
      {costOn && vids.length > 0 && (
        <div className="shrink-0 border-b px-2 py-1 text-[8.5px] leading-snug" style={{ borderColor: NEON.borderSoft, color: NEON.muted }}>
          <span style={{ color: "#3BF5A0" }}>Encoding to date: {usd(totalEnc)}</span> · <span style={{ color: NEON.yellow }}>Storage: {usd(totalStore)}/mo</span> <span className="opacity-70">(estimate)</span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {vids.length === 0 && <div className="px-1.5 py-2 text-[9.5px] italic" style={{ color: NEON.muted }}>No published videos yet — publish a set (Free/Full) and it appears here.</div>}
        {courses.map((c) => {
          const cVids = c.chapters.reduce((s, ch) => s + (byTopic.get(ch.id)?.length ?? 0), 0);
          if (cVids === 0) return null;
          const cKey = `c:${c.id}`;
          const cOpen = expanded.has(cKey);
          return (
            <div key={c.id} className="mb-1">
              <button className="flex w-full items-center gap-1 px-0.5 pt-1 text-left text-[9px] font-bold uppercase tracking-wider" style={{ color: NEON.yellow }} onClick={() => toggle(cKey)}>{cOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} {courseLabel(c)} <span className="opacity-60">({cVids})</span></button>
              {cOpen && c.chapters.map((ch) => {
                const rows = byTopic.get(ch.id) ?? [];
                if (rows.length === 0) return null;
                const tKey = `t:${ch.id}`;
                const tOpen = expanded.has(tKey);
                return (
                  <div key={ch.id} className="ml-1.5">
                    <button className="flex w-full items-center gap-1 px-0.5 py-0.5 text-left text-[9px] font-bold uppercase" style={{ color: NEON.muted }} onClick={() => toggle(tKey)}>{tOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} {topicLabel(ch)} <span className="opacity-60">({rows.length})</span></button>
                    {tOpen && groupsOf(rows).map((g) => (
                      <div key={g.label} className="ml-2">
                        <div className="px-0.5 text-[7.5px] font-bold uppercase tracking-wide" style={{ color: g.label === "CEQ Paid" ? "#FF8B9E" : g.label === "CEQ Free" ? "#3BF5A0" : NEON.cyan }}>{g.label}</div>
                        {g.rows.map((v) => <VidRow key={v.id} v={v} costOn={costOn} playing={playing} setPlaying={setPlaying} />)}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
        {unfiled.length > 0 && (
          <div className="mt-1 border-t pt-1" style={{ borderColor: NEON.borderSoft }}>
            <div className="px-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Unfiled ({unfiled.length})</div>
            {unfiled.map((v) => <VidRow key={v.id} v={v} costOn={costOn} playing={playing} setPlaying={setPlaying} />)}
          </div>
        )}
      </div>
      {costOn && <div className="shrink-0 border-t px-2 py-1 text-[8px] italic leading-snug" style={{ borderColor: NEON.borderSoft, color: NEON.muted }}>Estimates only. Delivery billed on watch time — not shown.</div>}
    </>
  );
}
