// THE COUNCIL SHARE FLOW — the two pure pieces the fast path depends on (2026-08-29).
//
// The group-chat post is the page's DEFAULT share and the reason its door can claim thirty
// seconds; the roster parser is what stops the email tab from being twenty minutes of typing.
// Both are pinned here because both fail silently in the worst way: a post missing a chapter, or
// an import that quietly places 14 of 18 rows and looks identical to one that placed all 18.
import { describe, expect, test } from "bun:test";

import { councilChapterLinksPost } from "@/lib/partners";
import { parseRoster } from "./CampaignBuilder";

const CHAPTERS = [
  { slug: "alpha-chi-omega", name: "Alpha Chi Omega", letters: "AXO" },
  { slug: "alpha-delta-pi", name: "Alpha Delta Pi", letters: "ADPi" },
  { slug: "chi-omega", name: "Chi Omega", letters: "ChiO" },
];

describe("the group-chat post", () => {
  const post = councilChapterLinksPost({
    courseCode: "AC 210",
    chapters: [
      { name: "Alpha Chi Omega", url: "https://surviveaccounting.com/go/alabama/axo" },
      { name: "Alpha Delta Pi", url: "https://surviveaccounting.com/go/alabama/adpi" },
    ],
  });

  test("carries EVERY chapter's link — a missing house never hears about it", () => {
    expect(post).toContain("surviveaccounting.com/go/alabama/axo");
    expect(post).toContain("surviveaccounting.com/go/alabama/adpi");
  });

  test("names the course and leads with the free exam", () => {
    expect(post).toContain("AC 210");
    expect(post.toLowerCase()).toContain("free");
  });

  // REWRITTEN 2026-08-31. The credential used to be the last line and this test pinned that.
  // The post now ends in a wall of chapter links, so a closing line sits below everything anyone
  // reads — the credential moved into the opening block instead. Same claim, pinned in its new
  // place; the assertion is not weaker, it is aimed at where the copy actually lives now.
  test("carries the credential where it will be read — in the opening block, not under the links", () => {
    expect(post).toContain("1,000+ students");
    const credentialAt = post.indexOf("1,000+ students");
    const firstLinkAt = post.indexOf("surviveaccounting.com");
    expect(credentialAt).toBeLessThan(firstLinkAt);
  });

  test("answers 'what does it cost' in the first line, which is all a chat preview shows", () => {
    const firstLine = post.split("\n")[0];
    expect(firstLine.toLowerCase()).toContain("free");
    expect(firstLine.toLowerCase()).toContain("no cost");
  });

  // THE WALL. 18 chapters as 18 consecutive near-identical lines is unscannable, and a president
  // hunting for her own house gives up. Name, link, blank line — every entry, every time.
  test("every chapter entry is separated by a blank line", () => {
    const lines = post.split("\n");
    const axo = lines.indexOf("Alpha Chi Omega");
    expect(axo).toBeGreaterThan(-1);
    expect(lines[axo + 1]).toBe("surviveaccounting.com/go/alabama/axo");
    expect(lines[axo + 2]).toBe("");
    expect(lines[axo + 3]).toBe("Alpha Delta Pi");
  });

  test("does not end in trailing whitespace — the last entry's separator is trimmed", () => {
    expect(post).toBe(post.trimEnd());
    expect(post.endsWith("surviveaccounting.com/go/alabama/adpi")).toBe(true);
  });

  test("carries NO tracking stamp — it gets forwarded and retyped, so a stamp would lie", () => {
    expect(post).not.toContain("?via=");
  });

  test("is a paste, not an email: no subject line and no signature block", () => {
    expect(post).not.toMatch(/^Subject:/im);
    expect(post).not.toMatch(/^—\s/m);
  });
});

describe("the roster parser", () => {
  test("takes what Excel actually pastes — tab-separated, header row skipped", () => {
    const r = parseRoster(
      ["Chapter\tEmail\tMobile", "Alpha Chi Omega\taxo@school.edu\t(555) 010-0134"].join("\n"),
      CHAPTERS,
    );
    expect(r.matched).toBe(1);
    expect(r.rows["alpha-chi-omega"]).toEqual({ email: "axo@school.edu", mobile: "(555) 010-0134" });
  });

  test("takes a .csv export too", () => {
    const r = parseRoster("Chi Omega,chio@school.edu", CHAPTERS);
    expect(r.rows["chi-omega"]?.email).toBe("chio@school.edu");
  });

  test("matches on the letters a real roster uses, not just the formal name", () => {
    expect(parseRoster("ADPi\tadpi@school.edu", CHAPTERS).rows["alpha-delta-pi"]?.email).toBe("adpi@school.edu");
  });

  test("shrugs off casing, spacing and punctuation", () => {
    expect(parseRoster("  alpha chi omega \taxo@school.edu", CHAPTERS).matched).toBe(1);
  });

  test("columns can be in any order — the email is found by SHAPE, not by position", () => {
    const r = parseRoster("Alpha Chi Omega\t555-010-0134\taxo@school.edu", CHAPTERS);
    expect(r.rows["alpha-chi-omega"]).toEqual({ email: "axo@school.edu", mobile: "555-010-0134" });
  });

  test("an unambiguous partial resolves", () => {
    expect(parseRoster("Alpha Chi\taxo@school.edu", CHAPTERS).rows["alpha-chi-omega"]?.email).toBe("axo@school.edu");
  });

  test("an AMBIGUOUS partial is refused, not guessed — the wrong president must never be emailed", () => {
    const r = parseRoster("Alpha\tsomeone@school.edu", CHAPTERS);
    expect(r.matched).toBe(0);
    expect(r.unmatched).toContain("Alpha");
  });

  test("a row we cannot place is REPORTED, never dropped silently", () => {
    const r = parseRoster(
      ["Alpha Chi Omega\taxo@school.edu", "Kappa Kappa Gamma\tkkg@school.edu"].join("\n"),
      CHAPTERS,
    );
    expect(r.matched).toBe(1);
    expect(r.unmatched).toEqual(["Kappa Kappa Gamma"]);
  });

  test("a chapter with no contact at all is not counted as imported", () => {
    const r = parseRoster("Alpha Chi Omega", CHAPTERS);
    expect(r.matched).toBe(0);
    expect(r.unmatched).toContain("Alpha Chi Omega");
  });

  test("blank lines and stray quotes survive the round trip", () => {
    const r = parseRoster('\n"Chi Omega","chio@school.edu"\n\n', CHAPTERS);
    expect(r.rows["chi-omega"]?.email).toBe("chio@school.edu");
  });
});
