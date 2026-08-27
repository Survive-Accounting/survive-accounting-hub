// GROWTH COMPENSATION — server functions behind King's HQ.
//
// growthCompSummary reads the same ledgers the Attribution Guide describes and
// returns the bucketed money: referral conversions classified by partner, untracked
// seat purchases classified by prior campaign touch, everything else organic. The
// pure rules live in growth-comp-core.ts (tested against the contract's own worked
// example); this file only fetches rows and applies them.
//
// kingDocUrl hands out short-lived signed URLs for the contract + attribution guide
// (private storage bucket `internal-docs` — never public paths).
//
// kingDigest composes/sends the plain-text email King gets. Sending goes through
// sendResendEmail; the cron route only fires it when something actually happened.
//
// LAW: ships to the client bundle — service-role client + admin gate imported
// dynamically inside handlers only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  buildCompSummary,
  classifyPartner,
  classifyUntracked,
  fmtUsd,
  SEMESTER,
  type Bucket,
  type CompSummary,
} from "@/lib/growth-comp-core";

type DB = { from: (t: string) => any; storage?: any };

const adminDb = async (): Promise<DB> => {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

export interface KingWin {
  at: string;
  text: string;
  amountCents: number | null;
}

export interface KingCompView {
  summary: CompSummary;
  /** seats split so the HQ can show bought vs claimed */
  seats: { bought: number; claimed: number };
  recentWins: KingWin[];
  /** provider-confirmed sends + logged DMs this semester — effort, not just outcomes */
  outreach: { emailsSent: number; dms: number; replies: number };
}

/** The whole comp picture, computed fresh from the ledgers. Shared by the HQ page,
 *  the digest, and (server-side) the cron — one implementation, one truth. */
export async function computeKingComp(db: DB): Promise<KingCompView> {
  const [partnersR, convR, poolsR, assignR, eventsR, chaptersR] = await Promise.all([
    db.from("referral_partners").select("id,type,email,created_by,is_test"),
    db
      .from("referral_conversions")
      .select("id,partner_id,subject_type,subject_id,amount_cents,occurred_at,is_test,kind")
      .gte("occurred_at", SEMESTER.start)
      .lt("occurred_at", SEMESTER.end),
    db
      .from("chapter_seat_pools")
      .select("id,chapter_id,seats_total,amount_cents,status,created_at,is_test")
      .gte("created_at", SEMESTER.start)
      .lt("created_at", SEMESTER.end),
    db.from("chapter_seat_assignments").select("id,pool_id,released_at,is_test"),
    db
      .from("growth_outreach_events")
      .select("campus_id,entity_type,entity_id,channel,direction,status,message_id,occurred_at")
      .gte("occurred_at", SEMESTER.start),
    db.from("campus_greek_chapters").select("id,campus_id"),
  ]);

  const partnerBucket = new Map<string, Bucket>();
  for (const p of ((partnersR.data ?? []) as any[]).filter((p) => !p.is_test)) {
    partnerBucket.set(p.id, classifyPartner(p));
  }

  const chapterCampus = new Map<string, string>();
  for (const c of (chaptersR.data ?? []) as any[]) chapterCampus.set(c.id, c.campus_id);

  // First provider-confirmed touch per chapter and per campus. A logged note is not
  // a touch; an email needs its provider receipt, a DM needs its manual log.
  const firstTouchChapter = new Map<string, string>();
  const firstTouchCampus = new Map<string, string>();
  const events = ((eventsR.data ?? []) as any[]).filter(
    (e) =>
      e.direction === "outbound" &&
      ((e.channel === "email" && e.message_id) || e.channel === "ig_dm"),
  );
  for (const e of events) {
    if (e.entity_type === "chapter" && e.entity_id) {
      const cur = firstTouchChapter.get(e.entity_id);
      if (!cur || e.occurred_at < cur) firstTouchChapter.set(e.entity_id, e.occurred_at);
    }
    if (e.campus_id) {
      const cur = firstTouchCampus.get(e.campus_id);
      if (!cur || e.occurred_at < cur) firstTouchCampus.set(e.campus_id, e.occurred_at);
    }
  }

  const buckets: Record<Bucket, number> = { king_growth: 0, founder: 0, organic: 0 };
  const wins: KingWin[] = [];

  // 1) Tracked-link conversions — strongest signal, classified by their partner.
  //    These carry their own dollars (individual purchases, tracked seat sales).
  const conversions = ((convR.data ?? []) as any[]).filter((c) => !c.is_test);
  const convertedPoolIds = new Set(
    conversions
      .filter((c) => String(c.subject_type ?? "").includes("pool"))
      .map((c) => c.subject_id)
      .filter(Boolean),
  );
  for (const c of conversions) {
    const cents = c.amount_cents ?? 0;
    if (cents <= 0) continue;
    const bucket = partnerBucket.get(c.partner_id) ?? "king_growth";
    buckets[bucket] += cents;
    if (bucket === "king_growth") {
      wins.push({
        at: c.occurred_at,
        text: "Tracked-link sale through a rep you manage",
        amountCents: cents,
      });
    }
  }

  // 2) Seat pools with NO tracked link — prior campaign touch decides King vs organic.
  let seatsBought = 0;
  for (const p of ((poolsR.data ?? []) as any[]).filter((p) => !p.is_test)) {
    if (p.status === "cancelled") continue;
    seatsBought += p.seats_total ?? 0;
    const cents = p.amount_cents ?? 0;
    if (cents <= 0 || convertedPoolIds.has(p.id)) continue; // tracked ones already counted
    const touch =
      firstTouchChapter.get(p.chapter_id) ??
      (chapterCampus.get(p.chapter_id)
        ? firstTouchCampus.get(chapterCampus.get(p.chapter_id)!)
        : null) ??
      null;
    const bucket = classifyUntracked({ purchasedAt: p.created_at, firstCampaignTouchAt: touch });
    buckets[bucket] += cents;
    if (bucket === "king_growth") {
      wins.push({
        at: p.created_at,
        text: `Chapter you reached bought ${p.seats_total ?? 0} seats`,
        amountCents: cents,
      });
    }
  }

  const seatsClaimed = ((assignR.data ?? []) as any[]).filter(
    (a) => !a.is_test && !a.released_at,
  ).length;

  wins.sort((a, b) => b.at.localeCompare(a.at));

  return {
    summary: buildCompSummary(buckets),
    seats: { bought: seatsBought, claimed: seatsClaimed },
    recentWins: wins.slice(0, 12),
    outreach: {
      emailsSent: events.filter((e) => e.channel === "email").length,
      dms: events.filter((e) => e.channel === "ig_dm").length,
      replies: ((eventsR.data ?? []) as any[]).filter(
        (e) => e.direction === "inbound" || e.status === "replied",
      ).length,
    },
  };
}

export const growthCompSummary = createServerFn({ method: "GET" }).handler(
  async (): Promise<KingCompView> => {
    const db = await adminDb();
    return computeKingComp(db);
  },
);

/* ── gated document downloads ─────────────────────────────────────────────────────── */

const DOC_KEYS = {
  contract: "king/growth-partner-agreement.pdf",
  attribution: "king/revenue-attribution-guide.pdf",
} as const;

export const kingDocUrl = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ doc: z.enum(["contract", "attribution"]) }).parse(d))
  .handler(async ({ data }): Promise<{ url: string | null; error?: string }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await (supabaseAdmin as any).storage
      .from("internal-docs")
      .createSignedUrl(DOC_KEYS[data.doc], 600, { download: true });
    if (error) return { url: null, error: error.message };
    return { url: signed?.signedUrl ?? null };
  });

