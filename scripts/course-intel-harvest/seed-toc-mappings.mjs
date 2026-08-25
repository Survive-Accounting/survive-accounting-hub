#!/usr/bin/env node
/**
 * Seed PROPOSED textbook TOC → Survive-topic mappings for the top-4 Intro-Financial
 * editions. Idempotent. Writes textbooks + textbook_chapters + textbook_chapter_topic_mapping
 * (state='proposed'). survive_topic_id left NULL — a human attaches the exact Survive unit
 * in the admin review step. NEVER touches student-facing maps. Requires --apply to write.
 */
import * as db from "./db.mjs";

const APPLY = process.argv.includes("--apply");
const SRC = "toc_standard_2026-08-25";
const BY = "course-intel-harvest";

// Canonical Survive topic spine (labels; ids attached by human on review)
const S = {
  S1: "Financial statements & the accounting equation", S2: "Transaction analysis & recording (journal entries)",
  S3: "Adjusting entries & accrual basis", S4: "Completing the accounting cycle / closing",
  S5: "Merchandising operations", S6: "Inventory & cost of goods sold", S7: "Internal control & cash",
  S8: "Receivables", S9: "Long-lived assets (PP&E & intangibles)", S10: "Liabilities (current & bonds)",
  S11: "Stockholders' equity", S12: "Statement of cash flows", S13: "Financial-statement analysis",
  SYS: "Accounting information systems",
};

const EDITIONS = [
  { key: "financial-accounting|libby|?", title: "Financial Accounting", authors: "Libby, Libby, Hodge", chapters: [
    [1, "Financial Statements and Business Decisions", ["S1"], "1"],
    [2, "Investing and Financing Decisions and the Accounting System", ["S2"], "1"],
    [3, "Operating Decisions and the Accounting System", ["S2"], "1"],
    [4, "Adjustments, Financial Statements, and the Quality of Earnings", ["S3", "S4"], "1"],
    [5, "Communicating and Interpreting Accounting Information", ["S13"], "1-2"],
    [6, "Sales Revenue, Receivables, and Cash", ["S7", "S8"], "2"],
    [7, "Cost of Goods Sold and Inventory", ["S6"], "2"],
    [8, "Property, Plant, and Equipment; Intangibles", ["S9"], "2"],
    [9, "Liabilities", ["S10"], "3"], [10, "Bonds", ["S10"], "3"],
    [11, "Stockholders' Equity", ["S11"], "3"], [12, "Statement of Cash Flows", ["S12"], "3-final"],
    [13, "Analyzing Financial Statements", ["S13"], "final"],
  ] },
  { key: "fundamental-accounting-principles|wild|?", title: "Fundamental Accounting Principles", authors: "Wild, Shaw", chapters: [
    [1, "Accounting in Business", ["S1"], "1"], [2, "Analyzing and Recording Transactions", ["S2"], "1"],
    [3, "Adjusting Accounts and Preparing Financial Statements", ["S3"], "1"], [4, "Completing the Accounting Cycle", ["S4"], "1"],
    [5, "Accounting for Merchandising Operations", ["S5"], "2"], [6, "Inventories and Cost of Sales", ["S6"], "2"],
    [7, "Accounting Information Systems", ["SYS"], "2"], [8, "Cash and Internal Controls", ["S7"], "2"],
    [9, "Accounting for Receivables", ["S8"], "2-3"], [10, "Plant Assets, Natural Resources, and Intangibles", ["S9"], "3"],
    [11, "Current Liabilities and Payroll Accounting", ["S10"], "3"], [12, "Long-Term Liabilities", ["S10"], "3"],
    [13, "Accounting for Corporations", ["S11"], "3"],
  ] },
  { key: "financial-accounting-tools-for-business-decision-making|kimmel|?", title: "Financial Accounting: Tools for Business Decision Making", authors: "Kimmel, Weygandt, Kieso", chapters: [
    [1, "Introduction to Financial Statements", ["S1"], "1"], [2, "A Further Look at Financial Statements", ["S1"], "1"],
    [3, "The Accounting Information System", ["S2"], "1"], [4, "Accrual Accounting Concepts", ["S3", "S4"], "1"],
    [5, "Merchandising Operations", ["S5"], "2"], [6, "Reporting and Analyzing Inventory", ["S6"], "2"],
    [7, "Fraud, Internal Control, and Cash", ["S7"], "2"], [8, "Reporting and Analyzing Receivables", ["S8"], "2"],
    [9, "Reporting and Analyzing Long-Lived Assets", ["S9"], "3"], [10, "Reporting and Analyzing Liabilities", ["S10"], "3"],
    [11, "Reporting and Analyzing Stockholders' Equity", ["S11"], "3"], [12, "Statement of Cash Flows", ["S12"], "3-final"],
    [13, "Financial Analysis: The Big Picture", ["S13"], "final"],
  ] },
  { key: "principles-of-accounting-volume-1-financial-accounting|openstax|?", title: "Principles of Accounting, Volume 1: Financial Accounting", authors: "OpenStax", chapters: [
    [1, "Role of Accounting in Society", ["S1"], "1"], [2, "Introduction to Financial Statements", ["S1"], "1"],
    [3, "Analyzing and Recording Transactions", ["S2"], "1"], [4, "The Adjustment Process", ["S3"], "1"],
    [5, "Completing the Accounting Cycle", ["S4"], "1-2"], [6, "Merchandising Transactions", ["S5"], "2"],
    [7, "Accounting Information Systems", ["SYS"], "2"], [8, "Fraud, Internal Controls, and Cash", ["S7"], "2"],
    [9, "Accounting for Receivables", ["S8"], "2"], [10, "Inventory", ["S6"], "2-3"],
    [11, "Long-Term Assets", ["S9"], "3"], [12, "Current Liabilities", ["S10"], "3"],
  ] },
];

