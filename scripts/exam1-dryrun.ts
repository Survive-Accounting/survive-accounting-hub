// Re-run the Exam 1 master seed as DRY RUN (read-only) against the live DB,
// to see whether the previously-applied card writes persisted.
import { readFileSync } from "node:fs";
import { runExam1Seed } from "../src/lib/exam1-seed.core";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(url, key);

const csv = readFileSync("data/exam1-master.csv", "utf8");
const report = await runExam1Seed(db as any, csv, false);
console.log(JSON.stringify(report, null, 1).slice(0, 6000));
