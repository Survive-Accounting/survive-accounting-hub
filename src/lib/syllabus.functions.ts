// SYLLABUS INTAKE (server) — the landing "Send your syllabus" modal. A student on an unmapped
// campus uploads their syllabus / study guide + an email; Lee tailors materials from it. Files are
// posted as base64 data URLs, decoded server-side, and written to the PRIVATE syllabus-submissions
// bucket by the service-role client; one row per submission records email + object paths (0108).
// Deny-by-default: nothing here is reachable by the anon client — only this service-role fn writes.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB per file
const fileSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.string().max(120).optional().default(""),
  dataUrl: z.string().min(1).max(15_000_000), // base64 data URL (bounded so a giant paste can't OOM)
});

// EXAM ASK (no files) — the "two sets down" inline card + any file-less email ask. Stores email +
// campus + professor into syllabus_submissions with a source tag. Same private table; deny-by-default.
export const submitExamAsk = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      email: z.string().trim().email().max(200),
      campusId: z.string().uuid().nullable().optional(),
      campusName: z.string().trim().max(120).nullable().optional(),
      professorName: z.string().trim().max(120).nullable().optional(),
      source: z.string().trim().max(40).default("two_set_ask"),
    }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => { insert: (row: unknown) => Promise<{ error: { message: string } | null }> } };
    const { error } = await db.from("syllabus_submissions").insert({
      email: data.email,
      campus_id: data.campusId ?? null,
      campus_name: data.campusName ?? null,
      professor_name: data.professorName ?? null,
      source: data.source,
      file_paths: [],
      file_names: [],
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const submitSyllabus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      email: z.string().trim().email().max(200),
      campusId: z.string().uuid().nullable().optional(),
      campusName: z.string().trim().max(120).nullable().optional(),
      note: z.string().trim().max(2000).nullable().optional(),
      files: z.array(fileSchema).min(1).max(5),
    }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const id = crypto.randomUUID();
    const paths: string[] = [];
    const names: string[] = [];
    for (let i = 0; i < data.files.length; i++) {
      const f = data.files[i];
      const m = /^data:([^;]*);base64,(.*)$/s.exec(f.dataUrl);
      if (!m) throw new Error("Unsupported file encoding.");
      const bytes = Buffer.from(m[2], "base64");
      if (bytes.length === 0) throw new Error("One of the files was empty.");
      if (bytes.length > MAX_BYTES) throw new Error(`"${f.name}" is over 10MB — please send a smaller file.`);
      const safe = f.name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || `file-${i}`;
      const path = `${id}/${i}-${safe}`;
      const { error: upErr } = await supabaseAdmin.storage
        .from("syllabus-submissions")
        .upload(path, bytes, { contentType: f.type || m[1] || "application/octet-stream", upsert: false });
      if (upErr) throw new Error(upErr.message);
      paths.push(path);
      names.push(f.name);
    }
    // syllabus_submissions isn't in the generated Supabase types yet (0108 is manual-apply), so the
    // typed client rejects the table name — cast .from to a loose signature like the other new-table fns.
    const db = supabaseAdmin as unknown as { from: (t: string) => { insert: (row: unknown) => Promise<{ error: { message: string } | null }> } };
    const { error } = await db.from("syllabus_submissions").insert({
      id,
      email: data.email,
      campus_id: data.campusId ?? null,
      campus_name: data.campusName ?? null,
      note: data.note ?? null,
      file_paths: paths,
      file_names: names,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
