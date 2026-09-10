// THE QUICK QUEUE's pure parts — what Ctrl+I means where, what a capture on the line carries,
// and the row it saves. Lee: "Ctrl+I, type, done, no clicking." Plus the source pins: the two
// docks render NOTHING in the film pop-out (it is the OBS shot), and the notepad's Ctrl+I
// italicises only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import type { FilmActive } from "@/components/blastoff/capture/prompter-sync";
import { BUILT_IN_CATEGORIES, CATEGORY_HINT, isShortsIdea, type Idea } from "./model";
import {
  FRAME_NODE_PREFIX, QUICK_PLACEHOLDER, QUICK_RETRY, QUICK_TOAST_MS,
  ideasHotkey, isProductionPath, productionContext, quickIdeaRow, quickToastText,
} from "./quick-queue";

const RESULTS = "/v3/e1s/2-1/blast-off/results";
const film = (qId: string | null, over: Partial<FilmActive> = {}): FilmActive => ({ setId: "deck-e1s-2-1", qId, at: 1, ...over });

describe("the production line", () => {
  test("/v3 and everything under it, any depth", () => {
    expect(isProductionPath("/v3")).toBe(true);
    expect(isProductionPath("/v3/e1s")).toBe(true);
    expect(isProductionPath(RESULTS)).toBe(true);
    expect(isProductionPath("/v3/e1s/2-1/blast-off/film")).toBe(true);
    expect(isProductionPath("/v3/post")).toBe(true);
  });
  test("nothing else — not the vault, not the admin, not a look-alike prefix", () => {
    expect(isProductionPath("/admin")).toBe(false);
    expect(isProductionPath("/admin/ideas")).toBe(false);
    expect(isProductionPath("/v30/x")).toBe(false);
    expect(isProductionPath("/")).toBe(false);
    expect(isProductionPath("/learn/v3")).toBe(false);
  });
});

describe("what a capture carries", () => {
  test("an /admin path gives no context — Ctrl+I there is not this feature", () => {
    expect(productionContext("/admin/ideas", null)).toEqual({});
    expect(productionContext("/admin", film("blast-f1"))).toEqual({});
  });
  test("a /v3 route with no film record gives topic + set only, flagged shorts", () => {
    expect(productionContext(RESULTS, null)).toEqual({ shorts: "1", topic: "e1s", set: "2-1" });
    expect(productionContext("/v3/e1s/2-1", null)).toEqual({ shorts: "1", topic: "e1s", set: "2-1" });
    expect(productionContext("/v3/strategy", null)).toEqual({ shorts: "1", topic: "strategy" });
  });
  test("a live film record adds the deck id and the frame id, prefix stripped", () => {
    expect(productionContext(RESULTS, film("blast-frame-9"))).toEqual({
      shorts: "1", topic: "e1s", set: "2-1", setId: "deck-e1s-2-1", frameId: "frame-9",
    });
    expect(FRAME_NODE_PREFIX).toBe("blast-");
  });
  test("a set card publishes its CEQ node id, which is not a frame id — kept as ceqId", () => {
    expect(productionContext(RESULTS, film("ceq-abc"))).toEqual({
      shorts: "1", topic: "e1s", set: "2-1", setId: "deck-e1s-2-1", ceqId: "ceq-abc",
    });
  });
  test("the countdown (slide 0, qId null) points at no slide — the deck id alone", () => {
    expect(productionContext(RESULTS, film(null, { popout: true, countdown: true, count: 7 }))).toEqual({
      shorts: "1", topic: "e1s", set: "2-1", setId: "deck-e1s-2-1",
    });
  });
  test("/v3's own pages are pages, not topics", () => {
    expect(productionContext("/v3/post", null)).toEqual({ shorts: "1" });
    expect(productionContext("/v3/teleprompter", null)).toEqual({ shorts: "1" });
    expect(productionContext("/v3/values", null)).toEqual({ shorts: "1" });
    expect(productionContext("/v3", null)).toEqual({ shorts: "1" });
  });
  test("never computes split — that is the film surface's to publish", () => {
    expect(productionContext(RESULTS, film("blast-f1"))).not.toHaveProperty("split");
  });
});

