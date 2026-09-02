// GROWTH V2 METRICS — per-campus campaign numbers for the /admin/growth/v2 feed.
//
// One pass over the shared tables, keyed by campus. Only the numbers we can honestly source today:
// DMs sent (growth_ig_dm), link clicks (contact_ref_visit), free / paid students
// (student_entitlements by source), emails sent (outreach_touch), reps hired (referral_partners),
// and paid chapters (chapter_seat_pools). Pageviews, MCQs answered, watch hours, and
// active-chapters stay "coming soon" until their telemetry is wired — the page renders them greyed.
import { createServerFn } from "@tanstack/react-start";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped-table convention
type DB = { from: (t: string) => any };
const admin = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

async function pageAll<T>(run: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await run(from, from + 999);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export interface V2Metrics {
  dmsSent: number;
  linkClicks: number;
  freeStudents: number;
  paidStudents: number;
  emailsSent: number;
  repsHired: number;
  paidChapters: number;
}
export type V2MetricsRow = V2Metrics & { campusId: string };

const zero = (): V2Metrics => ({ dmsSent: 0, linkClicks: 0, freeStudents: 0, paidStudents: 0, emailsSent: 0, repsHired: 0, paidChapters: 0 });

export const growthV2Metrics = createServerFn({ method: "GET" }).handler(async (): Promise<V2MetricsRow[]> => {
  await import("@/lib/admin-session.functions").then((m) => m.assertAdmin?.()).catch(() => undefined);
  const db = await admin();

  const [dms, visits, ents, touches, reps, pools, chapters] = await Promise.all([
    pageAll<{ campus_id: string | null; sent_at: string | null }>((f, t) => db.from("growth_ig_dm").select("campus_id,sent_at").range(f, t)),
    pageAll<{ campus_id: string | null; is_bot: boolean }>((f, t) => db.from("contact_ref_visit").select("campus_id,is_bot").range(f, t)),
    pageAll<{ campus_id: string | null; user_id: string | null; source: string | null }>((f, t) => db.from("student_entitlements").select("campus_id,user_id,source").is("revoked_at", null).not("is_test", "is", true).range(f, t)),
    pageAll<{ campus_id: string | null; source_channel: string | null; sent_at: string | null }>((f, t) => db.from("outreach_touch").select("campus_id,source_channel,sent_at").range(f, t)),
    pageAll<{ campus_id: string | null; type: string | null }>((f, t) => db.from("referral_partners").select("campus_id,type").eq("type", "campus_rep").range(f, t)),
    pageAll<{ chapter_id: string | null }>((f, t) => db.from("chapter_seat_pools").select("chapter_id").not("is_test", "is", true).range(f, t)),
    pageAll<{ id: string; campus_id: string | null }>((f, t) => db.from("campus_greek_chapters").select("id,campus_id").is("archived_at", null).range(f, t)),
  ]);

  const m = new Map<string, V2Metrics>();
  const get = (id: string | null | undefined): V2Metrics | null => (id ? (m.get(id) ?? m.set(id, zero()).get(id)!) : null);

  for (const d of dms) if (d.sent_at) get(d.campus_id) && (get(d.campus_id)!.dmsSent++);
  for (const v of visits) if (!v.is_bot) get(v.campus_id) && (get(v.campus_id)!.linkClicks++);
  for (const t of touches) if (t.source_channel === "email" && t.sent_at) get(t.campus_id) && (get(t.campus_id)!.emailsSent++);
  for (const r of reps) get(r.campus_id) && (get(r.campus_id)!.repsHired++);

  // Free / paid students — distinct users per campus; paid = has a stripe entitlement, free = the rest.
  const entUsers = new Map<string, Set<string>>();
  const paidUsers = new Map<string, Set<string>>();
  for (const e of ents) {
    if (!e.campus_id || !e.user_id) continue;
    (entUsers.get(e.campus_id) ?? entUsers.set(e.campus_id, new Set()).get(e.campus_id)!).add(e.user_id);
    if (e.source === "stripe") (paidUsers.get(e.campus_id) ?? paidUsers.set(e.campus_id, new Set()).get(e.campus_id)!).add(e.user_id);
  }
  for (const [id, users] of entUsers) {
    const paid = paidUsers.get(id)?.size ?? 0;
    const r = get(id)!;
    r.paidStudents = paid;
    r.freeStudents = users.size - paid;
  }

  // Paid chapters — distinct chapters that bought seats, mapped chapter → campus.
  const campusOfChapter = new Map<string, string>();
  for (const ch of chapters) if (ch.id && ch.campus_id) campusOfChapter.set(ch.id, ch.campus_id);
  const paidChapterSet = new Map<string, Set<string>>();
  for (const p of pools) {
    const cid = p.chapter_id ? campusOfChapter.get(p.chapter_id) : undefined;
    if (!cid || !p.chapter_id) continue;
    (paidChapterSet.get(cid) ?? paidChapterSet.set(cid, new Set()).get(cid)!).add(p.chapter_id);
  }
  for (const [id, set] of paidChapterSet) get(id)!.paidChapters = set.size;

  return [...m.entries()].map(([campusId, v]) => ({ campusId, ...v }));
});
