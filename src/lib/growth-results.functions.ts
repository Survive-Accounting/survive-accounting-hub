// GROWTH RESULTS — the honest scoreboard.
//
// REVENUE MODEL (Aug 2026, after special orders were retired):
//   1. A chapter buys SEATS      → chapter_seat_pools (paid) → chapter_seat_assignments (claimed)
//   2. A student buys ONE EXAM   → student_entitlements, source 'stripe'
//   3. Later: a $150 SEMESTER PASS — modelled here so it lights up the day it ships
// The deprecated made_to_order flow is NOT counted anywhere; those rows are dead data.
//
// SEATS ARE TWO NUMBERS, NEVER ONE. Bought is the money; claimed is whether the chapter
// actually got it into members' hands. A pool of 40 with 3 claimed is a support problem the
// revenue figure alone would hide.
//
// EMAILS SENT means a provider accepted it — a row with a message_id. The legacy manual-log
// page writes status='sent' with no message_id and no address; counting those told us 4
// emails had gone out when nothing had. Never trust status alone.
//
// LAW: ships to the client bundle — service-role client + admin gate imported dynamically.
import { createServerFn } from "@tanstack/react-start";
import { isTestRow } from "@/lib/growth-testdata";

type DB = { from: (t: string) => any };

const adminDb = async (): Promise<DB> => {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

export const SEMESTER_PASS_CENTS = 15000;

export interface GrowthResults {
  today: { emailsSent: number; emailTarget: number; dms: number; dmTarget: number };
  seats: { pools: number; bought: number; claimed: number; revenueCents: number };
  individual: { examPurchases: number; passPurchases: number; revenueCents: number };
  students: { identified: number; paid: number; questionsAnswered: number; waitlist: number };
  greek: { activeChapters: number; claimedChapters: number; campusesWithChapters: number };
  reach: { eligibleContacts: number; campusesContactable: number; campusesContacted: number };
}

export const growthResults = createServerFn({ method: "GET" }).handler(
  async (): Promise<GrowthResults> => {
    const db = await adminDb();
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);

    const [pools, assignments, ents, attempts, waitlist, chapters, claims, elig, events, settings] =
      await Promise.all([
        db.from("chapter_seat_pools").select("id,seats_total,amount_cents,status,is_test"),
        db.from("chapter_seat_assignments").select("id,released_at,is_test"),
        db
          .from("student_entitlements")
          .select("id,user_id,kind,source,is_test")
          .is("revoked_at", null),
        db.from("practice_attempts").select("id,user_id,is_test"),
        db.from("campus_waitlist").select("id,email,is_test"),
        db.from("campus_greek_chapters").select("id,campus_id").is("archived_at", null),
        db.from("greek_chapter_claims").select("id,email,status"),
        db.from("growth_outreach_eligibility").select("campus_id,email,outreach_eligible"),
        db
          .from("growth_outreach_events")
          .select("campus_id,channel,direction,message_id,occurred_at"),
        db.from("site_settings").select("settings").limit(1).maybeSingle(),
      ]);

    const livePools = ((pools.data ?? []) as any[]).filter(
      (p) => !p.is_test && p.status !== "cancelled",
    );
    const liveAssignments = ((assignments.data ?? []) as any[]).filter(
      (a) => !a.is_test && !a.released_at,
    );
    const liveEnts = ((ents.data ?? []) as any[]).filter((e) => !e.is_test);
    const paidEnts = liveEnts.filter((e) => e.source === "stripe");
    const passPurchases = paidEnts.filter((e) =>
      /pass|semester/i.test(String(e.kind ?? "")),
    ).length;
    const examPurchases = paidEnts.length - passPurchases;

    const liveAttempts = ((attempts.data ?? []) as any[]).filter((a) => !a.is_test);
    const identified = new Set(
      [...liveAttempts.map((a) => a.user_id), ...liveEnts.map((e) => e.user_id)].filter(Boolean),
    ).size;

    const targets = {
      email: 100,
      instagram: 20,
      ...((settings.data?.settings as any)?.growthDailyTargets ?? {}),
    };
    const evs = (events.data ?? []) as any[];
    const sentToday = evs.filter(
      (e) =>
        e.channel === "email" &&
        e.direction === "outbound" &&
        e.message_id && // proof a provider accepted it
        e.occurred_at &&
        new Date(e.occurred_at) >= midnight,
    ).length;
    const dmsToday = evs.filter(
      (e) =>
        e.channel === "ig_dm" &&
        e.direction === "outbound" &&
        e.occurred_at &&
        new Date(e.occurred_at) >= midnight,
    ).length;

    const eligRows = (elig.data ?? []) as any[];
    const contactableCampuses = new Set(
      eligRows.filter((e) => e.outreach_eligible && e.email && e.campus_id).map((e) => e.campus_id),
    );
    const contactedCampuses = new Set(
      evs.filter((e) => e.direction === "outbound" && e.campus_id).map((e) => e.campus_id),
    );

    return {
      today: {
        emailsSent: sentToday,
        emailTarget: targets.email,
        dms: dmsToday,
        dmTarget: targets.instagram,
      },
      seats: {
        pools: livePools.length,
        bought: livePools.reduce((n, p) => n + (p.seats_total ?? 0), 0),
        claimed: liveAssignments.length,
        revenueCents: livePools
          .filter((p) => p.status === "active" || p.status === "paid")
          .reduce((n, p) => n + (p.amount_cents ?? 0), 0),
      },
      individual: {
        examPurchases,
        passPurchases,
        // Exam price varies by product; the pass is fixed. Only the pass can be valued
        // reliably from this table, so exam revenue is left to Stripe rather than guessed.
        revenueCents: passPurchases * SEMESTER_PASS_CENTS,
      },
      students: {
        identified,
        paid: new Set(paidEnts.map((e) => e.user_id).filter(Boolean)).size,
        questionsAnswered: liveAttempts.length,
        waitlist: ((waitlist.data ?? []) as any[]).filter((w) => !isTestRow(w)).length,
      },
      greek: {
        activeChapters: ((chapters.data ?? []) as any[]).length,
        claimedChapters: ((claims.data ?? []) as any[]).filter(
          (c) => !isTestRow(c) && (c.status === "approved" || c.status === "pending"),
        ).length,
        campusesWithChapters: new Set(
          ((chapters.data ?? []) as any[]).map((c) => c.campus_id).filter(Boolean),
        ).size,
      },
      reach: {
        eligibleContacts: eligRows.filter((e) => e.outreach_eligible && e.email).length,
        campusesContactable: contactableCampuses.size,
        campusesContacted: contactedCampuses.size,
      },
    };
  },
);
