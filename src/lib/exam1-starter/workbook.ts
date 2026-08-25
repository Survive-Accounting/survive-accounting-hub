// Workbook reader for the Exam 1 Global Starter Map (Node/Bun only — pulls in `xlsx`).
// Reads the `Claude Import` sheet and normalizes every cell to the ImportRow shape that
// buildPlan() consumes. Kept out of plan.ts so the pure planner stays bundle-safe.
import * as XLSX from "xlsx";
import type { ImportRow } from "./plan";

const CLAUDE_IMPORT_SHEET = "Claude Import";

const str = (v: unknown): string => (v == null ? "" : String(v)).trim();
const int = (v: unknown): number => { const n = parseInt(str(v), 10); return Number.isFinite(n) ? n : 0; };

export function readImportRows(xlsxPath: string): { rows: ImportRow[]; sheetNames: string[] } {
  const wb = XLSX.readFile(xlsxPath);
  const ws = wb.Sheets[CLAUDE_IMPORT_SHEET];
  if (!ws) throw new Error(`Sheet "${CLAUDE_IMPORT_SHEET}" not found. Sheets: ${wb.SheetNames.join(", ")}`);
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
  const rows: ImportRow[] = raw.map((r) => {
    const choices = [1, 2, 3, 4, 5].map((i) => str(r[`Answer Choice #${i}`])).filter((c) => c !== "");
    return {
      topicOrder: int(r["Topic Order"]),
      topic: str(r["Topic"]),
      subtopicOrder: int(r["Subtopic Order"]),
      subtopic: str(r["Subtopic"]),
      questionText: str(r["Question Text"]),
      choices,
      correctIndex: int(r["Correct Answer #?"]),
      questionKey: str(r["Question Key"]),
      feedback: str(r["Feedback (Text)"]),
      source: str(r["Source"]),
      originalCeqId: str(r["Original CEQ ID"]),
      include: str(r["Include in Starter Map?"]).toUpperCase() === "YES",
    };
  });
  return { rows, sheetNames: wb.SheetNames };
}
