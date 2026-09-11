// THE MAP — the cram path and what hangs off it, per topic. Read AND arranged here.
//
// Lee, 2026-09-10: "make the cram map the home page of /v3 … we start there, plan out the map,
// and I can navigate to brainstorm, edit, film pop out, posting from one place." So this is
// rendered by BOTH /v3 (the home) and /v3/map (kept so old links work); the old queue list moved
// to /v3/queue.
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
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LaneMap, LaneMapHeadings } from "@/components/v3/LaneMap";
import { bareCramIds, layoutLanes, type BranchMove, type LaneLayout, type LaneTake } from "@/components/v3/lane-map";
import { blastOffPath, refreshBank, slugOf, useBank, type BlastOffStep } from "@/components/v3/use-bank";
import { V3Shell, V3Note, V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { StageChip } from "@/components/v3/StageChip";
import { stageOf, talkStageOf, type StageInfo } from "@/components/v3/set-stage";
import { LANE_LABEL, laneOf, type DeckLane } from "@/lib/deck-lane";
import { estimatedLengthSeconds, fmtRange } from "@/components/blastoff/film-summary";
import { listBlastPlanSetIds, mintBranch, setBranchOrders, setDeckLane, updateDeckMeta } from "@/lib/blastoff.functions";
import { PostProduction } from "@/components/v3/PostProduction";
import { cramPathGate } from "@/components/v3/cram-gate";
import { SplitWizard } from "@/components/blastoff/SplitWizard";
import { listPublishStatuses, PUBLISH_DESTINATIONS, type PublishDestination, type SetPublishStatus } from "@/lib/publish-queue.functions";
import { productionBottleneckReport } from "@/lib/production-time.functions";
import { orderedSets } from "@/lib/v3-topic-groups";
import { startTT, subscribeTT, ttState, type TTState } from "@/components/canvas/talkthrough-sync";
import type { BoothSetInfo, BoothTopic } from "@/lib/talkthrough.functions";


type PlanInfo = { frames: number; takes: LaneTake[]; ceqIds: string[][] };

export function LaneMapPage() {
  const { topics, error } = useBank();
  const [tt, setTT] = useState<TTState>(() => ttState());
  const [plans, setPlans] = useState<Map<string, PlanInfo>>(() => new Map());
  const [filmSeconds, setFilmSeconds] = useState<Map<string, number>>(() => new Map());
  const [publish, setPublish] = useState<Record<string, SetPublishStatus>>({});
  const [selected, setSelected] = useState<string | null>(null);
  // ONE TOPIC AT A TIME (Lee, 2026-09-10): "the cram path is the only thing you really see… click
  // take it to an A and it opens the offshoots for that topic, just one topic at a time."
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  const [moveNote, setMoveNote] = useState<string | null>(null);
  // POST FROM THE MAP: "if I click post can this modal just pop up in the cram map? I don't really
  // want to leave the map." The same PostProduction panel /v3/post mounts, over the map.
  const [producing, setProducing] = useState<{ key: string; title: string; topicName: string; hook: string } | null>(null);
  const navigate = useNavigate();
  // THE SPLIT WIZARD (Lee, 2026-09-10): "first thing we do is split it appropriately." Over the map.
  const [splitting, setSplitting] = useState<BoothSetInfo | null>(null);

  const loadPlans = useCallback(() => {
    listBlastPlanSetIds()
      .then((rows) => setPlans(new Map(rows.map((r) => [r.setId, { frames: r.takes.reduce((n, t) => n + t.frames, 0), takes: r.takes.map((t) => ({ headId: t.headId, name: t.name })), ceqIds: r.takes.map((t) => t.ceqIds) }]))))
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

  /** A DROP ON THE MAP is up to three writes: a new parent (lane write), a new split (meta write),
   *  and the explicit order of every sibling — then the bank, so the map redraws from the deck. */
  const applyMove = useCallback(async (m: BranchMove) => {
    const cur = allSetsRef.current.get(m.id)?.set;
    if (!cur) return;
    setMoveNote("moving…");
    try {
      if (cur.branchFrom !== m.parentId) await setDeckLane({ data: { setId: m.id, lane: m.lane, branchFrom: m.parentId, branchTakeHead: m.takeHead ?? "" } });
      else if ((cur.branchTakeHead ?? null) !== m.takeHead) await updateDeckMeta({ data: { setId: m.id, branchTakeHead: m.takeHead ?? "" } });
      if (m.orders.length) await setBranchOrders({ data: { orders: m.orders.map((o) => ({ setId: o.id, branchOrder: o.branchOrder })) } });
      await reload();
      setMoveNote(null);
    } catch (e) { setMoveNote(e instanceof Error ? e.message : String(e)); }
  }, [reload]);

  const stageFor = (set: BoothSetInfo): StageInfo => {
    const p = publish[set.id] ?? null;
    return stageOf({ talk: talkStageOf(tt, set), hasPlan: plans.has(set.id), filmSeconds: filmSeconds.get(set.id) ?? 0, filmedAt: p?.filmedAt ?? null, publish: p });
  };
  const takesOf = useCallback((id: string): readonly LaneTake[] => plans.get(id)?.takes ?? [], [plans]);

  const exam = useMemo(() => (topics ?? []).filter((t) => t.kind !== "strategy"), [topics]);
  const layouts = useMemo(() => new Map(exam.map((t) => [t.id, layoutLanes(orderedSets(slugOf(t.name), t.sets), takesOf)])), [exam, takesOf]);
  const allSets = useMemo(() => new Map((topics ?? []).flatMap((t) => t.sets.map((s) => [s.id, { set: s, topic: t }] as const))), [topics]);
  const allSetsRef = useRef(allSets); allSetsRef.current = allSets;
  const picked = selected ? allSets.get(selected) ?? null : null;

  return (
    <V3Shell wide crumbs={[{ label: "V3" }, { label: "Map" }]}>
      <h1 style={{ fontFamily: V3_DISPLAY, fontSize: 30, fontWeight: 900, letterSpacing: "-0.01em", margin: "0 0 4px" }}>
        Like <span style={{ color: "#E63B2D" }}>Reels</span> for exam prep.
      </h1>
      <div style={{ color: V3_MUTED, fontSize: 13, marginBottom: 22 }}>The cram path, in production order. Open a topic to see what hangs off it.</div>
      {moveNote && <V3Note tone={/moving/.test(moveNote) ? undefined : "bad"}>{moveNote}</V3Note>}

      {error && <V3Note tone="bad">Could not load the bank: {error}</V3Note>}
      {!topics && !error && <V3Note>Loading…</V3Note>}
      {topics && exam.length === 0 && <V3Note>No exam topics in the bank yet.</V3Note>}

      {exam.map((t) => {
        const layout = layouts.get(t.id)!;
        const bare = bareCramIds(layout);
        const branches = layout.nodes.length - layout.rows;
        const open = openTopic === t.id;
        return (
          <section key={t.id} id={slugOf(t.name)} style={{ marginBottom: 34 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              <Link to="/v3/$topic" params={{ topic: slugOf(t.name) }} style={{ fontFamily: V3_DISPLAY, fontSize: 17, fontWeight: 900, color: V3_CREAM, textDecoration: "none" }}>{t.name}</Link>
              <span style={{ fontSize: 11.5, color: V3_MUTED }}>
                {layout.rows} on the path{branches > 0 ? ` · ${branches} to take it to an A` : ""}{open && bare.length ? ` · ${bare.length} with nothing deeper yet` : ""}
              </span>
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => setOpenTopic(open ? null : t.id)} aria-pressed={open}
                style={{ ...small, borderColor: open ? V3_GOLD : `${V3_GOLD}66`, color: V3_GOLD, background: open ? `${V3_GOLD}1A` : "transparent" }}
                title={open ? "Back to just the cram path" : "Open the offshoots and pitches for this topic"}>
                Take it to an A {open ? "−" : "+"}
              </button>
            </div>
            {layout.rows === 0 ? (
              <V3Note>Every set in this topic hangs off something — nothing is on the cram path.</V3Note>
            ) : (
              <div style={{ overflowX: "auto", border: `1px solid ${V3_EDGE}`, borderRadius: 12, padding: "12px 10px" }}>
                {open && <LaneMapHeadings />}
                <LaneMap
                  layout={layout}
                  expanded={open}
                  onDrop={(m) => void applyMove(m)}
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
          {" · "}The same sets as a list: <Link to="/v3/queue" style={{ color: V3_GOLD, textDecoration: "none" }}>the queue →</Link>
          {" · "}What students will see: <Link to="/v3/learn" search={{ admin: true }} style={{ color: V3_GOLD, textDecoration: "none" }}>/v3/learn →</Link>
        </div>
      )}

      {splitting && <SplitWizard set={splitting} onClose={() => setSplitting(null)} onSaved={reload} />}

      {producing && (
        <PostProduction
          pubKey={producing.key}
          title={producing.title}
          topicName={producing.topicName}
          defaultHookLine={producing.hook}
          onTranscript={() => { /* the caption sheet lives on /v3/post; it re-reads the transcript there */ }}
          onOpenCopy={() => { void navigate({ to: "/v3/post", search: { open: producing.key } }); }}
          onClose={() => { setProducing(null); listPublishStatuses().then(setPublish).catch(() => { /* ticks refresh on the next load */ }); }}
        />
      )}

      {picked && (
        <SetPanel
          key={picked.set.id}
          topic={picked.topic} set={picked.set} info={stageFor(picked.set)} publish={publish}
          layout={layouts.get(picked.topic.id) ?? null} takesOf={takesOf}
          onChanged={reload} onSelect={setSelected} onClose={() => setSelected(null)}
          onSplit={() => setSplitting(picked.set)}
          onProduce={(key, title) => {
            const idx = key.includes("#") ? Number(key.split("#")[1]) - 1 : 0;
            const ids = plans.get(picked.set.id)?.ceqIds[idx] ?? [];
            const first = picked.set.ceqs.find((c) => ids.includes(c.id) && !c.noteOnly) ?? picked.set.ceqs.find((c) => !c.noteOnly);
            setProducing({ key, title, topicName: picked.topic.name, hook: first?.stem ?? "" });
          }}
        />
      )}
    </V3Shell>
  );
}

/** EVERY STEP FROM ONE PLACE (Lee, 2026-09-10). The step the set is actually on is lit gold —
 *  the same answer the queue's resume button gives. Film opens the pop-out surface; Post is the
 *  cross-post row. Iterate is reachable from any step's bar, not here. */
const STEP_LINKS: { step: BlastOffStep; label: string; title: string }[] = [
  { step: "talkthrough", label: "🎙 Brainstorm", title: "Talk it through in the Booth" },
  { step: "results", label: "✨ Editor", title: "The cards and slides" },
  { step: "film", label: "🎬 Film", title: "Rehearse & Film — the pop-out" },
  { step: "post", label: "📮 Post", title: "Cross-post — this set's row" },
];

const small: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, padding: "5px 10px", borderRadius: 8, border: `1px solid ${V3_EDGE}`, color: V3_CREAM, background: "transparent", cursor: "pointer", whiteSpace: "nowrap", textDecoration: "none", font: "inherit" };
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", font: "inherit", fontSize: 12.5, padding: "6px 9px", borderRadius: 8, border: `1px solid ${V3_EDGE}`, background: "rgba(244,239,230,0.05)", color: V3_CREAM, outline: "none" };
/** A native <select> paints its list in the OS's colours unless told otherwise — on this navy
 *  panel that was white-on-white ("hard to read", Lee, 2026-09-10). */
const selectStyle: React.CSSProperties = { background: "#141A2E", color: V3_CREAM, colorScheme: "dark" };
const optionStyle: React.CSSProperties = { background: "#141A2E", color: "#F4EFE6" };
const label: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: V3_MUTED, marginTop: 10, marginBottom: 4 };

/** THE EDITOR, docked bottom-right so Lee reads the map while he uses it. Everything saves on
 *  blur / Enter / change — there is no Save button, the same law as the rest of V3. */
const DEST_SHORT: Record<PublishDestination, string> = { site: "site", youtube: "YT", instagram: "IG", tiktok: "TT" };

function SetPanel({ topic, set, info, layout, takesOf, publish, onChanged, onSelect, onClose, onProduce, onSplit }: {
  topic: BoothTopic; set: BoothSetInfo; info: StageInfo; layout: LaneLayout | null;
  /** set_publish_status by publish key — a set's id, or "<setId>#N" for its N-th split. */
  publish: Record<string, SetPublishStatus>;
  takesOf: (id: string) => readonly LaneTake[];
  onChanged: () => Promise<void>; onSelect: (id: string) => void; onClose: () => void;
  /** Open this video's post-production over the map. */
  onProduce: (pubKey: string, title: string) => void;
  /** Open the split wizard for this set. */
  onSplit: () => void;
}) {
  const lane = laneOf(set);
  const parent = set.branchFrom ? topic.sets.find((s) => s.id === set.branchFrom) : null;
  const node = layout?.nodes.find((n) => n.id === set.id) ?? null;
  const parentTakes = parent ? takesOf(parent.id) : [];
  // THE VIDEOS this set is: one per split when it has cuts, else itself. Keyed the way /v3/post
  // keys its rows, so the ticks here are the ticks there.
  const ownTakes = takesOf(set.id);
  const videos = (ownTakes.length > 1 ? ownTakes : [{ headId: "", name: "" }]).map((t, i) => ({
    key: i === 0 ? set.id : `${set.id}#${i + 1}`,
    label: ownTakes.length > 1 ? (t.name || `Split ${i + 1}`) : set.name,
    status: publish[i === 0 ? set.id : `${set.id}#${i + 1}`] ?? null,
  }));
  // THE CRAM PATH FIRST (Lee, 2026-09-10): a branch's post → is shut until the topic's cram
  // path is filmed end to end. The same rule /v3/post applies to its 🎬 button.
  const gate = cramPathGate({ set, topicSets: topic.sets, takesOf, publish });
  const [name, setName] = useState(set.name);
  const [blurb, setBlurb] = useState(set.blurb ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [minting, setMinting] = useState<DeckLane | null>(null);
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

      {/* THE PIPELINE, first: "all I really want to see is the title and a way to get to the
          brainstorming editor, the pipeline of it — and then I can come back here to post it." */}
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        {STEP_LINKS.map((st) => (
          <Link key={st.step} to={blastOffPath(topic, set, st.step)} style={{ ...small, ...(st.step === info.next ? { borderColor: `${V3_GOLD}88`, color: V3_GOLD } : {}) }} title={st.title}>{st.label}</Link>
        ))}
      </div>

      {/* THE VIDEOS — Lee, 2026-09-10: "see the visual map of each video… track whether they're posted
          to IG, YT, TT". Each split is a row; each row is a door into its post-production. */}
      <div style={{ ...label, display: "flex", alignItems: "center", gap: 8 }}>
        <span>Videos</span>
        {lane === "cram" && <button type="button" onClick={onSplit} style={{ ...small, padding: "1px 7px", fontSize: 10, letterSpacing: 0, textTransform: "none", borderColor: `${V3_GOLD}66`, color: V3_GOLD }} title="Cards on the left, splits on the right — drag them where they go">✂ arrange splits</button>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {videos.map((v) => (
          <div key={v.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: V3_CREAM }}>{v.label}</span>
            {ownTakes.length > 1 && (
              <>
                <Link to={blastOffPath(topic, set, "results")} search={{ take: videos.indexOf(v) + 1 } as never} style={{ ...small, padding: "2px 6px", fontSize: 10.5, color: V3_MUTED }} title="The Editor, with just this split open">edit</Link>
                <Link to={blastOffPath(topic, set, "film")} search={{ take: videos.indexOf(v) } as never} style={{ ...small, padding: "2px 6px", fontSize: 10.5, color: V3_MUTED }} title="Film just this split">film</Link>
              </>
            )}
            {v.status?.filmedAt && <span title="filmed" style={{ color: "#7DD3FC", fontSize: 10 }}>🎬</span>}
            {PUBLISH_DESTINATIONS.map((d) => {
              const on = !!v.status?.[d].postedAt;
              return <span key={d} title={`${DEST_SHORT[d]}: ${on ? "posted" : "not yet"}`} style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.04em", color: on ? "#3BF5A0" : V3_MUTED, opacity: on ? 1 : 0.55 }}>{on ? "✓" : "○"}{DEST_SHORT[d]}</span>;
            })}
            <button type="button" onClick={gate ? undefined : () => onProduce(v.key, v.label)} disabled={!!gate} style={{ ...small, padding: "2px 7px", fontSize: 10.5, borderColor: gate ? V3_EDGE : `${V3_GOLD}66`, color: gate ? V3_MUTED : V3_GOLD, cursor: gate ? "not-allowed" : "pointer", opacity: gate ? 0.6 : 1 }} title={gate ? gate.reason : "Post-production for this video, right here: transcript, captions, cover, then post"}>{gate ? "🔒" : "post →"}</button>
          </div>
        ))}
      </div>

      {gate && <div style={{ fontSize: 11, color: "#FF9F43", marginTop: 6, lineHeight: 1.45 }}>{gate.reason}</div>}

      <div style={label}>Name</div>
      <input value={name} onChange={(e) => setName(e.target.value)} onBlur={rename} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} style={{ ...field, fontSize: 13.5, fontWeight: 700 }} />

      <input value={blurb} onChange={(e) => setBlurb(e.target.value)} onBlur={describe} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} placeholder="one line students see under it (optional)" style={{ ...field, marginTop: 6, fontSize: 12, color: V3_MUTED }} />

      {lane !== "cram" && parent && (
        <>
          <div style={label}>Hangs off</div>
          <select value={set.branchTakeHead ?? ""} onChange={(e) => attach(e.target.value)} style={{ ...field, ...selectStyle }}>
            <option value="" style={optionStyle}>{parent.name} — the whole set</option>
            {parentTakes.map((t, i) => <option key={t.headId} value={t.headId} style={optionStyle}>{t.name || `Split ${i + 1}`}</option>)}
          </select>
          {node?.takeMissing && <div style={{ fontSize: 11.5, color: "#FF9F43", marginTop: 4 }}>The split this pointed at is gone from the parent's plan — pick another.</div>}
          {parentTakes.length === 0 && <div style={{ fontSize: 11, color: V3_MUTED, marginTop: 4 }}>The parent has no saved plan yet, so it has no splits to attach to.</div>}
          <div style={{ fontSize: 11, color: V3_MUTED, marginTop: 6 }}>Drag it on the map to reorder it or move it to another split.</div>
        </>
      )}

      {lane === "cram" && (
        <>
          <div style={label}>Hang something off it</div>
          {minting ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <input autoFocus value={mintName} onChange={(e) => setMintName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") mint(); if (e.key === "Escape") setMinting(null); }} placeholder={minting === "pitch" ? "the pitch, in a line" : "the teaching video, in a line"} style={field} />
              {takesOf(set.id).length > 1 && (
                <select value={mintHead} onChange={(e) => setMintHead(e.target.value)} style={{ ...field, ...selectStyle }}>
                  <option value="" style={optionStyle}>off the whole set</option>
                  {takesOf(set.id).map((t, i) => <option key={t.headId} value={t.headId} style={optionStyle}>off {t.name || `Split ${i + 1}`}</option>)}
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
        </>
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ flex: 1 }} />
        {lane !== "cram" && <button type="button" onClick={park} style={{ ...small, color: V3_MUTED }} title="Leaves the map and the queue; nothing is deleted">park</button>}
      </div>
      {(busy || err) && <div style={{ fontSize: 11.5, marginTop: 8, color: err ? "#FF8B7E" : V3_MUTED }}>{err ?? `${busy}…`}</div>}
    </div>
  );
}
