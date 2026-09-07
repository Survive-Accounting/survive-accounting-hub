// REP NUDGES — server only, run by /api/cron/rep-nudges every hour.
//
//   REMINDERS  A verified applicant who hasn't finished the onboarding gets an email at 24h and
//              at 72h. Two total, then stop (spec §2). Stamped on rep_profile.reminders so a
//              re-run never double-sends.
//   SUMMARY    Lee's daily one-line text — applications received, onboardings finished, reps
//              approved yesterday, and how many are waiting on him. The route gates this to
//              8am Chicago; a quiet day with nobody waiting sends nothing.
//
// Test reps are never nudged and never counted.
import { firstName, dailySummarySms, parseProfile, reminderEmail, type RepProfile } from "@/lib/rep-pre-onboarding";
import { canonicalSchoolName } from "@/lib/schools";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped-table convention
type DB = { from: (t: string) => any };
const adminDb = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

type Row = { id: string; name: string; email: string | null; campus_id: string | null; phone_verified_at: string | null; rep_profile: unknown };

export type NudgeResult = { id: string; which: "h24" | "h72"; status: "sent" | "failed" | "skipped"; error?: string };

export async function runRepReminders(now = new Date(), db?: DB): Promise<NudgeResult[]> {
  const d = db ?? (await adminDb());
  const { data, error } = await d.from("referral_partners")
    .select("id,name,email,campus_id,phone_verified_at,rep_profile")
    .eq("type", "campus_rep").eq("application_status", "setup").eq("is_test", false)
    .not("phone_verified_at", "is", null).limit(500);
  if (error) throw new Error(error.message);
  const out: NudgeResult[] = [];
  const campusNames = new Map<string, string>();
  const { ONBOARDING_URL } = await import("@/lib/rep-review.server");
  const { sendResendEmail } = await import("@/lib/email.server");

  for (const r of (data ?? []) as Row[]) {
    const profile = parseProfile(r.rep_profile);
    const verified = r.phone_verified_at ? new Date(r.phone_verified_at).getTime() : 0;
    if (!verified) continue;
    const age = now.getTime() - verified;
    const which: "h24" | "h72" | null =
      age >= 72 * 3600e3 && !profile.reminders?.h72At ? "h72"
      : age >= 24 * 3600e3 && age < 72 * 3600e3 && !profile.reminders?.h24At ? "h24"
      : null;
    if (!which) continue;
    if (!r.email) { out.push({ id: r.id, which, status: "skipped", error: "no_email" }); continue; }

    let campus = "your campus";
    if (r.campus_id) {
      if (!campusNames.has(r.campus_id)) {
        const { data: c } = await d.from("campuses").select("slug,name,short_name").eq("id", r.campus_id).maybeSingle();
        campusNames.set(r.campus_id, c?.slug ? canonicalSchoolName(c.slug as string, (c.short_name as string) || (c.name as string)) : "your campus");
      }
      campus = campusNames.get(r.campus_id)!;
    }
    const mail = reminderEmail({ firstName: firstName(r.name), campus, url: ONBOARDING_URL, which });
    const res = await sendResendEmail({ to: r.email, subject: mail.subject, text: mail.text });
    // Stamp on success only — a failed provider call gets another try next hour.
    if (res.ok) {
      const next: RepProfile = { ...profile, reminders: { ...(profile.reminders ?? {}), [`${which}At`]: now.toISOString() } };
      await d.from("referral_partners").update({ rep_profile: next }).eq("id", r.id);
    }
    out.push({ id: r.id, which, status: res.ok ? "sent" : "failed", error: res.error });
  }
  return out;
}

/** Yesterday in Chicago: [start, end) as ISO. */
function chicagoYesterday(now: Date): { start: string; end: string } {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  // Midnight today in Chicago, expressed by probing the offset at that instant.
  const todayLocal = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00`);
  const offsetMin = (() => {
    const inChi = new Date(new Date(todayLocal.getTime()).toLocaleString("en-US", { timeZone: "America/Chicago" }));
    return (todayLocal.getTime() - inChi.getTime()) / 60000;
  })();
  const startToday = new Date(todayLocal.getTime() + offsetMin * 60000);
  const startYesterday = new Date(startToday.getTime() - 24 * 3600e3);
  return { start: startYesterday.toISOString(), end: startToday.toISOString() };
}

export async function runRepDailySummary(now = new Date(), db?: DB): Promise<{ sent: boolean; counts: { applications: number; onboarded: number; approved: number; pendingReview: number }; reason?: string }> {
  const d = db ?? (await adminDb());
  const { start, end } = chicagoYesterday(now);
  const countWhere = async (col: string) => {
    const { count } = await d.from("referral_partners").select("id", { count: "exact", head: true })
      .eq("type", "campus_rep").eq("is_test", false).gte(col, start).lt(col, end);
    return count ?? 0;
  };
  const [applications, onboarded, approved] = await Promise.all([countWhere("phone_verified_at"), countWhere("onboarding_submitted_at"), countWhere("approved_at")]);
  const { count: pending } = await d.from("referral_partners").select("id", { count: "exact", head: true })
    .eq("type", "campus_rep").eq("is_test", false).eq("application_status", "submitted");
  const counts = { applications, onboarded, approved, pendingReview: pending ?? 0 };
  if (!applications && !onboarded && !approved && !counts.pendingReview) return { sent: false, counts, reason: "quiet_day" };
  const { textLee } = await import("@/lib/rep-review.server");
  const r = await textLee(dailySummarySms(counts), { isTest: false });
  return { sent: r.ok, counts, reason: r.ok ? undefined : r.reason };
}
