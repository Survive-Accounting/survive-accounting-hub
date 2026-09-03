// ENGAGED CONTACTS — recording who moved, and reading it back.
//
// ── WHAT COUNTS AS SIGNAL ─────────────────────────────────────────────────────────────────────
// Not everyone we messaged. Only contacts showing something: a reply, a click, a forward that
// produced visits. The most valuable group is the one that CLICKED AND NEVER REPLIED — they found
// it useful enough to open and pass on and never told us, and nobody is following up with them.
//
// ── EVERY NUMBER HERE IS SOURCED, NONE ARE SEEDED ─────────────────────────────────────────────
//   replied / reply text / channel   growth_outreach_events, inbound direction
//   clicks, visitors, chapter opens  contact_ref_visit (this pass)
//   contact / campus / role          growth_contact_qc
//
// SIGNUPS AND PAID CONVERSIONS ARE NOT WIRED and are deliberately absent rather than rendered as
// zeros. Nothing today links a signup or an order back to a contact ref: the ref cookie is set on
// landing, but neither greek_chapter_members nor the order path records it. Showing "0 signups"
// for every contact would read as "nobody converted" when the truth is "we are not measuring it",
// and that is the more expensive mistake. See ENGAGED_NOT_WIRED.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same shape the other server modules use
type DB = { from: (t: string) => any };
const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

/** Stated in the UI so the gap is visible to whoever reads the table, not just to whoever reads
 *  this file. */
export const ENGAGED_NOT_WIRED =
  "Signups and paid conversions are not attributed to a contact yet — nothing records the ref at signup or checkout.";

const BOT_RE =
  /bot|crawler|spider|crawling|facebookexternalhit|slackbot|whatsapp|preview|monitor|curl|wget|headless|lighthouse/i;

/** Which surface a path is, decided at write time so counting never parses URLs. */
export function surfaceForPath(path: string): "chapter" | "council" | "campus" | "other" {
  if (/^\/go\/[^/]+\/council\//.test(path)) return "council";
  if (/^\/s\/[^/]+\/council/.test(path)) return "council";
  if (/^\/partners\/council\//.test(path)) return "council";
  if (/^\/go\/[^/]+\/[^/]+/.test(path)) return "chapter";
  if (/^\/s\/[^/]+\/[^/]+/.test(path)) return "chapter";
  if (/^\/s\/[^/]+\/?$/.test(path)) return "campus";
  return "other";
}

// ── RECORDING ────────────────────────────────────────────────────────────────────────────────
export const recordContactRefVisit = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      ref: z.string().uuid(),
      path: z.string().trim().min(1).max(400),
      campusId: z.string().uuid().nullable().optional().default(null),
      anonId: z.string().trim().max(64).nullable().optional().default(null),
    }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await admin();
    // Best effort by design: analytics must never break a share screen. A visit we failed to log
    // is a missing row; an exception here would be a blank page for someone holding a link.
    try {
      await db.from("contact_ref_visit").insert({
        contact_id: data.ref,
        campus_id: data.campusId,
        path: data.path.slice(0, 400),
        surface: surfaceForPath(data.path),
        anon_id: data.anonId,
        is_bot: false,
      });
    } catch { /* swallowed on purpose — see above */ }
    return { ok: true };
  });

/** Server-side bot check for callers that have the request. Exported so the same list is used
 *  wherever a visit is judged. */
export const looksLikeBot = (ua: string | null | undefined) => BOT_RE.test(ua ?? "");

// ── THE SCORE ────────────────────────────────────────────────────────────────────────────────
/** The brief's weights, as data so the table and any future sort agree. Clicks are capped
 *  because one person refreshing must not outrank a person who replied. */
export const ENGAGEMENT_WEIGHTS = {
  replied: 3,
  referred: 5,
  perUniqueVisitor: 2,
  visitorCap: 10,
  signup: 4,
  conversion: 10,
} as const;

export type EngagedRow = {
  contactId: string;
  name: string | null;
  email: string | null;
  campusId: string | null;
  campusName: string | null;
  role: string | null;
  channel: string | null;
  replied: boolean;
  replyText: string | null;
  clicks: number;
  uniqueVisitors: number;
  chapterPagesOpened: number;
  lastActivity: string | null;
  repCandidate: boolean;
  spokeByPhone: boolean;
  score: number;
};

