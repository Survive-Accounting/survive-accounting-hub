// GREEK CHAPTERS (server) — self-serve onboarding: sign up a chapter, SMS-verify the admin phone,
// mint a shareable free-Exam-1 link, redeem it (member join), and read a magic-link dashboard.
// Deny-by-default: every write is service-role here; the dashboard verifies the caller's Supabase
// JWT (magic-link) and matches it to the chapter's admin_email. Tables: 0111 + 0115 (manual-apply).
//
// LINK LAW (Phase 1): the link this mints is /go/<school>/<chapter>. /c/<slug> is redirect-only and
// nothing here may build one — see goUrlForChapter below.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { goPath } from "@/lib/greek-go.functions";

type DB = { from: (t: string) => any; auth: { getUser: (jwt: string) => Promise<{ data: { user: { email?: string | null } | null }; error: unknown }> } };
const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

// SMS-TRUTH — normalize a user-typed phone to E.164 or null. Twilio rejects bare 10-digit
// strings, so "(662) 565-8818" must become "+16625658818" BEFORE the send, and a number we
// can't normalize must fail loudly at the form, not silently at Twilio.
export function normalizePhoneE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

// Send an SMS via Twilio (same Messages API as onboarding.notifyLee). SMS-TRUTH: reports the
// outcome — callers surface failures instead of telling the user "I just texted you" on a lie.
export async function sendSms(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID ?? "", token = process.env.TWILIO_AUTH_TOKEN ?? "", msid = process.env.TWILIO_MESSAGING_SERVICE_SID ?? "";
  const dest = normalizePhoneE164(to);
  if (!dest) return { ok: false, error: "bad-phone" };
  if (!sid || !token || !msid) { console.warn("sendSms: missing Twilio env, skipping"); return { ok: false, error: "no-twilio-env" }; }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ MessagingServiceSid: msid, To: dest, Body: body }),
    });
    if (!res.ok) { console.warn("sendSms twilio error", res.status, await res.text()); return { ok: false, error: `twilio-${res.status}` }; }
    return { ok: true };
  } catch (e) { console.warn("sendSms failed", (e as Error).message); return { ok: false, error: "network" }; }
}

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 40);
const code6 = () => String(Math.floor(100000 + Math.random() * 900000));

/** LINK LAW (Phase 1): a chapter's public URL is /go/<school>/<chapter>, never /c/<slug>. /c/ is
 *  redirect-only, so nothing in this file may build one — every surface that shows, copies or
 *  QR-encodes a chapter link resolves through here.
 *
 *  Returns null when the chapter has no roster row behind it (a 0111-era signup that was never
 *  linked to campus_greek_chapters). Null is deliberate: the caller reports that the link isn't
 *  ready yet, which is honest, instead of falling back to a /c/ URL and minting a fresh legacy
 *  link at the exact moment we're trying to retire them. */
async function goUrlForChapter(db: DB, ch: { campus_id: string | null; campus_greek_chapter_id: string | null }): Promise<string | null> {
  if (!ch.campus_id || !ch.campus_greek_chapter_id) return null;
  const { data: campus } = await (db as any).from("campuses").select("slug").eq("id", ch.campus_id).maybeSingle();
  const { data: roster } = await (db as any).from("campus_greek_chapters").select("slug").eq("id", ch.campus_greek_chapter_id).maybeSingle();
  if (!campus?.slug || !roster?.slug) return null;
  return goPath(campus.slug, roster.slug);
}

