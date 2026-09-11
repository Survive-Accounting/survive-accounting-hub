// THE DAILY PULSE (2026-09-11) — two emails at 7am Central, every day there was activity:
//
//   1. CHAPTERS — one row per chapter that produced activity in the last day: page visits,
//      video starts, watch minutes, minutes on page, average session, link clicks, emails added.
//      Lee: "who is using this, which chapters are spreading it".
//   2. CAMPUSES — the same numbers rolled up per campus, with how many chapters were active.
//
// SERVER-ONLY (service-role Supabase + Resend). Import dynamically inside a server handler.
// Reads learn_events (migration 20260911_2100), campus_waitlist (emails), contact_ref_visit
// (DM-link clicks), greek_chapter_claims (dashboard claims). The window is the previous Chicago
// calendar day, so the 7am email reads "yesterday".

const PULSE_TO = process.env.PULSE_RECIPIENT || "lee@survivestudios.com";

type DB = { from: (t: string) => any };
type AnyRow = Record<string, any>;

export interface PulseRow {
  key: string;
  label: string;
  campus: string;
  visits: number;
  sessions: number;
  videoStarts: number;
  watchMin: number;
  pageMin: number;
  avgSessionMin: number;
  practice: number;
  linkClicks: number;
  emails: number;
  claims: number;
  /** Campus rows only: chapters with activity. */
  chaptersActive?: number;
}

export interface PulseData {
  dayLabel: string;
  windowStart: string;
  windowEnd: string;
  chapters: PulseRow[];
  campuses: PulseRow[];
  missingTable: boolean;
}

/** Midnight-to-midnight of the previous day in Chicago, as UTC instants. */
export function chicagoYesterday(now: Date): { start: Date; end: Date; label: string } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  // Chicago wall-clock "now" → the UTC offset at that moment.
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  const offsetMs = wall - now.getTime();
  const todayMidnightWall = Date.UTC(get("year"), get("month") - 1, get("day"));
  const end = new Date(todayMidnightWall - offsetMs);
  const start = new Date(end.getTime() - 24 * 3600 * 1000);
  const label = start.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "America/Chicago" });
  return { start, end, label };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

