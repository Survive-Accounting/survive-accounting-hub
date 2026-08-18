// TAKES INBOX (T1/T2) — the pure layer: obs-websocket auth + event parsing,
// scan-diffing, triage selection, and the film-safe rule that no status
// surface may render where OBS captures.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { baseName, closeDiagnosis, obsAuthString, parseRecordEvent } from "./obs-bridge";
import { fileKey, fmtBytes, latestPending, makeRecord, missingRecords, newFiles, type TakeRecord } from "./takes-store";

const studio = readFileSync(join(import.meta.dir, "CeqStudio.tsx"), "utf8").split("\r\n").join("\n");
const inbox = readFileSync(join(import.meta.dir, "TakesInbox.tsx"), "utf8").split("\r\n").join("\n");
const previewer = readFileSync(join(import.meta.dir, "CeqPreviewer.tsx"), "utf8").split("\r\n").join("\n");
const folder = readFileSync(join(import.meta.dir, "takes-folder.ts"), "utf8").split("\r\n").join("\n");

describe("obs-websocket v5 auth (known-answer)", () => {
  test("base64(sha256(base64(sha256(password+salt)) + challenge)) — verified against node crypto", async () => {
    expect(await obsAuthString("supersecret", "saltysalt", "chal1enge")).toBe("tPIWbljAlxI2AxOyl78FnNGMCQeCpuxb4B1gFBa3MoI=");
  });
  test("every input matters (no silent constant)", async () => {
    const base = await obsAuthString("p", "s", "c");
    expect(await obsAuthString("P", "s", "c")).not.toBe(base);
    expect(await obsAuthString("p", "S", "c")).not.toBe(base);
    expect(await obsAuthString("p", "s", "C")).not.toBe(base);
  });
});

describe("RecordStateChanged parsing", () => {
  const ev = (eventData: Record<string, unknown>) => ({ op: 5, d: { eventType: "RecordStateChanged", eventData } });
  test("STARTED and STOPPED are recognized; STOPPED carries the path", () => {
    expect(parseRecordEvent(ev({ outputActive: true, outputState: "OBS_WEBSOCKET_OUTPUT_STARTED" }))).toEqual({ kind: "started" });
    expect(parseRecordEvent(ev({ outputActive: false, outputState: "OBS_WEBSOCKET_OUTPUT_STOPPED", outputPath: "C:\\\\obs\\\\take 12.mkv" })))
      .toEqual({ kind: "stopped", path: "C:\\\\obs\\\\take 12.mkv" });
  });
  test("STOPPING is NOT a stop — banking on it would miss the final file", () => {
    expect(parseRecordEvent(ev({ outputActive: false, outputState: "OBS_WEBSOCKET_OUTPUT_STOPPING" })).kind).toBe("other");
  });
  test("unrelated messages are ignored", () => {
    expect(parseRecordEvent({ op: 5, d: { eventType: "CurrentProgramSceneChanged" } }).kind).toBe("other");
    expect(parseRecordEvent({ op: 2 }).kind).toBe("other");
    expect(parseRecordEvent(null).kind).toBe("other");
  });
  test("baseName handles Windows and POSIX paths", () => {
    expect(baseName("C:\\\\Users\\\\lee\\\\Videos\\\\take 3.mkv")).toBe("take 3.mkv");
    expect(baseName("/home/lee/take.mp4")).toBe("take.mp4");
  });
});

describe("folder scan diffing", () => {
  const f = (name: string, size: number, lastModified: number) => ({ name, size, lastModified });
  const known = (name: string, size: number, mtimeMs: number): TakeRecord => makeRecord({ name, size, lastModified: mtimeMs });
  test("new files only, oldest first (a batch banks in recording order)", () => {
    const res = newFiles([f("c.mkv", 3, 300), f("a.mkv", 1, 100), f("b.mkv", 2, 200)], [known("a.mkv", 1, 100)]);
    expect(res.map((x) => x.name)).toEqual(["b.mkv", "c.mkv"]);
  });
  test("identity is name+size+mtime — a re-recorded same-name file is NEW", () => {
    expect(fileKey("t.mkv", 10, 5)).not.toBe(fileKey("t.mkv", 11, 5));
    expect(newFiles([f("t.mkv", 11, 5)], [known("t.mkv", 10, 5)])).toHaveLength(1);
  });
});

describe("triage selection", () => {
  const rec = (id: string, mtimeMs: number, status: TakeRecord["status"]): TakeRecord => ({ ...makeRecord({ name: id, size: 1, lastModified: mtimeMs }), id, status });
  test("acts on the most recent PENDING take, ignoring kept/trashed", () => {
    const list = [rec("old", 100, "pending"), rec("newest", 300, "kept"), rec("mid", 200, "pending")];
    expect(latestPending(list)?.id).toBe("mid");
  });
  test("nothing pending ⇒ null (the hotkey no-ops with a note)", () => {
    expect(latestPending([rec("k", 1, "kept")])).toBeNull();
  });
  test("fmtBytes reads like the Recycle counter", () => {
    expect(fmtBytes(3.2 * 1024 ** 3)).toBe("3.20 GB");
  });
});

