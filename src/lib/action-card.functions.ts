// THE ACTION CARD (/x/<ref>) — everything Lee can do about one person, behind one link.
//
// The ref is sms_conversations.short_ref on the main line. From the phone number on that row this
// resolves the chapter claim, the rep application and the message thread (texts, calls,
// voicemails), and exposes the actions: approve/decline a claim, review a rep application, ring
// Lee's phone and bridge, mint a browser-softphone token, and "send me a preview" for the alerts.
//
// AUTH: every handler calls assertAdmin() — the HttpOnly admin-session cookie, the same gate every
// /admin server function uses. The link in the alert is a pointer, not a permission.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { assertAdmin } from "@/lib/admin-session.functions";
import { goPath } from "@/lib/greek-go.functions";
import { ORIGIN, type TemplateCtx } from "@/lib/comms/templates";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped-table convention
type DB = { from: (t: string) => any };
const admin = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

export interface CardClaim {
  id: string; status: string; name: string; position: string; email: string; phone: string;
  intent: "committed" | "curious" | "exploring" | null; membersAtClaim: number; createdAt: string; decidedAt: string | null;
  chapterName: string; letters: string; schoolName: string; goUrl: string | null; queueUrl: string;
}
export interface CardRep {
  id: string; name: string; email: string | null; phone: string | null; campusName: string | null; campusSlug: string | null;
  applicationStatus: string | null; repStatus: string | null; phoneVerified: boolean; coverage: string | null;
  graduationYear: number | null; courseStatus: string | null; ownChapter: string | null; roles: string[]; pitch: string | null;
  reachCount: number; submittedAt: string | null; createdAt: string; isTest: boolean; rosterUrl: string; viewAsUrl: string;
}
export interface CardMessage {
  id: string; direction: "in" | "out"; author: string | null; body: string; kind: "sms" | "call" | "voicemail"; createdAt: string;
  recordingSid: string | null; durationSeconds: number | null; transcriptStatus: string | null;
}
export interface ActionCard {
  ref: number; conversationId: string; phone: string; phonePretty: string; mainLine: string; mainLinePretty: string;
  kind: string; subject: string | null; status: string; campusName: string | null; lastMessageAt: string;
  claim: CardClaim | null; rep: CardRep | null; messages: CardMessage[];
  voice: { bridge: boolean; browser: boolean; leeCellPretty: string | null };
  /** True when migration 20260902_1500 has not been applied (kind/subject missing). */
  schemaGap: boolean;
}

