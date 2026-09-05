// ?copyedit — copy overrides for any page (Lee, 2026-09-04: "set up a route for the homepage
// that lets me easily tweak copy anywhere … ?copyedit"). An override is one element on one
// page: where it is (a tag/nth-of-type path from <body>), what it said when Lee changed it
// (so a rewrite in code makes the override step aside instead of clobbering new copy), and
// what it says now. Kept in the site_settings singleton under `copyOverrides`, merged so the
// flyer URL, the council pages and the idea categories in the same row are never touched.
//
// Reading is public (the overrides ARE the page's copy); writing needs the team passcode
// session, like every other admin fn.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface CopyOverride {
  /** "body>div:nth-of-type(1)>main>h1:nth-of-type(1)" */
  path: string;
  /** innerHTML when Lee changed it. */
  from: string;
  /** innerHTML now. */
  to: string;
  at: string;
}

const KEY = "copyOverrides";
type DB = { from: (t: string) => any };
async function admin(): Promise<DB> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
}
async function readAll(db: DB): Promise<Record<string, CopyOverride[]>> {
  try {
    const { data } = await db.from("site_settings").select("settings").eq("id", 1).maybeSingle();
    const raw = ((data?.settings ?? {}) as Record<string, unknown>)[KEY];
    return raw && typeof raw === "object" ? (raw as Record<string, CopyOverride[]>) : {};
  } catch { return {}; }
}
async function writeAll(db: DB, next: Record<string, CopyOverride[]>): Promise<void> {
  const { data } = await db.from("site_settings").select("settings").eq("id", 1).maybeSingle();
  const settings = { ...((data?.settings ?? {}) as Record<string, unknown>), [KEY]: next };
  const { error } = await db.from("site_settings").upsert({ id: 1, settings, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw new Error(error.message);
}

const pathSchema = z.string().max(300).regex(/^\/[A-Za-z0-9._~\-/]*$/);

export const getCopyOverrides = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ path: pathSchema }).parse(d))
  .handler(async ({ data }): Promise<{ overrides: CopyOverride[] }> => {
    const db = await admin();
    const all = await readAll(db);
    return { overrides: all[data.path] ?? [] };
  });

const overrideSchema = z.object({
  path: z.string().min(1).max(600).regex(/^body(>[a-z0-9]+(:nth-of-type\(\d+\))?)*$/),
  from: z.string().max(20_000),
  to: z.string().max(20_000),
  at: z.string().max(40),
});

/** Replace the page's whole list (the panel holds the working copy). */
export const saveCopyOverrides = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ path: pathSchema, overrides: z.array(overrideSchema).max(200) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; count: number }> => {
    const { adminSessionOk } = await import("@/lib/admin-session.functions");
    const s = await adminSessionOk();
    if (!s.ok) throw new Error("Sign in with the team passcode first.");
    const db = await admin();
    const all = await readAll(db);
    if (data.overrides.length) all[data.path] = data.overrides; else delete all[data.path];
    await writeAll(db, all);
    return { ok: true, count: data.overrides.length };
  });