describe("the laws (source pins)", () => {
  test("local files are only READ or MOVED to Recycle — no delete path on originals", () => {
    // removeEntry is CALLED only as the tail of a copy-fallback move (the file
    // already exists at the destination), never as a standalone delete.
    const calls = folder.split("\n").filter((l) => /await\s+\w+\.removeEntry\(/.test(l));
    expect(calls).toHaveLength(2); // move-to-recycle fallback + restore fallback
    for (const l of calls) expect(l).toMatch(/await (dir|bin)\.removeEntry\(name\)/);
    // and nothing ever removes a directory or recurses
    expect(folder).not.toMatch(/removeEntry\([^)]*recursive/);
  });
  test("triage hotkeys live in the FILM CONTROLLER keymap (both windows)", () => {
    expect(previewer).toContain('if (e.key === "F8" || e.key === "F10") { e.preventDefault(); e.stopImmediatePropagation(); triageLatest(e.key === "F8" ? "trash" : "keep"); return; }');
    expect(previewer).toContain('if (e.key === "F8") { triageLatest("trash"); return; }'); // recording surface allowlist
  });
  test("the idea bank moved to F7 — no key fights takes triage", () => {
    expect(studio).toContain('if (e.key !== "F7" || recording) return;');
    expect(studio).not.toContain('if (e.key !== "F8" || recording) return;');
  });
  test("FILM-SAFE: the inbox, countdown and status never render while recording", () => {
    // F2 docks the same inbox in Filming Mode — `!recording` still gates it.
    expect(studio).toContain("{(takesOpen || filming) && !recording && (");
    // F1 moved the countdown into the capture window as a SLATE; the studio now
    // mirrors that one store, and its mirror still hides in Recording Mode.
    expect(studio).toContain("{(slate.count != null || slate.speak) && !recording && (");
    // and the drawer itself is studio-only — never inside the film popout tree
    expect(inbox).toContain("STUDIO SURFACE ONLY");
  });
  test("nothing uploads without an explicit Keep", () => {
    const ing = inbox.slice(inbox.indexOf("const ingest ="), inbox.indexOf("// OBS bridge"));
    expect(ing).not.toContain("onUpload");
    expect(inbox).toContain("const doKeep");
  });
});

describe("OBS failure diagnosis (the flashing bug + honest errors)", () => {
  test("a wrong password is TERMINAL and says so — no infinite retry", () => {
    const d = closeDiagnosis(4009);
    expect(d.terminal).toBe(true);
    expect(d.text).toContain("WRONG PASSWORD");
  });
  test("unreachable OBS retries and names the three real causes", () => {
    const d = closeDiagnosis(1006);
    expect(d.terminal).toBe(false);
    expect(d.text).toMatch(/running.*ENABLED.*port/s);
  });
  test("unknown codes surface the code itself rather than a guess", () => {
    expect(closeDiagnosis(4205, "nope").text).toContain("4205");
  });
  test("THE FLASHING BUG: the OBS effect depends only on explicit dial signals", () => {
    const src = readFileSync(join(import.meta.dir, "TakesInbox.tsx"), "utf8").split("\r\n").join("\n");
    expect(src).toContain("}, [obsOn, connectTick, ingest]);");
    // render-unstable props must be read through refs, never depended on
    expect(src).toContain("liveFramesRef.current()");
    expect(src).toContain("onRecStartRef.current()");
    expect(src).not.toContain("[obsOn, addr, pass, ingest, liveFrameIds, onRecordStart]");
  });
});

describe("the scan RECONCILES, it does not only add (Lee, 08-17)", () => {
  const rec = (id: string, fileName: string, status: "pending" | "kept" | "trashed"): TakeRecord =>
    ({ id, fileName, sizeBytes: 1, mtimeMs: 1, recordedAt: "2026-08-17T00:00:00.000Z", status });
  const onDisk = (...names: string[]) => names.map((name) => ({ name, size: 1, lastModified: 1 }));

  test("a row whose file Lee deleted in Explorer is dropped", () => {
    const list = [rec("a", "gone.mkv", "kept"), rec("b", "here.mkv", "kept")];
    expect(missingRecords(list, onDisk("here.mkv"))).toEqual(["a"]);
  });
  test("a TRASHED row is exempt — its file is in Recycle/, which the root scan never sees", () => {
    // Pruning it would destroy the record of a file that is still restorable.
    expect(missingRecords([rec("t", "binned.mkv", "trashed")], onDisk())).toEqual([]);
  });
  test("pending rows are reconciled too, not just kept ones", () => {
    expect(missingRecords([rec("p", "vanished.mkv", "pending")], onDisk())).toEqual(["p"]);
  });
  test("an empty folder clears every non-trashed row, and nothing else", () => {
    const list = [rec("a", "x.mkv", "kept"), rec("b", "y.mkv", "pending"), rec("t", "z.mkv", "trashed")];
    expect(missingRecords(list, onDisk()).sort()).toEqual(["a", "b"]);
  });
  test("nothing is dropped when every file is still there", () => {
    expect(missingRecords([rec("a", "x.mkv", "kept")], onDisk("x.mkv"))).toEqual([]);
  });
  test("the reconcile runs on a FULL scan only — a record-stop ingest must not prune", () => {
    // record-stop passes onlyName and sees a filtered list; pruning from that
    // would delete every other take in the folder.
    expect(inbox).toContain("if (!opts?.onlyName) {");
    expect(inbox).toContain("const gone = missingRecords(currentTakes(), scanned);");
  });
  test("removing a row never touches the file — Trash is the only thing that moves one", () => {
    expect(inbox).toContain("title=\"Remove this row from the inbox. The file on disk is NOT touched");
    expect(inbox).toContain("onClick={() => void dropTakeRecord(t.id)}");
  });
  test("room tone can be set from a kept take, in the filming pass", () => {
    expect(inbox).toContain("Use THIS take as today's room tone");
    expect(studio).toContain("onRoomTone={async (_t, file) => {");
  });
});
