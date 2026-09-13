// STEP 5 · FILM (v4). The splits in order, each Ready or Blocked. Ready films now (/film in a new tab on its
// first slide); Blocked says exactly which placeholder question or slide holds it up, with a door to fix
// it, and turns Ready the moment the last one is resolved — worked out fresh every time, never stored.
//
// Lee, 2026-09-13: "Film each split in order, then move to the next topic." · "show each split as Ready
// (no placeholders) or Blocked (contains a placeholder question or slide). I film Ready splits
// immediately. Blocked ones go on a to-do list and become filmable once the placeholders are resolved."
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import type { BlastFrame } from "@/components/blastoff/plan";
import { contentCount, frameCountLabel } from "@/components/blastoff/reel";
import { V3_CREAM, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { publishKey } from "@/components/v3/publish-rekey";
import { blastOffPath, slugOf } from "@/components/v3/use-bank";
import { loadBlastPlan } from "@/lib/blastoff.functions";
import { laneOf } from "@/lib/deck-lane";
import { listPublishStatuses, type SetPublishStatus } from "@/lib/publish-queue.functions";
import type { BoothSetInfo, BoothTopic } from "@/lib/talkthrough.functions";

import { V4_AMBER, V4_MINT, V4_RED, v4Button } from "./V4Chrome";
import type { V4TopicData } from "./V4TopicPage";
import { splitRows } from "./v4-chain";
import type { V4Card } from "./v4-topic";

export function V4Film({ data, set, topic, topics, topicKey, setKey }: { data: V4TopicData; set: BoothSetInfo; topic: BoothTopic; topics: BoothTopic[]; topicKey: string; setKey: string }) {
  const cards = data.cards as V4Card[];
  const [frames, setFrames] = useState<BlastFrame[] | null>(null);
  const [publish, setPublish] = useState<Record<string, SetPublishStatus>>({});
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    loadBlastPlan({ data: { setId: data.setId } }).then((p) => setFrames((p?.frames ?? []) as BlastFrame[])).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    listPublishStatuses().then(setPublish).catch(() => { /* no filmed/posted chips */ });
  }, [data.setId]);

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const rows = useMemo(() => (frames ? splitRows(frames, (id) => { const c = byId.get(id); return c?.placeholder && !c.rejected ? { note: c.placeholder.note, stem: c.stem } : null; }) : []), [frames, byId]);

  // The next topic: the next cram set in this topic, else the first of the next topic.
  const next = useMemo(() => {
    const exam = topics.filter((t) => t.kind !== "strategy");
    const flat = exam.flatMap((t) => t.sets.filter((s) => laneOf(s) === "cram").map((s) => ({ t, s })));
    const i = flat.findIndex((x) => x.s.id === set.id);
    return i >= 0 ? flat[i + 1] ?? null : null;
  }, [topics, set.id]);

  if (err) return <div style={{ color: V4_RED, fontSize: 13 }}>{err}</div>;
  if (!frames) return <div style={{ color: V3_MUTED, fontSize: 13 }}>Loading the splits…</div>;
  const ready = rows.filter((r) => !r.blockers.length).length;

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 14px", border: `1px solid ${V3_EDGE}`, borderRadius: 12 }}>
        <span style={{ fontSize: 13.5, color: V3_CREAM }}><b style={{ color: V4_MINT }}>{ready}</b> ready · <b style={{ color: rows.length - ready ? V4_AMBER : V3_MUTED }}>{rows.length - ready}</b> blocked</span>
        <Link to="/v4/todo" style={{ ...v4Button(), textDecoration: "none" }}>To-do list</Link>
        <span style={{ flex: 1 }} />
        {next && <Link to="/v4/$topic/$set" params={{ topic: slugOf(next.t.name), set: slugOf(next.s.name) }} style={{ ...v4Button("gold"), textDecoration: "none" }}>Next topic: {next.s.name} →</Link>}
      </div>
      {!data.state?.final.split && <div style={{ marginTop: 8, fontSize: 12.5, color: V4_AMBER }}>Split isn't marked final yet — you can still film, but check the cuts first.</div>}

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((r) => {
          const pub = publish[publishKey(set.id, r.index)];
          const posted = !!pub?.site.postedAt;
          const filmed = !!pub?.filmedAt || posted;
          const blocked = r.blockers.length > 0;
          return (
            <div key={r.headId || r.index} style={{ border: `1px solid ${blocked ? `${V4_AMBER}88` : `${V4_MINT}55`}`, borderRadius: 12, padding: "10px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14.5, fontWeight: 900, color: V3_CREAM }}>{r.index + 1}. {r.name || `Split ${r.index + 1}`}</span>
                <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", borderRadius: 999, padding: "2px 9px", color: "#0B0F1E", background: blocked ? V4_AMBER : V4_MINT }}>{blocked ? "BLOCKED" : "READY"}</span>
                <span style={{ fontSize: 12, color: V3_MUTED }}>{frameCountLabel(contentCount(r.frames))}</span>
                {posted ? <span style={{ fontSize: 12, color: V4_MINT, fontWeight: 700 }}>posted</span> : filmed ? <span style={{ fontSize: 12, color: V4_MINT }}>filmed</span> : null}
                <span style={{ flex: 1 }} />
                {blocked
                  ? <span title="Resolve the placeholders below to film this split" style={{ ...v4Button(), opacity: 0.45, cursor: "not-allowed" }}>🎬 Film</span>
                  : <a href={`${blastOffPath(topic, set, "film")}?take=${r.index}${r.headId ? `&frame=${encodeURIComponent(r.headId)}` : ""}`} target="_blank" rel="noreferrer" style={{ ...v4Button("gold"), textDecoration: "none" }}>🎬 Film</a>}
                <a href={`/v3/post?open=${encodeURIComponent(publishKey(set.id, r.index))}`} style={{ ...v4Button(), textDecoration: "none", color: V3_MUTED }}>Post →</a>
              </div>
              {blocked && (
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12.5, color: V3_CREAM, lineHeight: 1.6 }}>
                  {r.blockers.map((b) => (
                    <li key={b.frameId}>
                      <span style={{ color: V4_AMBER, fontWeight: 700 }}>{b.kind === "question" ? "Question" : "Slide"}</span> — {b.note || b.label}
                      {" · "}
                      <Link to="/v4/$topic/$set/$step" params={{ topic: topicKey, set: setKey, step: b.kind === "question" ? "questions" : "slides" }} style={{ color: V3_GOLD }}>fix in {b.kind === "question" ? "Questions" : "Slides"}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