export interface ChapterOrg { id: string; name: string }
// Chapter picker source — the SAME GreekIntel data as elsewhere: campus_greek_chapters → greek_orgs
// names for the selected campus. Degrades to [] (free-text fallback in the UI) if the tables differ.
export const searchChapterOrgs = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ campusId: z.string().uuid(), q: z.string().trim().max(80).optional() }).parse(d))
  .handler(async ({ data }): Promise<ChapterOrg[]> => {
    try {
      const db = await admin();
      const { data: rows } = await db.from("campus_greek_chapters").select("greek_org_id").eq("campus_id", data.campusId).limit(600);
      const ids = [...new Set((rows ?? []).map((r: { greek_org_id: string | null }) => r.greek_org_id).filter(Boolean))] as string[];
      if (!ids.length) return [];
      const { data: orgs } = await db.from("greek_orgs").select("id,name").in("id", ids);
      const q = (data.q ?? "").toLowerCase();
      const out = (orgs ?? []).map((o: { id: string; name: string | null }) => ({ id: o.id, name: (o.name ?? "").trim() })).filter((o: ChapterOrg) => o.name && (!q || o.name.toLowerCase().includes(q)));
      out.sort((a: ChapterOrg, b: ChapterOrg) => a.name.localeCompare(b.name));
      return out.slice(0, 60);
    } catch { return []; }
  });

export const createGreekChapter = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    campusId: z.string().uuid().nullable().optional(),
    schoolName: z.string().trim().min(1).max(120),
    chapterName: z.string().trim().min(1).max(120),
    greekOrgId: z.string().uuid().nullable().optional(),
    adminNameRole: z.string().trim().min(1).max(160),
    adminEmail: z.string().trim().email().max(200),
    adminPhone: z.string().trim().min(7).max(20),
  }).parse(d))
  .handler(async ({ data }): Promise<{ chapterId: string; smsSent: boolean }> => {
    const db = await admin();
    // SMS-TRUTH: reject un-normalizable phones at the door — the code text below can't reach them.
    const phone = normalizePhoneE164(data.adminPhone);
    if (!phone) throw new Error("That phone number doesn't look right — use (XXX) XXX-XXXX.");
    // needs_review = we couldn't match the chapter to GreekIntel (no org id chosen) — Lee's manual check.
    const needsReview = !data.greekOrgId;
    // Unique slug: school-chapter, then -2/-3… on conflict.
    const base = slugify(`${data.schoolName}-${data.chapterName}`) || "chapter";
    let slug = base;
    for (let i = 2; i < 40; i++) { const { data: hit } = await db.from("greek_chapters").select("id").eq("slug", slug).maybeSingle(); if (!hit) break; slug = `${base}-${i}`; }
    const code = code6();
    const { data: ins, error } = await db.from("greek_chapters").insert({
      slug, campus_id: data.campusId ?? null, school_name: data.schoolName, chapter_name: data.chapterName,
      greek_org_id: data.greekOrgId ?? null, admin_name_role: data.adminNameRole, admin_email: data.adminEmail,
      admin_phone: phone, verify_code: code, verify_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      needs_review: needsReview,
    }).select("id").single();
    if (error) throw new Error(error.message);
    const sms = await sendSms(phone, `Survive Accounting: your chapter verification code is ${code}. It expires in 10 minutes.`);
    return { chapterId: ins.id as string, smsSent: sms.ok };
  });

// SMS-TRUTH — re-mint + re-text the verification code, optionally onto a corrected phone number
// (the "Wrong number? Change it" path UPDATES the existing row — no duplicate chapters). Rate-limited
// via the code's own timestamp: expires 10 min after send, so (expires − 10 min) is the last send.
export const resendChapterCode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ chapterId: z.string().uuid(), phone: z.string().trim().min(7).max(20).optional() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; smsSent?: boolean; error?: string }> => {
    const db = await admin();
    const { data: row } = await db.from("greek_chapters").select("id,admin_phone,phone_verified_at,verify_expires_at").eq("id", data.chapterId).maybeSingle();
    if (!row) return { ok: false, error: "Chapter not found — start over below." };
    if (row.phone_verified_at) return { ok: false, error: "You're already verified — your link is live." };
    const lastSent = row.verify_expires_at ? new Date(row.verify_expires_at).getTime() - 10 * 60_000 : 0;
    if (Date.now() - lastSent < 55_000) return { ok: false, error: "Just sent one — give it a minute, then try again." };
    let phone = row.admin_phone as string;
    if (data.phone) {
      const norm = normalizePhoneE164(data.phone);
      if (!norm) return { ok: false, error: "That phone number doesn't look right — use (XXX) XXX-XXXX." };
      phone = norm;
    }
    const code = code6();
    await db.from("greek_chapters").update({ admin_phone: phone, verify_code: code, verify_expires_at: new Date(Date.now() + 10 * 60_000).toISOString() }).eq("id", data.chapterId);
    const sms = await sendSms(phone, `Survive Accounting: your chapter verification code is ${code}. It expires in 10 minutes.`);
    return { ok: true, smsSent: sms.ok, error: sms.ok ? undefined : "Couldn't text that number — double-check it, or text me at (662) 565-8818 and I'll set you up." };
  });

