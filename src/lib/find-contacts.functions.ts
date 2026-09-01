// IN-APP CONTACT FINDING — the server functions behind the Find contacts button.
//
// AUTH: Lee/King (admin session) OR a VA session — King's team have their own logins already
// (growth_va + /va/<token>), so attribution is a real person rather than a shared account. Every
// write records that actor in `created_by`.
//
// THE IMPORT IS THE POINT. Nothing here saves until reviewed, and importReviewedContacts
// re-runs the SAME pure rules the UI showed (find-contacts-shared) server-side — a client that
// posts a blocked row gets it dropped, not trusted.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  COUNCIL_KEYS, canImport, flagRows, normalizeEmail, normalizeHandle,
  type CouncilKey, type CouncilPage, type OfficerRow, type UrlProbe,
} from "@/lib/find-contacts-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped-table convention
type DB = { from: (t: string) => any };
const admin = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

/** Lee/King or a VA. Returns the actor string stored in created_by. */
async function actor(): Promise<string> {
  const { adminSessionOk, vaSessionOk } = await import("@/lib/admin-session.functions");
  try { const a = await adminSessionOk(); if (a?.ok && a.email) return a.email; } catch { /* not an admin */ }
  try { const v = await vaSessionOk(); if (v?.ok && v.vaId) return `va:${v.vaId}`; } catch { /* not a VA */ }
  throw new Error("Not authorised — sign in as an admin or a VA.");
}

const CACHE_TTL_HOURS = 24 * 30;   // council URLs don't move (§5)

async function campusOf(db: DB, campusId: string): Promise<{ id: string; name: string; slug: string } | null> {
  const { data } = await db.from("campuses").select("id,name,short_name,slug").eq("id", campusId).maybeSingle();
  if (!data?.id) return null;
  return { id: data.id as string, name: (data.name as string) || (data.short_name as string) || (data.slug as string), slug: data.slug as string };
}

async function recordRun(db: DB, r: {
  campusId: string; step: "councils" | "officers"; model: string; ok: boolean; error?: string | null;
  promptTokens?: number; completionTokens?: number; costUsd?: number; fromCache?: boolean; count?: number; by: string;
}): Promise<void> {
  await db.from("find_contact_runs").insert({
    campus_id: r.campusId, step: r.step, model: r.model, ok: r.ok, error: r.error ?? null,
    prompt_tokens: r.promptTokens ?? 0, completion_tokens: r.completionTokens ?? 0,
    cost_usd: r.costUsd ?? 0, from_cache: !!r.fromCache, results_count: r.count ?? 0, created_by: r.by,
  }).then(() => undefined, (e: unknown) => console.warn("find_contact_runs insert failed", e));
}

// ── STEP 1 ───────────────────────────────────────────────────────────────────────────────────
export type CouncilPagesResult = {
  ok: true; campusId: string; campusName: string;
  pages: Array<CouncilPage & { probe: UrlProbe | null }>;
  fromCache: boolean; costUsd: number;
} | { ok: false; error: string; campusId: string };

export const findCouncilPagesFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ campusId: z.string().uuid(), refresh: z.boolean().optional() }).parse(d))
  .handler(async ({ data }): Promise<CouncilPagesResult> => {
    const by = await actor();
    const db = await admin();
    const campus = await campusOf(db, data.campusId);
    if (!campus) return { ok: false, error: "Campus not found.", campusId: data.campusId };

    try {
      const { findCouncilPages } = await import("@/lib/find-contacts.server");
      const { cached } = await import("@/lib/scrape-cache");
      let fromCache = true;
      let costUsd = 0;

      // 30-day cache per campus. The fetcher only runs on a miss, so `fromCache` flips there.
      const pages = data.refresh
        ? await (async () => {
            fromCache = false;
            const r = await findCouncilPages(campus.name);
            costUsd = r.usage.costUsd;
            await recordRun(db, { campusId: campus.id, step: "councils", model: r.usage.model, ok: true, promptTokens: r.usage.promptTokens, completionTokens: r.usage.completionTokens, costUsd, count: r.data.length, by });
            return r.data;
          })()
        : await cached("serp", `findcouncils:v1:${campus.id}`, CACHE_TTL_HOURS, async () => {
            fromCache = false;
            const r = await findCouncilPages(campus.name);
            costUsd = r.usage.costUsd;
            await recordRun(db, { campusId: campus.id, step: "councils", model: r.usage.model, ok: true, promptTokens: r.usage.promptTokens, completionTokens: r.usage.completionTokens, costUsd, count: r.data.length, by });
            return r.data;
          });

      const { probeUrls } = await import("@/lib/find-contacts.server");
      const probes = await probeUrls(pages.map((p) => p.url));
      if (fromCache) await recordRun(db, { campusId: campus.id, step: "councils", model: "cache", ok: true, fromCache: true, count: pages.length, by });

      return {
        ok: true, campusId: campus.id, campusName: campus.name, fromCache, costUsd,
        pages: pages.map((p, i) => ({ ...p, probe: probes[i] ?? null })),
      };
    } catch (e) {
      const msg = (e as Error).message;
      await recordRun(db, { campusId: campus.id, step: "councils", model: "perplexity/sonar", ok: false, error: msg, by });
      return { ok: false, error: msg, campusId: campus.id };
    }
  });

