// SITE CHAT — server doors. The visitor side (components/learn/SiteChat.tsx via LearnTextLee) and the
// admin inbox (routes/admin.growth.chat.tsx). Rules and timing are pure, in site-chat-rules.ts.
//
// Visitors are the sa_anon device id (lib/device-id.ts) — every visitor door checks the conversation
// belongs to that id, and the service-role client is imported inside the handler, never at module
// scope. Tables: migration/supabase-migrations/20260913_1600_site_chat.sql; until it runs, every door
// fails loudly naming it.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { inboxState, isTyping, pickAutoReplies, type ChatRule, type ChatTrigger } from "./site-chat-rules";

const MIGRATION = "Chat isn't set up yet — run migration/supabase-migrations/20260913_1600_site_chat.sql in the Supabase SQL editor.";
const db = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
};
function fail(error: { message: string } | null | undefined): never {
  const m = error?.message ?? "unknown error";
  if (/chat_(conversations|messages|auto_replies)/i.test(m) && /does not exist|schema cache|not find/i.test(m)) throw new Error(MIGRATION);
  throw new Error(m);
}

export interface ChatMessageView { id: string; sender: "visitor" | "admin" | "auto"; body: string; at: string; scheduled?: boolean; adminEmail?: string | null }
export interface VisitorChatView { conversationId: string | null; nickname: string | null; messages: ChatMessageView[]; typing: boolean; unread: number }

const visitorId = z.string().min(8).max(80);
const EMPTY: VisitorChatView = { conversationId: null, nickname: null, messages: [], typing: false, unread: 0 };

type ConvRow = { id: string; visitor_id: string; nickname: string | null; campus: string | null; page: string | null; status: string; created_at: string; last_message_at: string | null; last_visitor_at: string | null; last_admin_at: string | null; admin_read_at: string | null; visitor_read_at: string | null; is_test: boolean };
type MsgRow = { id: string; conversation_id: string; sender: "visitor" | "admin" | "auto"; body: string; created_at: string; deliver_at: string; auto_rule_id: string | null; admin_email: string | null };

/** What the visitor sees: delivered messages only, auto-replies shown as Lee's. */
async function visitorView(d: { from: (t: string) => any }, conv: ConvRow, markRead: boolean): Promise<VisitorChatView> {
  const now = new Date();
  const { data, error } = await d.from("chat_messages").select("id,sender,body,created_at,deliver_at").eq("conversation_id", conv.id).order("deliver_at", { ascending: true }).limit(500);
  if (error) fail(error);
  const rows = (data ?? []) as MsgRow[];
  const delivered = rows.filter((m) => Date.parse(m.deliver_at) <= now.getTime());
  const pending = rows.filter((m) => Date.parse(m.deliver_at) > now.getTime());
  const readAt = conv.visitor_read_at ? Date.parse(conv.visitor_read_at) : 0;
  const unread = delivered.filter((m) => m.sender !== "visitor" && Date.parse(m.deliver_at) > readAt).length;
  if (markRead && unread) await d.from("chat_conversations").update({ visitor_read_at: now.toISOString() }).eq("id", conv.id);
  return {
    conversationId: conv.id,
    nickname: conv.nickname,
    // An auto-reply is Lee's voice on the visitor's side — sender "admin", no marker.
    messages: delivered.map((m) => ({ id: m.id, sender: m.sender === "visitor" ? "visitor" : "admin", body: m.body, at: m.deliver_at })),
    typing: isTyping(pending.map((m) => ({ body: m.body, deliverAt: m.deliver_at })), now),
    unread: markRead ? 0 : unread,
  };
}

async function ownConversation(d: { from: (t: string) => any }, vid: string, conversationId: string | null | undefined): Promise<ConvRow | null> {
  let q = d.from("chat_conversations").select("*").eq("visitor_id", vid);
  q = conversationId ? q.eq("id", conversationId) : q.eq("status", "open").order("created_at", { ascending: false }).limit(1);
  const { data, error } = await q;
  if (error) fail(error);
  return ((data ?? [])[0] as ConvRow | undefined) ?? null;
}