export const verifyChapterPhone = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ chapterId: z.string().uuid(), code: z.string().trim().min(4).max(8) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; slug?: string; url?: string; error?: string }> => {
    const db = await admin();
    const { data: row } = await db.from("greek_chapters").select("id,slug,verify_code,verify_expires_at,phone_verified_at,campus_id,campus_greek_chapter_id").eq("id", data.chapterId).maybeSingle();
    if (!row) return { ok: false, error: "Chapter not found." };
    if (row.phone_verified_at) return { ok: true, slug: row.slug, url: (await goUrlForChapter(db, row)) ?? undefined };
    if (!row.verify_code || row.verify_code !== data.code) return { ok: false, error: "That code isn't right." };
    if (row.verify_expires_at && new Date(row.verify_expires_at).getTime() < Date.now()) return { ok: false, error: "That code expired — resend it." };
    await db.from("greek_chapters").update({ phone_verified_at: new Date().toISOString(), verify_code: null }).eq("id", data.chapterId);
    return { ok: true, slug: row.slug, url: (await goUrlForChapter(db, row)) ?? undefined };
  });

export interface ChapterPublic { slug: string; chapterName: string; schoolName: string; campusId: string | null }
// Public info for a /c/<slug> landing — pre-select + banner. Only active, verified, non-expired links.
export const getChapterBySlug = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().trim().min(1).max(60) }).parse(d))
  .handler(async ({ data }): Promise<ChapterPublic | null> => {
    const db = await admin();
    const { data: row } = await db.from("greek_chapters").select("slug,chapter_name,school_name,campus_id,status,phone_verified_at,link_expires_at").eq("slug", data.slug).maybeSingle();
    if (!row || row.status !== "active" || !row.phone_verified_at) return null;
    if (row.link_expires_at && new Date(row.link_expires_at).getTime() < Date.now()) return null;
    return { slug: row.slug, chapterName: row.chapter_name, schoolName: row.school_name, campusId: row.campus_id ?? null };
  });

// Claim free access — collects name + phone, creates a member row (uncapped, logged). Never gates the
// student: the player works with or without claiming. (SMS-verify-on-claim can reuse sendSms later.)
export const claimChapterAccess = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().trim().min(1).max(60), name: z.string().trim().min(1).max(120), phone: z.string().trim().min(7).max(20) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await admin();
    const { data: ch } = await db.from("greek_chapters").select("id,status").eq("slug", data.slug).maybeSingle();
    if (ch?.id && ch.status === "active") await db.from("greek_chapter_members").insert({ chapter_id: ch.id, name: data.name, phone: data.phone });
    return { ok: true };
  });

// ---- DASHBOARD (magic-link) — the caller's Supabase JWT is verified and matched to admin_email ----
async function chapterForToken(db: DB, accessToken: string) {
  const { data } = await db.auth.getUser(accessToken);
  const email = (data.user?.email ?? "").trim().toLowerCase();
  if (!email) return null;
  const { data: row } = await (db as any).from("greek_chapters").select("*").ilike("admin_email", email).eq("status", "active").order("created_at", { ascending: false }).maybeSingle();
  return row ?? null;
}

