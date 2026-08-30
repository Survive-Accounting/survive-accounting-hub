// /the-campaign — the private page's server side: the live counts, the campus list, and the
// referral submission.
//
// ── THE COUNTS ARE READ, NEVER SEEDED ─────────────────────────────────────────────────────────
// The page says "N campuses ready · M in the system" and both have to stay true as the numbers
// move, because the whole page is an argument that these numbers are real.
//
// READY IS A STORED FLAG, NOT A FORMULA HERE. `campuses.campus_status` is the column the
// research pipeline maintains, and 'ready' is its own value. The spec describes what earns that
// flag — council contacts, the top five fraternity and sorority chapters, a business club for rep
// recruiting, and a confirmed course code — and that description is what the tooltip tells the
// reader; but the COUNT comes from the flag, because the pipeline that sets it is the authority
// and a second implementation here would drift from it within a week.
//
// (Rebuilding that four-part test from the underlying tables was tried and produced 11, because
// growth_business_clubs is populated for only 34 campuses so far. That is a research-coverage
// gap, not a readiness count, and shipping it would have understated the campaign by 20x.)
//
// THE DENOMINATOR IS ONE NAMED FILTER, below, so "in the system" can be redefined in one line.
// It is NEVER hardcoded, and must never be "corrected" to match a slide — if the count disagrees
// with the deck, the deck is what changed.
//
// ── THE SUBMISSION ────────────────────────────────────────────────────────────────────────────
// One call writes up to four things: the submission row (always), a subscriber (if they asked), a
// warm lead (if they named a campus), and an email to Lee (always). Each is best-effort AFTER the
// submission row, because the one thing that must never fail is keeping what the person wrote.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { sendResendEmail } from "@/lib/email.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same shape the other server modules use
type DB = { from: (t: string) => any };
const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

/** Where the campaign notification goes. Deliberately Lee's studios address, not the support
 *  inbox — this is his personal network, and the replies are his to handle. */
const LEE_EMAIL = "lee@survivestudios.com";
const LEE_PHONE = "(601) 201-8759";
const SOURCE_PAGE = "/the-campaign";

/** PostgREST caps a select at 1,000 rows and there are more campuses than that, so the dropdown's
 *  list is paged rather than truncated — a picker that silently stops at 1,000 is a picker that
 *  cannot find the campus somebody is looking for. */
async function pageAll<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await run(from, from + PAGE - 1);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

export type CampaignCounts = { ready: number; total: number };

/** WHAT "IN THE SYSTEM" MEANS: every campus we have not deliberately excluded. Campuses marked
 *  'excluded' are duplicates and non-institutions the dedup pass removed, so counting them would
 *  inflate the denominator with rows nobody will ever contact.
 *
 *  LEE: this is the one line to change if you meant a narrower universe. As of 2026-08-30 it
 *  returns 970; your deck said 677, and no filter on this table reproduces 677 — see the report. */
const IN_THE_SYSTEM = (q: { neq: (col: string, val: string) => unknown }) => q.neq("campus_status", "excluded");

