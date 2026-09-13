// /v4 — THE TOPICS. Every cram set in the bank, grouped the way the bank groups them, with where each
// v4 topic is. No lanes, no offshoots, no pitches (Lee: "Hide sets, lanes and offshoots from the v4
// flow") — a topic here is one set, one chain.
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { V3Note, V3Shell, V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { slugOf, useBank } from "@/components/v3/use-bank";
import { laneOf } from "@/lib/deck-lane";
import { listV4Topics } from "@/lib/v4.functions";

import { V4_MINT } from "./V4Chrome";
import { V4_STEP_LABEL, type V4Step } from "./v4-topic";

export function V4Home() {
  const { topics, error } = useBank();
  const [v4, setV4] = useState<Map<string, string> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { listV4Topics().then((rows) => setV4(new Map(rows.map((r) => [r.setId, r.step])))).catch((e) => setErr(e instanceof Error ? e.message : String(e))); }, []);

  const exam = (topics ?? []).filter((t) => t.kind !== "strategy");
  return (
    <V3Shell crumbs={[{ label: "V4" }]}>
      <h1 style={{ fontFamily: V3_DISPLAY, fontSize: 32, fontWeight: 900, letterSpacing: "-0.01em", margin: "0 0 4px" }}>v4 · one topic, five steps</h1>
      <div style={{ color: V3_MUTED, fontSize: 13.5, maxWidth: 640, lineHeight: 1.5 }}>
        Questions → Slides → Chain → Split → Film. Talk it, let the AI propose, edit until it's yours, mark it final. v3 stays exactly as it was.
      </div>
      <div style={{ marginTop: 8 }}><Link to="/v4/todo" style={{ color: V3_GOLD, fontWeight: 700, fontSize: 13, textDecoration: "none" }}>To-do · every placeholder →</Link></div>
      {error && <V3Note tone="bad">Could not load the bank: {error}</V3Note>}
      {err && <V3Note tone="bad">{err}</V3Note>}
      {(!topics || !v4) && !error && !err && <V3Note>Loading…</V3Note>}
      {topics && v4 && exam.map((t) => {
        const sets = t.sets.filter((s) => laneOf(s) === "cram");
        if (!sets.length) return null;
        return (
          <section key={t.id} style={{ marginTop: 22 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: V3_MUTED, marginBottom: 6 }}>{t.name}</div>
            <div style={{ border: `1px solid ${V3_EDGE}`, borderRadius: 12, overflow: "hidden" }}>
              {sets.map((s, i) => {
                const step = v4.get(s.id) as V4Step | undefined;
                return (
                  <Link key={s.id} to={step ? "/v4/$topic/$set/$step" : "/v4/$topic/$set"} params={step ? { topic: slugOf(t.name), set: slugOf(s.name), step } : { topic: slugOf(t.name), set: slugOf(s.name) } as never}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderTop: i ? `1px solid ${V3_EDGE}` : "none", textDecoration: "none", color: V3_CREAM }}>
                    <span style={{ fontSize: 14.5, fontWeight: 700, flex: 1 }}>{s.name}</span>
                    <span style={{ fontSize: 12, color: V3_MUTED }}>{s.liveCount} question{s.liveCount === 1 ? "" : "s"}</span>
                    {step
                      ? <span style={{ fontSize: 12, fontWeight: 800, color: V4_MINT }}>v4 · {V4_STEP_LABEL[step] ?? step} →</span>
                      : <span style={{ fontSize: 12, fontWeight: 700, color: V3_GOLD }}>Start in v4 →</span>}
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </V3Shell>
  );
}