export function engagementScore(r: {
  replied: boolean;
  uniqueVisitors: number;
  referred?: boolean;
  signups?: number;
  conversions?: number;
}): number {
  const w = ENGAGEMENT_WEIGHTS;
  return (
    (r.replied ? w.replied : 0) +
    (r.referred ? w.referred : 0) +
    Math.min(r.uniqueVisitors * w.perUniqueVisitor, w.visitorCap) +
    (r.signups ?? 0) * w.signup +
    (r.conversions ?? 0) * w.conversion
  );
}

async function pageAll<T>(run: (f: number, t: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await run(from, from + PAGE - 1);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

export const listEngagedContacts = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ rows: EngagedRow[]; notWired: string }> => {
    const db = await admin();

    const [events, visits] = await Promise.all([
      pageAll<{ contact_id: string | null; direction: string; channel: string | null; body: string | null; created_at: string }>(
        (f, t) => db.from("growth_outreach_events").select("contact_id,direction,channel,body,created_at").not("contact_id", "is", null).range(f, t),
      ),
      pageAll<{ contact_id: string; campus_id: string | null; surface: string; anon_id: string | null; created_at: string; is_bot: boolean }>(
        (f, t) => db.from("contact_ref_visit").select("contact_id,campus_id,surface,anon_id,created_at,is_bot").range(f, t),
      ),
    ]);

    // Only contacts with SIGNAL — a reply or a visit. Everyone we merely messaged is the cold
    // list, and putting them here would bury the handful of people who actually moved.
    const signal = new Set<string>();
    const inbound = new Map<string, { channel: string | null; body: string | null; at: string }>();
    const outboundChannel = new Map<string, string | null>();
    const lastAt = new Map<string, string>();

    const touch = (id: string, at: string) => {
      const prev = lastAt.get(id);
      if (!prev || at > prev) lastAt.set(id, at);
    };

    for (const e of events) {
      const id = e.contact_id!;
      const isIn = /^(in|inbound|reply|received)$/i.test(e.direction ?? "");
      if (isIn) {
        signal.add(id);
        const prev = inbound.get(id);
        if (!prev || e.created_at > prev.at) inbound.set(id, { channel: e.channel, body: e.body, at: e.created_at });
        touch(id, e.created_at);
      } else if (!outboundChannel.has(id)) {
        outboundChannel.set(id, e.channel);
      }
    }

    const clicks = new Map<string, number>();
    const visitors = new Map<string, Set<string>>();
    const chapterOpens = new Map<string, number>();
    const campusOf = new Map<string, string>();

    for (const v of visits) {
      if (v.is_bot) continue;
      signal.add(v.contact_id);
      clicks.set(v.contact_id, (clicks.get(v.contact_id) ?? 0) + 1);
      if (v.anon_id) {
        const s = visitors.get(v.contact_id) ?? new Set<string>();
        s.add(v.anon_id);
        visitors.set(v.contact_id, s);
      }
      if (v.surface === "chapter") chapterOpens.set(v.contact_id, (chapterOpens.get(v.contact_id) ?? 0) + 1);
      if (v.campus_id && !campusOf.has(v.contact_id)) campusOf.set(v.contact_id, v.campus_id);
      touch(v.contact_id, v.created_at);
    }

    if (signal.size === 0) return { rows: [], notWired: ENGAGED_NOT_WIRED };

    const ids = [...signal];
    const contacts = await pageAll<{
      id: string; name: string | null; email: string | null; role: string | null;
      campus_id: string | null; rep_candidate: boolean | null; spoke_by_phone: boolean | null;
    }>((f, t) =>
      db.from("growth_contact_qc")
        .select("id,name,email,role,campus_id,rep_candidate,spoke_by_phone")
        .in("id", ids.slice(0, 1000))
        .range(f, t),
    );

    const campusIds = [...new Set(contacts.map((c) => c.campus_id).filter(Boolean) as string[])];
    const campuses = campusIds.length
      ? await pageAll<{ id: string; name: string | null }>((f, t) =>
          db.from("campuses").select("id,name").in("id", campusIds.slice(0, 1000)).range(f, t))
      : [];
    const campusName = new Map(campuses.map((c) => [c.id, c.name]));

    const rows: EngagedRow[] = contacts.map((c) => {
      const reply = inbound.get(c.id);
      const uniq = visitors.get(c.id)?.size ?? 0;
      const campusId = c.campus_id ?? campusOf.get(c.id) ?? null;
      return {
        contactId: c.id,
        name: c.name,
        email: c.email,
        campusId,
        campusName: campusId ? campusName.get(campusId) ?? null : null,
        role: c.role,
        channel: reply?.channel ?? outboundChannel.get(c.id) ?? null,
        replied: !!reply,
        replyText: reply?.body ?? null,
        clicks: clicks.get(c.id) ?? 0,
        uniqueVisitors: uniq,
        chapterPagesOpened: chapterOpens.get(c.id) ?? 0,
        lastActivity: lastAt.get(c.id) ?? null,
        repCandidate: !!c.rep_candidate,
        spokeByPhone: !!c.spoke_by_phone,
        score: engagementScore({ replied: !!reply, uniqueVisitors: uniq }),
      };
    });

    rows.sort((a, b) => b.score - a.score || (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""));
    return { rows, notWired: ENGAGED_NOT_WIRED };
  },
);

