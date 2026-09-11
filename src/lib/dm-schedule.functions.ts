// THE DM SCHEDULE STORE (2026-09-11) — the week's DM days live in the site_settings singleton
// under `dmSchedule` (same pattern as copyOverrides / councilPages), so there is no migration to
// wait on. Small (a few hundred items at most), last writer wins, admin-only.
//
// LAW: ships to the client bundle — service-role client + admin gate imported dynamically.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { seedSchedule, type DmSchedule } from "@/lib/dm-schedule";

const KEY = "dmSchedule";
type DB = { from: (t: string) => any };

const adminCtx = async (): Promise<{ db: DB; who: string }> => {
  const { assertAdmin, adminSessionOk } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  const s = await adminSessionOk().catch(() => null);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { db: supabaseAdmin as unknown as DB, who: s?.email ?? "admin" };
};

const Item = z.object({
  id: z.string().min(1).max(40),
  campus: z.string().max(80),
  orgKey: z.string().max(240),
  contactId: z.string().uuid().nullable(),
  kind: z.enum(["send", "follow_up"]),
  note: z.string().max(300).optional(),
  doneAt: z.string().nullable().optional(),
});
const Day = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  owner: z.enum(["lee", "king"]),
  sendAt: z.string().max(40),
  note: z.string().max(400).optional(),
  assignedAt: z.string().nullable().optional(),
  items: z.array(Item).max(200),
});
const Schedule = z.object({ days: z.array(Day).max(60) });

async function read(db: DB): Promise<DmSchedule | null> {
  const { data } = await db.from("site_settings").select("settings").eq("id", 1).maybeSingle();
  const raw = ((data?.settings ?? {}) as Record<string, unknown>)[KEY];
  const parsed = Schedule.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
async function write(db: DB, next: DmSchedule): Promise<void> {
  const { data } = await db.from("site_settings").select("settings").eq("id", 1).maybeSingle();
  const settings = { ...((data?.settings ?? {}) as Record<string, unknown>), [KEY]: next };
  const { error } = await db.from("site_settings").upsert({ id: 1, settings, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw new Error(error.message);
}

/** The schedule; seeded with Lee's first week the first time anyone asks. */
export const dmScheduleGet = createServerFn({ method: "GET" })
  .handler(async (): Promise<DmSchedule> => {
    const { db } = await adminCtx();
    const cur = await read(db);
    if (cur) return cur;
    const seeded = seedSchedule();
    await write(db, seeded);
    return seeded;
  });

export const dmScheduleSave = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Schedule.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { db } = await adminCtx();
    const days = [...data.days].sort((a, b) => a.date.localeCompare(b.date));
    await write(db, { days });
    return { ok: true };
  });

/** The hand-off email to King (or whoever), as edited in the modal. Marks the day assigned. */
export const dmScheduleAssign = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().trim().email(),
    subject: z.string().trim().min(1).max(200),
    text: z.string().min(1).max(20000),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { db, who } = await adminCtx();
    const { sendResendEmail } = await import("@/lib/email.server");
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:680px;color:#1a1a1a;"><pre style="white-space:pre-wrap;font:14px/1.5 inherit;margin:0;">${esc(data.text).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1">$1</a>')}</pre></div>`;
    const res = await sendResendEmail({ to: data.to, subject: data.subject, text: data.text, html, cc: who.includes("@") && who !== data.to ? [who] : undefined });
    if (!res.ok) return { ok: false, error: res.error ?? "send failed" };
    const cur = (await read(db)) ?? seedSchedule();
    const days = cur.days.map((d) => (d.date === data.date ? { ...d, owner: "king" as const, assignedAt: new Date().toISOString() } : d));
    await write(db, { days });
    return { ok: true };
  });
