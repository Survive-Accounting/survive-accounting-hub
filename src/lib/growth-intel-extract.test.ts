import { describe, expect, it } from "bun:test";
import {
  classifyBusinessCategory,
  normalizeClubName,
  normalizeRole,
  isPriorityRole,
  classifyContactType,
  classifySource,
  sourceRank,
  scanEmails,
  scanInstagram,
  scanFacebook,
  combineConfidence,
  contactDedupeKey,
  firstDomain,
  handleHasCampusSignal,
} from "./growth-intel-extract";

describe("classifyBusinessCategory", () => {
  it("matches Women-in-Business aliases", () => {
    expect(classifyBusinessCategory("Women in Business")).toBe("women_in_business");
    expect(classifyBusinessCategory("Undergraduate Women in Business")).toBe("women_in_business");
    expect(classifyBusinessCategory("UGA Women in Business Association")).toBe("women_in_business");
    expect(classifyBusinessCategory("Women in Finance")).toBe("women_in_business");
  });
  it("matches Investment/Finance aliases", () => {
    expect(classifyBusinessCategory("Investment Club")).toBe("investment_finance");
    expect(classifyBusinessCategory("Student Managed Investment Fund")).toBe("investment_finance");
    expect(classifyBusinessCategory("Financial Management Association")).toBe("investment_finance");
    expect(classifyBusinessCategory("Investment Banking Club")).toBe("investment_finance");
    expect(classifyBusinessCategory("Asset Management Group")).toBe("investment_finance");
  });
  it("EXCLUDES Beta Alpha Psi and off-target orgs (§4)", () => {
    expect(classifyBusinessCategory("Beta Alpha Psi")).toBeNull();
    expect(classifyBusinessCategory("Accounting Society")).toBeNull();
    expect(classifyBusinessCategory("Real Estate Club")).toBeNull();
    expect(classifyBusinessCategory("Marketing Association")).toBeNull();
    expect(classifyBusinessCategory("Entrepreneurship Club")).toBeNull();
  });
  it("does not match random student orgs", () => {
    expect(classifyBusinessCategory("Chess Club")).toBeNull();
    expect(classifyBusinessCategory("Pre-Law Society")).toBeNull();
  });
});

describe("normalizeClubName", () => {
  it("collapses campus-qualified variants to one identity", () => {
    const a = normalizeClubName("UGA Women in Business", "University of Georgia");
    const b = normalizeClubName("Women in Business at the University of Georgia", "University of Georgia");
    expect(a).toBe(b);
  });
  it("keeps distinct orgs distinct", () => {
    expect(normalizeClubName("Investment Club", "Auburn University")).not.toBe(
      normalizeClubName("Finance Society", "Auburn University"),
    );
  });
  it("collapses parenthetical acronym variants", () => {
    expect(normalizeClubName("Finance & Investment Club (HUFIC)", "Howard University")).toBe(
      normalizeClubName("Finance and Investment Club", "Howard University"),
    );
  });
  it("strips 4-letter campus acronyms (MTSU)", () => {
    expect(normalizeClubName("MTSU Investment Club", "Middle Tennessee State University")).toBe(
      normalizeClubName("Investment Club", "Middle Tennessee State University"),
    );
  });
});

describe("normalizeRole / isPriorityRole", () => {
  it("maps to canonical academic roles", () => {
    expect(normalizeRole("VP of Academics")).toBe("VP Academics");
    expect(normalizeRole("Scholarship Chairman")).toBe("Scholarship Chair");
    expect(normalizeRole("Academic Chair")).toBe("Academic Chair");
    expect(normalizeRole("President")).toBe("President");
  });
  it("flags priority roles", () => {
    expect(isPriorityRole("Scholarship Chair")).toBe(true);
    expect(isPriorityRole("VP Academics")).toBe(true);
    expect(isPriorityRole("Social Chair")).toBe(false);
  });
});

describe("classifyContactType (§8)", () => {
  it("named person + email => student_officer", () => {
    expect(classifyContactType({ email: "jane@uga.edu", name: "Jane Doe", role: "President" })).toBe("student_officer");
  });
  it("role local-part, no person => role_inbox", () => {
    expect(classifyContactType({ email: "ifcpresident@uga.edu" })).toBe("role_inbox");
  });
  it("general inbox => organization_general", () => {
    expect(classifyContactType({ email: "info@wibuga.org" })).toBe("organization_general");
  });
  it("advisor => staff_advisor", () => {
    expect(classifyContactType({ email: "s@uga.edu", name: "Pat Lee", role: "Program Advisor", isStaff: true })).toBe("staff_advisor");
  });
  it("social => social_account", () => {
    expect(classifyContactType({ isSocial: true })).toBe("social_account");
  });
});