/** A PostgREST exact count, without pulling a single row across the wire. */
async function countRows(
  db: DB,
  table: string,
  shape: (q: any) => any, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<number> {
  const { count } = await shape(db.from(table).select("id", { count: "exact", head: true }));
  return count ?? 0;
}

export const getCampaignCounts = createServerFn({ method: "GET" }).handler(
  async (): Promise<CampaignCounts> => {
    const db = await admin();
    const [ready, total] = await Promise.all([
      countRows(db, "campuses", (q) => q.eq("campus_status", "ready")),
      countRows(db, "campuses", (q) => IN_THE_SYSTEM(q)),
    ]);
    return { ready, total };
  },
);

/** The campus list behind the form's searchable dropdown. Name + id only — the picker does not
 *  need anything else, and a fatter payload on a page shared by email is a slower first paint.
 *
 *  THE SAME UNIVERSE THE CHIP COUNTS. The picker offered all 1,013 rows while the chip above it
 *  said "970 in the system", and the one audience guaranteed to notice a page disagreeing with
 *  itself by 43 is the audience this page is written for. Both now read IN_THE_SYSTEM. */
export const listCampaignCampuses = createServerFn({ method: "GET" }).handler(
  async (): Promise<Array<{ id: string; name: string }>> => {
    const db = await admin();
    const rows = await pageAll<{ id: string; name: string | null; institution_name: string | null }>((f, t) =>
      IN_THE_SYSTEM(db.from("campuses").select("id,name,institution_name").order("name").range(f, t) as never) as never,
    );
    return rows
      .map((r) => ({ id: r.id, name: (r.name ?? r.institution_name ?? "").trim() }))
      .filter((r) => r.name.length > 0);
  },
);

const SubmitInput = z.object({
  submitterName: z.string().trim().min(1).max(120),
  submitterEmail: z.string().trim().max(200).optional().default(""),
  subscribe: z.boolean().default(false),
  campusId: z.string().uuid().nullable().optional().default(null),
  campusText: z.string().trim().max(160).optional().default(""),
  referralName: z.string().trim().max(160).optional().default(""),
  referralContact: z.string().trim().max(200).optional().default(""),
  relationship: z.string().trim().max(40).optional().default(""),
  comments: z.string().trim().max(4000).optional().default(""),
  wantsCall: z.boolean().nullable().optional().default(null),
});

export type CampaignSubmitResult = {
  ok: true;
  /** What the confirmation appends. Derived on the server so the message can never claim a
   *  referral was logged when the write that logs it failed. */
  savedReferral: boolean;
  subscribed: boolean;
};

const isEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

export const submitCampaignReferral = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SubmitInput.parse(d))
  .handler(async ({ data }): Promise<CampaignSubmitResult> => {
    const db = await admin();
    const email = data.submitterEmail.trim();
    const hasReferral = !!(data.referralName || data.referralContact || data.campusId || data.campusText);
    const wantsSub = data.subscribe && isEmail(email);

    // ── 1. THE SUBMISSION ROW. The only write that is allowed to fail loudly: everything else on
    // this page is a convenience, and losing what somebody wrote is not recoverable.
    const { data: row, error } = await db
      .from("referral_submission")
      .insert({
        submitter_name: data.submitterName,
        submitter_email: email || null,
        subscribed: wantsSub,
        campus_id: data.campusId,
        campus_text: data.campusText || null,
        referral_name: data.referralName || null,
        referral_contact: data.referralContact || null,
        relationship: data.relationship || null,
        comments: data.comments || null,
        wants_call: data.wantsCall,
      })
      .select("id")
      .single();

    if (error) throw new Error(`referral_submission insert failed: ${error.message}`);

    // ── 2. THE SUBSCRIBER. Upsert on (email, page) so a second submit does not produce a second
    // copy of every update.
    if (wantsSub) {
      await db
        .from("campaign_subscriber")
        .upsert(
          { name: data.submitterName, email, source_page: SOURCE_PAGE, unsubscribed_at: null },
          { onConflict: "email,source_page" },
        )
        .then(undefined, () => undefined);
    }

    // ── 3. THE WARM LEAD. Created ONLY when a referral names a campus we can resolve, and created
    // ALREADY STOPPED: sequence_stopped_at is the table's own mechanism for "do not cold-send
    // this", so a referred person cannot be picked up by a cold sequence. Lee mails them himself.
    let leadId: string | null = null;
    if (hasReferral && data.campusId && (data.referralName || data.referralContact)) {
      const contact = data.referralContact.trim();
      const parts = (data.referralName || "").trim().split(/\s+/);
      const { data: lead } = await db
        .from("outreach_leads")
        .insert({
          campus_id: data.campusId,
          first_name: parts[0] || null,
          last_name: parts.slice(1).join(" ") || null,
          email: isEmail(contact) ? contact : null,
          status: "warm",
          source: "referral",
          sequence_stopped_at: new Date().toISOString(),
          sequence_stopped_reason: "warm referral — Lee reaches out personally, never a cold send",
          notes: [
            `warm — referred by ${data.submitterName}`,
            data.relationship ? `relationship: ${data.relationship}` : "",
            !isEmail(contact) && contact ? `contact: ${contact}` : "",
            data.campusText ? `campus (typed): ${data.campusText}` : "",
          ].filter(Boolean).join(" · "),
        })
        .select("id")
        .single();
      leadId = lead?.id ?? null;
      if (leadId) await db.from("referral_submission").update({ lead_id: leadId }).eq("id", row.id);
    }

    // ── 4. THE EMAIL TO LEE. Every field, so he never has to open the dashboard to answer.
    const lines = [
      `From: ${data.submitterName}${email ? ` <${email}>` : " (no email given)"}`,
      `Wants a call: ${data.wantsCall === true ? "YES" : data.wantsCall === false ? "not right now" : "—"}`,
      `Subscribed to updates: ${wantsSub ? "yes" : "no"}`,
      ``,
      `— REFERRAL —`,
      hasReferral ? `Campus: ${data.campusText || data.campusId || "—"}` : `(none)`,
      hasReferral ? `Name: ${data.referralName || "—"}` : ``,
      hasReferral ? `Contact: ${data.referralContact || "—"}` : ``,
      hasReferral ? `How they know them: ${data.relationship || "—"}` : ``,
      hasReferral ? `Lead created: ${leadId ?? "no (campus not resolved)"}` : ``,
      ``,
      `— COMMENTS —`,
      data.comments || "(none)",
      ``,
      `submission: ${row.id}`,
    ].filter((l) => l !== "");

    const sent = await sendResendEmail({
      to: LEE_EMAIL,
      subject: hasReferral
        ? `Campaign referral from ${data.submitterName}`
        : `Campaign note from ${data.submitterName}`,
      text: lines.join("\n"),
    }).catch(() => ({ ok: false as const }));

    if (sent.ok) await db.from("referral_submission").update({ notified_at: new Date().toISOString() }).eq("id", row.id);

    return { ok: true, savedReferral: hasReferral, subscribed: wantsSub };
  });

export const CAMPAIGN_CONTACT_PHONE = LEE_PHONE;
