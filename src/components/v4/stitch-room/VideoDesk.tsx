// ONE STITCHED VIDEO: watch it again, trim its start and end, trim the outro so it lands right, download either
// version, queue it to post. Lee, 2026-09-15: "I want to be able to trim the intro or outro. For example, I want
// to trim a bit off the outro sometimes, so it lands on the right spot … I want to be able to download the
// preview too, so I can view it that way, share it with team."
//
// The player plays the untouched stitch clamped to the trim, so what plays is what will be cut. Save trims makes
// the real files on the worker (the site video, and the social one with the outro).
import { useEffect, useRef, useState } from "react";

import { clampTrim, clock, isTrimmed, money, videoTitle, type StitchRecord } from "@/lib/film-stitch";
import { deleteFilmStitch, queueFilmStitch } from "@/lib/film-stitch.functions";
import { redoInFilm } from "../../blastoff/capture/film-nav";
import { track } from "@/lib/analytics";

import { ROOM } from "./room-theme";
import { applyTrims, downloadVideo, readOutroClip } from "./stitch-render";

export function VideoDesk({ record, onChange, onDeleted }: { record: StitchRecord; onChange: (r: StitchRecord) => void; onDeleted?: (r: StitchRecord) => void }) {
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
  // REDO (Lee, 2026-09-15: "I click it, it opens that exact point with film pop out opened (or if film pop out already
  // open, then navigate there) and I can just roll right in.") and DELETE (click twice).
  const [armedDelete, setArmedDelete] = useState(false);
  useEffect(() => { if (!armedDelete) return; const t = window.setTimeout(() => setArmedDelete(false), 3000); return () => window.clearTimeout(t); }, [armedDelete]);
  const redo = () => {
    if (!record.topicKey || !record.setKey) { setWork({ note: "This video was stitched before Redo knew its page — open it from the Film list.", tone: "bad" }); return; }
    const r = redoInFilm({ topicKey: record.topicKey, setKey: record.setKey, setId: record.setId, takeIndex: record.takeIndex });
    track("stitch_redo", { set_id: record.setId, video: record.takeIndex + 1, how: r });
    setWork(r === "blocked" ? { note: "The browser blocked the new tab — allow pop-ups for this site.", tone: "bad" } : { note: r === "sent" ? `Film is on #${record.takeIndex + 1} — roll right in.` : "Opened the film page on this video — pop out from there.", tone: "good" });
  };
  const remove = async () => {
    if (!armedDelete) { setArmedDelete(true); return; }
    setArmedDelete(false);
    try { await deleteFilmStitch({ data: { id: record.id } }); track("stitch_deleted", { set_id: record.setId, video: record.takeIndex + 1 }); onDeleted?.(record); }
    catch (e) { setWork({ note: e instanceof Error ? e.message : String(e), tone: "bad" }); }
  };

  // QUEUEING, with something to watch (Lee, 2026-09-15: "Better loading animation for Add to post queue").
  const [queueing, setQueueing] = useState<null | "adding" | "removing">(null);
  const [landed, setLanded] = useState(0);
  const toggleQueue = async () => {
    const adding = record.status !== "queued";
    setQueueing(adding ? "adding" : "removing");
    const started = Date.now();
    try {
      const saved = await queueFilmStitch({ data: { id: record.id, queued: adding } });
      await new Promise((r) => setTimeout(r, Math.max(0, 650 - (Date.now() - started)))); // long enough to see it fly
      onChange(saved);
      if (adding) { setLanded((n) => n + 1); track("stitch_queued", { set_id: record.setId, video: record.takeIndex + 1 }); }
    } catch (e) { setWork({ note: e instanceof Error ? e.message : String(e), tone: "bad" }); }
    finally { setQueueing(null); }
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
          <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.1 }}>{videoTitle(record.takeIndex, record.name)}</div>
          <div style={{ color: ROOM.muted, fontSize: 13, marginTop: 3 }}>{record.setName} · {record.slides} slides · <span style={{ color: ROOM.mint, fontWeight: 800 }}>{money(record.payCents)}</span> · stitched {new Date(record.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
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
          <button type="button" style={{ ...btn(), color: ROOM.sky, borderColor: `${ROOM.sky}88` }} onClick={redo} title="Film this video again: the film page and the pop-out go straight to it">↺ Redo in film</button>
          <button type="button" style={{ ...btn(armedDelete, ROOM.red), ...(armedDelete ? {} : { color: ROOM.red }) }} onClick={() => void remove()}
            title="Delete this stitch (its pay comes off the ledger). The takes stay in punch-in.">{armedDelete ? "Click again to delete" : "Delete stitch"}</button>
          <span style={{ flex: 1 }} />
          {record.status !== "posted" && (
            <button type="button" disabled={busy || !!queueing} onClick={() => void toggleQueue()}
              className={queueing === "adding" ? "sa-q-going" : landed && record.status === "queued" ? "sa-q-landed" : undefined}
              key={`q-${landed}`}
              style={{ ...btn(record.status !== "queued" && !queueing), position: "relative", overflow: "hidden", minWidth: 190, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                ...(record.status === "queued" && !queueing ? { color: ROOM.mint, borderColor: `${ROOM.mint}88` } : {}) }}
              title={dirty ? "Save the trims first, or it posts the last saved version" : undefined}>
              <style>{QUEUE_CSS}</style>
              {queueing === "adding" && <><span className="sa-q-bar" /><span className="sa-q-card" aria-hidden /> Adding to the queue…</>}
              {queueing === "removing" && <><span className="sa-q-spin" aria-hidden /> Taking it out…</>}
              {!queueing && (record.status === "queued" ? <>✓ In the post queue <span style={{ color: ROOM.muted, fontWeight: 600 }}>· remove</span></> : "Queue to post →")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const QUEUE_CSS = `
@keyframes sa-q-bar { from { transform: translateX(-100%) } to { transform: translateX(100%) } }
.sa-q-bar { position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(252,163,17,0.35), transparent); animation: sa-q-bar 700ms ease-in-out infinite; pointer-events: none; }
@keyframes sa-q-card { 0% { transform: translate(0, 0) scale(1) rotate(0); opacity: 1 } 70% { transform: translate(26px, -14px) scale(0.7) rotate(12deg); opacity: 1 } 100% { transform: translate(34px, -18px) scale(0.5) rotate(16deg); opacity: 0 } }
.sa-q-card { width: 10px; height: 14px; border-radius: 2px; background: #FCA311; box-shadow: 0 0 10px rgba(252,163,17,0.8); animation: sa-q-card 650ms cubic-bezier(0.3, 0.7, 0.4, 1) infinite; }
@keyframes sa-q-spin { to { transform: rotate(360deg) } }
.sa-q-spin { width: 12px; height: 12px; border-radius: 999px; border: 2px solid currentColor; border-top-color: transparent; animation: sa-q-spin 700ms linear infinite; }
@keyframes sa-q-land { 0% { transform: scale(0.94); box-shadow: 0 0 0 0 rgba(59,245,160,0.7) } 60% { transform: scale(1.04); box-shadow: 0 0 0 10px rgba(59,245,160,0) } 100% { transform: scale(1); box-shadow: none } }
.sa-q-landed { animation: sa-q-land 520ms cubic-bezier(0.2, 0.9, 0.3, 1.2); }
@media (prefers-reduced-motion: reduce) { .sa-q-bar, .sa-q-card, .sa-q-landed { animation: none; } }
`;