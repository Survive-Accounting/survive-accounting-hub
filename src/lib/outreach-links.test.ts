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
    expect(l.path).toBe("/learn/ole-miss?share=council&c=ifc");
    expect(withContactRef(l.path, REF)).toBe(`/learn/ole-miss?share=council&c=ifc&ref=${REF}`);
  });
  test("the office gets the all-council page; a chapter on the site gets its chair page", () => {
    expect(linkFor("university-of-mississippi", { kind: "office", group: "FSL Office", slug: "", onSite: true }, true).path).toBe("/s/university-of-mississippi/council");
    expect(linkFor("university-of-mississippi", { kind: "chapter", group: "IFC", slug: "alpha-tau-omega", onSite: true }, true).path).toBe("/learn/ole-miss/alpha-tau-omega?share=chair");
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
  const ok = (r: ReturnType<typeof contactDm>) => { if (!r.ok) throw new Error(r.missing.join()); return r.text; };
  test("councils, the FSL office and clubs get Lee's council DM; chapters get the chapter DM with their letters", () => {
    const ifc = ok(contactDm({ campusLabel: "Ole Miss", courseCode: "ACCY 201", org: { kind: "council", group: "IFC", name: "Interfraternity Council", onSite: true }, link: "https://surviveaccounting.com/l/68a083e86648" }));
    expect(ifc.startsWith("Hey y’all,")).toBe(true);
    expect(ifc).toContain("specifically for Ole Miss students");
    expect(ifc).toContain("\nhttps://surviveaccounting.com/l/68a083e86648\n");
    const office = ok(contactDm({ campusLabel: "Ole Miss", courseCode: "ACCY 201", org: { kind: "office", group: "FSL Office", name: "FSL", onSite: false }, link: "x" }));
    expect(office.startsWith("Hey y’all,")).toBe(true);
    const ato = ok(contactDm({ campusLabel: "Ole Miss", courseCode: "ACCY 201", org: { kind: "chapter", group: "IFC", name: "Alpha Tau Omega", onSite: true, letters: "ΑΤΩ" }, link: "x" }));
    expect(ato).toContain("specifically for ΑΤΩ members taking ACCY 201");
    expect(ato.endsWith("— Lee")).toBe(true);
  });
  test("no course code → nothing to copy", () => {
    expect(contactDm({ campusLabel: "Ole Miss", courseCode: null, org: { kind: "council", group: "IFC", name: "IFC", onSite: true }, link: "x" }).ok).toBe(false);
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
