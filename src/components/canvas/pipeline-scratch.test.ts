// PIPELINE SCRATCH LANE + DRAG (P3).
//
// The contract triangle: keyboard is PRIMARY (F9/F10/F8 untouched), drag is the
// CORRECTION layer (explicit target beats the automation), and DETACH ≠ TRASH
// (one breaks a link, the other moves a file). Plus the one-home rule: attached
// clips live in the stack, unattached kept takes live in the rail — never both.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8").split("\r\n").join("\n");
const studio = read("CeqStudio.tsx");
const inbox = read("TakesInbox.tsx");
const store = read("takes-store.ts");

describe("the scratch lane", () => {
  test("the rail shows kept takes that are NOT attached — attached ones live in the stack", () => {
    expect(inbox).toContain("const keptUnattached = kept.filter((t) => !t.upload?.path || !(attachedPaths?.has(t.upload.path) ?? false));");
    expect(inbox).toContain("{keptUnattached.map(row)}");
    expect(inbox).not.toContain("{kept.map(row)}"); // the old both-homes list is gone
    expect(studio).toContain("attachedPaths={new Set(takesByPath.keys())}");
  });
  test("pending keeps its playback — the play button predates P3 and stays", () => {
    expect(inbox).toContain('title="Play locally (instant — nothing uploads)"');
  });
});

describe("drag is the correction layer", () => {
  test("rail rows drag; trashed rows don't", () => {
    expect(inbox).toContain('draggable={t.status !== "trashed"}');
    expect(inbox).toContain('"application/x-sa-take"');
  });
  test("an explicit drop target beats coverage and the armed target", () => {
    expect(studio).toContain("const ids = opts?.explicit && t.target?.ids.length ? t.target.ids : attachTargets(");
  });
  test("a drop never moves the spine — auto-advance belongs to F10", () => {
    expect(studio).toContain("if (opts?.explicit) {");
    // the whole advance block sits in the else — pinned by its comment surviving
    expect(studio).toContain("// AUTO-ADVANCE (F1) — but a dissect CEQ");
  });
  test("drops route by upload state: attached directly, or keep+upload via the drop bus", () => {
    expect(studio).toContain("if (!ref) { keepTakeTo(takeId, frameId, at); return; }");
    expect(store).toContain("export const keepTakeTo = ");
    expect(inbox).toContain("setKeepToHandler((takeId, frameId, at) => {");
    // and the bus override rides doKeep — ONE keep path, not a fork
    expect(inbox).toContain('const t: TakeRecord = over ? { ...t0, target: { kind: "ceq", ids: [over.frameId], label: "dropped" } } : t0;');
  });
});

describe("reorder = stitch order", () => {
  test("a same-frame reorder writes takes[] AND re-syncs a saved recipe in-slot", () => {
    const mv = studio.slice(studio.indexOf("const moveClip = "), studio.indexOf("const allowStackDrop"));
    expect(mv).toContain("patchQ(from.frameId, { takes: src });");
    expect(mv).toContain("syncStitchGroup(src);");
    const sync = studio.slice(studio.indexOf("const syncStitchGroup = "), studio.indexOf("const moveSavedItem"));
    expect(sync).toContain("persistStitch(recut(saved, { items }));");
    expect(sync).not.toContain("trimInS"); // permutes WHOLE items — trims ride along
  });
  test("a cross-frame move keeps the item's trims and re-homes its ceqId", () => {
    const mv = studio.slice(studio.indexOf("const moveSavedItem = "), studio.indexOf("const moveClip = "));
    expect(mv).toContain("items.splice(slot, 0, { ...it, ceqId: toFrameId });");
  });
});

describe("DETACH is not TRASH", () => {
  test("both actions say exactly which one they are", () => {
    // Q1: detach lives on the timeline tile; its note (and tile title) say scratch,
    // file untouched. Trash stays on the rail and says Recycle.
    expect(studio).toContain('→ scratch lane'); // detachClip note
    expect(studio).toContain("File untouched; Ctrl+Z re-attaches.");
    expect(read("PipelineStage.tsx")).toContain('title="Detach → scratch (file untouched)"');
    expect(inbox).toContain('title="Trash (F8) — moves the file to Recycle; never deleted"');
  });
  test("detach never touches a file — no recycle move anywhere near it", () => {
    const det = studio.slice(studio.indexOf("const detachClip"), studio.indexOf("const attachLatestKept"));
    expect(det).not.toContain("moveToRecycle");
    expect(det).not.toContain("remove");
  });
});

describe("Q0 unblock — detach every clip + clear all + recycle toggle", () => {
  test("legacy clips get a reconstructed scratch record so detach always works", () => {
    const fn = studio.slice(studio.indexOf("const ensureScratchRecord ="), studio.indexOf("const detachClip ="));
    expect(fn).toContain('if (currentTakes().some((t) => t.upload?.path === clip.path)) return false;'); // idempotent
    expect(fn).toContain('status: "kept",');
    expect(fn).toContain("upload: { state: \"done\", attempts: 1, url: clip.url, path: clip.path },");
    expect(fn).toContain("id: `take-legacy-${Math.abs(h).toString(36)}`,"); // stable id, no dup on re-run
    expect(fn).not.toContain("moveToRecycle"); // migration never trashes
  });
  test("CLEAR ALL detaches every clip to scratch, confirms, and never trashes", () => {
    const fn = studio.slice(studio.indexOf("const clearAllClips ="), studio.indexOf("const clearTake ="));
    expect(fn).toContain("window.confirm(");
    expect(fn).toContain("if (await ensureScratchRecord(clip)) migrated += 1;");
    expect(fn).toContain("patchQ(c.id, { takes: [] });");
    expect(fn).not.toContain("moveToRecycle");
    expect(fn).not.toContain("doTrash");
    expect(studio).toContain("onClick={clearAllClips}"); // wired to a button
  });
  test("the recycle list is a TOGGLE, closed by default — no always-open list or size line in the chrome", () => {
    expect(inbox).toContain("const [showRecycle, setShowRecycle] = useState(false);");
    expect(inbox).toContain("{showRecycle && (");
    expect(inbox).toContain("<Trash2 className=\"h-3.5 w-3.5\" />"); // the bin icon button
    // the always-open list and the "Recycle: N takes · X MB" chrome line are gone
    expect(inbox).not.toContain("Recycle: {bin.count} take");
    // restore + open folder still reachable — inside the drawer
    expect(inbox).toContain("open folder");
  });
});

describe("a trim gesture can't start a row drag", () => {
  test("the strip blocks dragstart from bubbling into the draggable clip row", () => {
    expect(read("ClipTrimStrip.tsx")).toContain("draggable={false} onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}");
  });
});
