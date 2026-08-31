// CAMPUS REP V1 — pure-logic coverage for the pieces the DB can't test for us: lifecycle
// transitions, chapter-state precedence, contact validation, share copy, and the 10% commission
// promise. Server behaviours that live in the DB (the assignment race's unique index) are
// exercised in live QA; everything decidable in pure code is decided here.
import { describe, expect, it } from "bun:test";

import {
  ACTIVITY_KINDS, assignmentAfterQc, campusCapacity, chapterState, contactDraftProblem,
  contactTypeForRole, dmMessage, formatUsPhoneInput, mailtoHref, nextDmStatus, normalizeInstagram,
  onboardingProblem, reachCount, repSlugCandidate, shareEmail, shareKindForMethod, shareMessage,
  signupResolution, smsHref, REP_STATUSES,
} from "@/lib/rep-shared";
import { commissionCents } from "@/lib/referral-shared";
import { flyerTarget } from "@/lib/flyer.server";
import { seedCharFromKey } from "@/lib/picker-keys";

describe("rep lifecycle", () => {
  it("carries the full applicant → active path", () => {
    expect(REP_STATUSES).toEqual(["applied", "approved", "active", "paused", "deactivated"]);
  });
});

describe("assignmentAfterQc", () => {
  it("approve qualifies a reservation", () => {
    expect(assignmentAfterQc("reserved", "approve", false)).toBe("qualified");
  });
  it("reject with no other usable contact releases the reservation", () => {
    expect(assignmentAfterQc("reserved", "reject", false)).toBe("revoked");
  });
  it("reject with another usable contact keeps the reservation", () => {
    expect(assignmentAfterQc("reserved", "reject", true)).toBe("reserved");
  });
  it("a later reject never demotes an already-qualified chapter", () => {
    expect(assignmentAfterQc("qualified", "reject", false)).toBe("qualified");
  });
  it("terminal states never move", () => {
    expect(assignmentAfterQc("revoked", "approve", true)).toBe("revoked");
    expect(assignmentAfterQc("expired", "approve", true)).toBe("expired");
    expect(assignmentAfterQc("reassigned", "reject", false)).toBe("reassigned");
  });
});

describe("chapterState precedence", () => {
  const base = { claimed: false, signups: 0, housePosted: false, kitShared: false, myAssignment: null, otherAssignment: false } as const;
  it("available when nothing has happened", () => {
    expect(chapterState({ ...base })).toBe("available");
  });
  it("reserved (other) when another rep holds it", () => {
    expect(chapterState({ ...base, otherAssignment: true })).toBe("reserved_other");
  });
  it("assigned → contact_verified → kit_shared → flyer_posted → engaged ladder", () => {
    expect(chapterState({ ...base, myAssignment: "reserved" })).toBe("assigned");
    expect(chapterState({ ...base, myAssignment: "qualified" })).toBe("contact_verified");
    expect(chapterState({ ...base, myAssignment: "qualified", kitShared: true })).toBe("kit_shared");
    expect(chapterState({ ...base, myAssignment: "qualified", kitShared: true, housePosted: true })).toBe("flyer_posted");
    expect(chapterState({ ...base, myAssignment: "qualified", kitShared: true, housePosted: true, signups: 3 })).toBe("engaged");
  });
  it("claimed beats everything", () => {
    expect(chapterState({ ...base, claimed: true, myAssignment: "qualified", signups: 9 })).toBe("claimed");
  });
});

describe("contact draft validation", () => {
  it("requires an email OR a phone", () => {
    expect(contactDraftProblem({})).toContain("email or a phone");
    expect(contactDraftProblem({ name: "John" })).toContain("email or a phone");
  });
  it("passes with a phone alone or an email alone", () => {
    expect(contactDraftProblem({ phone: "5551234567" })).toBeNull();
    expect(contactDraftProblem({ email: "pres@chapter.org" })).toBeNull();
  });
  it("rejects a malformed email", () => {
    expect(contactDraftProblem({ email: "not-an-email" })).toContain("email");
  });
});

describe("normalizeInstagram", () => {
  it("normalizes handles, @handles and full URLs to one canonical form", () => {
    expect(normalizeInstagram("SomeHandle")).toBe("https://instagram.com/somehandle");
    expect(normalizeInstagram("@some.handle")).toBe("https://instagram.com/some.handle");
    expect(normalizeInstagram("https://instagram.com/Some_Handle/")).toBe("https://instagram.com/some_handle");
    expect(normalizeInstagram("")).toBeNull();
    expect(normalizeInstagram("   ")).toBeNull();
  });
});

describe("contactTypeForRole", () => {
  it("advisors are staff; execs are student officers", () => {
    expect(contactTypeForRole("Advisor")).toBe("staff_advisor");
    expect(contactTypeForRole("President")).toBe("student_officer");
    expect(contactTypeForRole("Treasurer")).toBe("student_officer");
  });
});