export interface ChapterDashboard {
  /** Needed by every Phase-2b action (seats, transfer) — the dashboard used to expose only a slug,
   *  which is a display value, not a key. */
  chapterId: string;
  /** /chapters/kit/<school>/<chapter>, or null for the same reason `url` can be null. */
  kitPath: string | null;
  seatsTotal: number;
  seatsAssigned: number;
  seatsNote: string | null;
  chapterName: string; schoolName: string; campusId: string | null; slug: string;
  /** /go/<school>/<chapter>, or null when the chapter has no roster row yet - see goUrlForChapter. */
  url: string | null;
  digestEnabled: boolean; membersJoined: number; setsCompleted: number; activeThisWeek: number;
  /** `id` and `hasSeat` are what make a seat toggle possible per row. */
  roster: Array<{ id: string; name: string; joinedAt: string; setsCompleted: number; hasSeat: boolean }>;
}
export const getChapterDashboard = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ accessToken: z.string().min(10) }).parse(d))
  .handler(async ({ data }): Promise<ChapterDashboard | null> => {
    const db = await admin();
    const ch = await chapterForToken(db, data.accessToken);
    if (!ch) return null;
    const { data: mem } = await db.from("greek_chapter_members").select("id,name,joined_at,sets_completed,seat_assigned_at").eq("chapter_id", ch.id).order("joined_at", { ascending: false });
    const rows = (mem ?? []) as Array<{ id: string; name: string; joined_at: string; sets_completed: number; seat_assigned_at: string | null }>;
    const goUrl = await goUrlForChapter(db, ch);
    // The kit path mirrors the /go/ path exactly — same two segments, different prefix — so a
    // printed flyer and the page it points at can never disagree about which chapter this is.
    const kitPath = goUrl && goUrl.startsWith("/go/") ? `/chapters/kit/${goUrl.slice(4)}` : null;
    const weekAgo = Date.now() - 7 * 864e5;
    return {
      chapterId: ch.id, kitPath,
      seatsTotal: (ch.seats_total as number) ?? 0,
      seatsAssigned: rows.filter((r) => r.seat_assigned_at).length,
      seatsNote: ch.seats_note ?? null,
      chapterName: ch.chapter_name, schoolName: ch.school_name, campusId: ch.campus_id ?? null, slug: ch.slug, url: goUrl,
      digestEnabled: !!ch.digest_enabled,
      membersJoined: rows.length,
      setsCompleted: rows.reduce((a, r) => a + (r.sets_completed ?? 0), 0),
      activeThisWeek: rows.filter((r) => new Date(r.joined_at).getTime() >= weekAgo).length,
      roster: rows.map((r) => ({ id: r.id, name: r.name, joinedAt: r.joined_at, setsCompleted: r.sets_completed ?? 0, hasSeat: !!r.seat_assigned_at })),
    };
  });

export const setChapterDigest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ accessToken: z.string().min(10), enabled: z.boolean() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const db = await admin();
    const ch = await chapterForToken(db, data.accessToken);
    if (!ch) return { ok: false };
    await db.from("greek_chapters").update({ digest_enabled: data.enabled }).eq("id", ch.id);
    return { ok: true };
  });

// ---- ADMIN (Lee's side) — a flat internal list. Surface behind an AdminGate route. Service-role. ----
export interface AdminChapterRow { id: string; slug: string; schoolName: string; chapterName: string; contact: string; email: string; createdAt: string; members: number; needsReview: boolean; status: string }
export const listGreekChaptersAdmin = createServerFn({ method: "GET" }).handler(async (): Promise<AdminChapterRow[]> => {
  const db = await admin();
  const { data: chs } = await db.from("greek_chapters").select("id,slug,school_name,chapter_name,admin_name_role,admin_email,created_at,needs_review,status").order("created_at", { ascending: false }).limit(500);
  const list = (chs ?? []) as Array<Record<string, unknown>>;
  const ids = list.map((c) => c.id as string);
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: mem } = await db.from("greek_chapter_members").select("chapter_id").in("chapter_id", ids);
    for (const m of (mem ?? []) as { chapter_id: string }[]) counts.set(m.chapter_id, (counts.get(m.chapter_id) ?? 0) + 1);
  }
  return list.map((c) => ({ id: c.id as string, slug: c.slug as string, schoolName: c.school_name as string, chapterName: c.chapter_name as string, contact: c.admin_name_role as string, email: c.admin_email as string, createdAt: c.created_at as string, members: counts.get(c.id as string) ?? 0, needsReview: !!c.needs_review, status: c.status as string }));
});
