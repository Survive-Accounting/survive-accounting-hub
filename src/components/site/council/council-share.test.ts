// THE COUNCIL SHARE FLOW — the two pure pieces the fast path depends on (2026-08-29).
//
// The group-chat post is the page's DEFAULT share and the reason its door can claim thirty
// seconds; the roster parser is what stops the email tab from being twenty minutes of typing.
// Both are pinned here because both fail silently in the worst way: a post missing a chapter, or
// an import that quietly places 14 of 18 rows and looks identical to one that placed all 18.
import { describe, expect, test } from "bun:test";

import { councilChapterLinksPost, councilPortalPost } from "@/lib/partners";
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

  // CHANGED 2026-08-31, and the reason matters: every pasteable message now ends on a PERSON with
  // a phone number, because whoever pastes this is putting their own credibility behind it and
  // the chat's first question is "who is this". The credential did not go anywhere — it is still
  // the last thing said about the product, immediately above the sign-off. Both are pinned.
  test("still carries the credential, as the last thing said about the product", () => {
    expect(post).toContain("Made by a tutor who's worked with 1,000+ accounting students.");
    expect(post.indexOf("1,000+")).toBeGreaterThan(post.lastIndexOf("surviveaccounting.com"));
  });

  test("ends on a person with a number, not on a brand", () => {
    expect(post.trim().endsWith("Questions? Text Lee Ingram, the tutor behind it — (662) 565-8818")).toBe(true);
  });

  // THE WALL. Eighteen chapters as eighteen consecutive near-identical lines is unscannable, and
  // a president hunting for her own house gives up — or worse, taps the wrong one.
  test("every chapter entry is separated by a blank line", () => {
    const lines = post.split("\n");
    const axo = lines.indexOf("Alpha Chi Omega");
    expect(axo).toBeGreaterThan(-1);
    expect(lines[axo + 1]).toBe("surviveaccounting.com/go/alabama/axo");
    expect(lines[axo + 2]).toBe("");
    expect(lines[axo + 3]).toBe("Alpha Delta Pi");
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

// ── THE PORTAL POST — the primary council share (2026-08-31) ─────────────────────────────────
//
// One link instead of eighteen. The failure it exists to prevent is not "she gives up scrolling"
// — it is a president tapping the WRONG chapter's link out of a group chat, landing on somebody
// else's page, and every member she forwards it to being counted against the wrong house.
describe("the portal post", () => {
  const post = councilPortalPost({
    courseCode: "AC 210",
    schoolName: "Alabama",
    portalUrl: "https://surviveaccounting.com/s/university-of-alabama",
  });

  test("carries EXACTLY ONE link, and it is the portal", () => {
    const links = post.match(/surviveaccounting\.com\S*/g) ?? [];
    expect(links).toEqual(["surviveaccounting.com/s/university-of-alabama"]);
  });

  test("never hands out a /go/ link — that is the one a thumb can get wrong", () => {
    expect(post).not.toContain("/go/");
  });

  test("names the course and says what it costs in the first line", () => {
    const first = post.split("\n")[0];
    expect(first).toContain("AC 210");
    expect(first.toLowerCase()).toContain("no cost");
  });

  test("ends on a person with a number", () => {
    expect(post.trim().endsWith("Questions? Text Lee Ingram, the tutor behind it — (662) 565-8818")).toBe(true);
  });

  // §6: the roster-count line is for the ONE exec who can fix an incomplete roster. Putting it in
  // a message bound for a room full of chapter presidents plants the idea that the thing they were
  // just handed is half-built.
  test("says nothing about missing chapters — that line is for the exec, not the group chat", () => {
    expect(post.toLowerCase()).not.toContain("missing");
    expect(post.toLowerCase()).not.toContain("added right away");
  });
});