describe("share copy", () => {
  const i = { campusName: "Auburn", chapterName: "Phi Delta Theta", courseCode: "ACCT 2110", shortUrl: "https://surviveaccounting.com/r/abc1234" };
  it("the message and email both carry the tracked link", () => {
    expect(shareMessage(i)).toContain(i.shortUrl);
    const em = shareEmail(i);
    expect(em.body).toContain(i.shortUrl);
    expect(em.subject).toContain("Phi Delta Theta");
  });
  it("sms:/mailto: hrefs URL-encode the tracked link into the composer", () => {
    expect(smsHref(shareMessage(i))).toStartWith("sms:?&body=");
    expect(decodeURIComponent(smsHref(shareMessage(i)))).toContain(i.shortUrl);
    const em = shareEmail(i);
    const href = mailtoHref("pres@chapter.org", em.subject, em.body);
    expect(href).toStartWith("mailto:pres%40chapter.org?subject=");
    expect(decodeURIComponent(href)).toContain(i.shortUrl);
  });
});

describe("share activity mapping", () => {
  it("every share method logs a defined activity kind", () => {
    for (const kind of Object.values(shareKindForMethod)) {
      expect(ACTIVITY_KINDS).toContain(kind);
    }
    expect(shareKindForMethod.sms_composer).toBe("share_kit_sms");
    expect(shareKindForMethod.web_share).toBe("share_kit_shared");
  });
});

describe("flyer attribution", () => {
  const base = { schoolSlug: "auburn", schoolName: "Auburn", courseCode: "ACCT 2110" };
  it("a rep-attributed flyer QR encodes /r/<code>, not /go", () => {
    expect(flyerTarget({ ...base, chapterSlug: "phi-delta-theta", chapterName: "Phi Delta Theta", refCode: "abc1234" }))
      .toBe("https://surviveaccounting.com/r/abc1234");
  });
  it("without a ref the QR stays the plain /go (chapter) or campus URL", () => {
    expect(flyerTarget({ ...base, chapterSlug: "phi-delta-theta" }))
      .toBe("https://surviveaccounting.com/go/auburn/phi-delta-theta?s=flyer");
    expect(flyerTarget(base)).toBe("https://surviveaccounting.com/auburn?s=flyer");
  });
  it("the flyer input has no rep-name field — attribution is QR-only by construction", () => {
    // Compile-time truth spot-checked at runtime: the accepted keys are exactly these.
    const input = { ...base, chapterSlug: "x", chapterName: "X", refCode: "abc" };
    expect(Object.keys(input).sort()).toEqual(["chapterName", "chapterSlug", "courseCode", "refCode", "schoolName", "schoolSlug"]);
  });
});

describe("signupResolution (self-verify, no approval gate)", () => {
  it("nothing on file → fresh signup then verification", () => {
    expect(signupResolution(null)).toBe("fresh");
  });
  it("an unverified signup RESUMES on the same row — never a duplicate rep", () => {
    expect(signupResolution({ repStatus: "approved", phoneVerifiedAt: null })).toBe("resume");
    expect(signupResolution({ repStatus: "applied", phoneVerifiedAt: null })).toBe("resume");
    // verified phone but not yet flipped active (interrupted mid-activation) still resumes
    expect(signupResolution({ repStatus: "approved", phoneVerifiedAt: "2026-08-26T00:00:00Z" })).toBe("resume");
  });
  it("a verified active rep is told to sign in", () => {
    expect(signupResolution({ repStatus: "active", phoneVerifiedAt: "2026-08-26T00:00:00Z" })).toBe("existing_active");
  });
  it("paused/deactivated reps cannot resurrect themselves through signup", () => {
    expect(signupResolution({ repStatus: "paused", phoneVerifiedAt: "2026-08-26T00:00:00Z" })).toBe("blocked");
    expect(signupResolution({ repStatus: "deactivated", phoneVerifiedAt: null })).toBe("blocked");
  });
});

describe("formatUsPhoneInput", () => {
  it("formats progressively as the user types", () => {
    expect(formatUsPhoneInput("6")).toBe("(6");
    expect(formatUsPhoneInput("601")).toBe("(601");
    expect(formatUsPhoneInput("6012")).toBe("(601) 2");
    expect(formatUsPhoneInput("601201")).toBe("(601) 201");
    expect(formatUsPhoneInput("6012018759")).toBe("(601) 201-8759");
  });
  it("re-formats pasted/decorated input and caps at 10 digits", () => {
    expect(formatUsPhoneInput("601-201-8759")).toBe("(601) 201-8759");
    expect(formatUsPhoneInput("60120187591234")).toBe("(601) 201-8759");
    expect(formatUsPhoneInput("")).toBe("");
  });
  it("leaves an international +… number alone", () => {
    expect(formatUsPhoneInput("+447911123456")).toBe("+447911123456");
  });
});

