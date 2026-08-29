// Parse docs/data/exam1masterchoices.xlsx (sheet "exam1-master-choices.csv")
// and print its shape — D1 investigation, read-only.
import * as XLSX from "xlsx";

const wb = XLSX.readFile("docs/data/exam1masterchoices.xlsx");
console.log("sheets:", wb.SheetNames);
const sheet = wb.Sheets[wb.SheetNames.find((n) => n.includes("master")) ?? wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
console.log("rows:", rows.length);
console.log("columns:", Object.keys(rows[0] ?? {}));

const topics = new Map<string, Map<string, number>>();
for (const r of rows) {
  const t = String(r.topic_name ?? "").trim();
  const s = String(r.set_stem ?? "").trim();
  if (!topics.has(t)) topics.set(t, new Map());
  const sets = topics.get(t)!;
  sets.set(s, (sets.get(s) ?? 0) + 1);
}
console.log(`\ntopics: ${topics.size}, sets: ${[...topics.values()].reduce((n, m) => n + m.size, 0)}`);
for (const [t, sets] of topics) {
  console.log(`\nTOPIC: ${t} (${[...sets.values()].reduce((a, b) => a + b, 0)} ceqs, ${sets.size} sets)`);
  for (const [s, n] of sets) console.log(`   ${n.toString().padStart(2)} · ${s}`);
}
const statuses = new Map<string, number>();
for (const r of rows) statuses.set(String(r.status ?? ""), (statuses.get(String(r.status ?? "")) ?? 0) + 1);
console.log("\nstatus counts:", [...statuses.entries()]);
console.log("sample row:", JSON.stringify(rows[0], null, 1));
