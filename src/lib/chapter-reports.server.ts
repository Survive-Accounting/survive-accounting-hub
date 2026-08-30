// SIGNUP REPORT EMAILS (K5, 2026-08-29) — the two emails a claimed chapter can receive.
//
//   SURGE   — "12 people from ΑΔΧ just signed up". Fires when real signups attributed to this
//             chapter cross a threshold inside a rolling window. At most one per chapter per 24h.
//   WEEKLY  — a Sunday digest for chapters that actually did something. NEVER sent for a week
//             with no activity: a zero report is a reminder that nothing happened, sent by us.
//
// ── THREE HARD RULES ─────────────────────────────────────────────────────────────────────────
//
// 1. EVERY NUMBER IS COUNTED AT SEND TIME FROM REAL ROWS. No projections, no minimums, no
//    "at least", no urgency we manufactured. If the count is 3, the subject line says 3.
// 2. ONE SEND PER (chapter, kind, period). chapter_report_sends is the dedupe key — a unique
//    index makes a double-send a database error rather than a second email.
// 3. IT CANNOT SEND UNTIL LEE TURNS IT ON. CHAPTER_REPORTS_ENABLED=1 is the switch; without it
//    every run is a DRY RUN that computes and logs exactly what it would have sent and mails
//    nobody. Automated outbound email to real chapter execs is not something to enable by
//    merging a branch.
//
// The migration (20260829_0900) is manual-apply. Without it the send log does not exist, and
// this module refuses to send rather than sending without dedupe — see `ensureLog`.
import { goPath } from "@/lib/greek-go.functions";

type DB = { from: (t: string) => any };
const admin = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

/** THE SWITCH. Anything other than "1" means dry run — compute, log, send nothing. */
export const reportsEnabled = (): boolean => process.env.CHAPTER_REPORTS_ENABLED === "1";

/** Surge threshold: this many signups inside the window trips one email. */
export const SURGE_MIN = 5;
export const SURGE_WINDOW_MIN = 60;

export type ReportKind = "surge" | "weekly";

export interface ReportOutcome {
  chapterId: string;
  chapterName: string;
  kind: ReportKind;
  signups: number;
  /** Where those signups came from, biggest first — only stamps that actually occurred. */
  sources: Array<{ via: string; n: number }>;
  to: string | null;
  status: "sent" | "dry_run" | "skipped_duplicate" | "skipped_no_activity" | "skipped_no_recipient" | "failed";
  reason?: string;
}

/** The send log must exist before anything is sent — it IS the dedupe. A missing table means the
 *  migration has not been applied, and we fail loudly instead of emailing without protection. */
async function ensureLog(db: DB): Promise<boolean> {
  const { error } = await db.from("chapter_report_sends").select("id").limit(1);
  if (error) {
    console.error(
      "[chapter-reports] chapter_report_sends is unavailable — migration 20260829_0900 has not been applied. " +
      "Refusing to send: without the log there is no duplicate protection.",
      error.message,
    );
    return false;
  }
  return true;
}

/** Already told this chapter about this period? */
async function alreadyReported(db: DB, chapterId: string, kind: ReportKind, periodKey: string): Promise<boolean> {
  const { data } = await db.from("chapter_report_sends")
    .select("id").eq("campus_greek_chapter_id", chapterId).eq("kind", kind).eq("period_key", periodKey).limit(1);
  return !!(data ?? []).length;
}

/** A surge is capped at one per chapter per 24h regardless of period key. */
async function surgedRecently(db: DB, chapterId: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 3600e3).toISOString();
  const { data } = await db.from("chapter_report_sends")
    .select("id").eq("campus_greek_chapter_id", chapterId).eq("kind", "surge").gte("created_at", since).limit(1);
  return !!(data ?? []).length;
}

