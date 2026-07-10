// Unit tests for vendor-list parsing + firm helpers. Run with `bun test`.
import { test, expect } from "bun:test";
import {
  deriveNameFromDomain,
  guessIndustry,
  normalizeFirmName,
  parseVendorFirms,
} from "./greek-vendors";

test("deriveNameFromDomain", () => {
  expect(deriveNameFromDomain("https://www.holmes-murphy.com/about")).toBe("Holmes Murphy");
  expect(deriveNameFromDomain("cslmanagement.com")).toBe("Cslmanagement"); // no dictionary split
  expect(deriveNameFromDomain("www.omegafi.com")).toBe("Omegafi");
});

test("normalizeFirmName cross-source equivalence", () => {
  expect(normalizeFirmName("WATKINS WARD AND STAFFORD PLLC")).toBe(
    normalizeFirmName("Watkins Ward & Stafford"),
  );
  expect(normalizeFirmName("Holmes Murphy, Inc.")).toBe("holmes murphy");
});

test("guessIndustry keywords", () => {
  expect(guessIndustry("Property Management/Consulting")).toBe("house_management");
  expect(guessIndustry("Fundraising/Financial")).toBe("fundraising_capital_campaigns");
  expect(guessIndustry("Maintenance/Home Security")).toBe("construction_renovation");
  expect(guessIndustry("nothing relevant")).toBeNull();
});

// Verbatim slice of `pdftotext -layout` output from the real ADPi facility vendor
// list (alphadeltapi.org Vendor-List.pdf): wrapped name cells, contact/phone/email
// columns, description column bleeding right, section headings.
const ADPI_LAYOUT = `Property Management/Consulting

Company      Website                                    Contact Phone               Email                                  Description

Name                                                    Person                                                         The Properties Services
                                                                                                                       program offers operational
                         https://www.alphadeltapi.org/  Amy          470-737-0899 apoklinkoski@alphadeltapi.com        assistance and facility
ADPi Properties                                         Poklinkoski                          housing@alphadeltapi.com  management support to
                                                                                                                       house corporations and
CSL          https://www.cslmanagement.com              Woody        423-225-8910   woody@cslmanagement.com            chapters who enroll in the
Management                                              Ratterman                                                      program.

Greek Key          http://www.greekkeyservices.com/ Chad Pepper 877-289-3196              info@GreekKeyServices.com       Maintenance, construction
Services                                                                                                                  and real estate services

CCL                https://www.cclcc.com            Scott Schafer 913-491-8626            schaferds@cclcc.com             Provides "Owner's
Construction                                                                    ext. 210                                  Representation" services
Consultants, Inc.

Food Service

Culinary     https://culinaryconsultants.net/           Brian Heider 847- 566-7533  info@culinaryconsultants.net       Managing food purchases
Consultants`;

test("real ADPi -layout slice: firms, stitched names, categories", () => {
  const firms = parseVendorFirms(ADPI_LAYOUT);
  const byName = new Map(firms.map((f) => [f.name, f]));
  expect(byName.has("CSL Management")).toBe(true);
  expect(byName.has("Greek Key Services")).toBe(true);
  expect(byName.has("CCL Construction Consultants, Inc.")).toBe(true);
  expect(byName.get("CSL Management")!.phone).toBe("423-225-8910");
  expect(byName.get("CSL Management")!.website).toBe("https://www.cslmanagement.com");
  expect(byName.get("CSL Management")!.category).toBe("Property Management/Consulting");
  expect(byName.get("CSL Management")!.industry).toBe("house_management");
  expect(byName.get("Culinary Consultants")!.category).toBe("Food Service");
  expect(byName.get("Culinary Consultants")!.industry).toBe("food_service");
  expect(byName.get("Culinary Consultants")!.phone).toBe("847- 566-7533");
  expect(firms.length).toBeGreaterThanOrEqual(5);
});

test("phone-anchored fallback when the paste has no URLs", () => {
  const firms = parseVendorFirms(
    "Approved Insurance Vendors\nHolmes Murphy 800-247-7756\nMJ Insurance 317-805-7500",
  );
  expect(firms).toEqual([
    {
      name: "Holmes Murphy",
      website: null,
      phone: "800-247-7756",
      city_state: null,
      category: "Approved Insurance Vendors",
      industry: "insurance_risk",
    },
    {
      name: "MJ Insurance",
      website: null,
      phone: "317-805-7500",
      city_state: null,
      category: "Approved Insurance Vendors",
      industry: "insurance_risk",
    },
  ]);
});

test("empty is safe", () => {
  expect(parseVendorFirms("")).toEqual([]);
});
