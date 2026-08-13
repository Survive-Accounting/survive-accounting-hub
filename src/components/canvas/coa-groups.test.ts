import { describe, expect, it } from "bun:test";

import { groupCoaByType, groupNameForType } from "./coa-groups";

describe("groupNameForType", () => {
  it("maps every real account_type to one of the 5 headers", () => {
    expect(groupNameForType("asset")).toBe("Assets");
    expect(groupNameForType("contra_asset")).toBe("Assets");
    expect(groupNameForType("liability")).toBe("Liabilities");
    expect(groupNameForType("contra_liability")).toBe("Liabilities");
    expect(groupNameForType("liability_adjunct")).toBe("Liabilities");
    expect(groupNameForType("equity")).toBe("Equity");
    expect(groupNameForType("contra_equity")).toBe("Equity");
    expect(groupNameForType("revenue")).toBe("Revenue");
    expect(groupNameForType("contra_revenue")).toBe("Revenue");
    expect(groupNameForType("expense")).toBe("Expenses");
  });
});

describe("groupCoaByType", () => {
  const rows = [
    { canonical_name: "Accumulated Depreciation", account_type: "contra_asset" },
    { canonical_name: "Cash", account_type: "asset" },
    { canonical_name: "Accounts Payable", account_type: "liability" },
    { canonical_name: "Rent Expense", account_type: "expense" },
    { canonical_name: "Bank Loan", account_type: "asset" },
    { canonical_name: "Sales Revenue", account_type: "revenue" },
    { canonical_name: "Owner's Capital", account_type: "equity" },
  ];

  it("groups in GROUP_ORDER and sorts alphabetically within a group", () => {
    const grouped = groupCoaByType(rows);
    expect(grouped.map((g) => g.group)).toEqual(["Assets", "Liabilities", "Equity", "Revenue", "Expenses"]);
    const assets = grouped.find((g) => g.group === "Assets")!.rows.map((r) => r.canonical_name);
    expect(assets).toEqual(["Accumulated Depreciation", "Bank Loan", "Cash"]);
  });

  it("nests contra accounts under their parent type, not a separate bucket", () => {
    const grouped = groupCoaByType(rows);
    const assetNames = grouped.find((g) => g.group === "Assets")!.rows.map((r) => r.canonical_name);
    expect(assetNames).toContain("Accumulated Depreciation");
  });

  it("omits groups with zero rows (nothing to collapse)", () => {
    const grouped = groupCoaByType([{ canonical_name: "Cash", account_type: "asset" }]);
    expect(grouped).toEqual([{ group: "Assets", rows: [{ canonical_name: "Cash", account_type: "asset" }] }]);
  });

  it("returns empty for an empty input", () => {
    expect(groupCoaByType([])).toEqual([]);
  });
});
