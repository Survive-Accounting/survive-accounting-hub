// ENTITLEMENTS (server, Prompt 4) — the purchase → unlocked-content path. Unlock is derived
// SERVER-SIDE from entitlements rows; a paid set's playback id is WITHHELD until the caller
// holds a covering grant (getSetPlayback). Grants are written only by service-role fulfillment
// (claimMyOrders matches a caller's own email → their orders; never trusts a client-supplied id).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type DB = { from: (t: string) => any };
const admin = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

// TODO (taxonomy reconciliation — future pass): there are TWO exam concepts in the schema and they
// overlap: course-level `exam_units` (0102; entitlement scope 'exam_unit' resolves through
// exam_unit_chapters below) and campus-level `campus_exams` (0105, the per-campus map). They should
// be reconciled into one model. Until then, under the taxonomy lock (0106, Option A) entitlements
// resolve at chapter(=unit) granularity and `campus_exams` is authoring/mapping only — it does NOT
// gate access. Do NOT wire campus_exams (or the new atomic `topics` table) into unlock logic without
// a deliberate migration that also updates order_chapters + this resolver together.
/** Expand a user's non-expired entitlements → the set of unlocked topic (chapter) ids.
 *  Degrades to EMPTY (everything paid stays locked — the safe default) if 0104 isn't applied. */
async function unlockedTopicIds(db: DB, userId: string): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    const nowIso = new Date().toISOString();
    const { data: ents, error } = await db.from("entitlements").select("scope,scope_id,expires_at").eq("user_id", userId);
    if (error) throw error;
    const unitIds: string[] = [];
    const courseIds: string[] = [];
    for (const e of (ents ?? []) as { scope: string; scope_id: string; expires_at: string | null }[]) {
      if (e.expires_at && e.expires_at < nowIso) continue;
      if (e.scope === "topic") out.add(e.scope_id);
      else if (e.scope === "exam_unit") unitIds.push(e.scope_id);
      else if (e.scope === "course") courseIds.push(e.scope_id);
    }
    if (unitIds.length) { const { data: mem } = await db.from("exam_unit_chapters").select("chapter_id").in("exam_unit_id", unitIds); for (const m of (mem ?? []) as { chapter_id: string }[]) out.add(m.chapter_id); }
    if (courseIds.length) { const { data: chs } = await db.from("chapters").select("id").in("course_id", courseIds); for (const c of (chs ?? []) as { id: string }[]) out.add(c.id); }
  } catch { /* entitlements not applied yet — no unlocks (paid stays locked) */ }
  return out;
}

/** The caller's unlocked topic ids — the shell marks paid sets in these topics as playable. */
export const fetchMyUnlockedTopics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<string[]> => {
    const db = await admin();
    return [...(await unlockedTopicIds(db, context.userId as string))];
  });

/** HONEST-PAYWALL — the three "no video" outcomes are DIFFERENT answers and the client must be
 *  able to tell them apart: `locked` (show the paywall — the ONLY case that should), `unpublished`
 *  (grant is fine, no ready video), `not_found` (stale tree). A thrown error is reserved for real
 *  infrastructure failure, so the client's catch can honestly say "couldn't reach the server —
 *  retry" instead of showing a paying student the paywall over a wifi blip. */
export type SetPlaybackResult =
  | { status: "ok"; playbackId: string }
  | { status: "locked" }
  | { status: "unpublished" }
  | { status: "not_found" };

/** SECURE per-set playback fetch. A paid set's id is never in the tree; the client asks for it
 *  here, and it's returned ONLY when the set is free or the caller holds a covering grant. */
export const getSetPlayback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ setId: z.string() }).parse(d))
  .handler(async ({ data, context }): Promise<SetPlaybackResult> => {
    const db = await admin();
    const { data: scenes, error } = await db.from("canvas_scenes").select("nodes_json");
    if (error) throw new Error(error.message);
    type Deck = { id: string; status?: string; payloadType?: string; access?: string; topicId?: string | null; lessonId?: string | null };
    let deck: Deck | undefined;
    for (const s of (scenes ?? []) as { nodes_json?: { decks?: Deck[] } }[]) {
      deck = (s.nodes_json?.decks ?? []).find((d) => d.id === data.setId && d.status === "live" && d.payloadType === "cards");
      if (deck) break;
    }
    if (!deck) return { status: "not_found" };
    if (deck.access === "paid") {
      const unlocked = await unlockedTopicIds(db, context.userId as string);
      if (!deck.topicId || !unlocked.has(deck.topicId)) return { status: "locked" };
    }
    if (!deck.lessonId) return { status: "unpublished" };
    const { data: vids } = await db.from("lesson_videos").select("playback_id,version,stage").eq("lesson_id", deck.lessonId).eq("stage", "ready").order("version", { ascending: false }).limit(1);
    const playbackId = ((vids?.[0] as { playback_id: string | null } | undefined)?.playback_id) ?? null;
    return playbackId ? { status: "ok", playbackId } : { status: "unpublished" };
  });

/** FULFILLMENT STUB — grant entitlements for the caller's OWN orders (matched by email). No
 *  Stripe: this stands in for "on order paid". Only orders that resolved their chapters (the
 *  order_chapters.chapter_id bridge) grant topic entitlements; unbridged free-text is skipped. */
export const claimMyOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ granted: number }> => {
    const db = await admin();
    const email = (context.claims as { email?: string } | undefined)?.email;
    if (!email) return { granted: 0 };
    const { data: orders } = await db.from("orders").select("id,status").eq("email", email).in("status", ["paid", "delivered"]);
    const orderIds = (orders ?? []).map((o: { id: string }) => o.id);
    if (!orderIds.length) return { granted: 0 };
    const { data: ocs } = await db.from("order_chapters").select("order_id,chapter_id").in("order_id", orderIds);
    const grants = ((ocs ?? []) as { order_id: string; chapter_id: string | null }[])
      .filter((oc) => !!oc.chapter_id)
      .map((oc) => ({ user_id: context.userId as string, scope: "topic", scope_id: oc.chapter_id, order_id: oc.order_id, source: "order" }));
    if (!grants.length) return { granted: 0 };
    const { error } = await db.from("entitlements").upsert(grants, { onConflict: "user_id,scope,scope_id" });
    if (error) throw new Error(error.message);
    return { granted: grants.length };
  });