async function pageAll(db: DB, table: string, select: string, apply: (q: any) => any): Promise<AnyRow[]> {
  const out: AnyRow[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await apply(db.from(table).select(select)).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as AnyRow[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function gatherPulse(db: DB, now: Date): Promise<PulseData> {
  const { start, end, label } = chicagoYesterday(now);
  const s = start.toISOString(), e = end.toISOString();

  let events: AnyRow[] = [];
  let missingTable = false;
  try {
    events = await pageAll(db, "learn_events", "campus_id,campus_slug,chapter_slug,session_id,anon_id,kind,seconds,is_test", (q) => q.gte("created_at", s).lt("created_at", e).eq("is_test", false));
  } catch (err) {
    if (/learn_events/.test((err as Error).message)) missingTable = true; else throw err;
  }
  const [emails, visits, claims, campusRows] = await Promise.all([
    pageAll(db, "campus_waitlist", "email,campus_id,chapter,is_test", (q) => q.gte("created_at", s).lt("created_at", e).eq("is_test", false).not("email", "is", null)),
    pageAll(db, "contact_ref_visit", "campus_id,path,is_bot", (q) => q.gte("created_at", s).lt("created_at", e).eq("is_bot", false)),
    pageAll(db, "greek_chapter_claims", "campus_greek_chapter_id", (q) => q.gte("created_at", s).lt("created_at", e)).catch(() => [] as AnyRow[]),
    pageAll(db, "campuses", "id,name,short_name,slug", (q) => q),
  ]);
  const campusName = new Map<string, string>(campusRows.map((c) => [c.id, (c.short_name as string) || (c.name as string)]));
  const campusSlugOf = new Map<string, string>(campusRows.map((c) => [c.id, c.slug as string]));
  const campusIdOfSlug = new Map<string, string>(campusRows.map((c) => [c.slug as string, c.id as string]));

  // Chapter names for the rows that need them (claims reference the chapter id; events the slug).
  const claimChapterIds = Array.from(new Set(claims.map((c) => c.campus_greek_chapter_id).filter(Boolean)));
  const chapterRows = claimChapterIds.length
    ? ((await db.from("campus_greek_chapters").select("id,campus_id,slug").in("id", claimChapterIds)).data ?? []) as AnyRow[]
    : [];
  const chapterOfClaim = new Map<string, { campusId: string; slug: string }>(chapterRows.map((c) => [c.id, { campusId: c.campus_id, slug: c.slug }]));

  type Acc = { sessions: Set<string>; visits: number; videoStarts: number; watchSec: number; pageSec: number; practice: number; linkClicks: number; emails: Set<string>; claims: number; chapters: Set<string>; campusId: string | null };
  const blank = (campusId: string | null): Acc => ({ sessions: new Set(), visits: 0, videoStarts: 0, watchSec: 0, pageSec: 0, practice: 0, linkClicks: 0, emails: new Set(), claims: 0, chapters: new Set(), campusId });
  const byChapter = new Map<string, Acc>();   // "<campusId>/<chapterSlug>"
  const byCampus = new Map<string, Acc>();    // campusId
  const campusOf = (ev: AnyRow): string | null => (ev.campus_id as string | null) ?? (ev.campus_slug ? campusIdOfSlug.get(ev.campus_slug) ?? null : null);
  const acc = (m: Map<string, Acc>, key: string, campusId: string | null) => { let a = m.get(key); if (!a) { a = blank(campusId); m.set(key, a); } return a; };

  for (const ev of events) {
    const cid = campusOf(ev);
    if (!cid) continue;
    const targets = [acc(byCampus, cid, cid)];
    if (ev.chapter_slug) { const a = acc(byChapter, `${cid}/${ev.chapter_slug}`, cid); targets.push(a); acc(byCampus, cid, cid).chapters.add(ev.chapter_slug); }
    for (const a of targets) {
      const sess = (ev.session_id as string | null) ?? (ev.anon_id as string | null);
      if (sess) a.sessions.add(sess);
      if (ev.kind === "page_visit") a.visits++;
      else if (ev.kind === "video_start") a.videoStarts++;
      else if (ev.kind === "watch_time") a.watchSec += Number(ev.seconds ?? 0);
      else if (ev.kind === "page_time") a.pageSec += Number(ev.seconds ?? 0);
      else if (ev.kind === "practice_answer") a.practice++;
    }
  }
  for (const w of emails) {
    const cid = w.campus_id as string | null;
    if (!cid) continue;
    const em = String(w.email).toLowerCase();
    acc(byCampus, cid, cid).emails.add(em);
    if (w.chapter) { const a = acc(byChapter, `${cid}/${w.chapter}`, cid); a.emails.add(em); acc(byCampus, cid, cid).chapters.add(String(w.chapter)); }
  }
  for (const v of visits) {
    const cid = v.campus_id as string | null;
    if (!cid) continue;
    acc(byCampus, cid, cid).linkClicks++;
    const m = /^\/(?:go|s)\/[^/]+\/([^/?]+)/.exec(String(v.path ?? ""));
    if (m && m[1] !== "council") { acc(byChapter, `${cid}/${m[1]}`, cid).linkClicks++; acc(byCampus, cid, cid).chapters.add(m[1]); }
  }
  for (const c of claims) {
    const ch = chapterOfClaim.get(c.campus_greek_chapter_id);
    if (!ch) continue;
    acc(byCampus, ch.campusId, ch.campusId).claims++;
    acc(byChapter, `${ch.campusId}/${ch.slug}`, ch.campusId).claims++;
    acc(byCampus, ch.campusId, ch.campusId).chapters.add(ch.slug);
  }

  const toRow = (key: string, label: string, a: Acc): PulseRow => ({
    key, label, campus: a.campusId ? (campusName.get(a.campusId) ?? campusSlugOf.get(a.campusId) ?? "?") : "?",
    visits: a.visits, sessions: a.sessions.size, videoStarts: a.videoStarts,
    watchMin: r1(a.watchSec / 60), pageMin: r1(a.pageSec / 60),
    avgSessionMin: a.sessions.size ? r1(a.pageSec / 60 / a.sessions.size) : 0,
    practice: a.practice, linkClicks: a.linkClicks, emails: a.emails.size, claims: a.claims,
  });
  const pretty = (slug: string) => slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const chapters = [...byChapter.entries()].map(([k, a]) => toRow(k, pretty(k.split("/")[1] ?? k), a))
    .sort((x, y) => (y.watchMin + y.visits) - (x.watchMin + x.visits));
  const campuses = [...byCampus.entries()].map(([k, a]) => ({ ...toRow(k, campusName.get(k) ?? k, a), chaptersActive: a.chapters.size }))
    .sort((x, y) => (y.watchMin + y.visits) - (x.watchMin + x.visits));

  return { dayLabel: label, windowStart: s, windowEnd: e, chapters, campuses, missingTable };
}

// ── rendering ─────────────────────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

function table(rows: PulseRow[], first: string, extra?: (r: PulseRow) => string): string {
  const th = (t: string, right = true) => `<th style="padding:8px 10px;text-align:${right ? "right" : "left"};font-weight:600;white-space:nowrap;">${t}</th>`;
  const td = (v: string | number, right = true, bold = false) => `<td style="padding:7px 10px;text-align:${right ? "right" : "left"};font-variant-numeric:tabular-nums;${bold ? "font-weight:600;" : ""}border-top:1px solid #eee;">${typeof v === "number" ? v : esc(v)}</td>`;
  const body = rows.map((r) => `<tr>${td(r.label, false, true)}${extra ? td(extra(r), false) : ""}${td(r.visits)}${td(r.videoStarts)}${td(r.watchMin)}${td(r.pageMin)}${td(r.avgSessionMin)}${td(r.practice)}${td(r.linkClicks)}${td(r.emails)}${td(r.claims)}</tr>`).join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:8px;overflow:hidden;font-size:13px;">
    <thead><tr style="background:#0b1f3a;color:#fff;">${th(first, false)}${extra ? th("", false) : ""}${th("Visits")}${th("Video starts")}${th("Watch min")}${th("Page min")}${th("Avg session")}${th("Practice")}${th("Link clicks")}${th("Emails")}${th("Claims")}</tr></thead>
    <tbody>${body}</tbody></table>`;
}

export function renderPulseHtml(d: PulseData, which: "chapters" | "campuses"): string {
  const rows = which === "chapters" ? d.chapters : d.campuses;
  const title = which === "chapters" ? "Chapter pulse" : "Campus pulse";
  const note = d.missingTable ? `<p style="color:#b3261e;font-size:13px;">learn_events is not there yet — run migration 20260911_2100_learn_events.sql. Emails, link clicks and claims below are real; visits and watch time are blank until then.</p>` : "";
  const body = rows.length
    ? (which === "chapters" ? table(rows, "Chapter", (r) => r.campus) : table(rows.map((r) => ({ ...r })), "Campus", (r) => `${r.chaptersActive ?? 0} chapter${r.chaptersActive === 1 ? "" : "s"} active`))
    : `<p style="font-size:14px;color:#666;">Nothing moved yesterday.</p>`;
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:760px;margin:0 auto;color:#1a1a1a;">
    <h2 style="margin:0 0 2px;font-size:18px;">${title}</h2>
    <p style="margin:0 0 14px;color:#666;font-size:13px;">${esc(d.dayLabel)} · Survive Accounting</p>
    ${note}${body}
    <p style="margin:14px 0 0;color:#999;font-size:12px;">Visits = /learn page loads. Watch min = seconds actually played, any play. Page min = time the tab was visible. Avg session = page minutes per session. Emails = distinct emails added. Sent daily, 7am Central.</p>
  </div>`;
}

export function renderPulseText(d: PulseData, which: "chapters" | "campuses"): string {
  const rows = which === "chapters" ? d.chapters : d.campuses;
  const lines = rows.map((r) => `- ${r.label}${which === "chapters" ? ` (${r.campus})` : ` (${r.chaptersActive ?? 0} chapters active)`}: ${r.visits} visits · ${r.videoStarts} video starts · ${r.watchMin} watch min · ${r.pageMin} page min · avg session ${r.avgSessionMin} min · ${r.linkClicks} link clicks · ${r.emails} emails · ${r.claims} claims`);
  return `${which === "chapters" ? "Chapter" : "Campus"} pulse — ${d.dayLabel}\n\n${lines.length ? lines.join("\n") : "Nothing moved yesterday."}${d.missingTable ? "\n\nlearn_events is missing — run migration 20260911_2100_learn_events.sql." : ""}`;
}

export interface PulseResult { ok: boolean; sent: number; skipped?: string; errors?: string[]; data?: PulseData }

/** Send both emails. Chapter email only when a chapter moved; campus email only when a campus did. */
export async function sendDailyPulse(opts: { now?: Date; dryRun?: boolean } = {}): Promise<PulseResult> {
  const now = opts.now ?? new Date();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as DB;
  const data = await gatherPulse(db, now);
  if (opts.dryRun) return { ok: true, sent: 0, skipped: "dryRun", data };
  const { sendResendEmail } = await import("@/lib/email.server");
  const errors: string[] = [];
  let sent = 0;
  for (const which of ["chapters", "campuses"] as const) {
    const rows = which === "chapters" ? data.chapters : data.campuses;
    if (!rows.length && !data.missingTable) continue;
    const res = await sendResendEmail({
      to: PULSE_TO,
      subject: `${which === "chapters" ? "Chapter" : "Campus"} pulse — ${data.dayLabel}${rows.length ? ` · ${rows.length} ${which === "chapters" ? "chapter" : "campus"}${rows.length === 1 ? "" : which === "chapters" ? "s" : "es"}` : ""}`,
      text: renderPulseText(data, which),
      html: renderPulseHtml(data, which),
    });
    if (res.ok) sent++; else errors.push(`${which}: ${res.error ?? "send failed"}`);
  }
  return { ok: errors.length === 0, sent, errors: errors.length ? errors : undefined, data };
}
