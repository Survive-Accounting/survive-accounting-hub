// CANNED INTRO/OUTRO — server side. One call to log a commit (best-effort — losing a usage row
// is real but must never block Lee from actually filling the prompter), one to read back recent
// usage for a slot so canned-lines.ts's pick/warning logic has something to work from.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isMissingSchema } from "./pg-errors";
import type { CannedSlot } from "@/components/blastoff/canned-lines";

const isMissingTable = (e: { code?: string; message: string }) => isMissingSchema(e, /canned_line_usage/i);

// canned_line_usage is new (migration/supabase-migrations/20260906_0300) and isn't in the
// generated Supabase types yet — same escape hatch as every other new table this session.
type CannedDB = { from: (t: "canned_line_usage") => any };
async function cannedDb(): Promise<CannedDB> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as CannedDB;
}

export const logCannedLineUse = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    setId: z.string().min(1).max(160), slot: z.enum(["intro", "outro", "bio"]), lineId: z.string().min(1).max(80),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    try {
      const db = await cannedDb();
      const { error } = await db.from("canned_line_usage").insert({ set_id: data.setId, slot: data.slot, line_id: data.lineId });
      if (error) {
        if (isMissingTable(error)) return { ok: false, error: "Run migration/supabase-migrations/20260906_0300_canned_line_usage.sql first." };
        return { ok: false, error: error.message };
      }
      return { ok: true };
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  });

/** Newest-first line ids for a slot, capped small — this only ever needs "was it the last one"
 *  and "how often lately," never a full history. Missing table → empty, not an error: nothing
 *  used yet is the normal starting state. */
export const recentCannedLineUses = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ slot: z.enum(["intro", "outro", "bio"]) }).parse(d))
  .handler(async ({ data }): Promise<string[]> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    try {
      const db = await cannedDb();
      const { data: rows, error } = await db.from("canned_line_usage")
        .select("line_id").eq("slot", data.slot satisfies CannedSlot).order("used_at", { ascending: false }).limit(8);
      if (error) return [];
      return ((rows ?? []) as { line_id: string }[]).map((r) => r.line_id);
    } catch { return []; }
  });