/** Re-probe URLs after a human edits or pastes one. */
export const probeUrlsFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ urls: z.array(z.string().url()).max(12) }).parse(d))
  .handler(async ({ data }): Promise<UrlProbe[]> => {
    await actor();
    const { probeUrls } = await import("@/lib/find-contacts.server");
    return probeUrls(data.urls);
  });

// ── STEP 2 ───────────────────────────────────────────────────────────────────────────────────
export type OfficersResult = {
  ok: true; campusId: string; campusName: string;
  officers: OfficerRow[];
  existing: { emails: string[]; handles: string[] };
  costUsd: number;
} | { ok: false; error: string; campusId: string };

export const scrapeOfficersFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    campusId: z.string().uuid(),
    urls: z.array(z.object({ council: z.enum(COUNCIL_KEYS), url: z.string().url() })).min(1).max(8),
  }).parse(d))
  .handler(async ({ data }): Promise<OfficersResult> => {
    const by = await actor();
    const db = await admin();
    const campus = await campusOf(db, data.campusId);
    if (!campus) return { ok: false, error: "Campus not found.", campusId: data.campusId };

    try {
      const { scrapeOfficers, searchPersonalInstagram } = await import("@/lib/find-contacts.server");
      const r = await scrapeOfficers(campus.name, data.urls);
      await recordRun(db, { campusId: campus.id, step: "officers", model: r.usage.model, ok: true, promptTokens: r.usage.promptTokens, completionTokens: r.usage.completionTokens, costUsd: r.usage.costUsd, count: r.data.length, by });

      // §Step 3 — SerpAPI prefill. For a named person with no handle from the page, run one Google
      // search for their personal Instagram. Bounded fan-out; a miss just leaves the row blank.
      const drafts = r.data.slice();
      const needIg = drafts.map((o, i) => ({ o, i })).filter(({ o }) => o.name && o.name.trim() && !o.instagram);
      const found = await Promise.all(needIg.map(({ o }) => searchPersonalInstagram(o.name!, campus.name).catch(() => null)));
      needIg.forEach(({ i }, k) => {
        const h = found[k];
        if (h) { drafts[i] = { ...drafts[i], instagram: h, instagramSource: "found", instagramConfidence: "low" }; }
      });

      // What this campus already has — duplicates are EXCLUDED, never overwritten. The canonical
      // store is growth_contact_qc (what the enrichment view + board read); campus_council_contacts
      // is the legacy scrape store and is unioned here so neither is re-imported.
      const [{ data: exQc }, { data: exCc }] = await Promise.all([
        db.from("growth_contact_qc").select("email,instagram").eq("campus_id", campus.id).limit(4000),
        db.from("campus_council_contacts").select("email,instagram_url").eq("campus_id", campus.id).limit(2000),
      ]);
      const emails = [
        ...((exQc ?? []) as Array<{ email: string | null }>).map((x) => x.email),
        ...((exCc ?? []) as Array<{ email: string | null }>).map((x) => x.email),
      ].filter(Boolean) as string[];
      const handles = [
        ...((exQc ?? []) as Array<{ instagram: string | null }>).map((x) => x.instagram),
        ...((exCc ?? []) as Array<{ instagram_url: string | null }>).map((x) => x.instagram_url),
      ].filter(Boolean) as string[];

      return {
        ok: true, campusId: campus.id, campusName: campus.name, costUsd: r.usage.costUsd,
        officers: drafts.map((o, i) => ({
          id: `r${i}`, council: o.council, position: o.position, name: o.name,
          email: o.email, phone: o.phone, instagram: o.instagram,
          instagramSource: o.instagramSource, instagramConfidence: o.instagramConfidence,
          chapter: o.chapter, sourceUrl: o.sourceUrl, include: true, igVerified: false, sourceChecked: false,
        })),
        existing: { emails, handles },
      };
    } catch (e) {
      const msg = (e as Error).message;
      await recordRun(db, { campusId: campus.id, step: "officers", model: "perplexity/sonar", ok: false, error: msg, by });
      return { ok: false, error: msg, campusId: campus.id };
    }
  });

