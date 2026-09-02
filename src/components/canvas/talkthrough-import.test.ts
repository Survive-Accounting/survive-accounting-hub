import { describe, expect, test } from "bun:test";

import { contextOfSegment } from "./talkthrough";
import { buildImportRows, parseTranscriptImport, setNameMatches } from "./talkthrough-import";

const CEQS = [
  { id: "ceq-1", label: "1.1" },
  { id: "ceq-2", label: "1.2" },
  { id: "ceq-3", label: "1.3" },
];

describe("parseTranscriptImport — the speaking convention", () => {
  test("a stamp word at the start of a sentence opens a stamped block", () => {
    const b = parseTranscriptImport("Phrase: debits on the left, credits on the right. Cheat code: assets equal liabilities plus equity.", 3);
    expect(b.map((x) => [x.stamp, x.text])).toEqual([
      ["phrase", "debits on the left, credits on the right."],
      ["cheat_code", "assets equal liabilities plus equity."],
    ]);
  });

  test("every stamp kind the handoff lists parses", () => {
    const text = [
      "Phrase: a", "Trigger word: b", "Tip: c", "Trick: d", "Cheat code: e", "Real world: f",
      "Memo: g", "Exhibit: h", "Short: i", "Nerd out: j", "Reword this: k", "Revise choices: l",
      "Blast off: m", "Review vibes: n",
    ].join(" ");
    expect(parseTranscriptImport(text, 3).map((x) => x.stamp)).toEqual([
      "phrase", "trigger_word", "tip_trick", "tip_trick", "cheat_code", "real_world",
      "memo", "exhibit", "short", "nerdout", "reword", "revise_choices", "blast_off", "review_vibe",
    ]);
  });

  test("the same words mid-sentence are speech, not stamps", () => {
    const b = parseTranscriptImport("In short, the memo is a phrase students forget, so the tip here is the exhibit.", 3);
    expect(b).toHaveLength(1);
    expect(b[0].stamp).toBeNull();
    expect(b[0].text).toBe("In short, the memo is a phrase students forget, so the tip here is the exhibit.");
  });

  test("a colon rescues a cue mid-sentence", () => {
    const b = parseTranscriptImport("and here is the cheat code: debit left.", 3);
    expect(b.map((x) => [x.stamp, x.text])).toEqual([[null, "and here is the"], ["cheat_code", "debit left."]]);
  });

  test("Question N anchors what follows; General goes back to the set", () => {
    const b = parseTranscriptImport("Question 2. Phrase: revenue when earned. Q3 tip: cash is not income. General. Memo: a thing for everyone.", 3);
    expect(b.map((x) => [x.stamp, x.ceqIndex])).toEqual([
      ["phrase", 1],
      ["tip_trick", 2],
      ["memo", null],
    ]);
  });

  test("a question the set does not have anchors nothing", () => {
    const b = parseTranscriptImport("Question 9. Phrase: still kept.", 3);
    expect(b).toEqual([{ text: "still kept.", stamp: "phrase", ceqIndex: null, setName: null }]);
  });

  test("blank lines end a block; a Set: header names what follows", () => {
    const b = parseTranscriptImport("Set: Easy Points 1\nQuestion 1\nCheat code: one.\n\nsome loose talk\n\nSet: Easy Points 2\nPhrase: two.", 3);
    expect(b).toEqual([
      { text: "one.", stamp: "cheat_code", ceqIndex: 0, setName: "Easy Points 1" },
      { text: "some loose talk", stamp: null, ceqIndex: 0, setName: "Easy Points 1" },
      { text: "two.", stamp: "phrase", ceqIndex: null, setName: "Easy Points 2" },
    ]);
  });

  test("the words right after a stamp are content, even when they look like a cue", () => {
    const b = parseTranscriptImport("Memo: whole set thing. Phrase: short and sweet.", 3);
    expect(b.map((x) => [x.stamp, x.text])).toEqual([["memo", "whole set thing."], ["phrase", "short and sweet."]]);
  });

  test("a cue with nothing after it makes no block; empty input makes none", () => {
    expect(parseTranscriptImport("Phrase:", 3)).toEqual([]);
    expect(parseTranscriptImport("   \n\n ", 3)).toEqual([]);
  });

  test("Windows line endings and stray punctuation are fine", () => {
    const b = parseTranscriptImport("Question 1,\r\nphrase — \"debit left\"\r\n", 3);
    expect(b).toEqual([{ text: "\"debit left\"", stamp: "phrase", ceqIndex: 0, setName: null }]);
  });
});

describe("setNameMatches", () => {
  test("unnamed blocks belong to the open set; names match loosely", () => {
    expect(setNameMatches(null, "\"Easy Points\" 1")).toBe(true);
    expect(setNameMatches("easy points 1", "\"Easy Points\" 1")).toBe(true);
    expect(setNameMatches("Easy Points 2", "\"Easy Points\" 1")).toBe(false);
  });
});

describe("buildImportRows", () => {
  const blocks = parseTranscriptImport("loose. Question 2. Cheat code: rule. Phrase: words.", 3);

  test("segments continue the session's seq and carry the booth's focus label", () => {
    const { segments } = buildImportRows(blocks, { sessionId: "tts-x", startSeq: 7, ceqs: CEQS, now: 1_000_000 });
    expect(segments.map((s) => s.seq)).toEqual([7, 8, 9]);
    expect(segments.map((s) => s.text)).toEqual(["loose.", "rule.", "words."]);
    expect(segments[0].focusedCeqId).toBeNull();
    expect(segments[1].focusedCeqId).toBe("ceq-2");
    expect(segments[1].focusedCeqLabel).toBe("Q2 · 1.2");
    for (const s of segments) {
      expect(s.sessionId).toBe("tts-x");
      expect(s.whisperPending).toBe(false);
      expect(s.audioPath).toBeNull();
    }
  });

  test("timestamps run in written order and stay in the past", () => {
    const { segments } = buildImportRows(blocks, { sessionId: "tts-x", startSeq: 0, ceqs: CEQS, now: 1_000_000 });
    const t = segments.map((s) => new Date(s.startedAt).getTime());
    expect(t[0] < t[1] && t[1] < t[2]).toBe(true);
    expect(Math.max(...t)).toBeLessThan(1_000_000);
  });

  test("a stamped block's tag window contains its segment, so the booth groups it", () => {
    const { segments, tags } = buildImportRows(blocks, { sessionId: "tts-x", startSeq: 0, ceqs: CEQS, now: 1_000_000 });
    expect(tags.map((t) => t.tag)).toEqual(["cheat_code", "phrase"]);
    expect(contextOfSegment(segments[0], tags)).toBeNull();
    expect(contextOfSegment(segments[1], tags)?.tag).toBe("cheat_code");
    expect(contextOfSegment(segments[2], tags)?.tag).toBe("phrase");
    expect(tags[0].focusedCeqId).toBe("ceq-2");
    expect(tags[0].source).toBe("tap");
    expect(tags[0].endedAt).not.toBeNull();
  });
});