/* ── King's email digest ──────────────────────────────────────────────────────────── */

export const KING_EMAIL = "king@surviveaccounting.com";
const DASHBOARD_URL = "https://surviveaccounting.com/admin/growth/king";

/** Plain text on purpose — Lee's spec: "just plain text stuff and a link to dashboard". */
export function composeKingDigest(view: KingCompView): { subject: string; text: string } {
  const s = view.summary;
  const lines: string[] = [
    `King —`,
    ``,
    `Your Survive numbers, ${SEMESTER.label}:`,
    ``,
    `  Your growth revenue:   ${fmtUsd(s.buckets.king_growth)}`,
    `  Your 5% earned:        ${fmtUsd(s.kingCommissionCents)}`,
    `  Milestone bonus:       ${fmtUsd(s.milestones.bonusEarnedCents)}`,
    `  Total earned:          ${fmtUsd(s.kingTotalCents)}`,
    ``,
    `  Company total:         ${fmtUsd(s.totalRevenueCents)}`,
  ];
  if (s.milestones.next) {
    lines.push(
      `  Next milestone:        ${fmtUsd(s.milestones.next.revenueCents)} pays you ${fmtUsd(s.milestones.next.bonusCents)} (${Math.round(s.milestones.progressToNext * 100)}% there)`,
    );
  } else {
    lines.push(`  Milestones:            all four cleared. Ridiculous. Congratulations.`);
  }
  lines.push(
    ``,
    `  Seats: ${view.seats.bought} bought / ${view.seats.claimed} claimed`,
    `  Outreach this semester: ${view.outreach.emailsSent} emails, ${view.outreach.dms} DMs, ${view.outreach.replies} replies`,
  );
  if (view.recentWins.length) {
    lines.push(``, `Latest wins:`);
    for (const w of view.recentWins.slice(0, 4)) {
      lines.push(`  - ${w.text}${w.amountCents ? ` (${fmtUsd(w.amountCents)})` : ""}`);
    }
  }
  lines.push(``, `Everything live: ${DASHBOARD_URL}`, ``, `— Survive`);
  return {
    subject: `Survive Growth — ${fmtUsd(s.kingTotalCents)} earned so far`,
    text: lines.join("\n"),
  };
}

export const kingDigestPreview = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ subject: string; text: string }> => {
    const db = await adminDb();
    return composeKingDigest(await computeKingComp(db));
  },
);

/** Explicit admin action; the daily cron uses the same composer but its own gate. */
export const sendKingDigestNow = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: boolean; error?: string }> => {
    const db = await adminDb();
    const digest = composeKingDigest(await computeKingComp(db));
    const { sendResendEmail } = await import("@/lib/email.server");
    const res = await sendResendEmail({
      to: KING_EMAIL,
      subject: digest.subject,
      text: digest.text,
    });
    if (res.ok) {
      await db
        .from("site_settings")
        .select("id,settings")
        .limit(1)
        .maybeSingle()
        .then(async ({ data: row }: any) => {
          if (!row) return;
          await db
            .from("site_settings")
            .update({
              settings: { ...row.settings, kingDigest: { lastSentAt: new Date().toISOString() } },
            })
            .eq("id", row.id);
        });
    }
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  },
);
