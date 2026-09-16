// TALK TO LEE, FLOATING — bottom-right on every tier of /learn and on the home page.
//
// 2026-09-11: Lee's photo in a circle; the tap opened a text message (phone) or a "Text Lee" card
// with the number (desk).
// 2026-09-13 — A CHAT (King's idea; Lee: "build this"): "it would be much better to make this a
// conversation-style chat system, similar to Instagram or Facebook Messenger." The tap opens a
// contained chat card: an optional name, the messages, a composer. Replies (Lee's, and auto-replies
// that read as his — lib/site-chat-rules.ts) arrive by polling while the card is open, and a small
// badge on the photo says a reply came in while it was closed. The texting option stays one line
// at the bottom for anyone who'd rather text.
//
// If the chat tables aren't there yet (migration 20260913_1600_site_chat.sql not run), the card
// falls back to the old Text Lee card — a student never sees an error for our setup.
//
// TOKEN-AGNOSTIC so it looks the same on both pages: every colour is a --lk-* variable (the /learn
// room's) with the home page's token as the fallback, and its CSS is its own (.ltl-*). Copy rule: no
// emoji; the number is written as Lee writes it.
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, MessageCircle, Send, X } from "lucide-react";

import { getAdminWho } from "@/components/AdminGate";
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { deviceAnonId } from "@/lib/device-id";
import { chatPoll, chatSend, chatSetNickname, type VisitorChatView } from "@/lib/site-chat.functions";
import { CONV_KEY, NAME_KEY, readChatLocal as readLocal, writeChatLocal as writeLocal } from "@/lib/site-chat-client";

export const LEE_TEL = "+16625658818";
export const LEE_PHONE = "(662) 565-8818";
export const LEE_PHOTO = "/lee-text-avatar.jpg";

/** The three lines the card says — as drafted in the proposal. */
export const TEXT_LEE_LINES = [
  "I love hearing from students.",
  "Ask anything, or just introduce yourself.",
  "I do my best to answer every single one.",
] as const;

const PHOTO_SIZE = 56;
const SHADOW = "0 14px 30px -8px rgba(0,0,0,0.85), 0 4px 10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.18)";
// The conversation and nickname keys live in lib/site-chat-client (2026-09-16) — the set screen's Ask Lee shares them.

/** The room's tokens, the home page's as fallbacks. */
const T = {
  text: "var(--lk-text, var(--text-primary, #F7F0E6))",
  muted: "var(--lk-muted, var(--text-secondary, #AAB4C8))",
  surface: "var(--lk-surface, var(--bg-surface, #162443))",
  border: "var(--lk-border, var(--border-default, #34486D))",
  acc: "var(--lk-acc, var(--accent-primary, #FFA611))",
  accInk: "var(--lk-acc-ink, #0B1220)",
  shadow: "var(--lk-shadow, 0 10px 30px rgba(0,0,0,.45))",
} as const;

