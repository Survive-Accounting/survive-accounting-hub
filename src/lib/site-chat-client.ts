// THE VISITOR'S SIDE OF THE SITE CHAT — the two keys the bubble keeps, and one way to send.
//
// Pulled out of LearnTextLee (2026-09-16) so the set screen's "Ask Lee a question" (learn/SetPanel.tsx) lands in the
// SAME conversation the bubble shows and Lee's inbox reads — tagged with where the student was (the topic, the set,
// the video and its timestamp), never a second pipeline.
import { getAdminWho } from "@/components/AdminGate";
import { deviceAnonId } from "@/lib/device-id";
import { chatSend, type VisitorChatView } from "@/lib/site-chat.functions";

export const CONV_KEY = "sa-chat-conversation";
export const NAME_KEY = "sa-chat-nickname";

export function readChatLocal(key: string): string | null { try { return window.localStorage.getItem(key); } catch { return null; } }
export function writeChatLocal(key: string, v: string | null) { try { if (v) window.localStorage.setItem(key, v); else window.localStorage.removeItem(key); } catch { /* storage blocked */ } }

/** "Know Your Accounts · video 3 · 0:12" — what the inbox sees first. */
export function askTag(t: { topic: string; setName: string; videoN: number; videoOf: number; atS: number }): string {
  const m = Math.floor(t.atS / 60), s = String(Math.floor(t.atS % 60)).padStart(2, "0");
  return `${t.topic} · ${t.setName}${t.videoOf > 1 ? ` · video ${t.videoN}` : ""} · ${m}:${s}`;
}

/** Send one message as this browser's visitor into its conversation (started if there is none). */
export async function sendToLee(body: string, opts: { page?: string; campus?: string | null } = {}): Promise<VisitorChatView> {
  const vid = deviceAnonId();
  if (!vid) throw new Error("No browser to send from.");
  const campus = opts.campus ?? (window.location.pathname.match(/^\/learn\/([^/]+)/)?.[1] ?? null);
  const v = await chatSend({ data: {
    visitorId: vid, conversationId: readChatLocal(CONV_KEY), body, nickname: readChatLocal(NAME_KEY),
    campus, page: (opts.page ?? window.location.pathname).slice(0, 300), isTest: getAdminWho() !== null,
  } });
  if (v.conversationId) writeChatLocal(CONV_KEY, v.conversationId);
  return v;
}
