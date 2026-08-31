// The value of this feature is what it REFUSES to save. Every "Do not" from the brief is a test
// here, because a wrong Instagram handle is worse than a blank one — nobody re-checks a filled
// field.
import { describe, expect, it } from "bun:test";

import {
  canImport, flagRows, hasContactMethod, igHitRate, igSearchQuery, igState, importSummary,
  isRoleAccountEmail, normalizeHandle, officerPrompt, parsePastedContacts, councilFromLabel, rolePriority, worstLevel,
  type OfficerRow,
} from "@/lib/find-contacts-shared";

const row = (o: Partial<OfficerRow> & { id: string }): OfficerRow => ({
  council: "ifc", position: "President", name: "Grayson King",
  email: "gking@olemiss.edu", phone: null, instagram: null,
  instagramSource: null, instagramConfidence: null,
  sourceUrl: "https://ifc.olemiss.edu/officers",
  include: true, igVerified: false, sourceChecked: false, ...o,
});

describe("role priority", () => {
  it("ranks the scholarship chair above the president", () => {
    expect(rolePriority("Scholarship Chair")).toBeLessThan(rolePriority("President"));
    expect(rolePriority("Academic Chair")).toBe(0);
    expect(rolePriority("Vice President")).toBe(2);
    expect(rolePriority("Treasurer")).toBe(3);
    expect(rolePriority("Social Chair")).toBe(9);
  });
});

describe("role-account emails — the 27-of-126 failure", () => {
  it("catches shared inboxes", () => {
    for (const e of ["info@x.edu", "greeklife@x.edu", "ifc@x.edu", "president@x.edu", "studentinvolvement@x.edu", "council-exec@x.edu"]) {
      expect(isRoleAccountEmail(e)).toBe(true);
    }
  });
  it("catches CONCATENATED council+role inboxes — found live at Ole Miss", () => {
    for (const e of ["ifcpresident@olemiss.edu", "panhellenicpresident@x.edu", "nphcsecretary@x.edu", "greekscholarship@x.edu"]) {
      expect(isRoleAccountEmail(e)).toBe(true);
    }
  });
  it("leaves real people alone", () => {
    for (const e of ["gking@olemiss.edu", "sarah.chen@x.edu", "adminson@x.edu", "presley@x.edu"]) {
      expect(isRoleAccountEmail(e)).toBe(false);
    }
  });
});

describe("normalizeHandle", () => {
  it("reduces every form to one comparable key", () => {
    expect(normalizeHandle("@GraysonKing")).toBe("graysonking");
    expect(normalizeHandle("https://instagram.com/GraysonKing/")).toBe("graysonking");
    expect(normalizeHandle("")).toBeNull();
    expect(normalizeHandle(null)).toBeNull();
  });
});

describe("the blocking rules (§9 Do not)", () => {
  it("blocks a row with no contact method", () => {
    const r = row({ id: "a", email: null, phone: null, instagram: null });
    const f = flagRows([r]).get("a")!;
    expect(f.some((x) => x.code === "no_contact" && x.level === "block")).toBe(true);
    expect(canImport(r, f)).toBe(false);
  });
  it("blocks a row with no source URL", () => {
    const r = row({ id: "a", sourceUrl: null });
    const f = flagRows([r]).get("a")!;
    expect(f.some((x) => x.code === "no_source" && x.level === "block")).toBe(true);
    expect(canImport(r, f)).toBe(false);
  });
  it("blocks a duplicate of a contact already on the campus — never overwrites", () => {
    const r = row({ id: "a", email: "gking@olemiss.edu" });
    const f = flagRows([r], { emails: ["GKing@olemiss.edu"], handles: [] }).get("a")!;
    expect(f.some((x) => x.code === "dup_email" && x.level === "block")).toBe(true);
    expect(canImport(r, f)).toBe(false);
  });
  it("blocks a duplicate Instagram already on the campus", () => {
    const r = row({ id: "a", instagram: "@graysonking", instagramSource: "listed" });
    const f = flagRows([r], { emails: [], handles: ["https://instagram.com/GraysonKing"] }).get("a")!;
    expect(f.some((x) => x.code === "dup_ig")).toBe(true);
  });
  it("an unchecked row never imports, however clean", () => {
    const r = row({ id: "a", include: false });
    expect(canImport(r, flagRows([r]).get("a")!)).toBe(false);
  });
});

describe("the warning rules", () => {
  it("warns when one handle appears on more than one row — an org account", () => {
    const rows = [
      row({ id: "a", instagram: "@olemisspanhel", instagramSource: "listed" }),
      row({ id: "b", instagram: "@olemisspanhel", instagramSource: "listed", email: "b@x.edu" }),
    ];
    const f = flagRows(rows);
    expect(f.get("a")!.some((x) => x.code === "shared_ig")).toBe(true);
    expect(f.get("b")!.some((x) => x.code === "shared_ig")).toBe(true);
  });
  it("warns on a role-account email but still allows the import", () => {
    const r = row({ id: "a", email: "panhellenic@olemiss.edu" });
    const f = flagRows([r]).get("a")!;
    expect(worstLevel(f)).toBe("warn");
    expect(canImport(r, f)).toBe(true);
  });
  it("warns until a person confirms a search-found handle", () => {
    const found = row({ id: "a", instagram: "@fdaniel_", instagramSource: "found", instagramConfidence: "low" });
    expect(flagRows([found]).get("a")!.some((x) => x.code === "ig_unconfirmed")).toBe(true);
    const confirmed = { ...found, igVerified: true };
    expect(flagRows([confirmed]).get("a")!.some((x) => x.code === "ig_unconfirmed")).toBe(false);
  });
  it("a handle printed on the council page is never flagged as unconfirmed", () => {
    const listed = row({ id: "a", instagram: "@graysonking", instagramSource: "listed" });
    expect(flagRows([listed]).get("a")!.some((x) => x.code === "ig_unconfirmed")).toBe(false);
  });
});

