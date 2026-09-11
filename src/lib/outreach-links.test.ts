// The DM and the link per contact are pasted into real Instagram threads — pinned here, with the
// HANDOFF-DM-LINKS reference messages (Ole Miss, ACCY 201) as the contract.
import { describe, expect, test } from "bun:test";

import {
  buildOrgs, contactDm, firstNameOf, groupOf, linkFor, matchChapter, needsContact, orgMatches, withContactRef, type LinkContact, type SiteChapter,
} from "./outreach-links";

const REF = "8f4c2a10-6b2e-4d3a-9c1e-2b7d5e9a1f00";
const contact = (o: Partial<LinkContact>): LinkContact => ({
  id: REF, contactId: "68a083e86648", orgType: "", council: "", orgName: "", contactKind: "", execTitle: "", firstName: "", fullName: "",
  orgIg: "", personalIg: "", altIg: "", email: "", needsReview: false, reviewReason: "", dmStatus: "", dmChannel: "", dmSentAt: null, igSentAt: null, clicks: 0, ...o,
});
const chapters: SiteChapter[] = [
  { slug: "alpha-tau-omega", name: "Alpha Tau Omega", council: "IFC", nickname: "ATO", letters: "ΑΤΩ" },
  { slug: "alpha-delta-pi", name: "Alpha Delta Pi", council: "Panhellenic", nickname: "ADPi", letters: "ΑΔΠ" },
  { slug: "phi-kappa-psi", name: "Phi Kappa Psi", council: "ifc", nickname: null, letters: null },
];

describe("links", () => {
  test("council contacts get the council chair page, with the ref", () => {
    const l = linkFor("university-of-mississippi", { kind: "council", group: "IFC", slug: "ifc", onSite: true }, true);
    expect(l.path).toBe("/go/university-of-mississippi/council/ifc");
    expect(withContactRef(l.path, REF)).toBe(`/go/university-of-mississippi/council/ifc?ref=${REF}`);
  });
  test("the office gets the all-council page; a chapter on the site gets its chair page", () => {
    expect(linkFor("university-of-mississippi", { kind: "office", group: "FSL Office", slug: "", onSite: true }, true).path).toBe("/s/university-of-mississippi/council");
    expect(linkFor("university-of-mississippi", { kind: "chapter", group: "IFC", slug: "alpha-tau-omega", onSite: true }, true).path).toBe("/go/university-of-mississippi/alpha-tau-omega");
  });
  test("clubs, chapters not on the site, and any org at a campus with no chapters get the campus page", () => {
    expect(linkFor("university-of-mississippi", { kind: "club", group: "Campus Club", slug: "", onSite: false }, true).path).toBe("/s/university-of-mississippi");
    expect(linkFor("university-of-mississippi", { kind: "chapter", group: "IFC", slug: "", onSite: false }, true).path).toBe("/s/university-of-mississippi");
    expect(linkFor("florida-gulf-coast-university", { kind: "council", group: "IFC", slug: "ifc", onSite: true }, false).path).toBe("/s/florida-gulf-coast-university");
  });
  test("a ref appends with & when the path already has a query", () => {
    expect(withContactRef("/s/x/council?c=ifc", REF)).toBe(`/s/x/council?c=ifc&ref=${REF}`);
    expect(withContactRef("/s/x", null)).toBe("/s/x");
  });
});

