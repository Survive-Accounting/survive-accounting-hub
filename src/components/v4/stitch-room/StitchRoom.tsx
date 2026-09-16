// THE STITCH ROOM — the popout every stitch opens in. Lee, 2026-09-15: "the next stitch I do? Let me view it
// from the same popout... I can just switch between each video in that pop out. So it can have a collapsible menu
// that shows each stitched video and then the upcoming incomplete videos still in process … Put a settings icon
// at top left though, and let me toggle this animation off."
//
// The stitching itself runs in the film tab (capture/stitch-queue.ts); this window hears it on a BroadcastChannel
// and reads the saved videos from film_stitches.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { inVideoOrder, isPlaceholderName, money, statsFor, videoKey, videoTitle, type StitchRecord } from "@/lib/film-stitch";
import { listFilmStitches } from "@/lib/film-stitch.functions";
import { loadV4VideoBriefs, type V4VideoBrief } from "@/lib/v4.functions";

import { STITCH_CHANNEL, type StitchJob, type StitchMessage } from "../../blastoff/capture/stitch-queue";
import { FilmStats } from "./FilmStats";
import { PostQueue } from "./PostQueue";
import { readAnimOn, ROOM, writeAnimOn } from "./room-theme";
import { StitchBuild } from "./StitchBuild";
import { VideoDesk } from "./VideoDesk";
import { openDemoLens } from "../DemoLens";
import { redoInFilm } from "../../blastoff/capture/film-nav";

type Tab = "videos" | "queue" | "stats";

