import { describe, expect, it } from "bun:test";

import {
  CSV_HEADERS, COUNCIL_EXPORT_LABEL, councilKeyFromLabel, csvCell, csvEmail, csvHandle,
  matchKey, parseContactsCsv, splitCsvLine, toCsv,
} from "./outreach-csv";

const row = (over: Partial<Parameters<typeof toCsv>[0][number]> = {}) => ({
  school: "Ole Miss", council: "IFC", role: "President", name: "Jordan Ellis",
  instagram: "jordan.ellis", chapter: "Sigma Chi", email: "jordan@go.olemiss.edu", ...over,
});

describe("toCsv", () => {
  it("writes the agreed header and one line per contact", () => {
    const out = toCsv([row()]);
    const lines = out.split("\n");
    expect(lines[0]).toBe("School,Council,Role,Name,Instagram,Chapter,Email");
    expect(lines[1]).toBe("Ole Miss,IFC,President,Jordan Ellis,jordan.ellis,Sigma Chi,jordan@go.olemiss.edu");
    expect(CSV_HEADERS).toHaveLength(7);
  });

  it("quotes commas and quotes rather than corrupting the row", () => {
    expect(csvCell("Smith, John")).toBe('"Smith, John"');
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvCell(null)).toBe("");
    expect(csvCell("line\nbreak")).toBe("line break");
  });

  it("round-trips: export then import gives the same values back", () => {
    const csv = toCsv([row({ name: "Carter, Maddie" }), row({ school: "LSU", council: "Panhellenic", chapter: "Kappa Delta", name: "Ann Lee" })]);
    const { rows } = parseContactsCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ school: "Ole Miss", council: "IFC", name: "Carter, Maddie", chapter: "Sigma Chi" });
    expect(rows[1]).toMatchObject({ school: "LSU", council: "Panhellenic", name: "Ann Lee" });
  });
});

describe("parseContactsCsv", () => {
  it("reads columns in any order and ignores extra ones", () => {
    const { rows, headerFound } = parseContactsCsv([
      "Chapter,Email,Notes,Council,Instagram,Name,Role,School",
      "Sigma Chi,j@x.edu,some note,IFC,@jordan,Jordan Ellis,President,Ole Miss",
    ].join("\n"));
    expect(headerFound).toBe(true);
    expect(rows[0]).toMatchObject({ school: "Ole Miss", council: "IFC", role: "President", name: "Jordan Ellis", instagram: "@jordan", chapter: "Sigma Chi", email: "j@x.edu" });
  });

  it("accepts tabs and markdown pipe tables, separator rows and all", () => {
    const tabbed = parseContactsCsv("School\tCouncil\tRole\tName\tInstagram\tChapter\tEmail\nLSU\tIFC\tPresident\tAnn\t@ann\tSigma Chi\t");
    expect(tabbed.rows[0]).toMatchObject({ school: "LSU", instagram: "@ann" });
    const piped = parseContactsCsv([
      "| School | Council | Role | Name | Instagram | Chapter | Email |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| LSU | NPHC | Treasurer | Kim | @kim | Alpha Phi Alpha | |",
    ].join("\n"));
    expect(piped.rows).toHaveLength(1);
    expect(piped.rows[0]).toMatchObject({ council: "NPHC", chapter: "Alpha Phi Alpha", name: "Kim" });
  });

  it("drops rows with no handle and no email, and counts them", () => {
    const { rows, skipped } = parseContactsCsv([
      "School,Council,Role,Name,Instagram,Chapter,Email",
      "Ole Miss,IFC,President,Jordan,@jordan,Sigma Chi,",
      "Ole Miss,IFC,Treasurer,Nobody,,Kappa Sigma,",
      "Ole Miss,IFC,Chair,Emailed,,Delta Psi,c@x.edu",
    ].join("\n"));
    expect(rows.map((r) => r.name)).toEqual(["Jordan", "Emailed"]);
    expect(skipped).toBe(1);
  });

  it("treats n/a and dashes as blank", () => {
    const { rows } = parseContactsCsv([
      "School,Council,Role,Name,Instagram,Chapter,Email",
      "Ole Miss,IFC,President,N/A,@jordan,—,none",
    ].join("\n"));
    expect(rows[0]).toMatchObject({ name: "", chapter: "", email: "", instagram: "@jordan" });
  });

  it("reports no header rather than guessing columns", () => {
    const r = parseContactsCsv("Ole Miss,IFC,President,Jordan,@jordan,Sigma Chi,\nLSU,IFC,President,Ann,@ann,,");
    expect(r.headerFound).toBe(false);
    expect(r.rows).toEqual([]);
  });

  it("handles an empty or header-only file", () => {
    expect(parseContactsCsv("").rows).toEqual([]);
    expect(parseContactsCsv("School,Council,Role,Name,Instagram,Chapter,Email").rows).toEqual([]);
  });

  it("keeps a quoted comma inside a name intact", () => {
    expect(splitCsvLine('a,"b, c",d')).toEqual(["a", "b, c", "d"]);
    expect(splitCsvLine('"say ""hi""",x')).toEqual(['say "hi"', "x"]);
  });
});

describe("councilKeyFromLabel", () => {
  it("covers every org King works, including Women in Business and Other", () => {
    expect(councilKeyFromLabel("IFC")).toBe("ifc");
    expect(councilKeyFromLabel("Interfraternity Council")).toBe("ifc");
    expect(councilKeyFromLabel("Panhellenic")).toBe("panhellenic");
    expect(councilKeyFromLabel("CPC")).toBe("panhellenic");
    expect(councilKeyFromLabel("NPHC")).toBe("nphc");
    expect(councilKeyFromLabel("Divine 9")).toBe("nphc");
    expect(councilKeyFromLabel("MGC")).toBe("mgc");
    expect(councilKeyFromLabel("Multicultural Greek Council")).toBe("mgc");
    expect(councilKeyFromLabel("Women in Business")).toBe("wib");
    expect(councilKeyFromLabel("WIB")).toBe("wib");
    expect(councilKeyFromLabel("Other")).toBe("fsl");
    expect(councilKeyFromLabel("Greek Life")).toBe("fsl");
    expect(councilKeyFromLabel("Chess Club")).toBeNull();
    expect(councilKeyFromLabel("")).toBeNull();
  });

  it("round-trips through the export label", () => {
    for (const [key, label] of Object.entries(COUNCIL_EXPORT_LABEL)) {
      expect(councilKeyFromLabel(label)).toBe(key);
    }
  });
});

describe("value cleaning", () => {
  it("bares handles and rejects junk", () => {
    expect(csvHandle("@SigmaChi")).toBe("sigmachi");
    expect(csvHandle("https://instagram.com/sigma.chi/")).toBe("sigma.chi");
    expect(csvHandle("n/a")).toBe("");
    expect(csvHandle("two words")).toBe("");
  });

  it("accepts only things shaped like an email", () => {
    expect(csvEmail("Lee@Example.COM")).toBe("lee@example.com");
    expect(csvEmail("not-an-email")).toBe("");
    expect(csvEmail("a@b")).toBe("");
  });

  it("matches names across spelling and punctuation", () => {
    expect(matchKey("Ole Miss")).toBe(matchKey("ole-miss"));
    expect(matchKey("Sigma Chi")).toBe(matchKey("sigma  chi!"));
  });
});