export const getActionCard = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ ref: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; card: ActionCard } | { ok: false; error: string }> => {
    await assertAdmin();
    const db = await admin();
    const { prettyPhone } = await import("@/lib/comms/refs.server");
    const { data: convo, error } = await db.from("sms_conversations").select("*").eq("short_ref", data.ref).maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!convo) return { ok: false, error: `No conversation with ref #${data.ref}.` };
    const phone = convo.student_phone as string;
    const schemaGap = !("kind" in convo);

    // ---- chapter claim (latest for this phone) ----
    let claim: CardClaim | null = null;
    try {
      const { data: c } = await db.from("greek_chapter_claims").select("*").eq("phone", phone).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (c?.id) {
        const { data: roster } = await db.from("campus_greek_chapters").select("id,campus_id,slug,greek_org_id,letters").eq("id", c.campus_greek_chapter_id).maybeSingle();
        const { data: campus } = roster?.campus_id ? await db.from("campuses").select("slug,name,short_name").eq("id", roster.campus_id).maybeSingle() : { data: null };
        const { data: org } = roster?.greek_org_id ? await db.from("greek_orgs").select("name").eq("id", roster.greek_org_id).maybeSingle() : { data: null };
        const { chapterSmsLabel } = await import("@/lib/greek-letters");
        const chapterName = ((org?.name as string) ?? "").trim() || "Chapter";
        claim = {
          id: c.id as string, status: c.status as string, name: c.name as string, position: c.position as string,
          email: c.email as string, phone: c.phone as string, intent: (c.intent as CardClaim["intent"]) ?? null,
          membersAtClaim: (c.members_at_claim as number) ?? 0, createdAt: c.created_at as string, decidedAt: (c.decided_at as string) ?? null,
          chapterName, letters: chapterSmsLabel(chapterName, (roster?.letters as string) ?? null),
          schoolName: (campus?.short_name as string) || (campus?.name as string) || "",
          goUrl: campus?.slug && roster?.slug ? goPath(campus.slug as string, roster.slug as string) : null,
          queueUrl: `/outreach/greek-claims?claim=${c.id as string}`,
        };
      }
    } catch (e) { console.warn("[x] claim lookup failed:", (e as Error).message); }

    // ---- campus rep ----
    let rep: CardRep | null = null;
    try {
      const { data: r } = await db.from("referral_partners").select("*").eq("type", "campus_rep").eq("phone", phone).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (r?.id) {
        const { data: campus } = r.campus_id ? await db.from("campuses").select("slug,name,short_name").eq("id", r.campus_id).maybeSingle() : { data: null };
        let ownChapter: string | null = null;
        if (r.own_chapter_id) {
          const { data: ch } = await db.from("campus_greek_chapters").select("greek_org_id,nickname").eq("id", r.own_chapter_id).maybeSingle();
          if (ch?.greek_org_id) { const { data: org } = await db.from("greek_orgs").select("name").eq("id", ch.greek_org_id).maybeSingle(); ownChapter = (org?.name as string) ?? (ch.nickname as string) ?? null; }
        }
        const { count } = await db.from("rep_chapter_reach").select("id", { count: "exact", head: true }).eq("partner_id", r.id);
        rep = {
          id: r.id as string, name: r.name as string, email: (r.email as string) ?? null, phone: (r.phone as string) ?? null,
          campusName: (campus?.short_name as string) || (campus?.name as string) || null, campusSlug: (campus?.slug as string) ?? null,
          applicationStatus: (r.application_status as string) ?? null, repStatus: (r.rep_status as string) ?? null,
          phoneVerified: !!r.phone_verified_at, coverage: (r.rep_coverage as string) ?? null,
          graduationYear: (r.graduation_year as number) ?? null, courseStatus: (r.course_status as string) ?? null,
          ownChapter, roles: Array.isArray(r.campus_roles) ? (r.campus_roles as string[]) : [], pitch: (r.pitch as string) ?? null,
          reachCount: count ?? 0, submittedAt: (r.onboarding_submitted_at as string) ?? null, createdAt: r.created_at as string,
          isTest: !!r.is_test, rosterUrl: "/admin/reps/roster", viewAsUrl: `/admin/reps/view/${r.id as string}`,
        };
      }
    } catch (e) { console.warn("[x] rep lookup failed:", (e as Error).message); }

    // ---- the thread ----
    const { data: msgs } = await db.from("sms_messages").select("*").eq("conversation_id", convo.id).order("created_at", { ascending: false }).limit(40);
    const messages: CardMessage[] = ((msgs ?? []) as Array<Record<string, unknown>>).reverse().map((m) => ({
      id: m.id as string, direction: m.direction as "in" | "out", author: (m.author as string) ?? null, body: m.body as string,
      kind: ((m.kind as string) ?? "sms") as CardMessage["kind"], createdAt: m.created_at as string,
      recordingSid: (m.recording_sid as string) ?? null, durationSeconds: (m.duration_seconds as number) ?? null, transcriptStatus: (m.transcript_status as string) ?? null,
    }));

    let campusName: string | null = claim?.schoolName ?? rep?.campusName ?? null;
    if (!campusName && convo.campus_id) {
      const { data: campus } = await db.from("campuses").select("name,short_name").eq("id", convo.campus_id).maybeSingle();
      campusName = (campus?.short_name as string) || (campus?.name as string) || null;
    }

    const { voiceConfig, leeCell } = await import("@/lib/voice/voice.server");
    const cfg = voiceConfig();
    return {
      ok: true,
      card: {
        ref: data.ref, conversationId: convo.id as string, phone, phonePretty: prettyPhone(phone),
        mainLine: convo.campus_number as string, mainLinePretty: prettyPhone(convo.campus_number as string),
        kind: (convo.kind as string) ?? (claim ? "claim" : rep ? "rep" : "student"), subject: (convo.subject as string) ?? null,
        status: convo.status as string, campusName, lastMessageAt: convo.last_message_at as string,
        claim, rep, messages,
        voice: { bridge: cfg.bridge, browser: cfg.browser, leeCellPretty: leeCell() ? prettyPhone(leeCell()) : null },
        schemaGap,
      },
    };
  });

export const decideClaimFromCard = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ claimId: z.string().uuid(), decision: z.enum(["approved", "rejected"]) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    await assertAdmin();
    const db = await admin();
    const { decideClaimCore } = await import("@/lib/greek-claims.functions");
    const { isTestRequest } = await import("@/lib/test-mode.functions");
    return decideClaimCore(db as unknown as Parameters<typeof decideClaimCore>[0], data.claimId, data.decision, await isTestRequest());
  });

/** Ring Lee's phone from the main line, then dial this person. The person sees the main line. */
export const startBridgeCall = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ ref: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; sid?: string; error?: string }> => {
    await assertAdmin();
    const db = await admin();
    const { data: convo } = await db.from("sms_conversations").select("id,campus_number,status").eq("short_ref", data.ref).maybeSingle();
    if (!convo?.id) return { ok: false, error: `No conversation with ref #${data.ref}.` };
    if (convo.status === "opted_out") return { ok: false, error: "They opted out (STOP). Not calling." };
    const { createBridgeCall } = await import("@/lib/voice/voice.server");
    return createBridgeCall({ conversationId: convo.id as string, mainLine: convo.campus_number as string });
  });