export function StitchRoom({ initialKey }: { initialKey?: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["film-stitches"], queryFn: () => listFilmStitches(), staleTime: 10_000, retry: false });
  const records = q.data ?? [];
  // EVERY FILM WINDOW'S JOBS, kept apart (one window's empty list never wipes another's), newest word per video.
  const [byTab, setByTab] = useState<Record<string, { at: number; jobs: StitchJob[] }>>({});
  /** Stopped stitches cleared from this window (the film tab that owned them may be gone). */
  const [cleared, setCleared] = useState<string[]>([]);
  const [clockTick, setClockTick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => setClockTick((n) => n + 1), 4000); return () => window.clearInterval(t); }, []);
  const jobs = useMemo(() => {
    const now = Date.now();
    const best = new Map<string, StitchJob & { _at: number }>();
    for (const { at, jobs: list } of Object.values(byTab)) {
      const gone = now - at > 12_000;
      for (const j of list) {
        // a film window that went quiet mid-stitch was closed or reloaded: that stitch stopped
        const job = gone && j.state !== "done" && j.state !== "error" ? { ...j, state: "error" as const, error: "The film tab closed before this finished — stitch it again from punch-in.", note: "stopped" } : j;
        const prev = best.get(j.key);
        if (!prev || at >= prev._at) best.set(j.key, { ...job, _at: at });
      }
    }
    return [...best.values()].filter((j) => !cleared.includes(j.key)).sort((a, b) => a.queuedAt - b.queuedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byTab, clockTick, cleared]);
  const [heard, setHeard] = useState(false);
  const [sel, setSel] = useState<string | null>(initialKey ?? null);
  const [tab, setTab] = useState<Tab>("videos");
  const [menu, setMenu] = useState(true);
  const [anim, setAnim] = useState(true);
  const [gear, setGear] = useState(false);
  useEffect(() => setAnim(readAnimOn()), []);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(STITCH_CHANNEL);
    ch.onmessage = (e: MessageEvent<StitchMessage>) => {
      const m = e.data;
      if (m?.type === "state") { setByTab((s) => ({ ...s, [m.tab ?? "legacy"]: { at: m.at ?? Date.now(), jobs: m.jobs } })); setHeard(true); }
      if (m?.type === "focus") { setSel(m.key); setTab("videos"); }
      if (m?.type === "saved") void qc.invalidateQueries({ queryKey: ["film-stitches"] });
    };
    ch.postMessage({ type: "hello" } satisfies StitchMessage);
    return () => ch.close();
  }, [qc]);

  const upsert = (r?: StitchRecord) => {
    if (r) qc.setQueryData<StitchRecord[]>(["film-stitches"], (old) => { const list = old ?? []; return list.some((x) => x.id === r.id) ? list.map((x) => (x.id === r.id ? r : x)) : [r, ...list]; });
    // a queue change can move other videos' places too
    void qc.invalidateQueries({ queryKey: ["film-stitches"] });
  };

    // WHICH VIDEO IS WHICH (Lee, 2026-09-16: "I'm having trouble knowing which stitch is which video. They're all
  // marked A = L + E effects"): every set in the room loads its videos' briefs — the cut's name, the slides it
  // covers, and what those slides say — so a video saved under the set's name (or "Split N") is named by its
  // cut, and every row says "Slides 12–18 · How do you increase Cash?" under the title.
  const [briefs, setBriefs] = useState<Record<string, V4VideoBrief[] | null>>({});
  const needBriefs = useMemo(() => [...new Set([...records, ...jobs].map((x) => x.setId))], [records, jobs]);
  useEffect(() => {
    for (const setId of needBriefs) {
      if (setId in briefs) continue;
      setBriefs((m) => ({ ...m, [setId]: null }));
      loadV4VideoBriefs({ data: { setId } }).then((s) => setBriefs((m) => ({ ...m, [setId]: s }))).catch(() => { /* stays #N */ });
    }
  }, [needBriefs]); // eslint-disable-line react-hooks/exhaustive-deps
  const briefFor = (x: { setId: string; takeIndex: number }): V4VideoBrief | undefined => briefs[x.setId]?.find((b) => b.index === x.takeIndex);
  const nameFor = (x: { setId: string; takeIndex: number; name: string; setName: string | null }) => (isPlaceholderName(x.name) || x.name.trim() === (x.setName ?? "").trim() ? (briefFor(x)?.name ?? "") : x.name);
  const titleFor = (x: { setId: string; takeIndex: number; name: string; setName: string | null }) => videoTitle(x.takeIndex, nameFor(x));
  const subFor = (x: { setId: string; takeIndex: number; setName: string | null }, tail: string) => { const b = briefFor(x); return b ? `${briefLine(b)} · ${tail}` : `${x.setName ?? ""} · ${tail}`; };
  const named = useMemo(() => records.map((r) => (isPlaceholderName(r.name) || r.name.trim() === (r.setName ?? "").trim() ? { ...r, name: briefs[r.setId]?.find((b) => b.index === r.takeIndex)?.name ?? (isPlaceholderName(r.name) ? "" : r.name) } : r)), [records, briefs]);

  const byKey = useMemo(() => new Map(named.map((r) => [videoKey(r.setId, r.takeIndex), r])), [named]);
  const inProgress = jobs.filter((j) => j.state !== "done" || !byKey.has(j.key));
  // default: the newest job still going, else the newest video
  useEffect(() => {
    if (sel) return;
    const live = [...jobs].reverse().find((j) => j.state !== "done" && j.state !== "error");
    if (live) setSel(live.key);
    else if (records[0]) setSel(videoKey(records[0].setId, records[0].takeIndex));
  }, [jobs, records, sel]);

  const job = sel ? jobs.find((j) => j.key === sel) : undefined;
  const record = sel ? byKey.get(sel) : undefined;
  const showBuild = job && (job.state !== "done" || !record);
  const today = statsFor(records, "today");

  const chip = (on: boolean): React.CSSProperties => ({ font: "inherit", fontSize: 13, fontWeight: 800, padding: "6px 12px", borderRadius: 8, cursor: "pointer", border: `1px solid ${on ? ROOM.gold : "transparent"}`, background: on ? "rgba(252,163,17,0.12)" : "transparent", color: on ? ROOM.gold : ROOM.muted });

  return (
    <div style={{ minHeight: "100vh", background: ROOM.bg, color: ROOM.cream, fontFamily: ROOM.font, display: "flex", flexDirection: "column" }}>
      {/* TOP BAR — the ⚙ top left */}
      <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${ROOM.edge}`, position: "relative" }}>
        <button type="button" aria-label="Settings" aria-expanded={gear} onClick={() => setGear((v) => !v)} style={{ ...chip(gear), fontSize: 16, padding: "4px 9px" }}>⚙</button>
        {gear && (
          <div style={{ position: "absolute", top: 48, left: 12, zIndex: 20, background: ROOM.panel, border: `1px solid ${ROOM.edge}`, borderRadius: 10, padding: 12, width: 260, boxShadow: "0 18px 40px rgba(0,0,0,0.5)" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={anim} onChange={(e) => { setAnim(e.target.checked); writeAnimOn(e.target.checked); }} />
              Bolt animation while stitching
            </label>
            <div style={{ fontSize: 11.5, color: ROOM.muted, marginTop: 6 }}>Off shows the same timeline without the bolt — lighter if it gets laggy.</div>
          </div>
        )}
        <button type="button" onClick={() => setMenu((v) => !v)} style={chip(false)} title={menu ? "Hide the video list" : "Show the video list"}>{menu ? "⟨" : "☰"}</button>
        <b style={{ fontSize: 16, letterSpacing: "0.02em" }}>Stitch Room</b>
        <nav style={{ display: "flex", gap: 2, marginLeft: 12 }}>
          <button type="button" style={chip(tab === "videos")} onClick={() => setTab("videos")}>Videos</button>
          <button type="button" style={chip(tab === "queue")} onClick={() => setTab("queue")}>Post queue{records.some((r) => r.status === "queued") ? ` · ${records.filter((r) => r.status === "queued").length}` : ""}</button>
          <button type="button" style={chip(tab === "stats")} onClick={() => setTab("stats")}>Stats & ledger</button>
        </nav>
        <span style={{ flex: 1 }} />
        {typeof window !== "undefined" && window.self === window.top && (
          <button type="button" onClick={() => openDemoLens("/v4/stitch-room")} style={chip(false)} title="The Stitch Room in a vertical window you can zoom and swim around — for filming a demo">▯ Vertical demo</button>
        )}
        <span style={{ fontSize: 12.5, color: ROOM.muted }}>Today: <b style={{ color: ROOM.cream }}>{today.videos}</b> videos · <b style={{ color: ROOM.mint }}>{money(today.payCents)}</b></span>
      </header>

      {q.isError && <div style={{ margin: 14, padding: 12, borderRadius: 10, border: `1px solid ${ROOM.red}`, color: ROOM.red, fontSize: 13 }}>{q.error instanceof Error ? q.error.message : String(q.error)}</div>}
      {!heard && <div style={{ margin: "10px 14px 0", fontSize: 12, color: ROOM.muted }}>Stitches in progress show up here while the film tab is open.</div>}

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* THE MENU — in progress, then every stitched video */}
        {menu && (
          <aside style={{ width: 270, flex: "none", borderRight: `1px solid ${ROOM.edge}`, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            {inProgress.length > 0 && <div style={{ fontSize: 10.5, letterSpacing: "0.14em", fontWeight: 800, color: ROOM.gold, padding: "4px 6px" }}>STITCHING</div>}
            {inProgress.map((j) => (
              <MenuRow key={j.key} on={sel === j.key} onClick={() => { setSel(j.key); setTab("videos"); }}
                                title={titleFor(j)} sub={subFor(j, j.state === "error" ? "stopped" : j.state === "waiting" ? "waiting" : j.note)} hint={briefHint(briefFor(j), j.setName)}
                tone={j.state === "error" ? ROOM.red : ROOM.gold} spinning={j.state !== "done" && j.state !== "error"} />
            ))}
            <div style={{ fontSize: 10.5, letterSpacing: "0.14em", fontWeight: 800, color: ROOM.muted, padding: "10px 6px 4px" }}>STITCHED · {records.length}</div>
            {q.isLoading && <div style={{ fontSize: 12, color: ROOM.muted, padding: 6 }}>Loading…</div>}
            {inVideoOrder(named).map((r) => {
              const k = videoKey(r.setId, r.takeIndex);
              return (
                <MenuRow key={r.id} on={sel === k} onClick={() => { setSel(k); setTab("videos"); }}
                                    title={titleFor(r)} sub={subFor(r, `${r.slides} slides`)} hint={briefHint(briefFor(r), r.setName ?? "")}
                  tone={r.status === "posted" ? ROOM.mint : r.status === "queued" ? ROOM.gold : ROOM.muted}
                  badge={r.status === "posted" ? "posted" : r.status === "queued" ? "queued" : undefined} />
              );
            })}
          </aside>
        )}

        <main style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: 20 }}>
          {tab === "videos" && (
            <>
              {/* IN LINE (Lee, 2026-09-15: "showing each in a line"): every stitch still going, one row each */}
              {jobs.filter((j) => j.state !== "done" && j.state !== "error").length > 1 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                  <div style={{ fontSize: 10.5, letterSpacing: "0.14em", fontWeight: 800, color: ROOM.gold }}>IN LINE · {jobs.filter((j) => j.state !== "done" && j.state !== "error").length}</div>
                  {jobs.filter((j) => j.state !== "done" && j.state !== "error").map((j, i) => {
                    const joined = j.segments.filter((s) => s.state === "joined").length;
                    const sent = j.segments.filter((s) => s.state !== "waiting" && s.state !== "uploading").length;
                    const frac = j.segments.length ? (sent + joined) / (2 * j.segments.length) : 0;
                    const on = sel === j.key;
                    return (
                      <button key={j.key} type="button" onClick={() => setSel(j.key)}
                        style={{ all: "unset", cursor: "pointer", display: "grid", gridTemplateColumns: "22px 1fr auto", gap: 10, alignItems: "center", padding: "8px 10px", borderRadius: 10, background: on ? "rgba(252,163,17,0.08)" : ROOM.panel, border: `1px solid ${on ? `${ROOM.gold}88` : ROOM.edge}` }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: ROOM.muted, textAlign: "right" }}>{i + 1}</span>
                        <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{titleFor(j)}</span>
                          <span style={{ height: 4, borderRadius: 4, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
                            <span style={{ display: "block", height: "100%", width: `${Math.round(frac * 100)}%`, background: j.state === "waiting" ? ROOM.muted : ROOM.sky, transition: "width 500ms" }} />
                          </span>
                        </span>
                        <span style={{ fontSize: 11.5, color: j.state === "waiting" ? ROOM.muted : ROOM.sky, whiteSpace: "nowrap" }}>{j.state === "waiting" ? "waiting its turn" : j.note}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {showBuild && job &&<StitchBuild job={{ ...job, name: nameFor(job) }} animate={anim} />}
              {job && job.state === "error" && (
                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => { if (job.topicKey && job.setKey) redoInFilm({ topicKey: job.topicKey, setKey: job.setKey, setId: job.setId, takeIndex: job.takeIndex }); }}
                    disabled={!job.topicKey || !job.setKey}
                    style={{ font: "inherit", fontSize: 13, fontWeight: 800, padding: "9px 14px", borderRadius: 9, cursor: "pointer", border: `1px solid ${ROOM.gold}`, background: ROOM.gold, color: "#14213D" }}>
                    ↺ Stitch it again in film
                  </button>
                  <button type="button" onClick={() => { setCleared((c) => [...c, job.key]); setSel(null); }}
                    style={{ font: "inherit", fontSize: 13, fontWeight: 800, padding: "9px 14px", borderRadius: 9, cursor: "pointer", border: `1px solid ${ROOM.edge}`, background: "transparent", color: ROOM.muted }}>
                    Clear it from the list
                  </button>
                </div>
              )}
                            {!showBuild && record && <VideoDesk record={record} brief={briefFor(record)} onChange={(r) => upsert(r)}
                onDeleted={(r) => { qc.setQueryData<StitchRecord[]>(["film-stitches"], (old) => (old ?? []).filter((x) => x.id !== r.id)); setSel(null); }} />}
              {!showBuild && !record && <div style={{ color: ROOM.muted, fontSize: 14 }}>{records.length || jobs.length ? "Pick a video on the left." : "No stitched videos yet. In punch-in, press ⚡ Stitch — it opens here."}</div>}
              {job && job.state === "done" && record && (
                <div style={{ marginTop: 16, fontSize: 12.5, color: ROOM.mint }}>
                  Just stitched in {job.startedAt && job.finishedAt ? `${Math.round((job.finishedAt - job.startedAt) / 1000)} s` : "the background"} · +{money(record.payCents)}
                </div>
              )}
            </>
          )}
          {tab === "queue" && <PostQueue records={named} suggestName={(r) => { const f = briefFor(r)?.first ?? ""; return f.length > 60 ? `${f.slice(0, 58)}…` : f; }} onChange={upsert} onOpen={(r) => { setSel(videoKey(r.setId, r.takeIndex)); setTab("videos"); }} />}
          {tab === "stats" && <FilmStats records={named} onOpen={(r) => { setSel(videoKey(r.setId, r.takeIndex)); setTab("videos"); }} />}
        </main>
      </div>
      <style>{`@keyframes sa-room-spin { to { transform: rotate(360deg) } } .sa-room-spin { animation: sa-room-spin 900ms linear infinite; }`}</style>
    </div>
  );
}

/** "Slides 12–18 · How do you increase Cash?" — where a video sits in its set and what it opens on. */
export function briefLine(b: V4VideoBrief): string {
  const range = b.from === b.to ? `Slide ${b.from}` : `Slides ${b.from}–${b.to}`;
  return b.first ? `${range} · ${b.first}` : range;
}
/** The hover: the set, the slide range, then every question the video asks. */
function briefHint(b: V4VideoBrief | undefined, setName: string): string | undefined {
  if (!b) return setName || undefined;
  const lines = [setName, b.from === b.to ? `Slide ${b.from}` : `Slides ${b.from}–${b.to}`];
  if (b.stems.length) lines.push("", ...b.stems.map((s) => `• ${s}`));
  else if (b.first) lines.push("", b.first, ...(b.last ? [`… ${b.last}`] : []));
  return lines.filter((l, i) => l || i > 0).join("\n");
}

function MenuRow({ on, onClick, title, sub, tone, badge, spinning, hint }: { on: boolean; onClick: () => void; title: string; sub: string; tone: string; badge?: string; spinning?: boolean; hint?: string }) {
  return (
    <button type="button" onClick={onClick} title={hint}
      style={{ all: "unset", cursor: "pointer", display: "flex", gap: 8, alignItems: "center", padding: "7px 8px", borderRadius: 8, background: on ? "rgba(252,163,17,0.10)" : "transparent", border: `1px solid ${on ? `${ROOM.gold}88` : "transparent"}` }}>
      {spinning
        ? <span className="sa-room-spin" style={{ width: 12, height: 12, borderRadius: 999, border: `2px solid ${tone}`, borderTopColor: "transparent", flex: "none" }} />
        : <span style={{ width: 8, height: 8, borderRadius: 999, background: tone, flex: "none", margin: "0 2px" }} />}
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: ROOM.cream, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
        <span style={{ display: "block", fontSize: 11, color: ROOM.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>
      </span>
      {badge && <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.08em", color: tone }}>{badge.toUpperCase()}</span>}
    </button>
  );
}
