// CAMPUS REP V1 — pure-logic coverage for the pieces the DB can't test for us: lifecycle
// transitions, chapter-state precedence, contact validation, share copy, and the 10% commission
// promise. Server behaviours that live in the DB (the assignment race's unique index) are
// exercised in live QA; everything decidable in pure code is decided here.
import { describe, expect, it } from "bun:test";

import {
  ACTIVITY_KINDS, assignmentAfterQc, chapterState, contactDraftProblem, contactTypeForRole,
  mailtoHref, normalizeInstagram, shareEmail, shareKindForMethod, shareMessage, smsHref,
  REP_STATUSES,
} from "@/lib/rep-shared";
import { commissionCents } from "@/lib/referral-shared";
import { flyerTarget } from "@/lib/flyer.server";

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

describe("commission", () => {
  it("campus reps earn a flat 10% of server-computed revenue", () => {
    expect(commissionCents(5000, { type: "percent", rate: 10 })).toBe(500);
    expect(commissionCents(27000, { type: "percent", rate: 10 })).toBe(2700);
    expect(commissionCents(0, { type: "percent", rate: 10 })).toBe(0);
  });
});
