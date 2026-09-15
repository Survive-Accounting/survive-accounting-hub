// ONE STITCHED VIDEO: watch it again, trim its start and end, trim the outro so it lands right, download either
// version, queue it to post. Lee, 2026-09-15: "I want to be able to trim the intro or outro. For example, I want
// to trim a bit off the outro sometimes, so it lands on the right spot … I want to be able to download the
// preview too, so I can view it that way, share it with team."
//
// The player plays the untouched stitch clamped to the trim, so what plays is what will be cut. Save trims makes
// the real files on the worker (the site video, and the social one with the outro).
import { useEffect, useRef, useState } from "react";

import { clampTrim, clock, isTrimmed, money, type StitchRecord } from "@/lib/film-stitch";
import { queueFilmStitch } from "@/lib/film-stitch.functions";

import { ROOM } from "./room-theme";
import { applyTrims, downloadVideo, readOutroClip } from "./stitch-render";

export function VideoDesk({ record, onChange }: { record: StitchRecord; onChange: (r: StitchRecord) => void }) {
  const video = useRef<HTMLVideoElement | null>(null);
  const [view, setView] = useState<"site" | "social">("site");
  const [dur, setDur] = useState<number>(record.durationS ?? 0);
  const [start, setStart] = useState(record.trimStartS);
  const [end, setEnd] = useState(record.trimEndS ?? record.durationS ?? 0);
  const [outroTrim, setOutroTrim] = useState(record.outroTrimS);
  const [work, setWork] = useState<{ note: string; tone: "work" | "good" | "bad" } | null>(null);
  const outro = readOutroClip();

  useEffect(() => {
    setStart(record.trimStartS); setEnd(record.trimEndS ?? record.durationS ?? 0); setOutroTrim(record.outroTrimS);
    setDur(record.durationS ?? 0); setView("site"); setWork(null);
  }, [record.id, record.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const src = view === "social" && record.socialUrl ? record.socialUrl : record.sourceUrl;
  const clamped = view === "site";
  const dirty = Math.abs(start - record.trimStartS) > 0.01 || Math.abs(end - (record.trimEndS ?? dur)) > 0.01 || Math.abs(outroTrim - record.outroTrimS) > 0.01;

  // the site view plays inside the trim
  const onTime = () => {
    const v = video.current;
    if (!v || !clamped) return;
    if (v.currentTime < start - 0.05) v.currentTime = start;
    if (end > 0 && v.currentTime >= end) { v.pause(); v.currentTime = end; }
  };
  const seek = (t: number, play = true) => { const v = video.current; if (!v) return; v.currentTime = Math.max(0, t); if (play) void v.play(); };
  const set = (s: number, e: number) => { const c = clampTrim(s, e, dur || e); setStart(c.startS); setEnd(c.endS); };

  const save = async () => {
    setWork({ note: "starting…", tone: "work" });
    try {
      const saved = await applyTrims(record, { startS: start, endS: end || dur, outroTrimS: outroTrim, withSocial: !!outro }, (note) => setWork({ note, tone: "work" }));
      onChange(saved);
      setWork({ note: outro ? "✓ trims saved — site and social versions made" : "✓ trims saved", tone: "good" });
    } catch (e) { setWork({ note: e instanceof Error ? e.message : String(e), tone: "bad" }); }
  };
  const toggleQueue = async () => {
    try { onChange(await queueFilmStitch({ data: { id: record.id, queued: record.status !== "queued" } })); }
    catch (e) { setWork({ note: e instanceof Error ? e.message : String(e), tone: "bad" }); }
  };

  const btn = (strong = false, tone: string = ROOM.gold): React.CSSProperties => ({ font: "inherit", fontSize: 12, fontWeight: 800, padding: "6px 11px", borderRadius: 8, cursor: "pointer", border: `1px solid ${strong ? tone : ROOM.edge}`, background: strong ? tone : "transparent", color: strong ? "#14213D" : ROOM.cream, whiteSpace: "nowrap" });
  const nudge = (label: string, f: () => void) => <button type="button" style={{ ...btn(), padding: "3px 7px" }} onClick={f}>{label}</button>;
  const busy = work?.tone === "work";

  return (
    <div style={{ display: "flex", gap: 22, flexWrap: "wrap", color: ROOM.cream, fontFamily: ROOM.font }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" style={btn(view === "site", ROOM.sky)} onClick={() => setView("site")}>Site video</button>
          <button type="button" style={btn(view === "social", ROOM.sky)} disabled={!record.socialUrl} onClick={() => setView("social")} title={record.socialUrl ? "With the outro, for Reels / TikTok / Shorts" : "Save trims to make the social version"}>Social + outro</button>
        </div>
        <video ref={video} key={src} src={src} controls playsInline onTimeUpdate={onTime}
          onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (view === "site" && Number.isFinite(d)) { setDur(d); if (!record.trimEndS && !end) setEnd(d); } if (clamped && start > 0) e.currentTarget.currentTime = start; }}
          style={{ width: 300, aspectRatio: "9 / 16", background: "#000", borderRadius: 14, border: `1px solid ${ROOM.edge}` }} />
      </div>

      <div style={{ flex: 1, minWidth: 300, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.1 }}>{record.name || `Video ${record.takeIndex + 1}`}</div>
          <div style={{ color: ROOM.muted, fontSize: 13, marginTop: 3 }}>{record.setName} · Video {record.takeIndex + 1} · {record.slides} slides · <span style={{ color: ROOM.mint, fontWeight: 800 }}>{money(record.payCents)}</span> · stitched {new Date(record.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, color: record.status === "posted" ? ROOM.mint : record.status === "queued" ? ROOM.gold : ROOM.muted }}>
            {record.status === "posted" ? <>✓ Posted{record.postedLink && <> — <a href={record.postedLink} target="_blank" rel="noreferrer" style={{ color: ROOM.mint }}>see it</a></>}</> : record.status === "queued" ? "In the post queue" : "Not queued"}
          </div>
        </div>

        {/* TRIM */}
        <div style={{ background: ROOM.panel, border: `1px solid ${ROOM.edge}`, borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <b>Trim</b>
            <span style={{ color: ROOM.muted, fontSize: 12 }}>{clock(start)} → {clock(end || dur)} · keeps {clock(Math.max(0, (end || dur) - start))} of {clock(dur)}</span>
          </div>
          <label style={{ fontSize: 12, color: ROOM.muted, display: "flex", flexDirection: "column", gap: 4 }}>Start
            <input type="range" min={0} max={dur || 1} step={0.05} value={start} onChange={(e) => { set(Number(e.target.value), end || dur); seek(Number(e.target.value), false); }} />
            <span style={{ display: "flex", gap: 4 }}>
              {nudge("−0.1", () => set(start - 0.1, end || dur))}{nudge("+0.1", () => set(start + 0.1, end || dur))}
              {nudge("Start here", () => set(video.current?.currentTime ?? start, end || dur))}
              {nudge("▶ from start", () => seek(start))}
            </span>
          </label>
          <label style={{ fontSize: 12, color: ROOM.muted, display: "flex", flexDirection: "column", gap: 4 }}>End
            <input type="range" min={0} max={dur || 1} step={0.05} value={end || dur} onChange={(e) => { set(start, Number(e.target.value)); seek(Math.max(start, Number(e.target.value) - 0.05), false); }} />
            <span style={{ display: "flex", gap: 4 }}>
              {nudge("−0.1", () => set(start, (end || dur) - 0.1))}{nudge("+0.1", () => set(start, (end || dur) + 0.1))}
              {nudge("End here", () => set(start, video.current?.currentTime ?? end))}
              {nudge("▶ last 3 s", () => { setView("site"); seek(Math.max(start, (end || dur) - 3)); })}
            </span>
          </label>
          {outro ? (
            <label style={{ fontSize: 12, color: ROOM.muted, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>Cut off the end of the outro
              {nudge("−0.1", () => setOutroTrim((v) => Math.max(0, Math.round((v - 0.1) * 100) / 100)))}
              <b style={{ color: ROOM.cream, minWidth: 44, textAlign: "center" }}>{outroTrim.toFixed(1)} s</b>
              {nudge("+0.1", () => setOutroTrim((v) => Math.min(outro.durationS - 0.5, Math.round((v + 0.1) * 100) / 100)))}
              <span>of {outro.durationS.toFixed(1)} s — the social version ends on it</span>
            </label>
          ) : <div style={{ fontSize: 12, color: ROOM.muted }}>No outro clip kept in this browser — film the outro slide once in punch-in for a social version.</div>}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" style={btn(true)} disabled={busy || (!dirty && (!!record.socialUrl || !outro))} onClick={() => void save()}>
              {dirty ? "Save trims" : record.socialUrl || !outro ? "Trims saved" : "Make social version"}
            </button>
            {isTrimmed(record) && <span style={{ fontSize: 12, color: ROOM.muted }}>trimmed file in use</span>}
            {work && <span style={{ fontSize: 12, color: work.tone === "good" ? ROOM.mint : work.tone === "bad" ? ROOM.red : ROOM.gold }}>{work.note}</span>}
          </div>
        </div>

        {/* DOWNLOAD · QUEUE */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={btn()} onClick={() => void downloadVideo(record.fileUrl, record.name, false)} title={dirty ? "Downloads the last saved trim" : undefined}>⬇ Download</button>
          <button type="button" style={btn()} disabled={!record.socialUrl} onClick={() => record.socialUrl && void downloadVideo(record.socialUrl, record.name, true)}>⬇ Download social</button>
          <span style={{ flex: 1 }} />
          {record.status !== "posted" && (
            <button type="button" style={btn(record.status !== "queued")} disabled={busy} onClick={() => void toggleQueue()}
              title={dirty ? "Save the trims first, or it posts the last saved version" : undefined}>
              {record.status === "queued" ? "Take out of the post queue" : "Queue to post →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