// ── THE IMPORT ───────────────────────────────────────────────────────────────────────────────
const OfficerRowSchema = z.object({
  id: z.string().max(40),
  council: z.enum(COUNCIL_KEYS),
  position: z.string().max(120).nullable(),
  name: z.string().max(160).nullable(),
  email: z.string().max(200).nullable(),
  phone: z.string().max(40).nullable(),
  instagram: z.string().max(200).nullable(),
  instagramSource: z.enum(["listed", "found", "manual"]).nullable(),
  instagramConfidence: z.enum(["high", "low"]).nullable(),
  chapter: z.string().max(160).nullable(),
  sourceUrl: z.string().max(500).nullable(),
  include: z.boolean(),
  igVerified: z.boolean(),
  sourceChecked: z.boolean(),
});

export const importReviewedContactsFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    campusId: z.string().uuid(),
    rows: z.array(OfficerRowSchema).max(200),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; imported: number; skipped: number; error?: string }> => {
    const by = await actor();
    const db = await admin();
    const campus = await campusOf(db, data.campusId);
    if (!campus) return { ok: false, imported: 0, skipped: 0, error: "Campus not found." };

    // Re-read what exists NOW (not what the client was shown) and re-run the same pure rules.
    const { data: ex } = await db.from("campus_council_contacts")
      .select("email,instagram_url").eq("campus_id", campus.id).limit(2000);
    const exRows = (ex ?? []) as Array<{ email: string | null; instagram_url: string | null }>;
    const existing = {
      emails: exRows.map((x) => x.email).filter(Boolean) as string[],
      handles: exRows.map((x) => x.instagram_url).filter(Boolean) as string[],
    };

    const rows = data.rows as OfficerRow[];
    const flags = flagRows(rows, existing);
    const keep = rows.filter((r) => canImport(r, flags.get(r.id) ?? []));

    const nowIso = new Date().toISOString();
    let imported = 0;
    for (const r of keep) {
      const handle = normalizeHandle(r.instagram);
      const { data: ins, error } = await db.from("campus_council_contacts").insert({
        campus_id: campus.id,
        council_type: r.council,
        contact_type: r.name ? "student_officer" : "role_inbox",
        name: r.name, role: r.position,
        email: normalizeEmail(r.email), phone: r.phone,
        instagram_url: handle ? `https://instagram.com/${handle}` : null,
        source_url: r.sourceUrl, source_type: "find_contacts",
        confidence: r.instagramConfidence === "high" ? "high" : "medium",
        is_current: true, retrieved_at: nowIso,
        created_by: by,
        instagram_source: handle ? (r.instagramSource ?? "found") : null,
        instagram_confidence: handle ? r.instagramConfidence : null,
        // VERIFICATION IS A HUMAN STEP: only stamped when the reviewer actually ticked the box.
        ig_verified_at: r.igVerified && handle ? nowIso : null,
        ig_verified_by: r.igVerified && handle ? by : null,
        source_checked_at: r.sourceChecked ? nowIso : null,
        source_checked_by: r.sourceChecked ? by : null,
      }).select("id").maybeSingle();
      if (error) { console.warn("contact insert failed", error.message); continue; }
      imported++;

      // Scoreboard: a searched handle that a person confirmed at import time.
      if (handle && r.instagramSource === "found") {
        await db.from("ig_find_outcomes").insert({
          campus_id: campus.id, contact_id: ins?.id ?? null,
          outcome: r.igVerified ? "confirmed" : "cleared", created_by: by,
        }).then(() => undefined, () => undefined);
      }
    }
    return { ok: true, imported, skipped: rows.length - imported };
  });