/** The two hand-set flags. One call, one column, so a mis-click is one undo. */
export const setContactFlag = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      contactId: z.string().uuid(),
      field: z.enum(["rep_candidate", "spoke_by_phone"]),
      value: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await admin();
    const { error } = await db
      .from("growth_contact_qc")
      .update({ [data.field]: data.value })
      .eq("id", data.contactId);
    // This one FAILS LOUDLY: an admin toggling a flag and seeing it stick when it did not save is
    // how a rep-candidate list quietly loses people.
    if (error) throw new Error(`could not set ${data.field}: ${error.message}`);
    return { ok: true };
  });

// ── SHARE-CONTACT RESOLVER (learn-share-flow, Phase 3) ─────────────────────────────────────────
// Turns a `?by=<uuid>` sharer id into the vouching line "Sarah Chen · Panhellenic scholarship
// chair · shared this with you". Returns ONLY the vouching fields — name, role, campus, and the
// council TYPE — never an email or phone. That is the deliberate boundary: the banner exists to
// vouch a shared link, so it exposes exactly what a person would put on the message they forwarded,
// and nothing a stranger could misuse. The id is an unguessable UUID minted when THAT person
// shared, so this only ever surfaces someone's own vouching.
export interface ShareContact {
  name: string | null;
  role: string | null;
  campusName: string | null;
  /** ifc | panhellenic | nphc | mgc | other — the enum, not a display name. */
  councilType: string | null;
  /** True when this contact sits on a council (drives CTA state B — "get this to your chapter"). */
  isCouncil: boolean;
}

export const resolveShareContact = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<ShareContact | null> => {
    const db = await admin();
    // Best-effort, like every read on a share surface: a resolver failure means no banner, never a
    // broken page.
    try {
      const { data: row } = await db.from("growth_contact_qc")
        .select("name,role,campus_id,council_type,contact_type,entity_type").eq("id", data.id).maybeSingle();
      if (!row) return null;
      let campusName: string | null = null;
      if (row.campus_id) {
        const { data: camp } = await db.from("campuses").select("name").eq("id", row.campus_id).maybeSingle();
        campusName = (camp?.name ?? "").toString().trim() || null;
      }
      const councilType = (row.council_type ?? "").toString().trim() || null;
      const role = (row.role ?? "").toString().trim() || null;
      const isCouncil = !!councilType
        || row.entity_type === "council"
        || /council|panhellenic|ifc|nphc|mgc/i.test(role ?? "");
      return { name: (row.name ?? "").toString().trim() || null, role, campusName, councilType, isCouncil };
    } catch {
      return null;
    }
  });

/** Display name for a council type, for the banner's fallback org line. */
export function councilTypeLabel(t: string | null | undefined): string | null {
  switch ((t ?? "").toLowerCase()) {
    case "ifc": return "IFC";
    case "panhellenic": return "Panhellenic";
    case "nphc": return "NPHC";
    case "mgc": return "MGC";
    default: return null;
  }
}