async function main() {
  let tbCount = 0, chCount = 0, mapCount = 0;
  for (const ed of EDITIONS) {
    // 1. canonical textbook row
    const tb = await db.rest("POST", "textbooks?on_conflict=edition_key", { body: { title: ed.title, authors: ed.authors, edition_key: ed.key, edition_confirmed: false, toc_source_url: SRC }, prefer: "resolution=merge-duplicates,return=representation" });
    const textbook_id = (Array.isArray(tb) ? tb[0] : tb)?.id;
    if (!textbook_id) { console.log(`  ! no textbook_id for ${ed.title}`); continue; }
    tbCount++;
    // 2. existing chapters for this textbook (idempotent)
    const existing = await db.rest("GET", `textbook_chapters?select=id,number&textbook_id=eq.${textbook_id}`);
    const byNum = new Map(existing.map((c) => [c.number, c.id]));
    const toInsert = ed.chapters.filter(([n]) => !byNum.has(n)).map(([n, title]) => ({ textbook_id, chapter_key: `${ed.key}-ch${n}`, number: n, title, position: n }));
    if (APPLY && toInsert.length) {
      const ins = await db.rest("POST", "textbook_chapters", { body: toInsert, prefer: "return=representation" });
      for (const c of (Array.isArray(ins) ? ins : [])) byNum.set(c.number, c.id);
      chCount += toInsert.length;
    } else if (!APPLY) { chCount += toInsert.length; }
    // 3. mapping rows (one per chapter→topic)
    const maps = [];
    for (const [n, title, topics, exam] of ed.chapters) {
      const chId = byNum.get(n);
      if (!chId && APPLY) continue;
      for (const t of topics) {
        const single = topics.length === 1;
        maps.push({ textbook_id, textbook_chapter_id: chId || null, survive_topic_id: null, survive_topic_label: S[t],
          problem_type: null, confidence: single ? "High" : "Medium", source: SRC,
          reason: `Ch ${n} "${title}" → ${S[t]}; typically Exam ${exam}`, state: "proposed", proposed_by: BY });
      }
    }
    if (APPLY && maps.length) { await db.rest("POST", "textbook_chapter_topic_mapping?on_conflict=textbook_chapter_id,survive_topic_label", { body: maps, prefer: "resolution=merge-duplicates,return=minimal" }); }
    mapCount += maps.length;
    console.log(`  ${APPLY ? "seeded" : "would seed"} ${ed.title}: ${ed.chapters.length} chapters, ${maps.length} mappings`);
  }
  console.log(`\n${APPLY ? "APPLIED" : "DRY-RUN"} — ${tbCount} textbooks, ${chCount} chapters, ${mapCount} proposed mappings. survive_topic_id=NULL (human attaches on review); state='proposed'.`);
  if (!APPLY) console.log("Re-run with --apply to write.");
}
main().catch((e) => { console.error("[seed:fatal]", e); process.exit(1); });