const CSS = `
@keyframes ltl-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes ltl-dot { 0%, 80%, 100% { opacity: .25; } 40% { opacity: 1; } }
.ltl-card { position: fixed; z-index: 95; right: 16px; bottom: calc(84px + env(safe-area-inset-bottom, 0px)); width: min(360px, calc(100vw - 32px)); max-height: min(560px, calc(100vh - 120px)); display: flex; flex-direction: column; border-radius: 16px; background: ${T.surface}; border: 1px solid ${T.border}; color: ${T.text}; box-shadow: ${T.shadow}; font-family: ${BRAND_SANS}; animation: ltl-in 180ms ease-out; overflow: hidden; }
.ltl-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 44px; margin-top: 12px; border-radius: 999px; padding: 9px 16px; font-size: 12px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; border: 0; cursor: pointer; background: ${T.acc}; color: ${T.accInk}; font-family: ${BRAND_SANS}; }
.ltl-btn:focus-visible, .ltl-face:focus-visible, .ltl-send:focus-visible { outline: 2px solid ${T.acc}; outline-offset: 3px; }
.ltl-log { flex: 1; overflow-y: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; min-height: 160px; }
.ltl-msg { max-width: 82%; padding: 8px 12px; border-radius: 16px; font-size: 14px; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; }
.ltl-msg[data-me="true"] { align-self: flex-end; background: ${T.acc}; color: ${T.accInk}; border-bottom-right-radius: 5px; }
.ltl-msg[data-me="false"] { align-self: flex-start; background: ${T.border}; color: ${T.text}; border-bottom-left-radius: 5px; }
.ltl-dots span { display: inline-block; width: 6px; height: 6px; margin: 0 2px; border-radius: 50%; background: ${T.muted}; animation: ltl-dot 1.2s infinite; }
.ltl-dots span:nth-child(2) { animation-delay: .2s; } .ltl-dots span:nth-child(3) { animation-delay: .4s; }
.ltl-in { width: 100%; box-sizing: border-box; background: transparent; color: ${T.text}; border: 1px solid ${T.border}; border-radius: 12px; padding: 9px 11px; font-size: 14px; font-family: ${BRAND_SANS}; }
.ltl-in:focus { outline: none; border-color: ${T.acc}; }
@media (prefers-reduced-motion: reduce) { .ltl-card { animation: none; } .ltl-dots span { animation: none; opacity: .7; } }
`;

const MIGRATION_MISSING = /Chat isn't set up yet/;

