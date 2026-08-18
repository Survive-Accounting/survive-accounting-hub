// PIPELINE EDIT TELEMETRY (P4).
//
// The log exists to tune the X/Y trim rule from EVIDENCE. The tests here are
// the never-lose rules (cloned from the Idea Bank) and the pure math: how an
// edit is classified against its proposal, what pruning may touch, and that
// the CSV can't be corrupted by a comma in a file name.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { classifyEdit, editLogCsv, mergeEvents, pendingEvents, pruneEvents, type EditEvent } from "./edit-telemetry";

const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8").split("\r\n").join("\n");

const ev = (id: string, over?: Partial<EditEvent>): EditEvent => ({
  id, at: `2026-08-18T0${id.length % 10}:00:00.000Z`, setId: "set-1", ceqId: "q1", takePath: `takes/${id}.mp4`, takeName: `${id}.mp4`,
  durationS: 10, slateEndMs: 1500, onsetMs: 2000, offsetMs: 8000, proposedInS: 1.85, proposedOutS: 8.25,
  finalInS: 1.85, finalOutS: 8.25, how: "nudge", disposition: "accepted", ruleVersion: "rms-sustain-v1", preRollMs: 150, postRollMs: 250,
  ...over,
});

describe("classifyEdit", () => {
  const proposed = { inS: 1.85, outS: 8.25 };
  test("within one shift-nudge (10ms) = ACCEPTED — the rule was right", () => {
    expect(classifyEdit(proposed, { inS: 1.85, outS: 8.25 })).toBe("accepted");
    expect(classifyEdit(proposed, { inS: 1.86, outS: 8.25 })).toBe("accepted");
  });
  test("within 300ms = NUDGED — the rule was close", () => {
    expect(classifyEdit(proposed, { inS: 1.85, outS: 8.5 })).toBe("nudged");
  });
  test("further = OVERRIDDEN — and so is a hand cut with no proposal at all", () => {
    expect(classifyEdit(proposed, { inS: 0.5, outS: 8.25 })).toBe("overridden");
    expect(classifyEdit(null, { inS: 1.85, outS: 8.25 })).toBe("overridden");
  });
});

describe("never-lose rules", () => {
  test("the queue is DERIVED — an event without syncedAt is pending, full stop", () => {
    const list = [ev("a"), { ...ev("b"), syncedAt: "2026-08-18T00:00:01Z" }];
    expect(pendingEvents(list).map((e) => e.id)).toEqual(["a"]);
  });
  test("pruning drops ONLY synced events, oldest first, and never below the floor", () => {
    const list = [
      ...Array.from({ length: 6 }, (_, i) => ({ ...ev(`s${i}`), syncedAt: "x" })),
      ...Array.from({ length: 4 }, (_, i) => ev(`u${i}`)),
    ];
    const pruned = pruneEvents(list, 8, 5);
    expect(pruned.length).toBe(5);
    // every unsynced event survived; the dropped five were all synced
    expect(pruned.filter((e) => !e.syncedAt).length).toBe(4);
  });
  test("a store full of unsynced events refuses to prune at all", () => {
    const list = Array.from({ length: 10 }, (_, i) => ev(`u${i}`));
    expect(pruneEvents(list, 8, 5).length).toBe(10);
  });
});

describe("export formats", () => {
  test("CSV holds the stable column order and survives commas and quotes", () => {
    const csv = editLogCsv([ev("a", { takeName: 'clip, "the good one".mp4', onsetMs: null })]);
    const [head, row] = csv.split("\n");
    expect(head).toBe("id,at,setId,ceqId,takePath,takeName,durationS,slateEndMs,onsetMs,offsetMs,proposedInS,proposedOutS,finalInS,finalOutS,how,disposition,ruleVersion,preRollMs,postRollMs");
    expect(row).toContain('"clip, ""the good one"".mp4"');
    // a null lands as an EMPTY cell, not the string "null"
    expect(row.split(",").length).toBeGreaterThanOrEqual(19);
    expect(row).not.toContain("null");
  });
  test("merge is a union by id — local wins, order by time", () => {
    const local = [ev("a"), ev("b")];
    const remote = [ev("b", { finalInS: 99 }), ev("c")];
    const m = mergeEvents(local, remote);
    expect(m.map((e) => e.id).sort()).toEqual(["a", "b", "c"]);
    expect(m.find((e) => e.id === "b")?.finalInS).toBe(1.85); // local copy kept
  });
});

// ---- contract pins --------------------------------------------------------

const studio = read("CeqStudio.tsx");
const tele = read("edit-telemetry.ts");
const sql = readFileSync(join(import.meta.dir, "../../../migration/supabase-migrations/0117_edit_events.sql"), "utf8").split("\r\n").join("\n");