/** The visitor's conversation, if any. `open` marks replies read. */
export const chatPoll = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ visitorId, conversationId: z.string().uuid().nullable().optional(), open: z.boolean().default(false) }).parse(d))
  .handler(async ({ data }): Promise<VisitorChatView> => {
    const d = await db();
    const conv = await ownConversation(d, data.visitorId, data.conversationId);
    if (!conv) return EMPTY;
    return visitorView(d, conv, data.open);
  });

export const chatSend = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    visitorId,
    conversationId: z.string().uuid().nullable().optional(),
    body: z.string().trim().min(1).max(2000),
    nickname: z.string().trim().max(60).nullable().optional(),
    campus: z.string().trim().max(120).nullable().optional(),
    page: z.string().max(300).nullable().optional(),
    isTest: z.boolean().default(false),
  }).parse(d))
  .handler(async ({ data }): Promise<VisitorChatView> => {
    const d = await db();
    const now = new Date();
    const { isTestOrBetaRequest } = await import("@/lib/beta-invite.server");
    const isTest = data.isTest || (await isTestOrBetaRequest());
    let conv = await ownConversation(d, data.visitorId, data.conversationId);
    if (conv && conv.status === "closed") conv = null;
    const nickname = data.nickname?.trim() || null;
    if (!conv) {
      const { data: row, error } = await d.from("chat_conversations").insert({
        visitor_id: data.visitorId, nickname, campus: data.campus ?? null, page: data.page ?? null, is_test: isTest,
      }).select("*").single();
      if (error) fail(error);
      conv = row as ConvRow;
    }
    // A LIGHT RATE LIMIT: a person doesn't send nine messages in a minute.
    const since = new Date(now.getTime() - 60_000).toISOString();
    const recent = await d.from("chat_messages").select("id", { count: "exact", head: true }).eq("conversation_id", conv.id).eq("sender", "visitor").gte("created_at", since);
    if (recent.error) fail(recent.error);
    if ((recent.count ?? 0) >= 8) throw new Error("That's a lot of messages at once — give it a minute.");

    const prior = await d.from("chat_messages").select("sender,auto_rule_id").eq("conversation_id", conv.id);
    if (prior.error) fail(prior.error);
    const priorRows = (prior.data ?? []) as Pick<MsgRow, "sender" | "auto_rule_id">[];
    const ins = await d.from("chat_messages").insert({ conversation_id: conv.id, sender: "visitor", body: data.body });
    if (ins.error) fail(ins.error);
    const convPatch: Record<string, unknown> = { last_message_at: now.toISOString(), last_visitor_at: now.toISOString(), updated_at: now.toISOString() };
    if (nickname && nickname !== conv.nickname) { convPatch.nickname = nickname; conv.nickname = nickname; }
    await d.from("chat_conversations").update(convPatch).eq("id", conv.id);

    // AUTO-REPLIES: scheduled now, delivered by time (the visitor view hides them until then).
    const isFirst = !priorRows.some((m) => m.sender === "visitor");
    try {
      const { data: ruleRows, error } = await d.from("chat_auto_replies").select("*").eq("enabled", true).order("sort", { ascending: true });
      if (error) fail(error);
      const rules = ((ruleRows ?? []) as RuleRow[]).map(ruleOf);
      const picks = pickAutoReplies(rules, {
        isFirst, body: data.body, nickname: conv.nickname,
        fired: new Set(priorRows.map((m) => m.auto_rule_id).filter((x): x is string => !!x)),
        hasAdminReply: priorRows.some((m) => m.sender === "admin"),
      }, now);
      if (picks.length) {
        const r = await d.from("chat_messages").insert(picks.map((p) => ({ conversation_id: conv!.id, sender: "auto", body: p.body, deliver_at: p.deliverAt.toISOString(), auto_rule_id: p.ruleId })));
        if (r.error) console.warn("[site-chat] auto-replies not scheduled:", r.error.message);
      }
    } catch (e) { console.warn("[site-chat] auto-replies skipped:", e instanceof Error ? e.message : e); }

    // TELL LEE about a new conversation (first message only), best-effort.
    if (isFirst && !isTest) {
      try {
        const { sendResendEmail } = await import("@/lib/email.server");
        const { FOUNDER_EMAIL } = await import("@/lib/comms/send.server");
        const who = conv.nickname || "Someone";
        await sendResendEmail({
          to: process.env.CHAT_ALERT_EMAIL || FOUNDER_EMAIL,
          subject: `New chat from ${who}${conv.campus ? ` (${conv.campus})` : ""}`,
          text: `${who} wrote:\n\n${data.body}\n\nReply: https://surviveaccounting.com/admin/growth/chat?c=${conv.id}`,
        });
      } catch (e) { console.warn("[site-chat] alert email not sent:", e instanceof Error ? e.message : e); }
    }
    return visitorView(d, conv, true);
  });