describe("classifySource (§6 priority)", () => {
  it("ranks a university org directory above a social page", () => {
    const dir = classifySource("https://involvement.uga.edu/organization/wib", "uga.edu");
    const soc = classifySource("https://instagram.com/ugawib", "uga.edu");
    expect(dir.source_type).toBe("university_org_directory");
    expect(sourceRank(dir.source_type)).toBeLessThan(sourceRank(soc.source_type));
    expect(dir.confidence).toBe("high");
  });
  it("recognizes a business-school host", () => {
    expect(classifySource("https://terry.uga.edu/students/clubs", "uga.edu").source_type).toBe("business_school_page");
  });
  it("recognizes campuslabs-hosted directories as official", () => {
    expect(classifySource("https://uga.campuslabs.com/engage/organization/wib", "uga.edu").source_type).toBe("university_org_directory");
  });
});

describe("verbatim scanners (hallucination guard)", () => {
  const md = "Contact us at WIB@uga.edu or the advisor Pat@terry.uga.edu. Follow https://instagram.com/uga_wib and facebook.com/UGAWomenInBusiness. Logo: banner.png";
  it("scans real emails, lowercased, drops asset-looking matches", () => {
    const e = scanEmails(md);
    expect(e.has("wib@uga.edu")).toBe(true);
    expect(e.has("pat@terry.uga.edu")).toBe(true);
    expect([...e].some((x) => x.endsWith(".png"))).toBe(false);
  });
  it("scans IG handles, skips reserved paths", () => {
    expect(scanInstagram("instagram.com/p/abc123 and instagram.com/uga_wib")).toEqual(["uga_wib"]);
  });
  it("scans FB pages", () => {
    expect(scanFacebook(md)).toContain("ugawomeninbusiness");
  });
});

describe("combineConfidence", () => {
  it("official + verbatim => high", () => {
    expect(combineConfidence({ best: "university_org_directory", verbatim: true })).toBe("high");
  });
  it("not verbatim => low regardless of source", () => {
    expect(combineConfidence({ best: "university_org_directory", verbatim: false })).toBe("low");
  });
  it("social-only verbatim => medium", () => {
    expect(combineConfidence({ best: "indexed_social", verbatim: true })).toBe("medium");
  });
});

describe("contactDedupeKey", () => {
  it("same email = same key (evidence, not duplicate)", () => {
    expect(contactDedupeKey({ email: "WIB@uga.edu" })).toBe(contactDedupeKey({ email: "wib@uga.edu", name: "x" }));
  });
  it("falls back to handle then name", () => {
    expect(contactDedupeKey({ instagram_url: "https://instagram.com/uga_wib" })).toContain("ig:");
    expect(contactDedupeKey({ name: "Jane Doe" })).toBe("name:jane doe");
  });
});

describe("handleHasCampusSignal (chapter IG precision)", () => {
  const bama = ["bama", "alabama", "crimson"];
  it("keeps campus-tokened chapter handles", () => {
    expect(handleHasCampusSignal("aepibama", bama)).toBe(true);
    expect(handleHasCampusSignal("alabamasigep", bama)).toBe(true);
    expect(handleHasCampusSignal("bamasammy", bama)).toBe(true);
  });
  it("drops national-org and wrong-school and garbage handles", () => {
    expect(handleHasCampusSignal("phikappatau", bama)).toBe(false); // national account
    expect(handleHasCampusSignal("aepigsu", bama)).toBe(false); // Georgia Southern
    expect(handleHasCampusSignal("popular", bama)).toBe(false); // garbage
    expect(handleHasCampusSignal("officialsigep", bama)).toBe(false); // national
  });
});

describe("firstDomain", () => {
  it("reads a domains array or email_domain", () => {
    expect(firstDomain(["uga.edu", "franklin.uga.edu"])).toBe("uga.edu");
    expect(firstDomain(null, "howard.edu")).toBe("howard.edu");
    expect(firstDomain("{fau.edu,foo.edu}")).toBe("fau.edu");
  });
});
