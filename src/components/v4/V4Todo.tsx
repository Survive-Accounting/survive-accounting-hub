// /v4/todo — every placeholder question and slide across the v4 topics, grouped by topic, with the split
// it holds up. Lee: "Placeholders should be easy to find later as a to-do list … Blocked ones go on a
// to-do list and become filmable once the placeholders are resolved."
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { V3Note, V3Shell, V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { slugOf, topicOfSet, useBank } from "@/components/v3/use-bank";
import { listV4Todo } from "@/lib/v4.functions";

import { V4_AMBER } from "./V4Chrome";

type Todo = Awaited<ReturnType<typeof listV4Todo>>;

export function V4Todo() {
  const { topics } = useBank();
  const [todo, setTodo] = useState<Todo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { listV4Todo().then(setTodo).catch((e) => setErr(e instanceof Error ? e.message : String(e))); }, []);
  const blockedSplits = (todo ?? []).reduce((n, t) => n + new Set(t.items.map((i) => i.split).filter((s) => s !== null)).size, 0);

  return (
    <V3Shell crumbs={[{ label: "V4", to: "/v4" }, { label: "To-do" }]}>
      <h1 style={{ fontFamily: V3_DISPLAY, fontSize: 30, fontWeight: 900, margin: "0 0 4px" }}>To-do · placeholders</h1>
      {err && <V3Note tone="bad">{err}</V3Note>}
      {!todo && !err && <V3Note>Loading…</V3Note>}
      {todo && todo.length === 0 && <V3Note>Nothing to build — every v4 topic's splits are ready.</V3Note>}
      {todo && todo.length > 0 && <div style={{ color: V3_MUTED, fontSize: 13.5 }}>Resolve these to unblock {blockedSplits} split{blockedSplits === 1 ? "" : "s"}.</div>}
      {todo?.map((t) => {
        const topic = topics ? topicOfSet(topics, t.setId) : undefined;
        const set = topic?.sets.find((s) => s.id === t.setId);
        const params = topic && set ? { topic: slugOf(topic.name), set: slugOf(set.name) } : null;
        const bySplit = new Map<number | null, typeof t.items>();
        for (const i of t.items) bySplit.set(i.split, [...(bySplit.get(i.split) ?? []), i]);
        return (
          <section key={t.setId} style={{ marginTop: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: V3_CREAM }}>{t.setName}</div>
            {[...bySplit.entries()].sort((a, b) => (a[0] ?? 999) - (b[0] ?? 999)).map(([split, items]) => (
              <div key={String(split)} style={{ marginTop: 8, border: `1px solid ${V3_EDGE}`, borderRadius: 12, padding: "8px 12px" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: V3_MUTED, letterSpacing: "0.08em", textTransform: "uppercase" }}>{split === null ? "Not in a split yet" : `Split ${split + 1}`}</div>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 13, color: V3_CREAM, lineHeight: 1.6 }}>
                  {items.map((i) => (
                    <li key={i.id}>
                      <span style={{ color: V4_AMBER, fontWeight: 700 }}>{i.kind === "question" ? "Question" : "Slide"}</span> — {i.note || i.label}
                      {i.kind === "question" && i.label && i.note ? <span style={{ color: V3_MUTED }}> ({i.label.slice(0, 60)})</span> : null}
                      {params && <> · <Link to="/v4/$topic/$set/$step" params={{ ...params, step: i.kind === "question" ? "questions" : "slides" }} style={{ color: V3_GOLD }}>fix</Link></>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </V3Shell>
  );
}