describe("the hotkey", () => {
  const key = (over: Partial<{ key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) =>
    ({ key: "i", ctrlKey: true, metaKey: false, shiftKey: false, ...over });
  test("on the line: Ctrl+I is the quick box, Ctrl+Shift+I the full bank", () => {
    expect(ideasHotkey(key(), RESULTS)).toBe("quick");
    expect(ideasHotkey(key({ key: "I", shiftKey: true }), RESULTS)).toBe("full");
    expect(ideasHotkey(key({ ctrlKey: false, metaKey: true }), "/v3")).toBe("quick");
  });
  test("off the line: unchanged — the full bank, Shift or not", () => {
    expect(ideasHotkey(key(), "/admin")).toBe("full");
    expect(ideasHotkey(key({ key: "I", shiftKey: true }), "/admin")).toBe("full");
    expect(ideasHotkey(key(), "/")).toBe("full");
  });
  test("any other key, or I without the modifier, is nobody's", () => {
    expect(ideasHotkey(key({ key: "k" }), RESULTS)).toBeNull();
    expect(ideasHotkey(key({ ctrlKey: false }), RESULTS)).toBeNull();
  });
});

describe("the row it saves", () => {
  const row = quickIdeaRow({
    id: "idea-q1", text: "  land isn't depreciated \n", pathname: RESULTS, pageTitle: "Editor — Survive",
    href: "https://surviveaccounting.com" + RESULTS, createdBy: "lee", context: productionContext(RESULTS, film("blast-f1")),
  });
  test("pre-tagged SHORTS, status IDEA, the words trimmed, the title derived", () => {
    expect(row.categories).toEqual(["SHORTS"]);
    expect(row.status).toBe("IDEA");
    expect(row.body).toBe("land isn't depreciated");
    expect(row.title).toBe("land isn't depreciated");
    expect(row.sourcePath).toBe(RESULTS);
    expect(row.createdBy).toBe("lee");
  });
  test("the modal's own context keys, then the production context merged in", () => {
    expect(row.context).toEqual({
      title: "Editor — Survive", href: "https://surviveaccounting.com" + RESULTS, intent: "general",
      shorts: "1", topic: "e1s", set: "2-1", setId: "deck-e1s-2-1", frameId: "f1",
    });
    expect(isShortsIdea({ ...row, createdAt: "", updatedAt: "" } as Idea)).toBe(true);
  });
  test("every other column defaulted exactly as save() does — the upsert is whole-row", () => {
    expect(row.subcategory).toBe("");
    expect(row.promptMd).toBeNull();
    expect(row.promptFilename).toBeNull();
    expect(row.sourceKind).toBe("web");
    expect(row.attachments).toEqual([]);
    expect(row.audioPath).toBeNull();
    expect(row.transcriptStatus).toBeNull();
    // Nothing missing: the same keys an Idea has, minus the two timestamps the database stamps.
    const keys = Object.keys(row).sort();
    expect(keys).toEqual(["attachments", "audioPath", "body", "categories", "context", "createdBy", "id", "promptFilename", "promptMd", "sourceKind", "sourcePath", "status", "subcategory", "title", "transcriptStatus"]);
  });
});

describe("the toast and the copy", () => {
  test("Queued · the first 40 characters, and it goes in 2.5 s", () => {
    expect(quickToastText("land isn't depreciated")).toBe("Queued · land isn't depreciated");
    expect(quickToastText("  " + "x".repeat(60))).toBe("Queued · " + "x".repeat(40));
    expect(QUICK_TOAST_MS).toBe(2500);
  });
  test("the placeholder says the three keys; the retry line says the one", () => {
    expect(QUICK_PLACEHOLDER).toBe("Short idea… Enter saves · Esc closes · Ctrl+Shift+I for the full bank");
    expect(QUICK_RETRY).toBe("didn't save — Enter to retry");
  });
});

// ------------------------------------------------------------------ source pins
const src = (rel: string) => readFileSync(join(import.meta.dir, rel), "utf8").split("\r\n").join("\n");

describe("never in the shot", () => {
  const dock = src("IdeasDock.tsx");
  const shipped = src("../shipped/ShippedDock.tsx");
  test("IdeasDock returns null under ?popout=1 — the pop-out is what OBS captures", () => {
    expect(dock).toContain('import { isPopoutSearch } from "@/components/blastoff/capture/popout";');
    expect(dock).toContain("isPopoutSearch(window.location.search)");
    expect(dock).toContain("if (popout || !listen) return null;");
  });
  test("ShippedDock too — no banner, no notepad, no R/N in the take", () => {
    expect(shipped).toContain("isPopoutSearch(window.location.search)");
    expect(shipped).toContain("if (popout || !unlocked) return null;");
  });
  test("the quick box stops every key — the editor's Space must not hear typing", () => {
    expect(dock).toContain("e.stopPropagation();\n    if (e.key === \"Enter\")");
    expect(dock).toContain("onKeyUp={(e) => e.stopPropagation()}");
  });
});

describe("the hotkey's neighbours", () => {
  test("the notepad's Ctrl+B/I/U stop at the notepad — italic no longer opens the bank", () => {
    const pad = src("../shipped/NotepadSurface.tsx");
    expect(pad).toContain('if (mod && e.key.toLowerCase() === "i") { e.preventDefault(); e.stopPropagation(); cmd("italic"); return; }');
    expect(pad).toContain('if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); e.stopPropagation(); cmd("bold"); return; }');
    expect(pad).toContain('if (mod && e.key.toLowerCase() === "u") { e.preventDefault(); e.stopPropagation(); cmd("underline"); return; }');
  });
  test("the unlock is announced, and the dock re-reads the flag on every open", () => {
    const gate = src("../AdminGate.tsx");
    expect(gate).toContain('export const ADMIN_UNLOCKED_EVENT = "sa:unlocked";');
    expect(gate.split("announceUnlock();").length).toBe(3); // unlockAdmin + tryUnlock
    const dock = src("IdeasDock.tsx");
    expect(dock).toContain("window.addEventListener(ADMIN_UNLOCKED_EVENT, onUnlocked);");
    expect(dock).toContain("setUnlocked(isAdminUnlocked());\n      setPreset(hk === \"quick\"");
  });
  test("the dock uses the pure hotkey, and the full modal skips the build prompt for a shorts idea", () => {
    const dock = src("IdeasDock.tsx");
    expect(dock).toContain("const hk = ideasHotkey(e, pathname);");
    expect(dock).toContain('preset?.context?.shorts !== "1"');
    expect(dock).toContain("...(preset?.context ?? {}),");
  });
});

describe("the expensive lanes are skipped for a short", () => {
  const fns = src("../../lib/ideas.functions.ts");
  test("the auto-merge never folds a shorts idea into another — two captures on one set are two rows", () => {
    expect(fns).toContain('&& ctx.strategy !== "1" && ctx.shorts !== "1" && words) {');
  });
  test("no Claude Code build prompt for a shorts idea, whoever calls", () => {
    expect(fns).toContain('const wantPrompt = data.draftPrompt && !isTodo && ctx.draft !== "1" && ctx.shorts !== "1" && (data.redraft || !r.prompt_md?.trim());');
  });
  test("the cheap organise still runs, and SHORTS passes through it unchanged", () => {
    expect(fns).toContain('if (ctx.shorts === "1" && !(r.categories ?? []).includes("SHORTS")) r.categories = ["SHORTS", ...(r.categories ?? [])].slice(0, 2);');
  });
});

describe("the category", () => {
  test("SHORTS is built in, on the business side, with the hint the AI filer reads", () => {
    const c = BUILT_IN_CATEGORIES.find((x) => x.key === "SHORTS");
    expect(c?.side).toBe("work");
    expect(CATEGORY_HINT.SHORTS).toBe("A short to make about the accounting content — an offshoot, a nerd-out, a tangent from a set");
  });
  test("isShortsIdea is the flag, not the category", () => {
    const mk = (context: Record<string, string>, categories: string[] = []): Idea => ({
      id: "i", title: "", body: "", categories, subcategory: "", status: "IDEA", sourcePath: "", context,
      promptMd: null, promptFilename: null, createdBy: "", sourceKind: "web", attachments: [], audioPath: null, transcriptStatus: null,
      createdAt: "", updatedAt: "",
    });
    expect(isShortsIdea(mk({ shorts: "1" }))).toBe(true);
    expect(isShortsIdea(mk({}, ["SHORTS"]))).toBe(false);
    expect(isShortsIdea(mk({ production: "1" }))).toBe(false);
  });
});