describe("hasContactMethod", () => {
  it("accepts any one of email, phone, handle — and rejects a short phone", () => {
    expect(hasContactMethod({ email: "a@b.edu", phone: null, instagram: null })).toBe(true);
    expect(hasContactMethod({ email: null, phone: "6012018759", instagram: null })).toBe(true);
    expect(hasContactMethod({ email: null, phone: null, instagram: "@x_y" })).toBe(true);
    expect(hasContactMethod({ email: null, phone: "555", instagram: null })).toBe(false);
  });
});

describe("import summary — the footer", () => {
  it("counts what imports and why the rest do not", () => {
    const rows = [
      row({ id: "a" }),
      row({ id: "b", email: "b@x.edu" }),
      row({ id: "c", email: null, phone: null, instagram: null }),   // blocked
      row({ id: "d", include: false }),                               // unchecked
    ];
    const s = importSummary(rows, flagRows(rows));
    expect(s.importing).toBe(2);
    expect(s.total).toBe(4);
    expect(s.excluded.some((e) => e.reason.includes("no contact method"))).toBe(true);
    expect(s.excluded.some((e) => e.reason === "unchecked")).toBe(true);
  });
});

describe("the Instagram state machine", () => {
  it("has exactly the brief's three states plus confirmed", () => {
    expect(igState({ instagram: null, instagramSource: null, igVerified: false })).toBe("missing");
    expect(igState({ instagram: "@gking", instagramSource: "listed", igVerified: false })).toBe("listed");
    expect(igState({ instagram: "@gking", instagramSource: "found", igVerified: false })).toBe("found_unconfirmed");
    expect(igState({ instagram: "@gking", instagramSource: "found", igVerified: true })).toBe("confirmed");
  });
  it("clearing a handle drops the row into the missing state", () => {
    expect(igState({ instagram: null, instagramSource: "found", igVerified: false })).toBe("missing");
  });
});

describe("the prefilled search", () => {
  it("is built from what we already know", () => {
    const q = igSearchQuery({ name: "Sarah Chen", campusName: "University of Mississippi", council: "panhellenic", position: "Treasurer" });
    expect(q).toBe('"Sarah Chen" "University of Mississippi" Panhellenic treasurer instagram');
  });
});

describe("the hit-rate scoreboard", () => {
  it("reports only on handles the model guessed", () => {
    expect(igHitRate({ confirmed: 0, cleared: 0 }).pct).toBeNull();
    expect(igHitRate({ confirmed: 5, cleared: 11 }).pct).toBe(31);
    expect(igHitRate({ confirmed: 5, cleared: 11 }).label).toContain("31% confirmed");
  });
});

describe("the officer prompt carries the refusal rules to the model", () => {
  const p = officerPrompt("Ole Miss", [{ council: "ifc", url: "https://ifc.olemiss.edu" }]);
  it("forbids substituting the office address and inventing handles", () => {
    expect(p).toContain("Never substitute the council's or Greek Life office's general address");
    expect(p).toContain("Never construct a handle from a name");
    expect(p).toContain("Never return a council or chapter account");
    expect(p).toContain("When unsure, return null");
  });
  it("requires a source for every officer", () => {
    expect(p).toContain("Include source_url for every officer");
  });
});

describe("§6 paste-import fallback", () => {
  it("parses a markdown table", () => {
    const rows = parsePastedContacts([
      "| Council | Position | Name | Email | Instagram | Source |",
      "| --- | --- | --- | --- | --- | --- |",
      "| IFC | President | Grayson King | gking@olemiss.edu | @gking | https://ifc.olemiss.edu |",
    ].join("\n"));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Grayson King");
    expect(rows[0].sourceUrl).toBe("https://ifc.olemiss.edu");
  });
  it("parses TSV and CSV, including quoted commas in names", () => {
    expect(parsePastedContacts("council\tname\temail\nIFC\tGrayson King\tg@x.edu")[0].name).toBe("Grayson King");
    const csv = parsePastedContacts('council,name,email\nIFC,"King, Grayson",g@x.edu');
    expect(csv[0].name).toBe("King, Grayson");
  });
  it("drops null-ish placeholders rather than storing them", () => {
    const r = parsePastedContacts("council,name,email\nIFC,Grayson,N/A")[0];
    expect(r.email).toBeNull();
  });
  it("returns nothing when no known column is present — never guesses positions", () => {
    expect(parsePastedContacts("a,b,c\n1,2,3")).toEqual([]);
  });
  it("maps council labels and refuses unknown ones", () => {
    expect(councilFromLabel("Interfraternity Council")).toBe("ifc");
    expect(councilFromLabel("Panhellenic")).toBe("panhellenic");
    expect(councilFromLabel("Women in Business")).toBe("wib");
    expect(councilFromLabel("Chess Club")).toBeNull();
  });
});
