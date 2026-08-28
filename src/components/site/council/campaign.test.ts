// THE CAMPAIGN BUILDER's assembled words and links (2026-08-28).
//
// These are the exact strings that land in a council officer's mail client and phone, so they are
// pinned here rather than eyeballed in a browser. The rule this file mostly exists to protect:
// every link we hand out is stamped, and the officer's own name signs the send.
import { describe, expect, test } from "bun:test";

import { campaignEmailBody, campaignSheetRows, campaignUrl, chapterSms } from "./CampaignBuilder";
import { slideTarget } from "@/lib/flyer.server";

const CHAPTERS = [
  { name: "Alpha Delta Phi", letters: "ADΦ", url: campaignUrl("/go/university-of-alabama/alpha-delta-phi") },
  { name: "Sigma Chi", letters: null, url: campaignUrl("/go/university-of-alabama/sigma-chi") },
];

describe("campaign links", () => {
  test("every chapter link is stamped via=campaign", () => {
    expect(campaignUrl("/go/university-of-alabama/sigma-chi"))
      .toBe("https://surviveaccounting.com/go/university-of-alabama/sigma-chi?via=campaign");
  });
  test("the four share channels are distinguishable", () => {
    const stamps = new Set([
      campaignUrl("/go/x/y"),
      "https://surviveaccounting.com/go/x/y?via=link",
      "https://surviveaccounting.com/go/x/y?s=flyer",
      slideTarget({ schoolSlug: "x", schoolName: "X", courseCode: null, chapterSlug: "y" }),
    ]);
    expect(stamps.size).toBe(4);
  });
});

describe("the blast body", () => {
  const body = campaignEmailBody({
    identity: { name: "Jordan Ellis", role: "VP Academic Excellence", email: "j@ua.edu" },
    councilName: "IFC", schoolName: "Alabama", courseLabel: "AC 210", chapters: CHAPTERS,
  });
  test("signs with the officer's own name and role, under the council", () => {
    expect(body).toContain("— Jordan Ellis, VP Academic Excellence, IFC");
  });
  test("carries every chapter's own stamped link", () => {
    for (const c of CHAPTERS) expect(body).toContain(c.url);
    expect((body.match(/\?via=campaign/g) ?? []).length).toBe(CHAPTERS.length);
  });
  test("falls back to the council's name when the officer hasn't said who they are", () => {
    const anon = campaignEmailBody({
      identity: { name: "", role: "", email: "" },
      councilName: "IFC", schoolName: "Alabama", courseLabel: "AC 210", chapters: CHAPTERS,
    });
    expect(anon.trimEnd().endsWith("— IFC")).toBe(true);
  });
  test("never claims the council endorsed or partnered with us", () => {
    expect(body).not.toMatch(/partnered|endorse/i);
  });
});

describe("the chapter spreadsheet", () => {
  const rows = campaignSheetRows(
    CHAPTERS.map((c, i) => ({ ...c, slug: i === 0 ? "alpha-delta-phi" : "sigma-chi" })),
    { "alpha-delta-phi": { email: "chair1@ua.edu", mobile: "(205) 555-0134" } },
  );
  test("one row per chapter, in the officer's column order", () => {
    expect(rows).toHaveLength(2);
    expect(Object.keys(rows[0]!)).toEqual(["Chapter", "Letters", "Share link", "Exec name", "Exec email", "Exec mobile"]);
  });
  test("carries the pre-tagged link and whatever they typed; blanks otherwise", () => {
    expect(rows[0]!["Share link"]).toContain("?via=campaign");
    expect(rows[0]!["Exec email"]).toBe("chair1@ua.edu");
    expect(rows[0]!["Exec mobile"]).toBe("(205) 555-0134");
    expect(rows[1]!["Exec email"]).toBe("");
    expect(rows[1]!["Exec mobile"]).toBe("");
  });
});

describe("the per-chapter text message", () => {
  test("names the chapter, the course and its own link, and stays SMS-short", () => {
    const sms = chapterSms({ chapterName: "Sigma Chi", courseLabel: "AC 210", url: CHAPTERS[1]!.url });
    expect(sms).toContain("Sigma Chi");
    expect(sms).toContain("AC 210");
    expect(sms).toContain(CHAPTERS[1]!.url);
    expect(sms.length).toBeLessThan(320);
  });
});
