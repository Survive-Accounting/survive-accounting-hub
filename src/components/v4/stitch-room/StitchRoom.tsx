// THE STITCH ROOM — the popout every stitch opens in. Lee, 2026-09-15: "the next stitch I do? Let me view it
// from the same popout... I can just switch between each video in that pop out. So it can have a collapsible menu
// that shows each stitched video and then the upcoming incomplete videos still in process … Put a settings icon
// at top left though, and let me toggle this animation off."
//
// The stitching itself runs in the film tab (capture/stitch-queue.ts); this window hears it on a BroadcastChannel
// and reads the saved videos from film_stitches.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { isPlaceholderName, money, splitNameOf, statsFor, videoKey, videoTitle, type StitchRecord } from "@/lib/film-stitch";
import { listFilmStitches } from "@/lib/film-stitch.functions";
import { loadV4Splits } from "@/lib/v4.functions";

import { STITCH_CHANNEL, type StitchJob, type StitchMessage } from "../../blastoff/capture/stitch-queue";
import { FilmStats } from "./FilmStats";
import { PostQueue } from "./PostQueue";
import { readAnimOn, ROOM, writeAnimOn } from "./room-theme";
import { StitchBuild } from "./StitchBuild";
import { VideoDesk } from "./VideoDesk";
import { openDemoLens } from "../DemoLens";

type Tab = "videos" | "queue" | "stats";

export function StitchRoom({ initialKey }: { initialKey?: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["film-stitches"], queryFn: () => listFilmStitches(), staleTime: 10_000, retry: false });
  const records = q.data ?? [];
  const [jobs, setJobs] = useState<StitchJob[]>([]);
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
      if (m?.type === "state") { setJobs(m.jobs); setHeard(true); }
      if (m?.type === "focus") { setSel(m.key); setTab("videos"); }
      if (m?.type === "saved") void qc.invalidateQueries({ queryKey: ["film-stitches"] });
    };
    ch.postMessage({ type: "hello" } satisfies StitchMessage);
    return () => ch.close();
  }, [qc]);

  const upsert = (r?: StitchRecord) => {
    if (r) qc.setQueryData<StitchRecord[]>(["film-stitches"], (old) => { const list = old ?? []; return list.some((x) => x.id === r.id) ? list.map((x) => (x.id === r.id ? r : x)) : [r, ...list]; });
    else void qc.invalidateQueries({ queryKey: ["film-stitches"] });
  };

  // NAMES: a video saved as "Split N" (or nothing) takes its name from the Build step's cuts.
  const [cutNames, setCutNames] = useState<Record<string, Awaited<ReturnType<typeof loadV4Splits>> | null>>({});
  const needNames = useMemo(() => [...new Set([...records, ...jobs].filter((x) => isPlaceholderName(x.name)).map((x) => x.setId))], [records, jobs]);
  useEffect(() => {
    for (const setId of needNames) {
      if (setId in cutNames) continue;
      setCutNames((m) => ({ ...m, [setId]: null }));
      loadV4Splits({ data: { setId } }).then((s) => setCutNames((m) => ({ ...m, [setId]: s }))).catch(() => { /* stays #N */ });
    }
  }, [needNames]); // eslint-disable-line react-hooks/exhaustive-deps
  const nameFor = (x: { setId: string; takeIndex: number; name: string }) => (isPlaceholderName(x.name) ? splitNameOf(cutNames[x.setId], x.takeIndex) : x.name);
  const titleFor = (x: { setId: string; takeIndex: number; name: string }) => videoTitle(x.takeIndex, nameFor(x));
  const named = useMemo(() => records.map((r) => (isPlaceholderName(r.name) ? { ...r, name: splitNameOf(cutNames[r.setId], r.takeIndex) } : r)), [records, cutNames]);

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
                title={titleFor(j)} sub={`${j.setName} · ${j.state === "error" ? "stopped" : j.state === "waiting" ? "waiting" : j.note}`}
                tone={j.state === "error" ? ROOM.red : ROOM.gold} spinning={j.state !== "done" && j.state !== "error"} />
            ))}
            <div style={{ fontSize: 10.5, letterSpacing: "0.14em", fontWeight: 800, color: ROOM.muted, padding: "10px 6px 4px" }}>STITCHED · {records.length}</div>
            {q.isLoading && <div style={{ fontSize: 12, color: ROOM.muted, padding: 6 }}>Loading…</div>}
            {records.map((r) => {
              const k = videoKey(r.setId, r.takeIndex);
              return (
                <MenuRow key={r.id} on={sel === k} onClick={() => { setSel(k); setTab("videos"); }}
                  title={titleFor(r)} sub={`${r.setName ?? ""} · ${r.slides} slides`}
                  tone={r.status === "posted" ? ROOM.mint : r.status === "queued" ? ROOM.gold : ROOM.muted}
                  badge={r.status === "posted" ? "posted" : r.status === "queued" ? "queued" : undefined} />
              );
            })}
          </aside>
        )}

        <main style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: 20 }}>
          {tab === "videos" && (
            <>
              {showBuild && job && <StitchBuild job={{ ...job, name: nameFor(job) }} animate={anim} />}
              {!showBuild && record && <VideoDesk record={record} onChange={(r) => upsert(r)}
                onDeleted={(r) => { qc.setQueryData<StitchRecord[]>(["film-stitches"], (old) => (old ?? []).filter((x) => x.id !== r.id)); setSel(null); }} />}
              {!showBuild && !record && <div style={{ color: ROOM.muted, fontSize: 14 }}>{records.length || jobs.length ? "Pick a video on the left." : "No stitched videos yet. In punch-in, press ⚡ Stitch — it opens here."}</div>}
              {job && job.state === "done" && record && (
                <div style={{ marginTop: 16, fontSize: 12.5, color: ROOM.mint }}>
                  Just stitched in {job.startedAt && job.finishedAt ? `${Math.round((job.finishedAt - job.startedAt) / 1000)} s` : "the background"} · +{money(record.payCents)}
                </div>
              )}
            </>
          )}
          {tab === "queue" && <PostQueue records={named} onChange={upsert} onOpen={(r) => { setSel(videoKey(r.setId, r.takeIndex)); setTab("videos"); }} />}
          {tab === "stats" && <FilmStats records={named} onOpen={(r) => { setSel(videoKey(r.setId, r.takeIndex)); setTab("videos"); }} />}
        </main>
      </div>
      <style>{`@keyframes sa-room-spin { to { transform: rotate(360deg) } } .sa-room-spin { animation: sa-room-spin 900ms linear infinite; }`}</style>
    </div>
  );
}

function MenuRow({ on, onClick, title, sub, tone, badge, spinning }: { on: boolean; onClick: () => void; title: string; sub: string; tone: string; badge?: string; spinning?: boolean }) {
  return (
    <button type="button" onClick={onClick}
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
