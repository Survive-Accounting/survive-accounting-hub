// EXAM 1 MASTER SEED (server fn) — the app-side entry to the reconcile in exam1-seed.core.ts.
// Same dry-run-first contract as the curriculum CSV import: call with apply=false, show the diff,
// and only apply on an explicit confirm. The bun runner (scripts side) calls the core directly.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { runExam1Seed, type Exam1SeedReport } from "./exam1-seed.core";

export type { Exam1SeedReport };

export const seedExam1Master = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ csv: z.string().min(1).max(4_000_000), apply: z.boolean() }).parse(d))
  .handler(async ({ data }): Promise<Exam1SeedReport | { errors: string[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return runExam1Seed(supabaseAdmin as unknown as { from: (t: string) => any }, data.csv, data.apply);
  });
