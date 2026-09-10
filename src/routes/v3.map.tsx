// /v3/map — THE CRAM PATH AND WHAT HANGS OFF IT, per topic.
//
// Lee, 2026-09-09, after his first three shorts: "once we get this new layout tool built, for
// mapping cram path versus offshoot… it'll be fun to reengineer the topics and figure out what is
// core to cramming and what is more of an offshoot, save for the end, takes more time to make,
// more thought to get it right, uses more examples, a bit longer form (still under 3 minutes)."
//
// This is that tool. Three columns per topic — pitches left, the cram path down the middle,
// offshoots right — coloured by the same stage chip the queue uses, so the map and the queue can
// never tell different stories. Clicking a node opens a panel with the four steps and the two
// mint buttons.
//
// It reads; it does not decide. The lane lives on the deck (lib/deck-lane.ts, absent = cram), so
// a topic nobody has marked draws as one straight path — which is the truth about the bank today.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { AdminGate } from "@/components/AdminGate";
import { LaneMap, LaneMapHeadings } from "@/components/v3/LaneMap";
import { layoutLanes, bareCramIds } from "@/components/v3/lane-map";
import { blastOffPath, slugOf, useBank } from "@/components/v3/use-bank";
import { V3Shell, V3Note, V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { StageChip, stepLabel } from "@/components/v3/StageChip";
import { stageOf, talkStageOf, type StageInfo } from "@/components/v3/set-stage";
import { LANE_LABEL, laneOf } from "@/lib/deck-lane";
import { estimatedLengthSeconds, fmtRange } from "@/components/blastoff/film-summary";
import { listBlastPlanSetIds } from "@/lib/blastoff.functions";
import { listPublishStatuses, type SetPublishStatus } from "@/lib/publish-queue.functions";
import { productionBottleneckReport } from "@/lib/production-time.functions";
import { orderedSets } from "@/lib/v3-topic-groups";
import { startTT, subscribeTT, ttState, type TTState } from "@/components/canvas/talkthrough-sync";
import type { BoothSetInfo, BoothTopic } from "@/lib/talkthrough.functions";

export const Route = createFileRoute("/v3/map")({
  component: () => <AdminGate><LaneMapPage /></AdminGate>,
  head: () => ({ meta: [{ title: "🗺 The map — Blast Off" }, { name: "robots", content: "noindex" }] }),
});

function LaneMapPage() {
  const { topics, error } = useBank();
  const [tt, setTT] = useState<TTState>(() => ttState());
  const [plans, setPlans] = useState<Map<string, number>>(() => new Map());
  const [filmSeconds, setFilmSeconds] = useState<Map<string, number>>(() => new Map());
  const [publish, setPublish] = useState<Record<string, SetPublishStatus>>({});
  const [selected, setSelected] = useState<string | null>(null);

  // Every signal is best-effort, exactly as /v3 loads them: a map that draws without a stage chip
  // is still a map, and none of this is worth an error screen.
  useEffect(() => {
    startTT();
    const unTT = subscribeTT(setTT);
    listBlastPlanSetIds()
      .then((rows) => setPlans(new Map(rows.map((r) => [r.setId, r.takes.reduce((n, t) => n + t.frames, 0)]))))
      .catch(() => { /* no plan signal — no runtime chip */ });
    productionBottleneckReport()
      .then((r) => setFilmSeconds(new Map(r.sets.map((s) => [s.setId, s.bySteps.film ?? 0]))))
      .catch(() => { /* chip falls back */ });
    listPublishStatuses().then(setPublish).catch(() => { /* chip falls back */ });
    return () => { unTT(); };
  }, []);

  const stageFor = (set: BoothSetInfo): StageInfo => {
    const p = publish[set.id] ?? null;
    return stageOf({ talk: talkStageOf(tt, set), hasPlan: plans.has(set.id), filmSeconds: filmSeconds.get(set.id) ?? 0, filmedAt: p?.filmedAt ?? null, publish: p });
  };

  // Strategy shorts have their own board; they are not on any exam's cram path.
  const exam = useMemo(() => (topics ?? []).filter((t) => t.kind !== "strategy"), [topics]);
  const allSets = useMemo(() => new Map((topics ?? []).flatMap((t) => t.sets.map((s) => [s.id, { set: s, topic: t }] as const))), [topics]);
  const picked = selected ? allSets.get(selected) ?? null : null;

  return (
    <V3Shell wide crumbs={[{ label: "V3", to: "/v3" }, { label: "Map" }]}>
      <h1 style={{ fontFamily: V3_DISPLAY, fontSize: 30, fontWeight: 900, letterSpacing: "-0.01em", margin: "0 0 6px" }}>🗺 The map</h1>
      <div style={{ color: V3_MUTED, fontSize: 13, marginBottom: 22, maxWidth: 680, lineHeight: 1.55 }}>
        The cram path down the middle — short, fast, what's on the exam. Teaching videos hang off it
        on the right; pitches on the left. A set with no lane is on the path, so a topic nobody has
        marked draws as one straight line. Set the lane on a set's own screen.
      </div>

      {error && <V3Note tone="bad">Could not load the bank: {error}</V3Note>}
      {!topics && !error && <V3Note>Loading…</V3Note>}

      {topics && exam.length === 0 && <V3Note>No exam topics in the bank yet.</V3Note>}

      {exam.map((t) => {
        const order = orderedSets(slugOf(t.name), t.sets);
        const layout = layoutLanes(order);
        const bare = bareCramIds(layout);
        return (
          <section key={t.id} id={slugOf(t.name)} style={{ marginBottom: 34 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              <Link to="/v3/$topic" params={{ topic: slugOf(t.name) }} style={{ fontFamily: V3_DISPLAY, fontSize: 17, fontWeight: 900, color: V3_CREAM, textDecoration: "none" }}>{t.name}</Link>
              <span style={{ fontSize: 11.5, color: V3_MUTED }}>
                {layout.rows} on the path
                {layout.nodes.length - layout.rows > 0 ? ` · ${layout.nodes.length - layout.rows} hanging off` : ""}
                {bare.length ? ` · ${bare.length} with nothing deeper yet` : ""}
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
                  runtime={(id) => { const n = plans.get(id); return n ? fmtRange(estimatedLengthSeconds({ total: n } as never)) : null; }}
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

      {picked && <SetPanel topic={picked.topic} set={picked.set} info={stageFor(picked.set)} onClose={() => setSelected(null)} />}
    </V3Shell>
  );
}

/** What a clicked node opens: which lane it is on, where it is in the pipeline, and the four
 *  doors. Docked bottom-right rather than a modal — Lee is reading the map while he uses it. */
function SetPanel({ topic, set, info, onClose }: { topic: BoothTopic; set: BoothSetInfo; info: StageInfo; onClose: () => void }) {
  const lane = laneOf(set);
  const parent = set.branchFrom ? topic.sets.find((s) => s.id === set.branchFrom) : null;
  const kids = topic.sets.filter((s) => s.branchFrom === set.id);
  const small: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, padding: "5px 10px", borderRadius: 8, border: `1px solid ${V3_EDGE}`, color: V3_CREAM, textDecoration: "none", whiteSpace: "nowrap" };
  return (
    <div style={{ position: "fixed", right: 18, bottom: 18, zIndex: 60, width: 320, background: "#0B0F1E", border: `1px solid ${V3_GOLD}66`, borderRadius: 14, padding: 14, boxShadow: "0 20px 50px rgba(0,0,0,0.55)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: V3_CREAM, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{set.name}</div>
        <button type="button" onClick={onClose} style={{ ...small, background: "transparent", cursor: "pointer", color: V3_MUTED }}>close</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: V3_MUTED }}>{LANE_LABEL[lane]}{parent ? ` off ${parent.name}` : ""}</span>
        <StageChip info={info} />
      </div>
      {kids.length > 0 && (
        <div style={{ fontSize: 11.5, color: V3_MUTED, marginTop: 6, lineHeight: 1.5 }}>
          Hanging off it: {kids.map((k) => k.name).join(", ")}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        <Link to={blastOffPath(topic, set, info.next)} style={{ ...small, borderColor: `${V3_GOLD}88`, color: V3_GOLD }}>Resume at {stepLabel(info.next)}</Link>
        <Link to="/v3/$topic/$set" params={{ topic: slugOf(topic.name), set: slugOf(set.name) }} style={small}>Set the lane</Link>
      </div>
    </div>
  );
}
