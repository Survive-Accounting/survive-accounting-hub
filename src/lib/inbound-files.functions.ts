// INBOUND FILES DASHBOARD (Prompt 2C, server) — the provenance ledger's worklist. Rows come from
// the syllabus modal's dual-write (0113 inbound_files); this module lists/filters them, toggles
// reviewed + notes, signs file URLs from PRIVATE storage, and can seed 3 dummy rows for testing.
// NEVER student-facing — these fns are called only from the authoring canvas. Student emails render
// only inside the authoring dashboard, nowhere public.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type Db = { from: (t: string) => any };
const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
};

export interface InboundFileRow {
  id: string;
  submitted_at: string;
  campus_id: string | null;
  campus_name: string | null;
  professor_name: string | null;
  student_email: string | null;
  files: { name: string; path: string; bucket?: string }[];
  reviewed: boolean;
  notes: string | null;
  reviewer: string | null;
  source: string;
}

export const listInboundFiles = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ unreviewedOnly: z.boolean().default(false), campus: z.string().trim().max(120).optional() }).parse(d ?? {}))
  .handler(async ({ data }): Promise<InboundFileRow[]> => {
    const sb = await admin();
    const db = sb as unknown as Db;
    try {
      let q = db.from("inbound_files").select("*").order("submitted_at", { ascending: false }).limit(200);
      if (data.unreviewedOnly) q = q.eq("reviewed", false);
      if (data.campus?.trim()) q = q.ilike("campus_name", `%${data.campus.trim()}%`);
      const { data: rows, error } = await q;
      if (error) throw error;
      return (rows ?? []) as InboundFileRow[];
    } catch { return []; } // 0113 not applied
  });

export const updateInboundFile = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    reviewed: z.boolean().optional(),
    notes: z.string().max(2000).nullable().optional(),
    reviewer: z.string().max(120).nullable().optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const sb = await admin();
    const db = sb as unknown as Db;
    const patch: Record<string, unknown> = {};
    if (data.reviewed !== undefined) patch.reviewed = data.reviewed;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.reviewer !== undefined) patch.reviewer = data.reviewer;
    const { error } = await db.from("inbound_files").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Signed download URL for one file (private bucket; 10-minute expiry). */
export const getInboundFileUrl = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ path: z.string().min(1).max(500), bucket: z.string().min(1).max(80).default("syllabus-submissions") }).parse(d))
  .handler(async ({ data }): Promise<{ url: string | null }> => {
    const sb = await admin();
    const { data: signed, error } = await sb.storage.from(data.bucket).createSignedUrl(data.path, 600);
    if (error) return { url: null };
    return { url: signed?.signedUrl ?? null };
  });

/** Seed 3 clearly-labeled dummy rows for dashboard testing (idempotent by source tag). */
export const seedInboundDummies = createServerFn({ method: "POST" }).handler(async (): Promise<{ ok: true; seeded: number }> => {
  const sb = await admin();
  const db = sb as unknown as Db;
  const { data: existing } = await db.from("inbound_files").select("id").eq("source", "dummy").limit(1);
  if (existing?.length) return { ok: true, seeded: 0 };
  const rows = [
    { campus_name: "University of Mississippi", professor_name: "Burney", student_email: "dummy1@example.com", files: [{ name: "syllabus-accy201.pdf", path: "dummy/none.pdf" }], source: "dummy", notes: "dummy row — safe to delete" },
    { campus_name: "Louisiana State University", professor_name: null, student_email: "dummy2@example.com", files: [{ name: "study-guide.docx", path: "dummy/none.docx" }], source: "dummy", notes: "dummy row — safe to delete" },
    { campus_name: "University of Tennessee", professor_name: "Testerson", student_email: null, files: [], source: "dummy", notes: "dummy row — safe to delete" },
  ];
  const { error } = await db.from("inbound_files").insert(rows);
  if (error) throw new Error(error.message);
  return { ok: true, seeded: rows.length };
});