export const chatSetNickname = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ visitorId, conversationId: z.string().uuid(), nickname: z.string().trim().max(60) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const d = await db();
    const conv = await ownConversation(d, data.visitorId, data.conversationId);
    if (!conv) throw new Error("That conversation isn't yours.");
    const r = await d.from("chat_conversations").update({ nickname: data.nickname || null, updated_at: new Date().toISOString() }).eq("id", conv.id);
    if (r.error) fail(r.error);
    return { ok: true };
  });

// ── ADMIN ─────────────────────────────────────────────────────────────────────────────────────

type RuleRow = { id: string; name: string; trigger: ChatTrigger; keywords: string[] | null; body: string; delay_seconds: number; enabled: boolean; sort: number };
const ruleOf = (r: RuleRow): ChatRule => ({ id: r.id, name: r.name, trigger: r.trigger, keywords: r.keywords ?? [], body: r.body, delaySeconds: r.delay_seconds, enabled: r.enabled, sort: r.sort });

async function adminDb() {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  return db();
}

export interface InboxRow {
  id: string; nickname: string | null; campus: string | null; page: string | null; status: string; createdAt: string;
  lastAt: string | null; preview: string; previewSender: string; unread: boolean; needsReply: boolean; replied: boolean; scheduled: number; messages: number; isTest: boolean;
}

export const chatInbox = createServerFn({ method: "POST" }).handler(async (): Promise<InboxRow[]> => {
  const d = await adminDb();
  const { data: convs, error } = await d.from("chat_conversations").select("*").order("last_message_at", { ascending: false, nullsFirst: false }).limit(300);
  if (error) fail(error);
  const rows = (convs ?? []) as ConvRow[];
  if (!rows.length) return [];
  const { data: msgs, error: mErr } = await d.from("chat_messages").select("conversation_id,sender,body,deliver_at").in("conversation_id", rows.map((c) => c.id)).order("deliver_at", { ascending: true }).limit(5000);
  if (mErr) fail(mErr);
  const now = Date.now();
  const by = new Map<string, MsgRow[]>();
  for (const m of (msgs ?? []) as MsgRow[]) { const l = by.get(m.conversation_id) ?? []; l.push(m); by.set(m.conversation_id, l); }
  return rows.map((c) => {
    const list = by.get(c.id) ?? [];
    const delivered = list.filter((m) => Date.parse(m.deliver_at) <= now);
    const last = delivered[delivered.length - 1];
    return {
      id: c.id, nickname: c.nickname, campus: c.campus, page: c.page, status: c.status, createdAt: c.created_at, lastAt: c.last_message_at,
      preview: last?.body.slice(0, 140) ?? "", previewSender: last?.sender ?? "", ...inboxState(c),
      scheduled: list.length - delivered.length, messages: delivered.length, isTest: c.is_test,
    };
  });
});

export const chatThread = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), markRead: z.boolean().default(true) }).parse(d))
  .handler(async ({ data }): Promise<{ conversation: InboxRow; messages: ChatMessageView[] }> => {
    const d = await adminDb();
    const { data: conv, error } = await d.from("chat_conversations").select("*").eq("id", data.id).single();
    if (error) fail(error);
    const c = conv as ConvRow;
    const { data: msgs, error: mErr } = await d.from("chat_messages").select("*").eq("conversation_id", c.id).order("deliver_at", { ascending: true }).limit(1000);
    if (mErr) fail(mErr);
    const now = Date.now();
    const list = (msgs ?? []) as MsgRow[];
    if (data.markRead && inboxState(c).unread) {
      const at = new Date().toISOString();
      await d.from("chat_conversations").update({ admin_read_at: at }).eq("id", c.id);
      c.admin_read_at = at;
    }
    const delivered = list.filter((m) => Date.parse(m.deliver_at) <= now);
    const last = delivered[delivered.length - 1];
    return {
      conversation: { id: c.id, nickname: c.nickname, campus: c.campus, page: c.page, status: c.status, createdAt: c.created_at, lastAt: c.last_message_at, preview: last?.body.slice(0, 140) ?? "", previewSender: last?.sender ?? "", ...inboxState(c), scheduled: list.length - delivered.length, messages: delivered.length, isTest: c.is_test },
      messages: list.map((m) => ({ id: m.id, sender: m.sender, body: m.body, at: m.deliver_at, scheduled: Date.parse(m.deliver_at) > now, adminEmail: m.admin_email })),
    };
  });

