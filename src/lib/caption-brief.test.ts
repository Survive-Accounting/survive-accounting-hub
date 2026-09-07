import { describe, expect, test } from "bun:test";

import {
  buildCaptionMessages, CAPTION_SYSTEM, captionClipboardText, hasCaptions, normalizeCaptions, normalizeHashtags, parseCaptions, stripEmoji,
} from "./caption-brief";

describe("talk the caption — the brief", () => {
  test("the messages carry the set, what he said, the kept lines, the cards and the notes", () => {
    const m = buildCaptionMessages({
      setName: "Internal Users", topicName: "Managerial vs Financial",
      stems: ["Which report goes to management?", "  "],
      keptLines: ["Internal means inside the building.", "Budgets, forecasts — that's managerial."],
      talkthrough: "Said during Talkthrough: internal equals inside",
      spoken: "this one's about who reads which report, keep it plain",
      previous: null,
    });
    expect(m.system).toBe(CAPTION_SYSTEM);
    for (const s of ["THE SET: Internal Users", "Managerial vs Financial", "WHAT LEE SAID", "who reads which report", "LINES HE KEPT", "- Internal means inside the building.", "THE CARDS THE SHORT COVERS", "- Which report goes to management?", "TALKTHROUGH NOTES", "internal equals inside"]) {
      expect(m.user).toContain(s);
    }
    expect(m.user).not.toContain("PREVIOUS");
    expect(m.user).not.toContain("-   ");
    expect(m.system).toMatch(/NO emoji/);
    expect(m.system).toMatch(/youtube: title ≤ 70/);
  });

  test("nothing said and nothing kept is said plainly, and a previous answer rides a revision", () => {
    const prev = normalizeCaptions({ youtube: { title: "Old title", caption: "x", hashtags: ["a"] } })!;
    const m = buildCaptionMessages({ setName: "S", topicName: "T", stems: [], keptLines: [], talkthrough: "", spoken: "", previous: prev });
    expect(m.user).toContain("nothing yet");
    expect(m.user).toContain("none saved");
    expect(m.user).toContain("PREVIOUS:");
    expect(m.user).toContain("Old title");
    expect(m.user).not.toContain("TALKTHROUGH NOTES");
  });

  test("the answer parses per destination with the limits and the register enforced", () => {
    const c = parseCaptions(JSON.stringify({
      youtube: { title: "Internal users — who reads managerial reports 🔥 and why it matters on the exam, really", caption: "Line one.\n\nLine two 🚀 \nLine three", hashtags: ["#Accounting", "Managerial Accounting", "cpa", "accounting", "x", "y", "z"] },
      instagram: { title: "", caption: "The post.", hashtags: ["a", "b", "c", "d", "e", "f"] },
      tiktok: { title: "Internal means inside.", caption: "One line.", hashtags: [] },
      site: { title: "Internal Users", caption: "Who reads\nwhich report.", hashtags: ["ignored"] },
    }));
    expect(c).not.toBeNull();
    expect(c!.youtube.title.length).toBeLessThanOrEqual(70);
    expect(c!.youtube.title).not.toContain("🔥");
    expect(c!.youtube.caption).toBe("Line one.\nLine two\nLine three");
    expect(c!.youtube.hashtags).toEqual(["accounting", "managerialaccounting", "cpa", "x", "y"]);
    expect(c!.instagram.title).toBe("");
    expect(c!.instagram.hashtags).toHaveLength(6);
    expect(c!.tiktok.hashtags).toEqual([]);
    expect(c!.site.caption).toBe("Who reads which report.");
    expect(c!.site.hashtags).toEqual([]);
    expect(hasCaptions(c)).toBe(true);
  });

  test("a partial answer still parses; a missing destination is empty, not absent", () => {
    const c = parseCaptions('here you go: {"youtube":{"title":"Only this","caption":"","hashtags":[]}}');
    expect(c!.youtube.title).toBe("Only this");
    expect(c!.tiktok).toEqual({ title: "", caption: "", hashtags: [] });
    expect(hasCaptions(c)).toBe(true);
  });

  test("junk does not parse, and an all-empty document is null", () => {
    expect(parseCaptions("no json")).toBeNull();
    expect(parseCaptions("{}")).toBeNull();
    expect(normalizeCaptions({ youtube: { title: "", caption: "", hashtags: ["a"] } })).toBeNull();
    expect(normalizeCaptions(null)).toBeNull();
    expect(hasCaptions(null)).toBe(false);
  });

  test("hashtags are cleaned, deduped and capped; emoji is stripped", () => {
    expect(normalizeHashtags(["#CPA Exam", "cpaexam", "  ", 3, "acct-101"], 5)).toEqual(["cpaexam", "acct101"]);
    expect(normalizeHashtags(["a", "b"], 0)).toEqual([]);
    expect(stripEmoji("Internal 🏢 users ✨")).toBe("Internal users");
  });

  test("the clipboard text is title, caption, then the hashtags with their # back on", () => {
    expect(captionClipboardText({ title: "T", caption: "C1\nC2", hashtags: ["a", "b"] })).toBe("T\n\nC1\nC2\n\n#a #b");
    expect(captionClipboardText({ title: "", caption: "Just the post", hashtags: [] })).toBe("Just the post");
    // An Instagram first line that already opens the caption isn't doubled.
    expect(captionClipboardText({ title: "Open", caption: "Open with this.\nMore.", hashtags: [] })).toBe("Open with this.\nMore.");
  });
});
