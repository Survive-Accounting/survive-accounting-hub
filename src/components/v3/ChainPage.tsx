// THE CHAIN PAGE (D) — /v3/$topic/chain. Every video planned for the topic, in play order, and a
// Now / Later / Skip on each (chain.ts has the rules; video_plans the decisions).
//
// Lee, 2026-09-13: "Getting all the ideas out, then prioritizing which ones for now or later or to
// skip." So the list leads with the counts, filters by decision, and every row carries what he needs
// to decide: what it is, what it hangs off, how long it runs, whether it's filmed or posted, and a
// door to edit it or film it.
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getAdminWho } from "@/components/AdminGate";
import { frameCountLabel, frameFlag } from "@/components/blastoff/reel";
import { V3Note, V3Shell, V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { blastOffPath, findTopic, slugOf, useBank } from "@/components/v3/use-bank";
import { publishKey } from "@/components/v3/publish-rekey";
import { listBlastPlanSetIds } from "@/lib/blastoff.functions";
import { listPublishStatuses, type SetPublishStatus } from "@/lib/publish-queue.functions";
import { orderedSets } from "@/lib/v3-topic-groups";
import { listVideoPlans, setVideoPlan, type VideoStatus } from "@/lib/video-plans.functions";

import { buildChain, chainCounts, chainTitle, type ChainEntry, type ChainStatus, type ChainTake } from "./chain";
import { layoutLanes, type LaneTake } from "./lane-map";

const MINT = "#3BF5A0";
const RED = "#FF8B7E";
const AMBER = "#F59E0B";
const LANE_CHIP: Record<ChainEntry["lane"], { label: string; color: string }> = {
  cram: { label: "Cram", color: V3_GOLD },
  offshoot: { label: "Offshoot", color: "#7DD3FC" },
  pitch: { label: "Pitch", color: "#F0ABFC" },
};
const STATUS_META: Record<VideoStatus, { label: string; color: string; title: string }> = {
  now: { label: "Now", color: MINT, title: "Make this one now" },
  later: { label: "Later", color: AMBER, title: "Worth making — not yet" },
  skip: { label: "Skip", color: RED, title: "Not making this one" },
};
const FILTERS: { id: ChainStatus | "all"; label: string }[] = [
  { id: "all", label: "All" }, { id: "undecided", label: "Undecided" }, { id: "now", label: "Now" }, { id: "later", label: "Later" }, { id: "skip", label: "Skip" },
];

export function ChainPage({ topicKey }: { topicKey: string }) {
  const { topics, error } = useBank();
  const topic = topics ? findTopic(topics, topicKey) : undefined;
  const [takes, setTakes] = useState<Map<string, ChainTake[]> | null>(null);
  const [publish, setPublish] = useState<Record<string, SetPublishStatus>>({});
  const [plans, setPlans] = useState<Map<string, VideoStatus>>(new Map());
  const [planErr, setPlanErr] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<ChainStatus | "all">("all");

  useEffect(() => {
    listBlastPlanSetIds()
      .then((rows) => setTakes(new Map(rows.map((r) => [r.setId, r.takes.map((t) => ({ headId: t.headId, name: t.name, content: t.content, about: t.about }))]))))
      .catch((e) => { setTakes(new Map()); setPlanErr(`The plans didn't load: ${e instanceof Error ? e.message : String(e)}`); });
    listPublishStatuses().then(setPublish).catch(() => { /* no filmed/posted chips */ });
  }, []);

  const setIds = useMemo(() => (topic ? topic.sets.map((s) => s.id) : []), [topic]);
  useEffect(() => {
    if (!setIds.length) return;
    listVideoPlans({ data: { setIds } })
      .then((r) => { if (r.ok) setPlans(new Map(r.rows.map((x) => [x.video_key, x.status]))); else setPlanErr(`Now / Later / Skip can't be saved yet — ${r.error}`); })
      .catch((e) => setPlanErr(e instanceof Error ? e.message : String(e)));
  }, [setIds]);

  const chain = useMemo(() => {
    if (!topic || !takes) return [];
    const takesOf = (id: string): readonly LaneTake[] => takes.get(id) ?? [];
    const layout = layoutLanes(orderedSets(slugOf(topic.name), topic.sets), takesOf);
    const nameOf = (id: string) => topic.sets.find((s) => s.id === id)?.name ?? "";
    return buildChain(layout, nameOf, (id) => takes.get(id) ?? []);
  }, [topic, takes]);

  const statusOf = useCallback((key: string): ChainStatus => plans.get(key) ?? "undecided", [plans]);
  const counts = chainCounts(chain, statusOf);
  const shown = chain.filter((e) => filter === "all" || statusOf(e.key) === filter);

  const decide = async (e: ChainEntry, s: VideoStatus) => {
    const prev = plans.get(e.key) ?? null;
    const next = prev === s ? null : s;
    setSaveErr(null);
    setPlans((m) => { const n = new Map(m); if (next) n.set(e.key, next); else n.delete(e.key); return n; });
    try {
      const r = await setVideoPlan({ data: { videoKey: e.key, setId: e.setId, status: next, who: getAdminWho() } });
      if (!r.ok) throw new Error(r.error);
    } catch (err) {
      setPlans((m) => { const n = new Map(m); if (prev) n.set(e.key, prev); else n.delete(e.key); return n; });
      setSaveErr(`Didn't save "${chainTitle(e)}": ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const minutes = chain.filter((e) => statusOf(e.key) === "now").reduce((n, e) => n + (e.content ?? 0), 0);
  return (
    <V3Shell wide crumbs={[{ label: "V3", to: "/v3" }, { label: topic?.name ?? topicKey, to: topic ? `/v3/${slugOf(topic.name)}` : undefined }, { label: "Chain" }]}>
      {error && <V3Note tone="bad">Could not load the bank: {error}</V3Note>}
      {(!topics || !takes) && !error && <V3Note>Loading the chain…</V3Note>}
      {topics && !topic && <V3Note tone="bad">No topic called “{topicKey}” in the live bank.</V3Note>}

      {topic && takes && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <h1 style={{ fontFamily: V3_DISPLAY, fontSize: 30, fontWeight: 900, letterSpacing: "-0.01em", margin: 0 }}>{topic.name} · the chain</h1>
            <span style={{ fontSize: 13, color: V3_MUTED }}>{chain.length} video{chain.length === 1 ? "" : "s"} in play order — decide what to make now</span>
          </div>
          <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
            {(topics ?? []).filter((t) => t.kind !== "strategy").map((t) => (
              <Link key={t.id} to="/v3/$topic/chain" params={{ topic: slugOf(t.name) }}
                style={{ color: t.id === topic.id ? V3_GOLD : V3_MUTED, fontWeight: t.id === topic.id ? 800 : 600, textDecoration: "none" }}>{t.name}</Link>
            ))}
          </div>

          {planErr && <V3Note tone="bad">{planErr}</V3Note>}
          {saveErr && <V3Note tone="bad">{saveErr}</V3Note>}

          <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {FILTERS.map((f) => {
              const on = filter === f.id;
              const n = f.id === "all" ? chain.length : counts[f.id];
              const color = f.id === "all" || f.id === "undecided" ? V3_CREAM : STATUS_META[f.id].color;
              return (
                <button key={f.id} type="button" onClick={() => setFilter(f.id)}
                  style={{ font: "inherit", fontSize: 12.5, fontWeight: 700, padding: "5px 12px", borderRadius: 999, cursor: "pointer", border: `1px solid ${on ? color : V3_EDGE}`, background: on ? `${color}1F` : "transparent", color: on ? color : V3_CREAM }}>
                  {f.label} <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.75 }}>{n}</span>
                </button>
              );
            })}
            {counts.now > 0 && <span style={{ fontSize: 12, color: V3_MUTED }}>Now: {counts.now} video{counts.now === 1 ? "" : "s"} · {frameCountLabel(minutes).replace(/ ·.*$/, "")} in total</span>}
          </div>

          <div style={{ marginTop: 12, border: `1px solid ${V3_EDGE}`, borderRadius: 12, overflow: "hidden" }}>
            {shown.length === 0 && <div style={{ padding: 16, fontSize: 13, color: V3_MUTED }}>Nothing here — try another filter.</div>}
            {shown.map((e, i) => {
              const set = topic.sets.find((s) => s.id === e.setId);
              const status = statusOf(e.key);
              const pub = e.takeIndex !== null ? publish[publishKey(e.setId, e.takeIndex)] : undefined;
              const posted = !!pub?.site.postedAt;
              const filmed = !!pub?.filmedAt || posted;
              const flag = e.content !== null ? frameFlag(e.content) : "ok";
              const lane = LANE_CHIP[e.lane];
              const skipped = status === "skip";
              const title = chainTitle(e);
              return (
                <div key={e.key} style={{ display: "grid", gridTemplateColumns: "40px 78px minmax(0, 1fr) auto auto auto", gap: 10, alignItems: "center", padding: "9px 12px", borderTop: i ? `1px solid ${V3_EDGE}` : "none", background: e.lane === "cram" ? "rgba(252,163,17,0.03)" : "transparent", opacity: skipped ? 0.55 : 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: V3_MUTED, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{e.order || "—"}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: lane.color, border: `1px solid ${lane.color}55`, borderRadius: 6, padding: "2px 6px", textAlign: "center" }}>{lane.label}</span>
                  <div style={{ minWidth: 0 }}>
                    <div title={e.name ? undefined : "Unnamed — this is what it's about. Name it on its header in the Editor."}
                      style={{ fontSize: 13.5, fontWeight: 700, color: e.name ? V3_CREAM : V3_MUTED, fontStyle: e.name ? "normal" : "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: skipped ? "line-through" : "none" }}>{title}</div>
                    <div style={{ fontSize: 11.5, color: V3_MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.parent ? `off ${e.parent.setName}${e.parent.takeName ? ` · ${e.parent.takeName}` : ""}` : e.lane === "cram" && e.splits > 1 ? `${e.setName} · split ${(e.takeIndex ?? 0) + 1} of ${e.splits}` : e.setName}
                      {e.orphan ? " · hangs off nothing — fix it on the map" : ""}
                    </div>
                  </div>
                  <span style={{ fontSize: 11.5, whiteSpace: "nowrap", color: e.content === null ? V3_MUTED : flag === "over" ? RED : flag === "long" ? AMBER : V3_MUTED }}>
                    {e.content === null ? "not planned yet" : frameCountLabel(e.content)}
                  </span>
                  <span style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, whiteSpace: "nowrap" }}>
                    {posted ? <span style={{ color: MINT, fontWeight: 700 }}>posted</span> : filmed ? <span style={{ color: MINT }}>filmed</span> : null}
                    {set && (
                      <a href={blastOffPath(topic, set, "results") + (e.takeIndex !== null && e.splits > 1 ? `?take=${e.takeIndex + 1}` : "")} title="Open it in the Editor" style={{ color: V3_CREAM, textDecoration: "none", border: `1px solid ${V3_EDGE}`, borderRadius: 6, padding: "2px 7px" }}>✨ edit</a>
                    )}
                    {set && e.headId && (
                      <a href={blastOffPath(topic, set, "film") + `?frame=${encodeURIComponent(e.headId)}${e.takeIndex !== null ? `&take=${e.takeIndex}` : ""}`} target="_blank" rel="noreferrer" title="Film it — opens /film in a new tab on its first slide" style={{ color: V3_CREAM, textDecoration: "none", border: `1px solid ${V3_EDGE}`, borderRadius: 6, padding: "2px 7px" }}>🎬 film</a>
                    )}
                  </span>
                  <span role="group" aria-label={`Decide: ${title}`} style={{ display: "inline-flex", border: `1px solid ${V3_EDGE}`, borderRadius: 999, overflow: "hidden" }}>
                    {(Object.keys(STATUS_META) as VideoStatus[]).map((s) => {
                      const on = status === s;
                      const m = STATUS_META[s];
                      return (
                        <button key={s} type="button" aria-pressed={on} title={on ? `${m.title} — click again to undecide` : m.title} onClick={() => void decide(e, s)}
                          style={{ font: "inherit", fontSize: 11.5, fontWeight: 800, padding: "4px 10px", cursor: "pointer", border: "none", background: on ? `${m.color}2A` : "transparent", color: on ? m.color : V3_MUTED }}>{m.label}</button>
                      );
                    })}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: V3_MUTED, maxWidth: 720, lineHeight: 1.5 }}>
            Offshoots and pitches sit right after the split they hang off — move them on the map. A set with no plan yet is one line until you split it in the Editor. Unnamed videos show what they're about in grey.
          </div>
        </>
      )}
    </V3Shell>
  );
}