describe("every trim door logs", () => {
  test("drag/nudge log through applyTrim, proposals log in the propose loop", () => {
    const apply = studio.slice(studio.indexOf("const applyTrim = "), studio.indexOf("/** PROPOSE TRIMS (P2)"));
    expect(apply).toContain("logTrim(takePath, { inS, outS }, how, proposed);");
    expect(studio).toContain('for (const path of applied) { const p = found.get(path)!; proposedRef.current.set(path, p); logTrim(path, p, "propose", p, spans.get(path)); }');
  });
  test("the proposal baseline survives the nudge that clears autoTrim", () => {
    expect(studio).toContain("const proposed = proposedRef.current.get(takePath) ?? (prev?.autoTrim");
  });
  test("events carry the rule version and the X/Y that produced them", () => {
    expect(studio).toContain("ruleVersion: TRIM_RULE_VERSION,");
    const base = studio.slice(studio.indexOf("const logTrim = "), studio.indexOf("const doExportEditLog"));
    expect(base).toContain("preRollMs,");
    expect(base).toContain("postRollMs,");
  });
});

describe("local-first, loud about failure", () => {
  test("the edit path commits synchronously and never awaits the network", () => {
    const log = tele.slice(tele.indexOf("export function logEditEvent"), tele.indexOf("export async function flushEditLog"));
    expect(log).toContain("saveLocal(events);");
    expect(log).toContain("void flushEditLog();");
    expect(log).not.toContain("await");
  });
  test("a localStorage failure SURFACES in the studio note, never swallowed", () => {
    expect(studio).toContain("EDIT LOG WRITE FAILED (localStorage):");
  });
  test("a failed sync leaves the queue intact and keeps the error visible", () => {
    const fl = tele.slice(tele.indexOf("export async function flushEditLog"), tele.indexOf("export function startEditLog"));
    expect(fl).toContain("error = e instanceof Error ? e.message : String(e);");
    expect(fl).toContain("const ackAt = new Map(acked.map((r) => [r.id, r.created_at]));"); // stamp from the ACK
  });
});

describe("the export", () => {
  test("JSON + CSV, clipboard + download, and it names its scope honestly", () => {
    expect(studio).toContain("navigator.clipboard.writeText(json)");
    expect(studio).toContain('dl(`sa-edit-log-${day}.json`, "application/json", json);');
    expect(studio).toContain('dl(`sa-edit-log-${day}.csv`, "text/csv", csv);');
    expect(tele).toContain('scope: "merged" | "local-only"');
  });
  test("no dashboards — the button and the log are the whole feature", () => {
    expect((studio.match(/doExportEditLog/g) ?? []).length).toBe(2); // definition + the one button
  });
});

describe("review fixes (adversarial pass, 08-18)", () => {
  test("flush chunks against the 500-cap — a queue past 500 can't wedge forever", () => {
    const fl = tele.slice(tele.indexOf("export async function flushEditLog"), tele.indexOf("export function startEditLog"));
    expect(fl).toContain("queue.slice(0, MAX_BATCH)");
    expect(fl).toContain("for (let queue = pendingEvents(events); queue.length; queue = pendingEvents(events))");
    expect(fl).toContain("if (!acked.length) break;"); // never spins when the server acks nothing
    expect(tele).toContain("const MAX_BATCH = 500;");
  });
  test("sync errors SURFACE — the studio subscribes and shows a new one once", () => {
    expect(tele).toContain("export function subscribeEditLog(");
    expect(studio).toContain('setNote("EDIT LOG SYNC: " + s.error)');
    expect(studio).toContain("s.error !== lastEditErrRef.current"); // deduped, not spammed
  });
  test("saveLocal merges with the disk copy — two tabs can't clobber unsynced events", () => {
    const sl = tele.slice(tele.indexOf("const saveLocal ="), tele.indexOf("export interface EditLogState"));
    expect(sl).toContain("const byId = new Map(list.map((e) => [e.id, e]));");
    expect(sl).toContain("if (!mine || (!mine.syncedAt && d.syncedAt)) byId.set(d.id, d);");
    expect(tele).toContain('window.addEventListener("storage",');
  });
  test("listEditEvents is PAGED — the export can't silently stop at 1000", () => {
    const fns = read("../../lib/edit-events.functions.ts");
    expect(fns).toContain(".range(from, from + PAGE - 1)");
    expect(fns).toContain("if (rows.length < PAGE) break;");
  });
});

describe("the migration", () => {
  test("0117 is deny-by-default and append-only in spirit", () => {
    expect(sql).toContain("create table if not exists public.edit_events");
    expect(sql).toContain("alter table public.edit_events enable row level security;");
    expect(sql).toContain("check (disposition in ('proposed', 'accepted', 'nudged', 'overridden'))");
    expect(sql).not.toContain("create policy"); // service-role only, same as idea_notes
  });
});
