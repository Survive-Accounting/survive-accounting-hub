// GROWTH REACH — build the contact map by hand, not just by scraper.
//
// (growth-contacts.functions.ts is the older person/role-history module from growth-admin-v1;
// THIS file owns adding, correcting and retiring the contacts the Outreach tab reads.)
//
// The scrapers miss things — Lee found Lee Women in Business's Instagram on the UNLV
// involvement page after the crawler didn't. This makes that a ten-second fix: add a
// contact, correct a wrong one, retire a dead one, or paste the URL you found it on and
// let one cheap fetch pull the contacts off that single page.
//
// WHERE CONTACTS LIVE. growth_outreach_eligibility is a view over growth_contact_qc, so a
// row written here appears in the Outreach tab immediately. Manual adds are
// contact_source='manual' with confidence 'high', qc_action 'approve' and outreach_eligible
// true — a human vouched for it — and qc_by records who.
//
// LAW: ships to the client bundle — service-role client + admin gate imported dynamically.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { extractContactsFromText, type ExtractedContact } from "@/lib/growth-reach-core";

type DB = { from: (t: string) => any };

const adminCtx = async (): Promise<{ db: DB; who: string }> => {
  const { assertAdmin, adminSessionOk } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  const who = (await adminSessionOk())?.email ?? "admin";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { db: supabaseAdmin as unknown as DB, who };
};

const cleanHandle = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const s = v.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://instagram.com/${s.replace(/^@/, "")}`;
};

const CONTACT_TYPES = [
  "role_inbox",
  "organization_general",
  "chapter_exec",
  "student_officer",
  "staff_advisor",
  "social_account",
  "unknown",
] as const;

export const growthAddContact = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        campusId: z.string().uuid(),
        entityType: z.enum(["chapter", "council", "club", "campus"]),
        entityId: z.string().uuid().nullable().optional(),
        councilType: z.string().max(40).nullable().optional(),
        contactType: z.enum(CONTACT_TYPES).default("unknown"),
        name: z.string().trim().max(160).nullable().optional(),
        role: z.string().trim().max(160).nullable().optional(),
        email: z.string().trim().max(200).nullable().optional(),
        instagram: z.string().trim().max(300).nullable().optional(),
        isRoleAccount: z.boolean().optional(),
        sourceUrl: z.string().trim().max(500).nullable().optional(),
        note: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; qcId?: string; error?: string }> => {
    const { db, who } = await adminCtx();
    const email = data.email?.trim().toLowerCase() || null;
    const instagram = cleanHandle(data.instagram);
    if (!email && !instagram)
      return { ok: false, error: "An email or an Instagram handle is required." };
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return { ok: false, error: "That email doesn't look right." };

    // Don't create a second row for an address this campus already has.
    if (email) {
      const { data: dupe } = await db
        .from("growth_contact_qc")
        .select("id")
        .eq("campus_id", data.campusId)
        .ilike("email", email)
        .limit(1);
      if (dupe?.length) return { ok: false, error: "That email is already on this campus." };
    }

    const now = new Date().toISOString();
    // contact_source is constrained (gcq_source_ck) to a fixed set — map the manual entry to the
    // bucket that matches what it's a contact FOR. "manual" is NOT allowed and silently rejected.
    const contactSource =
      data.contactType === "staff_advisor"
        ? "growth_advisors"
        : data.entityType === "council"
          ? "campus_council_contacts"
          : data.entityType === "club"
            ? "growth_business_clubs"
            : "growth_public_contacts";
    const row = {
      contact_source: contactSource,
      source_id: crypto.randomUUID(),
      campus_id: data.campusId,
      entity_type: data.entityType,
      entity_id: data.entityId ?? null,
      council_type: data.councilType ?? null,
      contact_type: data.contactType,
      campaign_purpose: data.contactType === "staff_advisor" ? "ADVISORY_ESCALATION" : null,
      name: data.name?.trim() || null,
      role: data.role?.trim() || null,
      email,
      instagram,
      is_role_account: data.isRoleAccount ?? false,
      source_url: data.sourceUrl?.trim() || null,
      source_type: "manual_entry",
      confidence: "high", // a human found it and vouched for it
      last_verified_at: now,
      freshness_status: "current",
      outreach_eligible: true,
      qc_action: "approve",
      qc_by: who,
      qc_at: now,
      qc_notes: data.note?.trim() || `Added manually by ${who}`,
    };
    const { data: ins, error } = await db
      .from("growth_contact_qc")
      .insert(row)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    return { ok: true, qcId: ins?.id };
  });