export const chatReply = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), body: z.string().trim().min(1).max(4000), who: z.string().max(200).nullable().optional() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const d = await adminDb();
    const now = new Date().toISOString();
    // A person answered: any auto-reply still waiting would talk over them.
    const del = await d.from("chat_messages").delete().eq("conversation_id", data.id).eq("sender", "auto").gt("deliver_at", now);
    if (del.error) fail(del.error);
    const ins = await d.from("chat_messages").insert({ conversation_id: data.id, sender: "admin", body: data.body, admin_email: data.who ?? null });
    if (ins.error) fail(ins.error);
    const up = await d.from("chat_conversations").update({ last_admin_at: now, last_message_at: now, admin_read_at: now, updated_at: now, status: "open" }).eq("id", data.id);
    if (up.error) fail(up.error);
    return { ok: true };
  });

export const chatUpdateConversation = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["open", "closed"]).optional(), unread: z.boolean().optional() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const d = await adminDb();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.status) patch.status = data.status;
    if (data.unread === true) patch.admin_read_at = null;
    if (data.unread === false) patch.admin_read_at = new Date().toISOString();
    const r = await d.from("chat_conversations").update(patch).eq("id", data.id);
    if (r.error) fail(r.error);
    return { ok: true };
  });

/** A scheduled auto-reply: send it now, or cancel it. */
export const chatScheduled = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ messageId: z.string().uuid(), action: z.enum(["send_now", "cancel"]) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const d = await adminDb();
    const now = new Date().toISOString();
    const r = data.action === "cancel"
      ? await d.from("chat_messages").delete().eq("id", data.messageId).eq("sender", "auto").gt("deliver_at", now)
      : await d.from("chat_messages").update({ deliver_at: now }).eq("id", data.messageId).eq("sender", "auto");
    if (r.error) fail(r.error);
    return { ok: true };
  });

export const chatRules = createServerFn({ method: "POST" }).handler(async (): Promise<ChatRule[]> => {
  const d = await adminDb();
  const { data, error } = await d.from("chat_auto_replies").select("*").order("sort", { ascending: true }).order("created_at", { ascending: true });
  if (error) fail(error);
  return ((data ?? []) as RuleRow[]).map(ruleOf);
});

export const chatSaveRule = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().nullable(),
    name: z.string().trim().max(120),
    trigger: z.enum(["first_message", "keyword", "no_reply"]),
    keywords: z.array(z.string().trim().min(1).max(60)).max(40),
    body: z.string().trim().min(1).max(2000),
    delaySeconds: z.number().int().min(0).max(86400),
    enabled: z.boolean(),
    sort: z.number().int().min(0).max(1000),
  }).parse(d))
  .handler(async ({ data }): Promise<{ id: string }> => {
    const d = await adminDb();
    const row = { name: data.name, trigger: data.trigger, keywords: data.keywords, body: data.body, delay_seconds: data.delaySeconds, enabled: data.enabled, sort: data.sort, updated_at: new Date().toISOString() };
    const r = data.id
      ? await d.from("chat_auto_replies").update(row).eq("id", data.id).select("id").single()
      : await d.from("chat_auto_replies").insert(row).select("id").single();
    if (r.error) fail(r.error);
    return { id: String(r.data.id) };
  });

export const chatDeleteRule = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const d = await adminDb();
    const r = await d.from("chat_auto_replies").delete().eq("id", data.id);
    if (r.error) fail(r.error);
    return { ok: true };
  });