/** A one-hour Voice SDK token for the browser softphone. */
export const getVoiceToken = createServerFn({ method: "POST" })
  .handler(async (): Promise<{ ok: boolean; token?: string; error?: string }> => {
    await assertAdmin();
    const { voiceConfig } = await import("@/lib/voice/voice.server");
    if (!voiceConfig().browser) return { ok: false, error: "Browser calling needs TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET and TWILIO_TWIML_APP_SID on the server." };
    const { voiceAccessToken } = await import("@/lib/voice/voice-token");
    const token = voiceAccessToken({
      accountSid: process.env.TWILIO_ACCOUNT_SID!, apiKeySid: process.env.TWILIO_API_KEY_SID!, apiKeySecret: process.env.TWILIO_API_KEY_SECRET!,
      twimlAppSid: process.env.TWILIO_TWIML_APP_SID!, identity: "lee",
    });
    return { ok: true, token };
  });

// ---- previews: real sends to Lee, marked [PREVIEW], so the copy can be judged on a phone -------
export const PREVIEW_KINDS = ["claim", "claim_curious", "rep_signup", "rep_applied", "call", "voicemail"] as const;
export type PreviewKind = (typeof PREVIEW_KINDS)[number];

function previewCtx(kind: PreviewKind): { key: "founder_priority" | "founder_call" | "founder_voicemail"; ctx: TemplateCtx } {
  const base = { ref: 241, actionLink: `${ORIGIN}/x/241`, name: "Jordan Ellis", phone: "+16625550142", email: "jellis@go.olemiss.edu", school: "Ole Miss", campusSlug: "university-of-mississippi" };
  switch (kind) {
    case "claim": return { key: "founder_priority", ctx: { ...base, kind: "greek_claim", chapter: "Sigma Chi", letters: "ΣX", role: "Academic / Scholarship Chair", intent: "committed", members: 84, chapterLink: `${ORIGIN}/go/university-of-mississippi/sigma-chi`, adminLink: `${ORIGIN}/outreach/greek-claims?claim=preview` } };
    case "claim_curious": return { key: "founder_priority", ctx: { ...base, kind: "greek_claim", name: "Maddie Carter", chapter: "Kappa Alpha Theta", letters: "KAΘ", role: "Treasurer", intent: "curious", members: 12, chapterLink: `${ORIGIN}/go/university-of-mississippi/kappa-alpha-theta`, adminLink: `${ORIGIN}/outreach/greek-claims?claim=preview` } };
    case "rep_signup": return { key: "founder_priority", ctx: { ...base, kind: "rep", ref: 242, actionLink: `${ORIGIN}/x/242`, repStage: "signup", applicationLink: `${ORIGIN}/admin/reps/roster` } };
    case "rep_applied": return { key: "founder_priority", ctx: { ...base, kind: "rep", ref: 242, actionLink: `${ORIGIN}/x/242`, repStage: "applied", detail: "Class of 2028, in Sigma Chi, can reach 6 chapters, Scholarship Chair", note: "I know every house on the row and I'm in ACCY 201 right now.", applicationLink: `${ORIGIN}/admin/reps/roster` } };
    case "call": return { key: "founder_call", ctx: { ...base, callerLabel: "Jordan Ellis, ΣX claim" } };
    case "voicemail": return { key: "founder_voicemail", ctx: { ...base, callerLabel: "Jordan Ellis, ΣX claim", durationSeconds: 42, transcript: "Hey Lee, it's Jordan from Sigma Chi. We're ready to sponsor seats for the fall. Call me back when you can, I've got the treasurer with me." } };
  }
}

export const sendAlertPreviews = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ kinds: z.array(z.enum(PREVIEW_KINDS)).min(1).max(6) }).parse(d))
  .handler(async ({ data }): Promise<{ results: { kind: PreviewKind; email: string; sms: string }[] }> => {
    await assertAdmin();
    const db = await admin();
    const { founderAlert } = await import("@/lib/comms/send.server");
    const results: { kind: PreviewKind; email: string; sms: string }[] = [];
    for (const kind of data.kinds) {
      const { key, ctx } = previewCtx(kind);
      const r = await founderAlert({ db, ctx, key, priority: true, preview: true });
      const fmt = (o: { status: string; reason?: string }) => o.status + (o.reason ? ` (${o.reason})` : "");
      results.push({ kind, email: fmt(r.email), sms: fmt(r.sms) });
    }
    return { results };
  });

/** What the previews will say, rendered — for the page to show beside the buttons. */
export const renderAlertPreviews = createServerFn({ method: "POST" })
  .handler(async (): Promise<{ kind: PreviewKind; subject: string; sms: string; text: string }[]> => {
    await assertAdmin();
    const { renderTemplate } = await import("@/lib/comms/templates");
    return PREVIEW_KINDS.map((kind) => {
      const { key, ctx } = previewCtx(kind);
      const r = renderTemplate(key, ctx);
      return { kind, subject: r.subject, sms: r.sms ?? "", text: r.text };
    });
  });
