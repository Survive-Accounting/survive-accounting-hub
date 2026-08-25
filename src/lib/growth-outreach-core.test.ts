import { describe, expect, it } from "bun:test";
import {
  assembleQueue,
  classifyContact,
  defaultContactFor,
  needsReview,
  renderGrowthTemplate,
  type EligibleContact,
} from "./growth-outreach-core";

const contact = (over: Partial<EligibleContact>): EligibleContact => ({
  qcId: crypto.randomUUID(),
  contactSource: "growth_public_contacts",
  campusId: "00000000-0000-0000-0000-0000000000aa",
  chapterId: null,
  councilType: "ifc",
  orgId: null,
  campaignPurpose: null,
  contactType: "role_inbox",
  name: null,
  role: null,
  email: "ifc@ufl.edu",
  instagram: null,
  confidence: "high",
  lastVerified: null,
  freshnessStatus: "current",
  outreachEligible: true,
  reviewReason: null,
  qcAction: "approve",
  ...over,
});

describe("assembleQueue — the ten hold rules", () => {
  const ctx = { suppressedEmails: new Set<string>(), previouslyContacted: new Set<string>() };

  it("passes a clean eligible contact", () => {
    const [d] = assembleQueue([contact({})], ctx);
    expect(d.ok).toBe(true);
  });
  it("holds: no email", () => {
    expect(assembleQueue([contact({ email: null })], ctx)[0].reason).toBe("no_email");
  });
  it("holds: not outreach eligible", () => {
    expect(assembleQueue([contact({ outreachEligible: false })], ctx)[0].reason).toBe(
      "not_eligible",
    );
  });
  it("holds: QC not approved", () => {
    expect(assembleQueue([contact({ qcAction: "pending" })], ctx)[0].reason).toBe(
      "qc_not_approved",
    );
  });
  it("holds: verify_before_use until human-verified", () => {
    expect(assembleQueue([contact({ freshnessStatus: "verify_before_use" })], ctx)[0].reason).toBe(
      "verify_before_use",
    );
  });
  it("dedupes lower(email) within the batch — first selected wins", () => {
    const a = contact({ email: "Exec@SigmaChi.com" });
    const b = contact({ email: "exec@sigmachi.com" });
    const out = assembleQueue([a, b], ctx);
    expect(out[0].ok).toBe(true);
    expect(out[1].reason).toBe("duplicate_in_batch");
  });
  it("holds: suppressed", () => {
    const out = assembleQueue([contact({ email: "opted@out.com" })], {
      ...ctx,
      suppressedEmails: new Set(["opted@out.com"]),
    });
    expect(out[0].reason).toBe("suppressed");
  });
  it("holds: already contacted (prior outreach history)", () => {
    const out = assembleQueue([contact({ email: "seen@before.com" })], {
      ...ctx,
      previouslyContacted: new Set(["seen@before.com"]),
    });
    expect(out[0].reason).toBe("already_contacted");
  });
  it("holds: advisory/escalation contacts never enter a first-touch queue", () => {
    const out = assembleQueue([contact({ campaignPurpose: "ADVISORY_ESCALATION" })], ctx);
    expect(out[0].reason).toBe("advisory_gated");
  });
});

describe("classification + default selection", () => {
  it("classifies per the display contract", () => {
    expect(classifyContact(contact({}))).toBe("CURRENT_HIGH");
    expect(classifyContact(contact({ freshnessStatus: "verify_before_use" }))).toBe("VERIFY");
    expect(classifyContact(contact({ email: null, instagram: "@sigchi" }))).toBe("SOCIAL");
    expect(classifyContact(contact({ campaignPurpose: "ADVISORY_ESCALATION" }))).toBe("ADVISORY");
    expect(classifyContact(contact({ confidence: "medium" }))).toBe("USABLE");
  });
  it("entity default prefers role inbox > org general > high-confidence named", () => {
    const named = contact({
      contactType: "student_officer",
      email: "sarah@x.com",
      confidence: "high",
    });
    const general = contact({ contactType: "organization_general", email: "info@x.com" });
    const inbox = contact({ contactType: "role_inbox", email: "ifc@x.com" });
    expect(defaultContactFor([named, general, inbox])?.email).toBe("ifc@x.com");
    expect(defaultContactFor([named, general])?.email).toBe("info@x.com");
    // VERIFY-held and advisory rows are never auto-picked
    expect(defaultContactFor([contact({ freshnessStatus: "verify_before_use" })])).toBeNull();
    expect(defaultContactFor([contact({ campaignPurpose: "ADVISORY_ESCALATION" })])).toBeNull();
  });
});

describe("template rendering + review gate", () => {
  const vars = {
    campus: {
      value: "University of Florida",
      source: "campuses",
      confidence: "high" as const,
      lastVerified: null,
    },
    first_name: { value: null, source: "contact", confidence: "low" as const, lastVerified: null },
    tracked_link: {
      value: "https://x.com/uf",
      source: "gen",
      confidence: "high" as const,
      lastVerified: null,
    },
  };
  it("renders vars and drops conditional sections for empty vars", () => {
    const r = renderGrowthTemplate(
      "Hi{{#first_name}} {{first_name}}{{/first_name}}, welcome to {{campus}}. {{tracked_link}}",
      vars,
    );
    expect(r.text).toBe("Hi, welcome to University of Florida. https://x.com/uf");
    expect(r.missing).not.toContain("campus");
  });
  it("flags missing required vars for review", () => {
    const r = renderGrowthTemplate("{{campus}} {{course_code}}", vars);
    const review = needsReview(r, vars, { freshnessStatus: "current", name: null }, [
      "campus",
      "course_code",
    ]);
    expect(review.review).toBe(true);
    expect(review.reasons.join(" ")).toContain("course_code");
  });
  it("unverified named officers force review", () => {
    const r = renderGrowthTemplate("{{campus}}", vars);
    const review = needsReview(r, vars, { freshnessStatus: "verify_before_use", name: "Sarah" }, [
      "campus",
    ]);
    expect(review.review).toBe(true);
  });
  it("clean render with satisfied required vars passes", () => {
    const r = renderGrowthTemplate("Hello {{campus}} {{tracked_link}}", vars);
    const review = needsReview(r, vars, { freshnessStatus: "current", name: null }, [
      "campus",
      "tracked_link",
    ]);
    expect(review.review).toBe(false);
  });
});