// ── SUBMIT → INSTAGRAM DM QUEUE ────────────────────────────────────────────────────────────────
// The endpoint of the flow. Reviewed rows are written into growth_contact_qc (the canonical store
// the enrichment field grid + board read, via growthSaveCampusContacts, which resolves/creates the
// Women-in-Business club and marks org vs person), then the campus is stamped in growth_ig_queue so
// the /coldoutreach/instagram page can list it. Councils map straight through; wib → the WiB club.
export const sendToDmQueueFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    campusId: z.string().uuid(),
    rows: z.array(OfficerRowSchema).max(200),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; imported: number; error?: string }> => {
    const by = await actor();
    const db = await admin();
    const campus = await campusOf(db, data.campusId);
    if (!campus) return { ok: false, imported: 0, error: "Campus not found." };

    const kept = (data.rows as OfficerRow[]).filter((r) => r.include && (normalizeEmail(r.email) || normalizeHandle(r.instagram)));
    const contacts = kept.map((r) => {
      const isPerson = !!(r.name && r.name.trim());
      const isClub = r.council === "wib";
      return {
        kind: isClub ? ("club" as const) : ("council" as const),
        newClubCategory: isClub ? "women_in_business" : undefined,
        newClubName: isClub ? "Women in Business" : undefined,
        councilType: isClub ? undefined : r.council,
        isPerson,
        name: isPerson ? r.name : null,
        role: r.position,
        email: r.email,
        instagram: r.instagram,
        chapter: r.chapter,
        igRoleAccount: !isPerson,
      };
    });

    let imported = 0;
    try {
      const { growthSaveCampusContacts } = await import("@/lib/growth-tranche.functions");
      const res = await growthSaveCampusContacts({ data: { campusId: campus.id, contacts } });
      imported = res.saved;
    } catch (e) {
      return { ok: false, imported: 0, error: (e as Error).message };
    }

    // Stamp the queue — one row per campus, refreshed on each submit.
    await db.from("growth_ig_queue").upsert({
      campus_id: campus.id, queued_at: new Date().toISOString(), queued_by: by, contact_count: imported,
    }, { onConflict: "campus_id" }).then(() => undefined, (e: unknown) => console.warn("ig_queue upsert failed", e));

    return { ok: true, imported };
  });

/** Records a Confirm / Wrong-clear / manual paste decision on a searched handle, so the header's
 *  hit rate reflects reality even for rows that never get imported. */
export const recordIgOutcomeFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    campusId: z.string().uuid(),
    outcome: z.enum(["confirmed", "cleared", "manual"]),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const by = await actor();
    const db = await admin();
    await db.from("ig_find_outcomes").insert({ campus_id: data.campusId, outcome: data.outcome, created_by: by })
      .then(() => undefined, () => undefined);
    return { ok: true };
  });

// ── the header numbers (§3 hit rate, §5 running cost) ────────────────────────────────────────
export const findContactsStatsFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ campusId: z.string().uuid().optional().nullable() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; confirmed: number; cleared: number; costUsd: number; runs: number }> => {
    await actor();
    const db = await admin();
    let oq = db.from("ig_find_outcomes").select("outcome").limit(20000);
    let rq = db.from("find_contact_runs").select("cost_usd").limit(20000);
    if (data.campusId) { oq = oq.eq("campus_id", data.campusId); rq = rq.eq("campus_id", data.campusId); }
    const [{ data: outcomes }, { data: runs }] = await Promise.all([oq, rq]);
    const o = (outcomes ?? []) as Array<{ outcome: string }>;
    const r = (runs ?? []) as Array<{ cost_usd: number | string }>;
    return {
      ok: true,
      confirmed: o.filter((x) => x.outcome === "confirmed").length,
      cleared: o.filter((x) => x.outcome === "cleared").length,
      costUsd: r.reduce((s, x) => s + Number(x.cost_usd ?? 0), 0),
      runs: r.length,
    };
  });
