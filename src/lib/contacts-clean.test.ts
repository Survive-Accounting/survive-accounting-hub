import { describe, expect, it } from "bun:test";

import {
  chapterPatterns, cleanContacts, contactKindOf, inferCouncil, isOrgName, normalizeCouncil,
  normalizeEmail, normalizeTitle, residual, resolveChapter, rootDomain, scoreHandle, splitName,
  stripHandle, titleCaseFix, type ScrapeRow,
} from "./contacts-clean";
import { contactId, contactsToCsv, parseContactsFile } from "./growth-contacts-schema";

const row = (o: Partial<ScrapeRow>): ScrapeRow => ({ school: "", council: "", role: "", name: "", instagram: "", chapter: "", email: "", ...o });
const SRC = "test.csv @ 2026-09-10";
const clean = (rows: ScrapeRow[]) => cleanContacts(rows, SRC);

describe("field normalisers", () => {
  it("repairs emails: case, %20 junk, known domain typos", () => {
    expect(normalizeEmail("  KKennedy@ALSU.edu ")).toBe("kkennedy@alasu.edu");
    expect(normalizeEmail("a%20b@umihc.edu")).toBe("ab@umich.edu");
    expect(normalizeEmail("")).toBe("");
    expect(rootDomain("x@mail.olemiss.edu")).toBe("olemiss.edu");
  });

  it("normalises council spelling, including Women in Business to Campus Club", () => {
    expect(normalizeCouncil("PANHELLENIC")).toBe("Panhellenic");
    expect(normalizeCouncil("ifc")).toBe("IFC");
    expect(normalizeCouncil("Women in Business")).toBe("Campus Club");
    expect(normalizeCouncil("OTHER")).toBe("Other");
  });

  it("normalises titles: VP expanded, ampersand, council prefix stripped", () => {
    expect(normalizeTitle("VP of Finance")).toBe("Vice President of Finance");
    expect(normalizeTitle("Scholarship & Standards Chair")).toBe("Scholarship and Standards Chair");
    expect(normalizeTitle("IFC President")).toBe("President");
    expect(titleCaseFix("DIRECTOR OF GREEK LIFE")).toBe("Director Of Greek Life");
  });

  it("splits names, dropping honorifics, suffixes and nicknames", () => {
    expect(splitName("Kamela D. Kennedy")).toEqual({ first: "Kamela", last: "Kennedy" });
    expect(splitName('Dr. James B. Oliver Jr.')).toEqual({ first: "James", last: "Oliver" });
    expect(splitName('Robert "Bobby" Smith')).toEqual({ first: "Robert", last: "Smith" });
    expect(splitName("Cher")).toEqual({ first: "Cher", last: "" });
  });

  it("tells an organisation name from a person's", () => {
    expect(isOrgName("Fraternity and Sorority Life Office")).toBe(true);
    expect(isOrgName("Alpha Chi Omega")).toBe(true);
    expect(isOrgName("Jordan Ellis")).toBe(false);
  });

  it("classifies student officers, staff and inboxes", () => {
    expect(contactKindOf("President", "Jordan Ellis", false)).toBe("student_officer");
    expect(contactKindOf("Scholarship Chair", "Maddie Carter", false)).toBe("student_officer");
    expect(contactKindOf("Assistant Director of Fraternity and Sorority Life", "Nykeria Foster", false)).toBe("staff");
    expect(contactKindOf("", "", true)).toBe("org_inbox");
  });

  it("bares handles from @ and URLs", () => {
    expect(stripHandle("@SigmaChi")).toBe("sigmachi");
    expect(stripHandle("https://www.instagram.com/sigmachi/")).toBe("sigmachi");
  });
});

