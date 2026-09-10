// /v3/map — THE CRAM PATH AND WHAT HANGS OFF IT, per topic. Read AND arranged here.
//
// Lee, 2026-09-09: "once we get this new layout tool built, for mapping cram path versus
// offshoot… it'll be fun to reengineer the topics." 2026-09-10: "set this up in a UI where I can
// play with it myself. I want to start arranging the offshoots in particular orders, connect them
// to the right splits, and this way I'll know what order of production I'm making the videos
// today… Let me edit titles, descriptions, etc."
//
// Three columns per topic — pitches left, the cram path down the middle, offshoots right —
// coloured by the same stage chip the queue uses. Click a node: the panel docks bottom-right and
// is the editor — name, one-line blurb, which split it hangs off, its place among its siblings,
// mint a new offshoot or pitch off a cram set, park one, or go brainstorm it. Every write goes
// through lib/blastoff.functions.ts and comes back through the bank, so what the map draws is
// always what the deck says.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminGate } from "@/components/AdminGate";
import { LaneMap, LaneMapHeadings } from "@/components/v3/LaneMap";
import { bareCramIds, layoutLanes, nudgeOrder, type LaneLayout, type LaneTake } from "@/components/v3/lane-map";
import { blastOffPath, refreshBank, slugOf, useBank } from "@/components/v3/use-bank";
import { V3Shell, V3Note, V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { StageChip, stepLabel } from "@/components/v3/StageChip";
import { stageOf, talkStageOf, type StageInfo } from "@/components/v3/set-stage";
import { LANE_LABEL, laneOf, type DeckLane } from "@/lib/deck-lane";
import { estimatedLengthSeconds, fmtRange } from "@/components/blastoff/film-summary";
import { listBlastPlanSetIds, mintBranch, setBranchOrders, updateDeckMeta } from "@/lib/blastoff.functions";
import { enqueueCeqJob } from "@/lib/ceq-queue.functions";
import { kickQueue, useCeqJobs } from "@/components/v3/ceq-queue-client";
import { listPublishStatuses, PUBLISH_DESTINATIONS, type PublishDestination, type SetPublishStatus } from "@/lib/publish-queue.functions";
import { productionBottleneckReport } from "@/lib/production-time.functions";
import { orderedSets } from "@/lib/v3-topic-groups";
import { startTT, subscribeTT, ttState, type TTState } from "@/components/canvas/talkthrough-sync";
import type { BoothSetInfo, BoothTopic } from "@/lib/talkthrough.functions";

export const Route = createFileRoute("/v3/map")({
  component: () => <AdminGate><LaneMapPage /></AdminGate>,
  head: () => ({ meta: [{ title: "🗺 The map — Blast Off" }, { name: "robots", content: "noindex" }] }),
});

type PlanInfo = { frames: number; takes: LaneTake[] };

function LaneMapPage() {
  const { topics, error } = useBank();
  const [tt, setTT] = useState<TTState>(() => ttState());
  const [plans, setPlans] = useState<Map<string, PlanInfo>>(() => new Map());
  const [filmSeconds, setFilmSeconds] = useState<Map<string, number>>(() => new Map());
  const [publish, setPublish] = useState<Record<string, SetPublishStatus>>({});
  const [selected, setSelected] = useState<string | null>(null);

  const loadPlans = useCallback(() => {
    listBlastPlanSetIds()
      .then((rows) => setPlans(new Map(rows.map((r) => [r.setId, { frames: r.takes.reduce((n, t) => n + t.frames, 0), takes: r.takes.map((t) => ({ headId: t.headId, name: t.name })) }]))))
      .catch(() => { /* no plan signal — no runtime chip, no split pills */ });
  }, []);

  useEffect(() => {
    startTT();
    const unTT = subscribeTT(setTT);
    loadPlans();
    productionBottleneckReport().then((r) => setFilmSeconds(new Map(r.sets.map((s) => [s.setId, s.bySteps.film ?? 0])))).catch(() => { /* chip falls back */ });
    listPublishStatuses().then(setPublish).catch(() => { /* chip falls back */ });
    return () => { unTT(); };
  }, [loadPlans]);

  /** After any write: the bank and the plans, so the map redraws from what the deck now says.
   *  Awaited by the panel so "busy" holds until the fresh tree is on screen — a second click
   *  before that would compute from the layout the write just made stale. */
  const reload = useCallback(async () => { loadPlans(); await refreshBank(); }, [loadPlans]);

  const stageFor = (set: BoothSetInfo): StageInfo => {
    const p = publish[set.id] ?? null;
    return stageOf({ talk: talkStageOf(tt, set), hasPlan: plans.has(set.id), filmSeconds: filmSeconds.get(set.id) ?? 0, filmedAt: p?.filmedAt ?? null, publish: p });
  };
  const takesOf = useCallback((id: string): readonly LaneTake[] => plans.get(id)?.takes ?? [], [plans]);

  const exam = useMemo(() => (topics ?? []).filter((t) => t.kind !== "strategy"), [topics]);
  const layouts = useMemo(() => new Map(exam.map((t) => [t.id, layoutLanes(orderedSets(slugOf(t.name), t.sets), takesOf)])), [exam, takesOf]);
  const allSets = useMemo(() => new Map((topics ?? []).flatMap((t) => t.sets.map((s) => [s.id, { set: s, topic: t }] as const))), [topics]);
  const picked = selected ? allSets.get(selected) ?? null : null;

  return (
    <V3Shell wide crumbs={[{ label: "V3", to: "/v3" }, { label: "Map" }]}>
      <h1 style={{ fontFamily: V3_DISPLAY, fontSize: 30, fontWeight: 900, letterSpacing: "-0.01em", margin: "0 0 6px" }}>🗺 The map</h1>
      <div style={{ color: V3_MUTED, fontSize: 13, marginBottom: 22, maxWidth: 700, lineHeight: 1.55 }}>
        The cram path down the middle, numbered in production order. Teaching videos hang off it on
        the right under the split they belong to; pitches on the left. Click any node to rename it,
        describe it, move it, attach it to a split, or add something off it.
      </div>

      {error && <V3Note tone="bad">Could not load the bank: {error}</V3Note>}
      {!topics && !error && <V3Note>Loading…</V3Note>}
      {topics && exam.length === 0 && <V3Note>No exam topics in the bank yet.</V3Note>}

      {exam.map((t) => {
        const layout = layouts.get(t.id)!;
        const bare = bareCramIds(layout);
        const branches = layout.nodes.length - layout.rows;
        return (
          <section key={t.id} id={slugOf(t.name)} style={{ marginBottom: 34 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              <Link to="/v3/$topic" params={{ topic: slugOf(t.name) }} style={{ fontFamily: V3_DISPLAY, fontSize: 17, fontWeight: 900, color: V3_CREAM, textDecoration: "none" }}>{t.name}</Link>
              <span style={{ fontSize: 11.5, color: V3_MUTED }}>
                {layout.rows} on the path{branches > 0 ? ` · ${branches} hanging off` : ""}{bare.length ? ` · ${bare.length} with nothing deeper yet` : ""}
              </span>
            </div>
            {layout.rows === 0 ? (
              <V3Note>Every set in this topic hangs off something — nothing is on the cram path.</V3Note>
            ) : (
              <div style={{ overflowX: "auto", border: `1px solid ${V3_EDGE}`, borderRadius: 12, padding: "12px 10px" }}>
                <LaneMapHeadings />
                <LaneMap
                  layout={layout}
                  stage={(id) => { const s = t.sets.find((x) => x.id === id); return s ? stageFor(s) : null; }}
                  count={(id) => t.sets.find((x) => x.id === id)?.liveCount ?? null}
                  runtime={(id) => { const n = plans.get(id)?.frames; return n ? fmtRange(estimatedLengthSeconds({ total: n } as never)) : null; }}
                  takesOf={takesOf}
                  selected={selected}
                  onSelect={setSelected}
                />
              </div>
            )}
          </section>
        );
      })}

      {topics && (
        <div style={{ fontSize: 11.5, color: V3_MUTED, marginTop: 10 }}>
          Strategy shorts live on <Link to="/admin/ideas/strategy" style={{ color: V3_GOLD, textDecoration: "none" }}>the strategy board →</Link>
        </div>
      )}

      {picked && (
        <SetPanel
          key={picked.set.id}
          topic={picked.topic} set={picked.set} info={stageFor(picked.set)} publish={publish}
          layout={layouts.get(picked.topic.id) ?? null} takesOf={takesOf}
          onChanged={reload} onSelect={setSelected} onClose={() => setSelected(null)}
        />
      )}
    </V3Shell>
  );
}

const small: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, padding: "5px 10px", borderRadius: 8, border: `1px solid ${V3_EDGE}`, color: V3_CREAM, background: "transparent", cursor: "pointer", whiteSpace: "nowrap", textDecoration: "none", font: "inherit" };
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", font: "inherit", fontSize: 12.5, padding: "6px 9px", borderRadius: 8, border: `1px solid ${V3_EDGE}`, background: "rgba(244,239,230,0.05)", color: V3_CREAM, outline: "none" };
const label: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: V3_MUTED, marginTop: 10, marginBottom: 4 };

/** THE EDITOR, docked bottom-right so Lee reads the map while he uses it. Everything saves on
 *  blur / Enter / change — there is no Save button, the same law as the rest of V3. */
const DEST_SHORT: Record<PublishDestination, string> = { site: "site", youtube: "YT", instagram: "IG", tiktok: "TT" };

function SetPanel({ topic, set, info, layout, takesOf, publish, onChanged, onSelect, onClose }: {
  topic: BoothTopic; set: BoothSetInfo; info: StageInfo; layout: LaneLayout | null;
  /** set_publish_status by publish key — a set's id, or "<setId>#N" for its N-th split. */
  publish: Record<string, SetPublishStatus>;
  takesOf: (id: string) => readonly LaneTake[];
  onChanged: () => Promise<void>; onSelect: (id: string) => void; onClose: () => void;
}) {
  const lane = laneOf(set);
  const parent = set.branchFrom ? topic.sets.find((s) => s.id === set.branchFrom) : null;
  const node = layout?.nodes.find((n) => n.id === set.id) ?? null;
  const kids = topic.sets.filter((s) => s.branchFrom === set.id);
  const parentTakes = parent ? takesOf(parent.id) : [];
  // THE VIDEOS this set is: one per split when it has cuts, else itself. Keyed the way /v3/post
  // keys its rows, so the ticks here are the ticks there.
  const ownTakes = takesOf(set.id);
  const videos = (ownTakes.length > 1 ? ownTakes : [{ headId: "", name: "" }]).map((t, i) => ({
    key: i === 0 ? set.id : `${set.id}#${i + 1}`,
    label: ownTakes.length > 1 ? (t.name || `Split ${i + 1}`) : set.name,
    status: publish[i === 0 ? set.id : `${set.id}#${i + 1}`] ?? null,
  }));
  const [name, setName] = useState(set.name);
  const [blurb, setBlurb] = useState(set.blurb ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [minting, setMinting] = useState<DeckLane | null>(null);
  // THE QUEUE (docs/DESIGN-CEQ-QUEUE.md): cards from the brainstorm, made in the background.
  const { jobs: ceqJobs, reload: reloadJobs } = useCeqJobs(set.id);
  const queueCards = () => void write("queuing", async () => { await enqueueCeqJob({ data: { deckId: set.id } }); kickQueue(); reloadJobs(); });
  const jobNote = (() => {
    const j = ceqJobs[0]; if (!j) return null;
    if (j.status === "queued") return "cards: queued";
    if (j.status === "running") return "cards: generating…";
    if (j.status === "failed") return `cards: failed — ${j.error ?? "no reason given"}`;
    const n = j.result?.cards.length ?? 0; return n > j.decided ? `cards: ${n - j.decided} to review in the Editor` : `cards: ${n} made, all decided`;
  })();
  const [mintName, setMintName] = useState("");
  const [mintHead, setMintHead] = useState("");

  const write = async (what: string, fn: () => Promise<unknown>) => {
    setBusy(what); setErr(null);
    try { await fn(); await onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };
  const rename = () => { const n = name.trim(); if (n && n !== set.name) void write("saving name", () => updateDeckMeta({ data: { setId: set.id, name: n } })); };
  const describe = () => { if (blurb.trim() !== (set.blurb ?? "")) void write("saving", () => updateDeckMeta({ data: { setId: set.id, blurb: blurb.trim() } })); };
  const attach = (head: string) => void write("attaching", () => updateDeckMeta({ data: { setId: set.id, branchTakeHead: head } }));
  const nudge = (dir: -1 | 1) => {
    if (!layout || !node) return;
    // Siblings = same parent, same side, in the order they are drawn.
    const sib = layout.nodes.filter((n) => n.row === node.row && n.col === node.col && !n.orphan).sort((a, b) => a.sub - b.sub).map((n) => n.id);
    const orders = nudgeOrder(sib, set.id, dir).map((o) => ({ setId: o.id, branchOrder: o.branchOrder }));
    void write("moving", () => setBranchOrders({ data: { orders } }));
  };
  const park = () => {
    if (!window.confirm(`Park "${set.name}"? It leaves the map and the queue; nothing is deleted.`)) return;
    void write("parking", async () => { await updateDeckMeta({ data: { setId: set.id, parked: true } }); onClose(); });
  };
  const mint = () => {
    const n = mintName.trim(); if (!n || !minting) return;
    void write("minting", async () => {
      const r = await mintBranch({ data: { parentId: set.id, lane: minting, name: n, ...(mintHead ? { branchTakeHead: mintHead } : {}) } });
      setMinting(null); setMintName(""); setMintHead("");
      onSelect(r.deckId);
    });
  };

  return (
    <div style={{ position: "fixed", right: 18, bottom: 18, zIndex: 60, width: 340, maxHeight: "80vh", overflowY: "auto", background: "#0B0F1E", border: `1px solid ${V3_GOLD}66`, borderRadius: 14, padding: 14, boxShadow: "0 20px 50px rgba(0,0,0,0.55)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {node && node.order > 0 && <span style={{ fontSize: 11, fontWeight: 900, color: V3_GOLD, border: `1px solid ${V3_GOLD}88`, borderRadius: 999, padding: "1px 7px" }}>#{node.order}</span>}
        <span style={{ fontSize: 11, color: V3_MUTED, flex: 1 }}>{LANE_LABEL[lane]}{parent ? ` · off ${parent.name}` : ""}</span>
        <StageChip info={info} />
        <button type="button" onClick={onClose} style={{ ...small, color: V3_MUTED, padding: "3px 8px" }}>close</button>
      </div>

      {/* THE VIDEOS — Lee, 2026-09-10: "see the visual map of each video… track whether they're posted
          to IG, YT, TT". Each split is a row; each row is a door into its post-production. */}
      <div style={label}>Videos</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {videos.map((v) => (
          <div key={v.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: V3_CREAM }}>{v.label}</span>
            {v.status?.filmedAt && <span title="filmed" style={{ color: "#7DD3FC", fontSize: 10 }}>🎬</span>}
            {PUBLISH_DESTINATIONS.map((d) => {
              const on = !!v.status?.[d].postedAt;
              return <span key={d} title={`${DEST_SHORT[d]}: ${on ? "posted" : "not yet"}`} style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.04em", color: on ? "#3BF5A0" : V3_MUTED, opacity: on ? 1 : 0.55 }}>{on ? "✓" : "○"}{DEST_SHORT[d]}</span>;
            })}
            <Link to="/v3/post" search={{ open: v.key }} style={{ ...small, padding: "2px 7px", fontSize: 10.5, borderColor: `${V3_GOLD}66`, color: V3_GOLD }} title="Post-production for this video: transcript, captions, copy, cover, then post">post →</Link>
          </div>
        ))}
      </div>

      <div style={label}>Name</div>
      <input value={name} onChange={(e) => setName(e.target.value)} onBlur={rename} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} style={{ ...field, fontSize: 13.5, fontWeight: 700 }} />

      <div style={label}>One line about it</div>
      <textarea value={blurb} onChange={(e) => setBlurb(e.target.value)} onBlur={describe} rows={2} placeholder="what this video does that the cram one doesn't" style={{ ...field, resize: "vertical", lineHeight: 1.45 }} />

      {lane !== "cram" && parent && (
        <>
          <div style={label}>Hangs off</div>
          <select value={set.branchTakeHead ?? ""} onChange={(e) => attach(e.target.value)} style={field}>
            <option value="">{parent.name} — the whole set</option>
            {parentTakes.map((t, i) => <option key={t.headId} value={t.headId}>{t.name || `Split ${i + 1}`}</option>)}
          </select>
          {node?.takeMissing && <div style={{ fontSize: 11.5, color: "#FF9F43", marginTop: 4 }}>The split this pointed at is gone from the parent's plan — pick another.</div>}
          {parentTakes.length === 0 && <div style={{ fontSize: 11, color: V3_MUTED, marginTop: 4 }}>The parent has no saved plan yet, so it has no splits to attach to.</div>}
          <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: V3_MUTED, flex: 1 }}>Order among siblings</span>
            <button type="button" onClick={() => nudge(-1)} style={small} title="Film this one earlier">▲</button>
            <button type="button" onClick={() => nudge(1)} style={small} title="Film this one later">▼</button>
          </div>
        </>
      )}

      {lane === "cram" && (
        <>
          <div style={label}>Hang something off it</div>
          {minting ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <input autoFocus value={mintName} onChange={(e) => setMintName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") mint(); if (e.key === "Escape") setMinting(null); }} placeholder={minting === "pitch" ? "the pitch, in a line" : "the teaching video, in a line"} style={field} />
              {takesOf(set.id).length > 1 && (
                <select value={mintHead} onChange={(e) => setMintHead(e.target.value)} style={field}>
                  <option value="">off the whole set</option>
                  {takesOf(set.id).map((t, i) => <option key={t.headId} value={t.headId}>off {t.name || `Split ${i + 1}`}</option>)}
                </select>
              )}
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" onClick={mint} disabled={!mintName.trim()} style={{ ...small, borderColor: `${V3_GOLD}88`, color: V3_GOLD, opacity: mintName.trim() ? 1 : 0.5 }}>Add {minting}</button>
                <button type="button" onClick={() => setMinting(null)} style={small}>cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" onClick={() => setMinting("offshoot")} style={{ ...small, borderColor: "#7DD3FC88", color: "#7DD3FC" }}>+ offshoot</button>
              <button type="button" onClick={() => setMinting("pitch")} style={{ ...small, borderColor: "#C4B5FD88", color: "#C4B5FD" }}>+ pitch</button>
            </div>
          )}
          {kids.length > 0 && <div style={{ fontSize: 11.5, color: V3_MUTED, marginTop: 8, lineHeight: 1.5 }}>Hanging off it: {kids.map((k) => k.name).join(" · ")}</div>}
        </>
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
        <Link to={blastOffPath(topic, set, "talkthrough")} style={{ ...small, borderColor: `${V3_GOLD}88`, color: V3_GOLD }}>Brainstorm it</Link>
        <button type="button" onClick={queueCards} disabled={!!busy} style={{ ...small, borderColor: "#7DD3FC88", color: "#7DD3FC", opacity: busy ? 0.5 : 1 }} title="Turn what you said in the Booth into candidate cards, in the background">Generate cards</button>
        <Link to={blastOffPath(topic, set, info.next)} style={small}>{stepLabel(info.next)}</Link>
        <span style={{ flex: 1 }} />
        {lane !== "cram" && <button type="button" onClick={park} style={{ ...small, color: V3_MUTED }} title="Leaves the map and the queue; nothing is deleted">park</button>}
      </div>
      {(busy || err) && <div style={{ fontSize: 11.5, marginTop: 8, color: err ? "#FF8B7E" : V3_MUTED }}>{err ?? `${busy}…`}</div>}
      {jobNote && !busy && <div style={{ fontSize: 11.5, marginTop: 6, color: /failed/.test(jobNote) ? "#FF8B7E" : "#7DD3FC" }}>{jobNote}</div>}
    </div>
  );
}
