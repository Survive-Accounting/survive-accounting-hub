// SITE CHAT — the pure half: which auto-replies a visitor message sets off, when each lands, and
// when the visitor should see "typing". Server functions in site-chat.functions.ts; tables in
// migration 20260913_1600_site_chat.sql.
//
// King's brief (Lee, 2026-09-13): auto-replies "should not sound or look like they are coming from a
// bot. They should feel natural and human," with "a reply delay option so we can control how long
// the system waits before sending an automatic reply, depending on the situation or type of
// message." So an auto-reply is stored and shown exactly like a human one (no badge on the visitor's
// side), it waits its own delay, the visitor sees typing for a believable stretch before it lands,
// two replies from one message never arrive in the same second, and {name} reads naturally with or
// without a nickname.

export type ChatTrigger = "first_message" | "keyword" | "no_reply";

export interface ChatRule {
  id: string;
  name: string;
  trigger: ChatTrigger;
  keywords: string[];
  body: string;
  delaySeconds: number;
  enabled: boolean;
  sort: number;
}

export interface ChatRuleContext {
  /** This is the visitor's first message in the conversation. */
  isFirst: boolean;
  body: string;
  /** Rules that already fired in this conversation — each fires once per conversation. */
  fired: ReadonlySet<string>;
  /** A person has already replied in this conversation. */
  hasAdminReply: boolean;
  nickname: string | null;
}

export interface ScheduledReply { ruleId: string; body: string; deliverAt: Date }

const TRIGGER_ORDER: Record<ChatTrigger, number> = { first_message: 0, keyword: 1, no_reply: 2 };

/** A keyword matches as a whole word or phrase, any case. */
export function keywordHit(body: string, keywords: readonly string[]): boolean {
  const hay = ` ${body.toLowerCase().replace(/[^a-z0-9']+/g, " ")} `;
  return keywords.some((k) => {
    const needle = k.toLowerCase().replace(/[^a-z0-9']+/g, " ").trim();
    return !!needle && hay.includes(` ${needle} `);
  });
}

/** "{name}" → the nickname; without one, the placeholder goes and the sentence still reads:
 *  "Hey {name}!" → "Hey!", "Thanks, {name}." → "Thanks.". */
export function fillName(body: string, nickname: string | null): string {
  const first = (nickname ?? "").trim().split(/\s+/)[0] ?? "";
  if (first) return body.replace(/\{name\}/g, first);
  return body
    .replace(/[,\s]*\{name\}(?=[\s!?.,]|$)/g, "")
    .replace(/\{name\}/g, "")
    .replace(/\s+([!?.,])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** How long a person takes to type this — the gap between two replies and the typing lead. */
export function typingSeconds(body: string): number {
  return Math.round(Math.min(9, 3 + body.length / 28) * 1000) / 1000;
}

/** The auto-replies one visitor message sets off, each with its landing time. */
export function pickAutoReplies(rules: readonly ChatRule[], ctx: ChatRuleContext, now: Date): ScheduledReply[] {
  const hits = rules
    .filter((r) => r.enabled && r.body.trim() && !ctx.fired.has(r.id))
    .filter((r) =>
      r.trigger === "first_message" ? ctx.isFirst
        : r.trigger === "keyword" ? keywordHit(ctx.body, r.keywords)
          : !ctx.hasAdminReply)
    .sort((a, b) => TRIGGER_ORDER[a.trigger] - TRIGGER_ORDER[b.trigger] || a.sort - b.sort);
  const out: ScheduledReply[] = [];
  let floor = now.getTime();
  for (const r of hits) {
    const body = fillName(r.body, ctx.nickname);
    // Never two in the same breath: each lands at least a typing-length after the one before.
    const at = Math.max(now.getTime() + Math.max(0, r.delaySeconds) * 1000, floor + typingSeconds(body) * 1000);
    out.push({ ruleId: r.id, body, deliverAt: new Date(at) });
    floor = at;
  }
  return out;
}

/** Whether the visitor sees "typing": a reply is due within its own typing length. */
export function isTyping(pending: readonly { body: string; deliverAt: Date | string }[], now: Date): boolean {
  return pending.some((p) => {
    const ms = new Date(p.deliverAt).getTime() - now.getTime();
    return ms > 0 && ms <= typingSeconds(p.body) * 1000;
  });
}

/** The inbox's reading of a conversation. */
export function inboxState(c: { last_visitor_at: string | null; last_admin_at: string | null; admin_read_at: string | null; status: string }): { unread: boolean; needsReply: boolean; replied: boolean } {
  const v = c.last_visitor_at ? Date.parse(c.last_visitor_at) : 0;
  const a = c.last_admin_at ? Date.parse(c.last_admin_at) : 0;
  const read = c.admin_read_at ? Date.parse(c.admin_read_at) : 0;
  return { unread: v > read, needsReply: c.status === "open" && v > a, replied: a > 0 };
}
