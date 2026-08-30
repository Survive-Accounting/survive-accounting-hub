import { test, expect } from "bun:test";
import { buildUsageReport, renderActivityPrompt, type EventLite, type SessionLite } from "./usage-report";
import type { UsageElement } from "./usage-elements";

const man: UsageElement[] = [
  { id: "used-a", label: "Used A", panel: "p1" },
  { id: "seen-b", label: "Seen B", panel: "p1" },
  { id: "never-c", label: "Never C", panel: "collapsed" },
  { id: "dead-d", label: "Dead D", panel: "p2" },
  { id: "protected-e", label: "Refund handling", panel: "p2" },
];
const ev = (o: Partial<EventLite> & { element_id: string; event_type: EventLite["event_type"]; session_id: string }): EventLite =>
  ({ element_label: null, occurred_at: "2026-08-29T10:00:00.000Z", parent_panel: null, ...o });
const events: EventLite[] = [
  ev({ element_id: "used-a", event_type: "impression", session_id: "s1" }),
  ev({ element_id: "used-a", event_type: "interaction", session_id: "s1", occurred_at: "2026-08-29T10:01:00.000Z" }),
  ev({ element_id: "used-a", event_type: "interaction", session_id: "s1", occurred_at: "2026-08-29T10:02:00.000Z" }),
  ev({ element_id: "seen-b", event_type: "impression", session_id: "s1" }),
  ev({ element_id: "dead-d", event_type: "impression", session_id: "s1" }),
  ev({ element_id: "dead-d", event_type: "interaction", session_id: "s1" }),
  ev({ element_id: "protected-e", event_type: "rage_click", session_id: "s1" }),
];
const sessions: SessionLite[] = [{ id: "s1", started_at: "2026-08-29T09:59:00.000Z", ended_at: null, active_ms: 180000 }];

const report = buildUsageReport({ surface: "study-canvas", layoutVersion: "v1", rangeLabel: "this session", events, sessions, manifest: man, protectedIds: ["protected-e"] });

test("used = interacted, ranked, with last-used date", () => {
  expect(report.used.map((u) => u.id)).toEqual(["used-a", "dead-d"]);
  expect(report.used[0].interactions).toBe(2);
  expect(report.used[0].lastUsedIso).toBe("2026-08-29T10:02:00.000Z");
});
test("seen but never touched excludes the used ones", () => {
  expect(report.seenNotTouched.map((s) => s.id)).toEqual(["seen-b"]);
});
test("never rendered = manifest elements with no impression and no interaction", () => {
  expect(report.neverRendered.map((n) => n.id).sort()).toEqual(["never-c", "protected-e"]);
});
test("dead ends = interacted exactly once", () => {
  expect(report.deadEnds.map((d) => d.id)).toContain("dead-d");
  expect(report.deadEnds.map((d) => d.id)).not.toContain("used-a");
});
test("rage clicks surfaced", () => {
  expect(report.rageClicks[0].id).toBe("protected-e");
});
test("time-to-first-interaction computed from session start", () => {
  // earliest interaction is dead-d @10:00:00, session start 09:59:00 => 60s
  expect(report.timeToFirstMs.medianMs).toBe(60000);
});
test("low-confidence flagged under 20 sessions", () => {
  expect(report.lowConfidence).toBe(true);
});
test("prompt contains the sections + protected marker + no-change instruction", () => {
  const p = renderActivityPrompt(report);
  expect(p).toContain("Seen but never touched");
  expect(p).toContain("Never rendered");
  expect(p).toContain("🔒protected");
  expect(p).toContain("Make NO code changes until I approve");
  expect(p).toContain("Low usage is NOT the same as low value");
});