describe("the DM", () => {
  test("Luke Habeeb, IFC scholarship chair at Ole Miss (the handoff's reference message)", () => {
    const msg = contactDm({
      campusLabel: "Ole Miss", courseCode: "ACCY 201", org: { kind: "council", group: "IFC", name: "Interfraternity Council", onSite: true },
      firstName: firstNameOf("Luke Habeeb"), isOrg: false, link: `surviveaccounting.com/go/university-of-mississippi/council/ifc?ref=${REF}`, campusHasChapters: true,
    });
    expect(msg).toBe([
      "Hey Luke! Intro accounting (ACCY 201) is one of the biggest drags on GPAs across your fraternities, and it's a fixable one.",
      "",
      "I'm an Ole Miss accounting grad and I've tutored ACCY 201 since 2015. I make cram videos and practice exams built around what's actually on the exam. Everything for Exam 1 is free.",
      "",
      "Could you pass this to your chapter scholarship chairs? Every IFC chapter has its own page here:",
      "",
      `surviveaccounting.com/go/university-of-mississippi/council/ifc?ref=${REF}`,
      "",
      "Happy to answer any questions. Thanks!",
      "",
      "— Lee",
    ].join("\n"));
  });
  test("the Alpha Tau Omega chapter account (the handoff's second reference message)", () => {
    const msg = contactDm({
      campusLabel: "Ole Miss", courseCode: "ACCY 201", org: { kind: "chapter", group: "IFC", name: "Alpha Tau Omega", onSite: true },
      firstName: "", isOrg: true, link: "surviveaccounting.com/go/university-of-mississippi/alpha-tau-omega", campusHasChapters: true,
    });
    expect(msg.startsWith("Hey! Intro accounting (ACCY 201) is one of the biggest drags on chapter GPAs, and it's a fixable one.")).toBe(true);
    expect(msg).toContain("I set up a page just for Alpha Tau Omega at Ole Miss. Could you share it with your members or pass it to your scholarship chair?");
    expect(msg).toContain("\nsurviveaccounting.com/go/university-of-mississippi/alpha-tau-omega\n");
    expect(msg.endsWith("— Lee")).toBe(true);
  });
  test("a person at a chapter is asked to share with members; Panhellenic says sororities; no code says intro accounting", () => {
    const person = contactDm({ campusLabel: "Ole Miss", courseCode: "ACCY 201", org: { kind: "chapter", group: "IFC", name: "Alpha Tau Omega", onSite: true }, firstName: "Jordan", isOrg: false, link: "x", campusHasChapters: true });
    expect(person).toContain("Hey Jordan!");
    expect(person).toContain("Could you share it with your members?\n");
    expect(person).not.toContain("scholarship chair?");
    const ph = contactDm({ campusLabel: "Ole Miss", courseCode: null, org: { kind: "council", group: "Panhellenic", name: "Panhellenic Council", onSite: true }, firstName: "", isOrg: true, link: "x", campusHasChapters: true });
    expect(ph).toContain("across your sororities");
    expect(ph).toContain("Hey! Intro accounting is one of the biggest drags");
    expect(ph).toContain("I've tutored intro accounting since 2015");
  });
  test("a campus with nothing on the site keeps the old council ask", () => {
    const msg = contactDm({ campusLabel: "Florida Gulf Coast", courseCode: null, org: { kind: "council", group: "IFC", name: "Interfraternity Council", onSite: true }, firstName: "", isOrg: true, link: "x", campusHasChapters: false });
    expect(msg).toContain("Could you pass this to your chapter scholarship chairs so they can share it with their members?");
  });
  test("first names: people yes, org accounts and handles no", () => {
    expect(firstNameOf("Luke Habeeb")).toBe("Luke");
    expect(firstNameOf("univmissifc")).toBe("");
    expect(firstNameOf("")).toBe("");
  });
});

describe("orgs", () => {
  test("chapter contacts join the site chapter by name, nickname or letters; the council label is normalised", () => {
    expect(matchChapter("ADPi", chapters)?.slug).toBe("alpha-delta-pi");
    expect(matchChapter("ΑΤΩ", chapters)?.slug).toBe("alpha-tau-omega");
    expect(groupOf({ council: "ifc", orgType: "chapter" })).toBe("IFC");
    expect(groupOf({ council: "", orgType: "office" })).toBe("FSL Office");
  });
  test("every council and every site chapter is a row even with no contact, and a chapter needs a contact until it has an account and a chair", () => {
    const orgs = buildOrgs([
      contact({ orgType: "chapter", council: "IFC", orgName: "Alpha Tau Omega", contactKind: "org_inbox", orgIg: "olemissato" }),
      contact({ id: "11111111-1111-4111-8111-111111111111", orgType: "chapter", council: "IFC", orgName: "ATO", contactKind: "student_officer", fullName: "Jordan Ellis", execTitle: "Scholarship Chair", personalIg: "jordan" }),
      contact({ id: "22222222-2222-4222-8222-222222222222", orgType: "council", council: "IFC", orgName: "Interfraternity Council", contactKind: "student_officer", fullName: "Luke Habeeb", execTitle: "Scholarship/Academic Chair", personalIg: "lukehabeeb" }),
    ], chapters);
    const ato = orgs.find((o) => o.slug === "alpha-tau-omega")!;
    expect(ato.account?.orgIg).toBe("olemissato");
    expect(ato.people.map((p) => p.fullName)).toEqual(["Jordan Ellis"]);
    expect(needsContact(ato)).toBe(false);
    const adpi = orgs.find((o) => o.slug === "alpha-delta-pi")!;
    expect(adpi.people).toEqual([]);
    expect(needsContact(adpi)).toBe(true);
    // Phi Kappa Psi's lowercase "ifc" lands under IFC.
    expect(orgs.find((o) => o.slug === "phi-kappa-psi")!.group).toBe("IFC");
    expect(orgs.filter((o) => o.kind === "council").map((o) => o.group).sort()).toEqual(["IFC", "MGC", "NPHC", "Panhellenic"]);
    const ifc = orgs.find((o) => o.kind === "council" && o.group === "IFC")!;
    expect(ifc.people[0].fullName).toBe("Luke Habeeb");
    expect(orgMatches(ato, "@jordan")).toBe(true);
    expect(orgMatches(ato, "scholarship")).toBe(true);
    expect(orgMatches(adpi, "jordan")).toBe(false);
  });
});
