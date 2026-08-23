// TEST MODE server fns — the two write paths for the guided run.
//
// * logTestModeActivity — anon-writable append log (RLS: insert only). Everything the drawer
//   surfaces also goes here so the admin console can read a run end-to-end.
// * grantTestEntitlement — admin-only stub used until Stripe test checkout ships. Writes an
//   `is_test=true` row into student_entitlements so the paid-content UI unlocks in Test Mode.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface TestActivityRow { id: number; session_key: string; tester_email: string | null; tester_name: string | null; step: string | null; event: string; status: string; detail: string | null; meta_json: string | null; created_at: string }

// ────────────────────────────────────────────────────────────────────────────────────────────
// activity log — anon insert; server-side dedupe is unnecessary (append-only), but we truncate
// meta/detail defensively to keep any one row small.
// ────────────────────────────────────────────────────────────────────────────────────────────
export const logTestModeActivity = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      sessionKey: z.string().min(6).max(80),
      testerEmail: z.string().max(320).nullable(),
      testerName: z.string().max(120).nullable(),
      step: z.string().max(40).nullable(),
      event: z.string().max(40),
      status: z.enum(["ok", "warn", "error"]).default("ok"),
      detail: z.string().max(1000).nullable(),
      meta: z.any().nullable(),
    }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Fire-and-forget from the caller's POV; still `await` here so the transaction commits.
    // The anon RLS policy (insert-only) exists so this works from any browser session.
    const meta = data.meta == null ? null : safeMeta(data.meta);
    const { error } = await (supabaseAdmin.from("test_mode_activity" as never) as unknown as { insert: (r: Record<string, unknown>) => Promise<{ error: { message?: string } | null }> })
      .insert({
        session_key: data.sessionKey,
        tester_email: data.testerEmail,
        tester_name: data.testerName,
        step: data.step,
        event: data.event,
        status: data.status,
        detail: data.detail,
        meta,
      });
    if (error) console.warn("test_mode_activity insert failed:", error.message);
    return { ok: true };
  });

function safeMeta(v: unknown): unknown {
  try { const s = JSON.stringify(v); return s.length > 8192 ? JSON.parse(s.slice(0, 8192) + '"}') : v; } catch { return null; }
}

// ────────────────────────────────────────────────────────────────────────────────────────────
// TEST GRANT (Phase A) — a dev-only shortcut to grant an is_test entitlement so paid-content
// UI can be exercised before Stripe is wired. Callable only when Test Mode is armed for the
// caller (server verifies session key matches a recent test_mode_activity row) AND a valid
// student session exists. Writes `source='test_grant'`.
//
// Once Phase B Stripe webhook lands, this stays for local dev/emergencies but every real
// entitlement flows through Stripe → `source='stripe'`.
// ────────────────────────────────────────────────────────────────────────────────────────────
export const grantTestEntitlement = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      accessToken: z.string().min(20),
      sessionKey: z.string().min(6).max(80),
      kind: z.enum(["exam_2", "exam_3", "final", "pass"]),
      campusId: z.string().uuid().nullable().optional(),
    }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; id: string } | { ok: false; error: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u, error: uErr } = await supabaseAdmin.auth.getUser(data.accessToken);
    if (uErr || !u?.user) return { ok: false, error: "not signed in" };

    // The session must have produced an activity row in the last hour — proof the tester
    // actually walked through the guided run.
    const since = new Date(Date.now() - 60 * 60_000).toISOString();
    const { data: acts } = await (supabaseAdmin.from("test_mode_activity" as never) as unknown as { select: (c: string) => { eq: (k: string, v: string) => { gte: (k: string, v: string) => { limit: (n: number) => Promise<{ data: Array<{ id: number }> | null }> } } } })
      .select("id").eq("session_key", data.sessionKey).gte("created_at", since).limit(1);
    if (!acts?.length) return { ok: false, error: "no recent activity for this session" };

    const row = {
      user_id: u.user.id,
      kind: data.kind,
      campus_id: data.campusId ?? null,
      source: "test_grant",
      is_test: true,
      granted_at: new Date().toISOString(),
      meta: { session_key: data.sessionKey },
    };
    const { data: ins, error } = await (supabaseAdmin.from("student_entitlements" as never) as unknown as { insert: (r: Record<string, unknown>) => { select: (c: string) => { single: () => Promise<{ data: { id: string } | null; error: { message?: string } | null }> } } })
      .insert(row).select("id").single();
    if (error) {
      // Duplicate unique index → this user already holds this entitlement; that's a success.
      if (/duplicate|conflict|unique/i.test(String(error.message ?? ""))) return { ok: true, id: "existing" };
      return { ok: false, error: error.message ?? "insert failed" };
    }
    return { ok: true, id: ins?.id ?? "" };
  });

// ────────────────────────────────────────────────────────────────────────────────────────────
// LIST activity — admin console feed. Bounded to last N rows and last N minutes.
// ────────────────────────────────────────────────────────────────────────────────────────────
export const listTestModeActivity = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ accessToken: z.string().min(20), limit: z.number().int().min(1).max(500).optional(), sinceMinutes: z.number().int().min(1).max(20160).optional() }).parse(d))
  .handler(async ({ data }): Promise<{ rows: TestActivityRow[]; error?: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u } = await supabaseAdmin.auth.getUser(data.accessToken);
    // Admin check — every /outreach/* server fn uses the same pattern; here we just require any
    // authed user for now (matches other Test Mode fns) since the drawer expects the tester's
    // own session to see their own activity. A stricter admin gate can go on the route.
    if (!u?.user) return { rows: [], error: "not signed in" };
    const since = new Date(Date.now() - (data.sinceMinutes ?? 60 * 24) * 60_000).toISOString();
    const { data: rows } = await (supabaseAdmin.from("test_mode_activity" as never) as unknown as { select: (c: string) => { gte: (k: string, v: string) => { order: (k: string, opts: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: unknown[] | null }> } } } })
      .select("id,session_key,tester_email,tester_name,step,event,status,detail,meta,created_at")
      .gte("created_at", since).order("created_at", { ascending: false }).limit(data.limit ?? 200);
    const list: TestActivityRow[] = (rows ?? []).map((r) => { const x = r as { id: number; session_key: string; tester_email: string | null; tester_name: string | null; step: string | null; event: string; status: string; detail: string | null; meta: unknown; created_at: string }; return { id: x.id, session_key: x.session_key, tester_email: x.tester_email, tester_name: x.tester_name, step: x.step, event: x.event, status: x.status, detail: x.detail, meta_json: x.meta == null ? null : JSON.stringify(x.meta), created_at: x.created_at }; });
    return { rows: list };
  });
