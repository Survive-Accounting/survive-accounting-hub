// EXAM UNITS (server, Prompt 2) — authoring for exam-unit grouping over chapters/topics.
// All service-role (bypass RLS). Mirrors the chapter admin fns in canvas.functions.ts:
// position is per-course, reorder is collision-safe two-phase, units archive (never hard-delete
// unless membership only). Fails LOUD naming 0102 if the tables aren't applied yet.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isMissingSchema } from "@/lib/pg-errors";

const MISSING = "exam_units tables missing — apply migration/supabase-migrations/0102_exam_units.sql in the Supabase SQL editor";
function rethrow(e: { code?: string; message: string }): never {
  if (isMissingSchema(e, /exam_unit/i)) throw new Error(MISSING);
  throw new Error(e.message);
}

export interface ExamUnitRow { id: string; name: string; position: number | null; status: "active" | "archived"; chapter_ids: string[] }

const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
};

/** Active + archived units for a course, each with its chapter ids (membership). */
export const listExamUnits = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ course_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<ExamUnitRow[]> => {
    const db = await admin();
    const { data: units, error } = await db.from("exam_units").select("id,name,position,status").eq("course_id", data.course_id).order("status", { ascending: true }).order("position", { ascending: true });
    if (error) rethrow(error);
    const ids = (units ?? []).map((u: { id: string }) => u.id);
    const byUnit = new Map<string, string[]>();
    if (ids.length) {
      const { data: mem, error: e2 } = await db.from("exam_unit_chapters").select("exam_unit_id,chapter_id").in("exam_unit_id", ids);
      if (e2) rethrow(e2);
      for (const m of (mem ?? []) as { exam_unit_id: string; chapter_id: string }[]) { const l = byUnit.get(m.exam_unit_id) ?? []; l.push(m.chapter_id); byUnit.set(m.exam_unit_id, l); }
    }
    return (units ?? []).map((u: { id: string; name: string; position: number | null; status: "active" | "archived" }) => ({ id: u.id, name: u.name, position: u.position ?? null, status: u.status, chapter_ids: byUnit.get(u.id) ?? [] }));
  });

export const createExamUnit = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ course_id: z.string().uuid(), name: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data }): Promise<ExamUnitRow> => {
    const db = await admin();
    const { data: top, error: tErr } = await db.from("exam_units").select("position").eq("course_id", data.course_id).eq("status", "active").order("position", { ascending: false }).limit(1);
    if (tErr) rethrow(tErr);
    const next = (typeof (top?.[0] as { position: number } | undefined)?.position === "number" ? (top[0] as { position: number }).position : 0) + 1;
    const { data: ins, error } = await db.from("exam_units").insert({ course_id: data.course_id, name: data.name.trim(), position: next, status: "active" }).select("id,name,position,status").single();
    if (error) rethrow(error);
    return { ...(ins as { id: string; name: string; position: number | null; status: "active" | "archived" }), chapter_ids: [] };
  });

export const renameExamUnit = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), name: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await admin();
    const { error } = await db.from("exam_units").update({ name: data.name.trim() }).eq("id", data.id);
    if (error) rethrow(error);
    return { ok: true };
  });

export const setExamUnitStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["active", "archived"]) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await admin();
    const { error } = await db.from("exam_units").update({ status: data.status }).eq("id", data.id);
    if (error) rethrow(error);
    return { ok: true };
  });

/** Collision-safe two-phase renumber of the given ACTIVE units, 1..N in order. */
export const reorderExamUnits = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ course_id: z.string().uuid(), ordered_ids: z.array(z.string().uuid()).min(1) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await admin();
    for (let i = 0; i < data.ordered_ids.length; i++) {
      const { error } = await db.from("exam_units").update({ position: -(i + 1) }).eq("id", data.ordered_ids[i]).eq("course_id", data.course_id);
      if (error) rethrow(error);
    }
    for (let i = 0; i < data.ordered_ids.length; i++) {
      const { error } = await db.from("exam_units").update({ position: i + 1 }).eq("id", data.ordered_ids[i]).eq("course_id", data.course_id);
      if (error) rethrow(error);
    }
    return { ok: true };
  });

/** Replace a unit's chapter membership with the given set (delete-all then insert). */
export const setUnitChapters = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ exam_unit_id: z.string().uuid(), chapter_ids: z.array(z.string().uuid()) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await admin();
    const { error: dErr } = await db.from("exam_unit_chapters").delete().eq("exam_unit_id", data.exam_unit_id);
    if (dErr) rethrow(dErr);
    if (data.chapter_ids.length) {
      const rows = data.chapter_ids.map((cid, i) => ({ exam_unit_id: data.exam_unit_id, chapter_id: cid, position: i + 1 }));
      const { error: iErr } = await db.from("exam_unit_chapters").insert(rows);
      if (iErr) rethrow(iErr);
    }
    return { ok: true };
  });