export const growthUpdateContact = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        qcId: z.string().uuid(),
        name: z.string().trim().max(160).nullable().optional(),
        role: z.string().trim().max(160).nullable().optional(),
        email: z.string().trim().max(200).nullable().optional(),
        instagram: z.string().trim().max(300).nullable().optional(),
        isRoleAccount: z.boolean().optional(),
        sourceUrl: z.string().trim().max(500).nullable().optional(),
        contactType: z.enum(CONTACT_TYPES).optional(),
        note: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { db, who } = await adminCtx();
    const now = new Date().toISOString();
    // A human just looked at it, so it is verified, current and usable again.
    const patch: Record<string, unknown> = {
      qc_by: who,
      qc_at: now,
      last_verified_at: now,
      freshness_status: "current",
      outreach_eligible: true,
      qc_action: "approve",
      confidence: "high",
      review_reason: null,
    };
    if (data.name !== undefined) patch.name = data.name?.trim() || null;
    if (data.role !== undefined) patch.role = data.role?.trim() || null;
    if (data.email !== undefined) patch.email = data.email?.trim().toLowerCase() || null;
    if (data.instagram !== undefined) patch.instagram = cleanHandle(data.instagram);
    if (data.isRoleAccount !== undefined) patch.is_role_account = data.isRoleAccount;
    if (data.sourceUrl !== undefined) patch.source_url = data.sourceUrl?.trim() || null;
    if (data.contactType !== undefined) patch.contact_type = data.contactType;
    if (data.note !== undefined) patch.qc_notes = data.note?.trim() || null;
    const { error } = await db.from("growth_contact_qc").update(patch).eq("id", data.qcId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

/** Mark a contact dead/wrong. Keeps the row (provenance) but takes it out of every queue. */
export const growthRetireContact = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ qcId: z.string().uuid(), reason: z.string().trim().max(500).optional() }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { db, who } = await adminCtx();
    const { error } = await db
      .from("growth_contact_qc")
      .update({
        outreach_eligible: false,
        qc_action: "wrong_data",
        review_reason: data.reason?.trim() || `Marked wrong by ${who}`,
        qc_by: who,
        qc_at: new Date().toISOString(),
      })
      .eq("id", data.qcId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

/* ── PASTE A URL, PULL THE CONTACTS ───────────────────────────────────────────────────────
   One page, one fetch. Deliberately NOT a crawler: it reads exactly the URL given, pulls the
   emails and social handles out of the markup, and hands them back for a human to accept.
   Nothing is written until someone picks rows and calls growthAddContact. */

export const growthExtractFromUrl = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ url: z.string().trim().max(500) }).parse(d))
  .handler(
    async ({ data }): Promise<{ ok: boolean; contacts: ExtractedContact[]; error?: string }> => {
      await adminCtx();
      // The URL is free text, so it must not be usable to probe the private network.
      let parsed: URL;
      try {
        parsed = new URL(data.url);
      } catch {
        return { ok: false, contacts: [], error: "That is not a valid URL." };
      }
      if (!/^https?:$/.test(parsed.protocol))
        return { ok: false, contacts: [], error: "Only http(s) URLs." };
      if (/^(localhost$|127\.|10\.|192\.168\.|169\.254\.|::1|\[)/i.test(parsed.hostname)) {
        return { ok: false, contacts: [], error: "That host is not allowed." };
      }

      // Plain fetch first (free). Firecrawl only if that yields nothing — most .edu org pages
      // are server-rendered, so the paid call is usually unnecessary.
      try {
        const res = await fetch(parsed.toString(), {
          headers: { "user-agent": "Mozilla/5.0 (compatible; SurviveAccountingBot/1.0)" },
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) {
          const found = extractContactsFromText(await res.text());
          if (found.length) return { ok: true, contacts: found };
        }
      } catch {
        /* fall through to Firecrawl */
      }

      const key = process.env.FIRECRAWL_API_KEY;
      if (!key) return { ok: true, contacts: [], error: "No contacts found on that page." };
      try {
        const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url: parsed.toString(), formats: ["markdown", "html"] }),
          signal: AbortSignal.timeout(45_000),
        });
        const json = (await res.json()) as { data?: { markdown?: string; html?: string } };
        const found = extractContactsFromText(
          `${json.data?.markdown ?? ""}\n${json.data?.html ?? ""}`,
        );
        return {
          ok: true,
          contacts: found,
          error: found.length ? undefined : "No contacts found on that page.",
        };
      } catch (e) {
        return {
          ok: false,
          contacts: [],
          error: e instanceof Error ? e.message : "Could not read that page.",
        };
      }
    },
  );

export { extractContactsFromText, type ExtractedContact };