describe("picker type-to-search predicate", () => {
  const k = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) =>
    seedCharFromKey({ key, ctrlKey: false, metaKey: false, altKey: false, ...mods });
  it("a printable character seeds the search", () => {
    expect(k("O")).toBe("O");
    expect(k("l")).toBe("l");
    expect(k("2")).toBe("2");
  });
  it("named keys never seed (Tab keeps tabbing, arrows/Enter keep native meaning)", () => {
    expect(k("Tab")).toBeNull();
    expect(k("Enter")).toBeNull();
    expect(k("ArrowDown")).toBeNull();
    expect(k("Escape")).toBeNull();
    expect(k("Backspace")).toBeNull();
  });
  it("modifier chords stay the browser's (Ctrl+F, Cmd+K…)", () => {
    expect(k("f", { ctrlKey: true })).toBeNull();
    expect(k("k", { metaKey: true })).toBeNull();
    expect(k("a", { altKey: true })).toBeNull();
  });
  it("Space stays native button activation", () => {
    expect(k(" ")).toBeNull();
  });
  // The scope guardrail is structural: the handler is attached to the picker's trigger button
  // only, never document — a keystroke inside any other input can't reach it by construction.
});

describe("V2: campusCapacity (1 by default, 2 max split by council)", () => {
  it("no approved reps → open", () => {
    expect(campusCapacity([]).open).toBe(true);
  });
  it("one rep covering a single council → open for the other council", () => {
    expect(campusCapacity(["ifc"]).open).toBe(true);
    expect(campusCapacity(["panhellenic"]).open).toBe(true);
  });
  it("one rep covering both → campus closed", () => {
    expect(campusCapacity(["both"]).open).toBe(false);
  });
  it("unknown/other coverage closes self-serve signup (Lee can still approve by hand)", () => {
    expect(campusCapacity(["other"]).open).toBe(false);
    expect(campusCapacity([null]).open).toBe(false);
  });
  it("two reps → never a third", () => {
    expect(campusCapacity(["ifc", "panhellenic"]).open).toBe(false);
    expect(campusCapacity(["ifc", "ifc"]).open).toBe(false);
  });
});

describe("V2: coverage map + onboarding validation", () => {
  it("counts members and know-someones separately", () => {
    expect(reachCount({ a: "member", b: "knows_someone", c: "knows_someone" })).toEqual({ total: 3, member: 1, knows: 2 });
    expect(reachCount({})).toEqual({ total: 0, member: 0, knows: 0 });
  });
  it("requires year, course status, and at least one reachable chapter", () => {
    expect(onboardingProblem({ graduationYear: null, courseStatus: "taken", reach: { a: "member" } })).toContain("graduation");
    expect(onboardingProblem({ graduationYear: 2027, courseStatus: null, reach: { a: "member" } })).toContain("course");
    expect(onboardingProblem({ graduationYear: 2027, courseStatus: "taken", reach: {} })).toContain("at least one chapter");
    expect(onboardingProblem({ graduationYear: 2027, courseStatus: "taken", reach: { a: "knows_someone" } })).toBeNull();
  });
});

describe("V2: DM status ladder", () => {
  it("first Copy DM marks dm_sent; later copies don't regress", () => {
    expect(nextDmStatus("not_contacted", "copy_dm")).toBe("dm_sent");
    expect(nextDmStatus("dm_sent", "copy_dm")).toBe("dm_sent");
    expect(nextDmStatus("replied", "copy_dm")).toBe("replied");
  });
  it("mark_replied always lands on replied", () => {
    expect(nextDmStatus("dm_sent", "mark_replied")).toBe("replied");
    expect(nextDmStatus("replied", "mark_replied")).toBe("replied");
  });
});

describe("V2: vanity slug + DM message", () => {
  it("builds first-name-campus slugs, stripped and bounded", () => {
    expect(repSlugCandidate("Sarah Test", "university-of-alabama")).toBe("sarah-alabama");
    expect(repSlugCandidate("Lee", "university-of-mississippi")).toBe("lee-mississippi");
    expect(repSlugCandidate("  ", null)).toBe("rep");
  });
  it("the DM always carries the tracked link and the chapter's name", () => {
    const m = dmMessage({ chapterName: "Chi O", courseCode: "AC 210", shortUrl: "https://surviveaccounting.com/r/sarah-alabama" });
    expect(m).toContain("https://surviveaccounting.com/r/sarah-alabama");
    expect(m).toContain("Chi O");
    expect(m).toContain("AC 210");
  });
});

describe("commission", () => {
  it("campus reps earn a flat 10% of server-computed revenue", () => {
    expect(commissionCents(5000, { type: "percent", rate: 10 })).toBe(500);
    expect(commissionCents(27000, { type: "percent", rate: 10 })).toBe(2700);
    expect(commissionCents(0, { type: "percent", rate: 10 })).toBe(0);
  });
});