describe("the handle matcher", () => {
  it("strips every way a school is written out of a handle", () => {
    expect(residual("auburnkd", "Auburn University")).toBe("kd");
    expect(residual("kappasigma_ksu", "Kansas State University")).toBe("kappasigma");
    expect(residual("sigmasatclemson", "Clemson University")).toBe("sigmas");
    // a handle that is nothing but the school reduces to empty: the school's own account
    expect(residual("floridaatlantic", "Florida Atlantic University")).toBe("");
  });

  it("generates letter-abbreviation patterns and nicknames", () => {
    const p = chapterPatterns("Kappa Delta");
    expect(p).toContain("kappadelta");
    expect(p).toContain("kd");
    expect(chapterPatterns("Pi Kappa Alpha")).toContain("pike");
  });

  it("prefers a match at the start of the handle", () => {
    expect(scoreHandle("kappadelta", "Kappa Delta")).toBeGreaterThan(scoreHandle("xkappadelta", "Kappa Delta"));
  });

  it("keeps the claimed chapter when two score equally", () => {
    // "phikap" is a nickname of both Phi Kappa Psi and Phi Kappa Tau.
    const m = resolveChapter("phikap", ["Phi Kappa Psi", "Phi Kappa Tau"], "Phi Kappa Tau");
    expect(m.chapter).toBe("Phi Kappa Tau");
    expect(m.tie).toBe(false);
  });

  it("reports a genuine tie when nothing was claimed", () => {
    expect(resolveChapter("phikap", ["Phi Kappa Psi", "Phi Kappa Tau"], "").tie).toBe(true);
  });

  it("scores nothing for a fragment that is not a whole pattern", () => {
    expect(scoreHandle("sig", "Sigma Chi")).toBe(0);
  });

  it("infers the council from the national org", () => {
    expect(inferCouncil("Alpha Chi Omega")).toBe("Panhellenic");
    expect(inferCouncil("Alpha Phi Alpha")).toBe("NPHC");
    expect(inferCouncil("Lambda Theta Phi")).toBe("MGC");
    expect(inferCouncil("Women in Business")).toBe("Campus Club");
    expect(inferCouncil("Sigma Chi")).toBe("IFC");
  });
});