export function LearnTextLee({ bottomOffset = 16 }: {
  /** Kept for callers; the chat card works the same on a phone and a desk. */
  narrow?: boolean;
  /** px above the safe area. */
  bottomOffset?: number;
}) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [down, setDown] = useState(false);
  const [view, setView] = useState<VisitorChatView | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const read = useCallback(() => setUnread(0), []);
  const goDown = useCallback(() => setDown(true), []);

  // CLOSED: a slow look for a reply, only once a conversation exists.
  useEffect(() => {
    if (open || down) return;
    const conv = readLocal(CONV_KEY);
    const vid = deviceAnonId();
    if (!conv || !vid) return;
    let live = true;
    const look = () => chatPoll({ data: { visitorId: vid, conversationId: conv, open: false } })
      .then((v) => { if (live) { setUnread(v.unread); if (!v.conversationId) writeLocal(CONV_KEY, null); } })
      .catch((e) => { if (live && MIGRATION_MISSING.test(String(e?.message ?? e))) setDown(true); });
    void look();
    const t = window.setInterval(look, 45_000);
    return () => { live = false; window.clearInterval(t); };
  }, [open, down]);

  const face = (
    <span className="relative block" style={{ width: PHOTO_SIZE, height: PHOTO_SIZE, lineHeight: 0 }}>
      <img
        src={LEE_PHOTO} alt="" aria-hidden
        style={{ width: PHOTO_SIZE, height: PHOTO_SIZE, objectFit: "cover", objectPosition: "50% 30%", borderRadius: "50%", border: `2px solid ${T.text}`, boxShadow: SHADOW, display: "block" }}
      />
      <span className="absolute grid place-items-center rounded-full" style={{ right: -4, bottom: -4, width: 24, height: 24, background: unread ? "#E5484D" : T.acc, color: unread ? "#fff" : T.accInk, boxShadow: "0 6px 14px -4px rgba(0,0,0,0.9)", fontSize: 12, fontWeight: 800, lineHeight: 1 }}>
        {unread ? Math.min(unread, 9) : <MessageCircle className="h-3.5 w-3.5" aria-hidden />}
      </span>
    </span>
  );
  const wrap = { right: 16, bottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom, 0px))` } as const;

  return (
    <>
      <style>{CSS}</style>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label={unread ? `Chat with Lee — ${unread} new` : "Chat with Lee"} aria-expanded={open} className="ltl-face fixed z-[90] block" style={{ ...wrap, background: "transparent", border: 0, padding: 0, cursor: "pointer" }}>
        {face}
      </button>
      {open && (down
        ? <TextLeeCard onClose={close} />
        : <ChatCard view={view} setView={setView} onClose={close} onRead={read} onDown={goDown} />)}
    </>
  );
}

function ChatCard({ view, setView, onClose, onRead, onDown }: {
  view: VisitorChatView | null; setView: (v: VisitorChatView) => void; onClose: () => void; onRead: () => void; onDown: () => void;
}) {
  const [vid] = useState(() => deviceAnonId());
  const [draft, setDraft] = useState("");
  const [name, setName] = useState(() => readLocal(NAME_KEY) ?? "");
  const [editingName, setEditingName] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const log = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);

  const handle = useCallback((e: unknown) => {
    const m = e instanceof Error ? e.message : String(e);
    if (MIGRATION_MISSING.test(m)) onDown(); else setErr(m);
  }, [onDown]);

  // OPEN: poll while the card is up — quicker while a reply is on its way.
  useEffect(() => {
    if (!vid) return;
    let live = true;
    let t: number | undefined;
    const tick = async () => {
      try {
        const v = await chatPoll({ data: { visitorId: vid, conversationId: readLocal(CONV_KEY), open: true } });
        if (!live) return;
        setView(v);
        onRead();
        if (v.conversationId) writeLocal(CONV_KEY, v.conversationId);
        if (v.nickname && !readLocal(NAME_KEY)) { setName(v.nickname); writeLocal(NAME_KEY, v.nickname); }
        t = window.setTimeout(tick, v.typing ? 1500 : 5000);
      } catch (e) { if (live) handle(e); }
    };
    void tick();
    return () => { live = false; if (t) window.clearTimeout(t); };
  }, [vid, setView, onRead, handle]);

  const count = view?.messages.length ?? 0;
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [count, view?.typing]);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending || !vid) return;
    setSending(true); setErr(null);
    // Show it at once; the server's copy replaces it.
    setView({ ...(view ?? { conversationId: null, nickname: null, typing: false, unread: 0, messages: [] }), messages: [...(view?.messages ?? []), { id: `local-${Date.now()}`, sender: "visitor", body, at: new Date().toISOString() }] });
    setDraft("");
    try {
      const campus = window.location.pathname.match(/^\/learn\/([^/]+)/)?.[1] ?? null;
      const v = await chatSend({ data: { visitorId: vid, conversationId: readLocal(CONV_KEY), body, nickname: name.trim() || null, campus, page: window.location.pathname.slice(0, 300), isTest: getAdminWho() !== null } });
      setView(v);
      if (v.conversationId) writeLocal(CONV_KEY, v.conversationId);
    } catch (e) { handle(e); setDraft(body); }
    finally { setSending(false); input.current?.focus(); }
  };
  const saveName = async () => {
    setEditingName(false);
    writeLocal(NAME_KEY, name.trim() || null);
    const conv = readLocal(CONV_KEY);
    if (conv && vid) { try { await chatSetNickname({ data: { visitorId: vid, conversationId: conv, nickname: name.trim() } }); } catch (e) { handle(e); } }
  };

  const started = count > 0;
  return (
    <div role="dialog" aria-label="Chat with Lee" className="ltl-card">
      <div className="flex items-center gap-3" style={{ padding: "12px 14px", borderBottom: `1px solid ${T.border}` }}>
        <img src={LEE_PHOTO} alt="" aria-hidden style={{ width: 38, height: 38, objectFit: "cover", objectPosition: "50% 30%", borderRadius: "50%", border: `2px solid ${T.text}`, flexShrink: 0 }} />
        <div className="min-w-0 flex-1">
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.2, fontFamily: BRAND_DISPLAY, fontWeight: 900 }}>Lee</p>
          <p style={{ margin: "1px 0 0", fontSize: 12, color: T.muted }}>Survive Accounting</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: T.border, color: T.text, border: 0, cursor: "pointer" }}><X className="h-4 w-4" /></button>
      </div>

      <div ref={log} className="ltl-log" aria-live="polite">
        {!started && (
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: T.muted, padding: "4px 2px 8px" }}>
            {TEXT_LEE_LINES.map((line) => <div key={line}>{line}</div>)}
          </div>
        )}
        {view?.messages.map((m) => <div key={m.id} className="ltl-msg" data-me={m.sender === "visitor"}>{m.body}</div>)}
        {view?.typing && <div className="ltl-msg ltl-dots" data-me="false" aria-label="Lee is typing"><span /><span /><span /></div>}
      </div>

      <div style={{ padding: "10px 12px 12px", borderTop: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
        {(!started || editingName) ? (
          <input className="ltl-in" value={name} maxLength={60} placeholder="Your name (optional)" aria-label="Your name (optional)"
            onChange={(e) => setName(e.target.value)} onBlur={() => { if (editingName) void saveName(); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (editingName) void saveName(); else input.current?.focus(); } }} />
        ) : (
          <button type="button" onClick={() => setEditingName(true)} style={{ all: "unset", cursor: "pointer", fontSize: 11.5, color: T.muted }}>
            {name.trim() ? `Chatting as ${name.trim()} · change` : "Add your name"}
          </button>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea ref={input} className="ltl-in" rows={1} value={draft} maxLength={2000} placeholder="Message Lee…" aria-label="Message"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            style={{ resize: "none", maxHeight: 120 }} />
          <button type="button" className="ltl-send grid shrink-0 place-items-center rounded-full" onClick={() => void send()} disabled={!draft.trim() || sending} aria-label="Send"
            style={{ width: 40, height: 40, border: 0, cursor: draft.trim() ? "pointer" : "default", background: T.acc, color: T.accInk, opacity: draft.trim() && !sending ? 1 : 0.5 }}>
            <Send className="h-4 w-4" />
          </button>
        </div>
        {err && <div style={{ fontSize: 12, color: "#FF8A7A" }}>{err}</div>}
        <a href={`sms:${LEE_TEL}`} style={{ fontSize: 11.5, color: T.muted, textDecoration: "none" }}>Rather text? {LEE_PHONE}</a>
      </div>
    </div>
  );
}

/** The fallback card: "Text Lee · (662) 565-8818", three lines, copy the number. */
function TextLeeCard({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  const copy = async () => {
    const ok = await copyToClipboard(LEE_PHONE);
    setCopied(ok);
    window.setTimeout(() => setCopied(null), 1800);
  };
  return (
    <div role="dialog" aria-label="Text Lee" className="ltl-card" style={{ padding: 18 }}>
      <div className="flex items-start gap-3">
        <img src={LEE_PHOTO} alt="" aria-hidden style={{ width: 44, height: 44, objectFit: "cover", objectPosition: "50% 30%", borderRadius: "50%", border: `2px solid ${T.text}`, flexShrink: 0 }} />
        <div className="min-w-0 flex-1">
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.2, fontFamily: BRAND_DISPLAY, fontWeight: 900 }}>Text Lee</p>
          <p style={{ margin: "2px 0 0", fontSize: 14, fontWeight: 700, color: T.text, whiteSpace: "nowrap" }}>{LEE_PHONE}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: T.border, color: T.text, border: 0, cursor: "pointer" }}><X className="h-4 w-4" /></button>
      </div>
      <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4, fontSize: 13.5, lineHeight: 1.45, color: T.muted }}>
        {TEXT_LEE_LINES.map((line) => <li key={line}>{line}</li>)}
      </ul>
      <a href={`sms:${LEE_TEL}`} className="ltl-btn" style={{ textDecoration: "none" }}>Text Lee</a>
      <button type="button" onClick={() => void copy()} className="ltl-btn" style={{ background: "transparent", color: T.text, border: `1px solid ${T.border}` }}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied === true ? "Copied" : copied === false ? `Couldn't copy — ${LEE_PHONE}` : "Copy the number"}
      </button>
    </div>
  );
}
