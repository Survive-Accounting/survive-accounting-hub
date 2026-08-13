// MEMO SCOPE (Lee) — memos are reusable across an entire TOPIC, not just one
// lesson. A memo lives in some frame under a lesson; that lesson carries a
// `topic` field (topic-grouping batch). Two memos are in the same library iff
// their owning lessons share a topic. These helpers are the single source of
// truth for "which lesson owns this node" and "what topic is that lesson",
// shared by the Memo Library panel and the CEQ previewer's reuse list.
import type { useReactFlow } from "@xyflow/react";

type Rf = ReturnType<typeof useReactFlow>;

/** Walk parentId up to the enclosing lesson NODE (≤6 hops). Null if none. */
export function lessonNodeOf(rf: Rf, start: { parentId?: string }) {
  let cur: { parentId?: string } | undefined = start;
  let guard = 0;
  while (cur?.parentId && guard++ < 6) {
    const p = rf.getNode(cur.parentId);
    if (!p) return null;
    if (p.type === "lesson") return p;
    cur = p;
  }
  return null;
}

/** A lesson node's topic (trimmed; falls back to its label). "" if neither. */
export function topicOfLessonNode(lesson: { data?: unknown } | null | undefined): string {
  const d = (lesson?.data ?? {}) as { topic?: unknown; label?: unknown };
  const raw = typeof d.topic === "string" && d.topic.trim() ? d.topic : typeof d.label === "string" ? d.label : "";
  return raw.trim();
}

/** Case-insensitive match key for a topic (so "Cash" == "cash"). */
export const topicKey = (t: string) => t.trim().toLowerCase();

/** The topic that owns a node (via its lesson). "" if the node isn't under a lesson. */
export function topicOfNode(rf: Rf, node: { parentId?: string }): string {
  return topicOfLessonNode(lessonNodeOf(rf, node));
}
