import { describe, expect, test } from "bun:test";

import { assFromCards, assTime, cardsFromWords, shortsStyle, splitLines, srtFromCards, srtTime, type Word } from "./captions";

function words(text: string, start = 0, per = 0.3): Word[] {
  return text.split(" ").map((t, i) => ({ t, s: start + i * per, e: start + i * per + per * 0.8 }));
}

describe("caption cards", () => {
  test("a sentence becomes short cards of at most five words, held until the next card", () => {
    const cards = cardsFromWords(words("Internal users are managers inside the company who use info to plan."));
    expect(cards.length).toBeGreaterThanOrEqual(3);
    for (const c of cards) expect(c.lines.flat().length).toBeLessThanOrEqual(5);
    for (let i = 0; i < cards.length - 1; i++) expect(cards[i].e).toBeLessThanOrEqual(cards[i + 1].s);
    expect(cards[0].s).toBe(0);
  });
  test("a sentence end closes the card; a comma closes it after three words; a long pause closes it", () => {
    const w = [...words("Cram it. Then", 0), ...words("practice, and pass", 5)];
    const cards = cardsFromWords(w);
    expect(cards[0].lines.flat().map((x) => x.t)).toEqual(["Cram", "it."]);
    expect(cards[1].lines.flat().map((x) => x.t)).toEqual(["Then"]);           // the pause before "practice" ends it
    expect(cards[2].lines.flat().map((x) => x.t)).toEqual(["practice,", "and", "pass"]);
  });
  test("the time cap starts a new card even mid-sentence", () => {
    const cards = cardsFromWords(words("one two three four five six", 0, 0.5), { maxSeconds: 1.2 });
    expect(cards[0].lines.flat().length).toBeLessThanOrEqual(3);
  });
  test("a wide card breaks into two balanced lines", () => {
    const two = splitLines(words("managers inside the company decide"), 16);
    expect(two).toHaveLength(2);
    expect(two[0].map((w) => w.t).join(" ")).toBe("managers inside");
    expect(splitLines(words("plan control"), 16)).toHaveLength(1);
  });
});

describe("the files", () => {
  test("ASS carries the Shorts style — Rubik, the band right of the camera, karaoke per word", () => {
    const st = shortsStyle(1080, 1920);
    const ass = assFromCards(cardsFromWords(words("Internal users plan.")), st);
    expect(ass).toContain("PlayResX: 1080");
    // THE RAIL (layout.ts CAPTION_RAIL): 4.0 % type, soft-gold spoken, white ink, navy stroke (BGR);
    // align bottom-centre, MarginL 35 % (right of the .28w home camera), MarginR 16 %, MarginV 26.5 % (text bottom at .735h).
    expect(ass).toContain("Style: Cram,Rubik,77,&H008AD9FF,&H00FFFFFF,&H0020120B");
    expect(ass).toContain(",2,378,173,509,1");
    expect(ass).toMatch(/Dialogue: 0,0:00:00\.00,0:00:0\d\.\d\d,Cram,,0,0,0,,\{\\k\d+\}Internal(\\N| )\{\\k\d+\}users \{\\k\d+\}plan\./);
  });
  test("no camera frees the whole width", () => {
    expect(shortsStyle(1080, 1920, "none").left).toBeLessThan(0.1);
  });
  test("times format as ASS centiseconds and SRT milliseconds", () => {
    expect(assTime(61.234)).toBe("0:01:01.23");
    expect(srtTime(61.234)).toBe("00:01:01,234");
  });
  test("the SRT sidecar numbers the cards and keeps the line break", () => {
    const srt = srtFromCards([{ s: 0, e: 1, lines: [[{ t: "managers", s: 0, e: 0.3 }], [{ t: "inside", s: 0.4, e: 0.7 }]] }]);
    expect(srt).toBe("1\n00:00:00,000 --> 00:00:01,000\nmanagers\ninside\n");
  });
});