describe("cleanContacts pipeline", () => {
  it("drops test rows and exact duplicates", () => {
    const r = clean([
      row({ school: "Ole Miss", council: "IFC", chapter: "Sigma Chi", instagram: "@sigmachi_om" }),
      row({ school: "Ole Miss", council: "IFC", chapter: "Sigma Chi", instagram: "@sigmachi_om" }),
      row({ school: "Ole Miss", council: "IFC", name: "Fake", email: "x@example.edu" }),
    ]);
    expect(r.stats.dropped_exact_duplicates).toBe(1);
    expect(r.stats.dropped_test_rows).toBe(1);
    expect(r.rows).toHaveLength(1);
  });

  it("moves a row to the school its email domain proves", () => {
    const r = clean([row({ school: "Barnard College", council: "IFC", name: "Ann Lee", role: "Advisor", email: "alee@murraystate.edu" })]);
    expect(r.rows[0].school).toBe("Murray State University");
    expect(r.rows[0].notes).toContain("moved from 'Barnard College'");
    expect(r.stats.rows_moved_to_real_school_by_email_domain).toBe(1);
  });

  it("flags an email domain that belongs to no known school", () => {
    const r = clean([row({ school: "Wesleyan University", council: "IFC", email: "studentengagement@batten.edu" })]);
    expect(r.rows[0].needs_review).toBe("yes");
    expect(r.rows[0].review_reason).toContain("batten.edu is not a known school domain");
  });

  it("pulls a chapter name out of the Role column", () => {
    const r = clean([row({ school: "Ole Miss", council: "IFC", role: "President, Phi Kappa Sigma", name: "Jordan Ellis", email: "j@olemiss.edu" })]);
    expect(r.rows[0].org_name).toBe("Phi Kappa Sigma");
    expect(r.rows[0].exec_title).toBe("President");
    expect(r.stats.chapter_extracted_from_role_or_name).toBe(1);
  });

  it("re-matches a handle to the chapter it actually spells", () => {
    const r = clean([
      row({ school: "American University", council: "Panhellenic", chapter: "Alpha Chi Omega", instagram: "@americanchio" }),
      row({ school: "American University", council: "Panhellenic", chapter: "Chi Omega", instagram: "@aucho" }),
    ]);
    const fixed = r.rows.find((x) => x.notes.includes("chapter corrected"));
    expect(fixed?.org_name).toBe("Chi Omega");
    expect(r.stats.chapter_ig_reassigned_to_correct_chapter + r.stats.chapter_ig_assigned_to_chapter_missing_from_school_list).toBeGreaterThan(0);
  });

  it("moves a council handle onto the council and off the chapter", () => {
    const r = clean([row({ school: "Lafayette College", council: "IFC", chapter: "Zeta Psi", instagram: "@ifc_lafayette" })]);
    expect(r.stats.chapter_ig_moved_to_council).toBe(1);
    expect(r.rows.every((x) => x.org_ig !== "ifc_lafayette" || x.org_type !== "chapter")).toBe(true);
  });

  it("drops a school-wide account rather than calling it a chapter", () => {
    const r = clean([row({ school: "University of Alabama", council: "Panhellenic", chapter: "Alpha Phi", instagram: "@univofalabama", email: "a@ua.edu" })]);
    expect(r.stats.chapter_ig_noise_or_unmatched).toBeGreaterThan(0);
    expect(r.rows[0].org_ig).toBe("");
    expect(r.rows[0].notes).toContain("school's or a generic account");
  });

  it("files a business fraternity as a Campus Club", () => {
    const r = clean([row({ school: "Auburn University", council: "Other", chapter: "Sigma Chi", instagram: "@auburnakpsi", email: "x@auburn.edu" })]);
    expect(r.rows[0].council).toBe("Campus Club");
    expect(r.rows[0].org_type).toBe("club");
    expect(r.rows[0].org_name).toBe("Alpha Kappa Psi");
  });

  it("separates a personal handle from the chapter's", () => {
    const r = clean([
      row({ school: "University of Mississippi", council: "IFC", chapter: "Sigma Chi", role: "President", name: "Jordan Ellis", instagram: "@jordanellis", email: "j@olemiss.edu" }),
      row({ school: "University of Mississippi", council: "IFC", chapter: "Sigma Chi", instagram: "@olemisssigmachi" }),
    ]);
    const person = r.rows.find((x) => x.full_name === "Jordan Ellis")!;
    expect(person.personal_ig).toBe("jordanellis");
    expect(person.contact_kind).toBe("student_officer");
    // the org's handle is copied onto the person's row so they are reachable either way
    expect(person.org_ig).toBe("olemisssigmachi");
  });

  // Reproduces the Erskine College row in Lee's contacts-review.csv byte for byte: the title starts
  // "Director of", which STUDENT_TITLE_RX claims before the staff pattern sees it, so the person
  // stays a student officer on their first council and carries the rest in councils_covered.
  it("collapses one person listed under four councils, keeping every council they cover", () => {
    const rows = ["IFC", "Panhellenic", "NPHC", "MGC"].map((c) =>
      row({ school: "Erskine College", council: c, role: "Director of Student Engagement and Leadership", name: "Cierra Hyde", email: "cierra.hyde@erskine.edu" }));
    const r = clean(rows);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      council: "IFC", org_type: "council", org_name: "Interfraternity Council", contact_kind: "student_officer",
      councils_covered: "IFC;MGC;NPHC;Panhellenic",
    });
    expect(r.rows[0].notes).toBe("also listed under: Multicultural Greek Council; National Pan-Hellenic Council; Panhellenic Council | merged 4 rows across councils");
    expect(r.stats.duplicate_person_rows_collapsed).toBe(1);
  });

  // A staff advisor repeated per council collapses to ONE office row. Matches the Hamilton College
  // row in contacts-review.csv: because every copy already resolves to the same office org, the
  // group merges on the "duplicate rows" path and keeps the first council rather than widening
  // councils_covered. Locked in deliberately — it is the reference implementation's behaviour.
  it("collapses a staff advisor repeated per council into one office row", () => {
    const rows = ["IFC", "Panhellenic", "NPHC"].map((c) =>
      row({ school: "Erskine College", council: c, role: "Assistant Dean for Greek Life", name: "Pat Rivers", email: "pat.rivers@erskine.edu" }));
    const r = clean(rows);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      org_type: "office", org_name: "Fraternity and Sorority Life Office", contact_kind: "staff", council: "IFC",
    });
    expect(r.rows[0].notes).toContain("merged 3 duplicate rows");
  });

  // The FSL Office widening DOES happen when the copies resolve to different orgs.
  it("widens to FSL Office when a person's councils resolve to different orgs", () => {
    const r = clean([
      row({ school: "Erskine College", council: "IFC", role: "Assistant Dean", name: "Pat Rivers", email: "pat.rivers@erskine.edu" }),
      row({ school: "Erskine College", council: "Panhellenic", role: "Assistant Dean", name: "Pat Rivers", chapter: "Chi Omega", email: "pat.rivers@erskine.edu" }),
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].councils_covered.split(";").sort()).toEqual(["IFC", "Panhellenic"]);
  });

  it("flags the scraper's cartesian product instead of guessing a chapter", () => {
    const rows = ["Alpha Delta Pi", "Alpha Tau Omega", "Phi Kappa Psi"].map((ch) =>
      row({ school: "Miami University", council: "Panhellenic", role: "President", name: "Jacob Little", chapter: ch, email: "littlejh@miamioh.edu" }));
    const r = clean(rows);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].org_name).toBe("");
    expect(r.rows[0].council).toBe("Other");
    expect(r.rows[0].needs_review).toBe("yes");
    expect(r.rows[0].review_reason).toContain("listed under several chapters");
    expect(r.stats.cartesian_product_people_resolved).toBe(1);
  });

  it("flags one handle claimed by two chapters at the same school", () => {
    const r = clean([
      row({ school: "Florida Atlantic University", council: "IFC", chapter: "Sigma Chi", instagram: "@fausigs" }),
      row({ school: "Florida Atlantic University", council: "IFC", chapter: "Sigma Nu", instagram: "@fausigs" }),
    ]);
    expect(r.rows.every((x) => x.needs_review === "yes")).toBe(true);
    expect(r.rows[0].review_reason).toContain("is also assigned to");
  });

  it("drops a row with no handle, no email and no person", () => {
    const r = clean([row({ school: "Ole Miss", council: "IFC", chapter: "Sigma Chi" })]);
    expect(r.rows).toHaveLength(0);
    expect(r.stats.dropped_rows_with_no_contact_channel + r.stats.chapter_ig_noise_or_unmatched).toBeGreaterThan(0);
    expect(r.dropped.length).toBeGreaterThan(0);
  });

  it("stamps the source on every row and mints a reproducible id", () => {
    const r = clean([row({ school: "Ole Miss", council: "IFC", chapter: "Sigma Chi", instagram: "@olemisssigmachi" })]);
    expect(r.rows[0].source).toBe(SRC);
    expect(r.rows[0].contact_id).toHaveLength(12);
    expect(r.rows[0].contact_id).toBe(contactId(r.rows[0]));
  });

  it("is deterministic: the same input twice gives byte-identical output", () => {
    const rows = [
      row({ school: "Ole Miss", council: "IFC", chapter: "Sigma Chi", instagram: "@olemisssigmachi" }),
      row({ school: "LSU", council: "Panhellenic", chapter: "Kappa Delta", role: "President", name: "Ann Lee", email: "alee@lsu.edu" }),
    ];
    expect(contactsToCsv(clean(rows).rows)).toBe(contactsToCsv(clean(rows).rows));
  });

  // THE ID-STABILITY GUARANTEE. Everything upserts on contact_id, so the same set of contacts must
  // clean to the same ids no matter what order the scraper hands them over — otherwise every scrape
  // inserts a second copy of everyone.
  it("gives identical output whatever order the rows arrive in", () => {
    const rows = [
      row({ school: "Auburn University", council: "Panhellenic", chapter: "Delta Delta Delta", instagram: "@auburntridelta" }),
      row({ school: "Auburn University", council: "Panhellenic", chapter: "Delta Delta Delta", instagram: "@auburndeltas" }),
      row({ school: "Auburn University", council: "IFC", role: "Advisor", name: "Pat Rivers", email: "pat@auburn.edu" }),
      row({ school: "Auburn University", council: "NPHC", role: "Advisor", name: "Pat Rivers", email: "pat@auburn.edu" }),
      row({ school: "Auburn University", council: "MGC", role: "Advisor", name: "Pat Rivers", email: "pat@auburn.edu" }),
    ];
    const forward = clean(rows);
    const reversed = clean([...rows].reverse());
    const shuffled = clean([rows[3], rows[0], rows[4], rows[2], rows[1]]);
    expect(contactsToCsv(reversed.rows)).toBe(contactsToCsv(forward.rows));
    expect(contactsToCsv(shuffled.rows)).toBe(contactsToCsv(forward.rows));
    // and specifically the fields that used to depend on order
    expect(forward.rows.map((r) => r.contact_id)).toEqual(reversed.rows.map((r) => r.contact_id));
  });

  it("round-trips through the CSV writer and reader", () => {
    const r = clean([row({ school: "Ole Miss", council: "IFC", chapter: "Sigma Chi", role: "President", name: "Jordan Ellis", instagram: "@jordanellis", email: "j@olemiss.edu" })]);
    const back = parseContactsFile(contactsToCsv(r.rows));
    expect(back.legacy).toBe(false);
    expect(back.rows[0]).toMatchObject({
      contact_id: r.rows[0].contact_id, school: "University of Mississippi", full_name: "Jordan Ellis", personal_ig: "jordanellis",
    });
  });
});