/** ISO week key ("2026-W35") — the weekly digest's period. */
export function weekKey(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((t.getTime() - yearStart.getTime()) / 864e5) + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** The via-source split, in plain English, from stamps that actually occurred. Returns null when
 *  nothing is attributable — we then say nothing about sources rather than guessing. */
export function sourceLine(sources: Array<{ via: string; n: number }>): string | null {
  const known = sources.filter((s) => s.n > 0);
  if (!known.length) return null;
  const label: Record<string, string> = {
    groupme: "your GroupMe link", text: "texts", link: "the chapter link",
    flyer: "the flyer QR", slide: "the meeting slide", campaign: "your council's email",
  };
  const top = known[0]!;
  const name = label[top.via] ?? top.via;
  const total = known.reduce((a, s) => a + s.n, 0);
  if (known.length === 1) return `All of them came from ${name}.`;
  return top.n / total >= 0.6 ? `Mostly from ${name}.` : `Most from ${name}, the rest spread across your other links.`;
}

// ── WHAT THE NUMBERS ARE, EXACTLY ─────────────────────────────────────────────────────────────
//
// SIGNUPS are rows in greek_chapter_members for this chapter, created inside the window. That is
// a real person who joined, not a visit and not a projection.
//
// THE SOURCE SPLIT is computed from the chapter's stamped VISITS in the same window
// (expand_events "greek_visit:<school>/<chapter>?via=<stamp>"). It answers "where did the traffic
// come from", which is not the same as "which link each signup used" — we do not record a stamp
// on the member row. So the email says "Mostly from your GroupMe link", describing arrivals, and
// never claims a per-signup attribution it does not have.
async function countSignups(db: DB, shellChapterId: string, sinceIso: string): Promise<number> {
  const { count } = await db.from("greek_chapter_members")
    .select("*", { count: "exact", head: true }).eq("chapter_id", shellChapterId).gte("joined_at", sinceIso);
  return count ?? 0;
}

async function visitSources(db: DB, schoolSlug: string, chapterSlug: string, sinceIso: string): Promise<Array<{ via: string; n: number }>> {
  const prefix = `greek_visit:${schoolSlug}/${chapterSlug}`;
  const { data } = await db.from("expand_events")
    .select("event").like("event", `${prefix}%`).gte("created_at", sinceIso).limit(1000);
  const tally = new Map<string, number>();
  for (const r of (data ?? []) as Array<{ event: string }>) {
    const m = r.event.match(/\?via=([a-z]+)$/);
    if (!m) continue; // an unstamped visit tells us nothing about source; it is not a bucket
    tally.set(m[1]!, (tally.get(m[1]!) ?? 0) + 1);
  }
  return [...tally.entries()].map(([via, n]) => ({ via, n })).sort((a, b) => b.n - a.n);
}

/** The chapters that may receive a report: claimed, with a claimant email and a shell row. */
async function reportableChapters(db: DB): Promise<Array<{
  rosterId: string; shellId: string; chapterName: string; schoolSlug: string; chapterSlug: string; to: string;
}>> {
  const { data: claims } = await db.from("greek_chapter_claims")
    .select("campus_greek_chapter_id,email,status").eq("status", "approved").limit(500);
  const out: Array<{ rosterId: string; shellId: string; chapterName: string; schoolSlug: string; chapterSlug: string; to: string }> = [];
  for (const c of (claims ?? []) as Array<{ campus_greek_chapter_id: string; email: string }>) {
    const { data: roster } = await db.from("campus_greek_chapters")
      .select("id,slug,campus_id,greek_org_id").eq("id", c.campus_greek_chapter_id).maybeSingle();
    if (!roster?.id) continue;
    const { data: shell } = await db.from("greek_chapters").select("id").eq("campus_greek_chapter_id", roster.id).maybeSingle();
    if (!shell?.id) continue; // no shell = nobody has joined = nothing to report
    const { data: campus } = await db.from("campuses").select("slug").eq("id", roster.campus_id).maybeSingle();
    const { data: org } = roster.greek_org_id
      ? await db.from("greek_orgs").select("name").eq("id", roster.greek_org_id).maybeSingle()
      : { data: null };
    if (!campus?.slug) continue;
    out.push({
      rosterId: roster.id as string, shellId: shell.id as string,
      chapterName: ((org?.name ?? "") as string).trim() || "your chapter",
      schoolSlug: campus.slug as string, chapterSlug: roster.slug as string, to: c.email,
    });
  }
  return out;
}

/** Render + send one report. Honours the dry-run switch and writes the dedupe row on success. */
async function deliver(db: DB, r: {
  rosterId: string; chapterName: string; schoolSlug: string; chapterSlug: string; to: string;
  kind: ReportKind; periodKey: string; signups: number; newThisWeek?: number; sources: Array<{ via: string; n: number }>;
}): Promise<ReportOutcome> {
  const base: ReportOutcome = {
    chapterId: r.rosterId, chapterName: r.chapterName, kind: r.kind,
    signups: r.signups, sources: r.sources, to: r.to, status: "dry_run",
  };
  const dashUrl = `https://surviveaccounting.com${goPath(r.schoolSlug, r.chapterSlug)}?claim=1`;
  const split = sourceLine(r.sources);

  const subject = r.kind === "surge"
    ? `${r.signups} people from ${r.chapterName} just signed up`
    : `${r.chapterName} this week: ${r.newThisWeek ?? r.signups} new`;

  const body = r.kind === "surge"
    ? [
        `<p><b>${r.signups}</b> people from ${r.chapterName} signed up in the last hour.</p>`,
        split ? `<p>${split}</p>` : "",
        `<p>That is the link doing its job.</p>`,
        `<p><a href="${dashUrl}">See the dashboard →</a></p>`,
      ].join("")
    : [
        `<p>${r.chapterName} this week: <b>${r.newThisWeek ?? 0}</b> new, <b>${r.signups}</b> signed up in total.</p>`,
        split ? `<p>${split}</p>` : "",
        `<p><a href="${dashUrl}">See the dashboard →</a></p>`,
      ].join("");

  if (!reportsEnabled()) {
    console.info(`[chapter-reports] DRY RUN — would send ${r.kind} to ${r.to}: "${subject}"`);
    return base;
  }

  try {
    // Unsubscribe comes from the shared comms helper, so a chapter exec who opts out of these
    // is opted out everywhere rather than only here.
    const { contactLinks } = await import("@/lib/comms/send.server");
    const { unsubscribeLink } = await contactLinks(db, r.to).catch(() => ({ unsubscribeLink: "" }));
    const { sendResendEmail } = await import("@/lib/email.server");
    const html = unsubscribeLink
      ? `${body}<p style="font-size:12px;color:#8B97BD">You get these because you claimed ${r.chapterName}. <a href="${unsubscribeLink}">Unsubscribe</a>.</p>`
      : body;
    const sent = await sendResendEmail({ to: r.to, subject, text: subject, html });
    if (!sent.ok) return { ...base, status: "failed", reason: sent.error };

    // The log row is what stops a second send. Written only after a real send.
    await db.from("chapter_report_sends").insert({
      campus_greek_chapter_id: r.rosterId, kind: r.kind, period_key: r.periodKey,
      signups: r.signups, sent_to: r.to,
    });
    return { ...base, status: "sent" };
  } catch (e) {
    return { ...base, status: "failed", reason: e instanceof Error ? e.message : String(e) };
  }
}

// ── THE TWO RUNS ──────────────────────────────────────────────────────────────────────────────

/** SURGE. Called often (a short cron). Finds chapters whose signups crossed SURGE_MIN inside the
 *  last SURGE_WINDOW_MIN, and tells each one once. */
export async function runSurgeReports(): Promise<ReportOutcome[]> {
  const db = await admin();
  if (!(await ensureLog(db))) return [];
  const sinceIso = new Date(Date.now() - SURGE_WINDOW_MIN * 60e3).toISOString();
  // The period key is the window's hour, so two runs inside the same hour cannot both fire.
  const periodKey = `surge:${sinceIso.slice(0, 13)}`;
  const out: ReportOutcome[] = [];

  for (const c of await reportableChapters(db)) {
    const signups = await countSignups(db, c.shellId, sinceIso);
    if (signups < SURGE_MIN) continue;
    if (await surgedRecently(db, c.rosterId)) {
      out.push({ chapterId: c.rosterId, chapterName: c.chapterName, kind: "surge", signups, sources: [], to: c.to, status: "skipped_duplicate", reason: "24h cap" });
      continue;
    }
    if (await alreadyReported(db, c.rosterId, "surge", periodKey)) {
      out.push({ chapterId: c.rosterId, chapterName: c.chapterName, kind: "surge", signups, sources: [], to: c.to, status: "skipped_duplicate", reason: "same window" });
      continue;
    }
    const sources = await visitSources(db, c.schoolSlug, c.chapterSlug, sinceIso);
    out.push(await deliver(db, { ...c, kind: "surge", periodKey, signups, sources }));
  }
  return out;
}

/** WEEKLY. NO ACTIVITY MEANS NO EMAIL — a zero report is a weekly reminder that nothing happened,
 *  which is the opposite of the job. */
export async function runWeeklyChapterReports(): Promise<ReportOutcome[]> {
  const db = await admin();
  if (!(await ensureLog(db))) return [];
  const weekIso = new Date(Date.now() - 7 * 864e5).toISOString();
  const periodKey = weekKey();
  const out: ReportOutcome[] = [];

  for (const c of await reportableChapters(db)) {
    const newThisWeek = await countSignups(db, c.shellId, weekIso);
    if (newThisWeek === 0) {
      out.push({ chapterId: c.rosterId, chapterName: c.chapterName, kind: "weekly", signups: 0, sources: [], to: c.to, status: "skipped_no_activity" });
      continue;
    }
    if (await alreadyReported(db, c.rosterId, "weekly", periodKey)) {
      out.push({ chapterId: c.rosterId, chapterName: c.chapterName, kind: "weekly", signups: newThisWeek, sources: [], to: c.to, status: "skipped_duplicate", reason: "week already sent" });
      continue;
    }
    const total = await countSignups(db, c.shellId, new Date(0).toISOString());
    const sources = await visitSources(db, c.schoolSlug, c.chapterSlug, weekIso);
    out.push(await deliver(db, { ...c, kind: "weekly", periodKey, signups: total, newThisWeek, sources }));
  }
  return out;
}
