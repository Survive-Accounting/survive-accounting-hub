// /admin/growth/chat — THE CHAT INBOX (2026-09-13, King's idea). Every conversation from the floating
// Lee button on /learn and the home page: who wrote (their nickname, campus, the page they were on),
// unread / needs a reply / replied / closed, the whole history, a reply box — and the AUTO-REPLIES
// tab, where each reply has its trigger, its delay and an on/off switch.
//
// The visitor sees auto-replies as Lee's own messages; here they're marked, and one still waiting
// shows when it will land, with "send now" and "cancel". Replying cancels any that are waiting.
// Server doors: lib/site-chat.functions.ts. Tables: migration 20260913_1600_site_chat.sql.
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getAdminWho } from "@/components/AdminGate";
import type { ChatRule, ChatTrigger } from "@/lib/site-chat-rules";
import {
  chatDeleteRule, chatInbox, chatReply, chatRules, chatSaveRule, chatScheduled, chatThread, chatUpdateConversation,
  type ChatMessageView, type InboxRow,
} from "@/lib/site-chat.functions";

export const Route = createFileRoute("/admin/growth/chat")({
  validateSearch: (s: Record<string, unknown>): { c?: string } => (typeof s.c === "string" && s.c ? { c: s.c } : {}),
  head: () => ({ meta: [{ title: "Chat — Growth" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: ChatInboxPage,
});

type Filter = "needs" | "unread" | "all" | "closed";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "needs", label: "Needs a reply" },
  { id: "unread", label: "Unread" },
  { id: "all", label: "Active" },
  { id: "closed", label: "Closed" },
];

function ago(iso: string | null): string {
  if (!iso) return "";
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 0) return `in ${fmtWait(-s)}`;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
function fmtWait(s: number): string { return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`; }

function ChatInboxPage() {
  const search = Route.useSearch();
  const [tab, setTab] = useState<"inbox" | "auto">("inbox");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Chat</h1>
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          {(["inbox", "auto"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-md px-3 py-1 text-sm ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {t === "inbox" ? "Inbox" : "Auto-replies"}
            </button>
          ))}
        </div>
      </div>
      {tab === "inbox" ? <Inbox initial={search.c} /> : <AutoReplies />}
    </div>
  );
}

function Inbox({ initial }: { initial?: string }) {
  const [rows, setRows] = useState<InboxRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("needs");
  const [sel, setSel] = useState<string | null>(initial ?? null);
  const load = useCallback(async () => {
    try { setRows(await chatInbox()); setErr(null); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void load(); const t = window.setInterval(load, 10_000); return () => window.clearInterval(t); }, [load]);

  const counts = useMemo(() => ({
    needs: rows?.filter((r) => r.needsReply).length ?? 0,
    unread: rows?.filter((r) => r.unread).length ?? 0,
    all: rows?.filter((r) => r.status === "open").length ?? 0,
    closed: rows?.filter((r) => r.status === "closed").length ?? 0,
  }), [rows]);
  const shown = (rows ?? []).filter((r) => filter === "needs" ? r.needsReply : filter === "unread" ? r.unread : filter === "closed" ? r.status === "closed" : r.status === "open");

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(260px, 360px) minmax(0, 1fr)" }}>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" onClick={() => setFilter(f.id)} className={`rounded-full border px-2.5 py-0.5 text-xs ${filter === f.id ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground"}`}>
              {f.label} {counts[f.id] ? <b>{counts[f.id]}</b> : null}
            </button>
          ))}
        </div>
        {err && <div className="rounded-md border border-red-500/40 p-2 text-sm text-red-400">{err}</div>}
        {!rows && !err && <div className="text-sm text-muted-foreground">Loading…</div>}
        {rows && !shown.length && <div className="text-sm text-muted-foreground">Nothing here.</div>}
        <div className="flex flex-col gap-1">
          {shown.map((r) => (
            <button key={r.id} type="button" onClick={() => setSel(r.id)}
              className={`rounded-lg border px-3 py-2 text-left ${sel === r.id ? "border-primary bg-primary/10" : "border-border hover:bg-accent/40"}`}>
              <div className="flex items-center gap-2">
                {r.unread && <span className="size-2 shrink-0 rounded-full bg-sky-400" aria-label="unread" />}
                <span className={`truncate text-sm ${r.unread ? "font-semibold" : ""}`}>{r.nickname || "No name"}</span>
                {r.campus && <span className="truncate text-xs text-muted-foreground">{r.campus}</span>}
                {r.isTest && <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">test</span>}
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{ago(r.lastAt)}</span>
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {r.previewSender === "visitor" ? "" : r.previewSender === "auto" ? "Auto: " : "You: "}{r.preview}
              </div>
              <div className="mt-1 flex gap-2 text-[11px]">
                {r.needsReply ? <span className="text-amber-400">needs a reply</span> : r.replied ? <span className="text-emerald-400">replied</span> : null}
                {r.scheduled > 0 && <span className="text-muted-foreground">{r.scheduled} auto-reply waiting</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
      <div>{sel ? <Thread key={sel} id={sel} onChanged={load} /> : <div className="text-sm text-muted-foreground">Pick a conversation.</div>}</div>
    </div>
  );
}

function Thread({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [data, setData] = useState<{ conversation: InboxRow; messages: ChatMessageView[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const log = useRef<HTMLDivElement | null>(null);
  const load = useCallback(async () => {
    try { setData(await chatThread({ data: { id, markRead: true } })); setErr(null); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [id]);
  useEffect(() => { void load().then(onChanged); const t = window.setInterval(load, 5000); return () => window.clearInterval(t); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = data?.messages.length ?? 0;
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [n]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await load(); onChanged(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const send = () => { const body = draft.trim(); if (!body) return; setDraft(""); void act(() => chatReply({ data: { id, body, who: getAdminWho() } })); };

  if (!data) return <div className="text-sm text-muted-foreground">{err ?? "Loading…"}</div>;
  const c = data.conversation;
  return (
    <div className="flex flex-col rounded-xl border border-border" style={{ height: "calc(100vh - 170px)", minHeight: 420 }}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="font-semibold">{c.nickname || "No name"}</span>
        {c.campus && <span className="text-sm text-muted-foreground">{c.campus}</span>}
        {c.page && <span className="truncate text-xs text-muted-foreground">from {c.page}</span>}
        <span className="text-xs text-muted-foreground">started {ago(c.createdAt)} ago</span>
        <span className="ml-auto flex gap-2">
          <button type="button" disabled={busy} className="rounded-md border border-border px-2 py-0.5 text-xs" onClick={() => void act(() => chatUpdateConversation({ data: { id, unread: true } }))}>Mark unread</button>
          <button type="button" disabled={busy} className="rounded-md border border-border px-2 py-0.5 text-xs" onClick={() => void act(() => chatUpdateConversation({ data: { id, status: c.status === "closed" ? "open" : "closed" } }))}>{c.status === "closed" ? "Reopen" : "Close"}</button>
        </span>
      </div>
      <div ref={log} className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-4 py-3">
        {data.messages.map((m) => {
          const mine = m.sender !== "visitor";
          return (
            <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <div className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${m.scheduled ? "border border-dashed border-border text-muted-foreground" : mine ? "bg-primary text-primary-foreground" : "bg-muted"}`} style={{ overflowWrap: "anywhere" }}>
                {m.body}
              </div>
              <div className="mt-0.5 flex gap-2 text-[11px] text-muted-foreground">
                <span>{m.sender === "auto" ? "auto-reply" : m.sender === "admin" ? (m.adminEmail ?? "you") : c.nickname || "visitor"}</span>
                <span>{m.scheduled ? `sends ${ago(m.at)}` : new Date(m.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                {m.scheduled && (
                  <>
                    <button type="button" disabled={busy} className="underline" onClick={() => void act(() => chatScheduled({ data: { messageId: m.id, action: "send_now" } }))}>send now</button>
                    <button type="button" disabled={busy} className="underline" onClick={() => void act(() => chatScheduled({ data: { messageId: m.id, action: "cancel" } }))}>cancel</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {err && <div className="px-4 text-sm text-red-400">{err}</div>}
      <div className="flex items-end gap-2 border-t border-border p-3">
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="Reply… (Enter sends, Shift+Enter for a new line)"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        <button type="button" disabled={busy || !draft.trim()} onClick={send} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Send</button>
      </div>
    </div>
  );
}

const TRIGGER_LABEL: Record<ChatTrigger, string> = {
  first_message: "Their first message",
  keyword: "A message with a keyword",
  no_reply: "Any message, until someone replies",
};
const blankRule = (sort: number): ChatRule => ({ id: "", name: "", trigger: "first_message", keywords: [], body: "", delaySeconds: 45, enabled: true, sort });

function AutoReplies() {
  const [rules, setRules] = useState<ChatRule[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setRules(await chatRules()); setErr(null); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Students see these as your own messages, typed after the delay you set. Write them the way you'd text: short, no formal greetings.
        Put <code>{"{name}"}</code> where their name goes — if they didn't give one, it's left out and the sentence still reads. Each fires once per
        conversation, and replying yourself cancels any still waiting.
      </p>
      {err && <div className="rounded-md border border-red-500/40 p-2 text-sm text-red-400">{err}</div>}
      {rules?.map((r) => <RuleEditor key={r.id} rule={r} onSaved={load} />)}
      {rules && <RuleEditor key={`new-${rules.length}`} rule={blankRule(rules.length)} onSaved={load} />}
    </div>
  );
}

function RuleEditor({ rule, onSaved }: { rule: ChatRule; onSaved: () => void }) {
  const [r, setR] = useState(rule);
  const [kw, setKw] = useState(rule.keywords.join(", "));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const isNew = !rule.id;
  const dirty = JSON.stringify({ ...r, keywords: kw }) !== JSON.stringify({ ...rule, keywords: rule.keywords.join(", ") });
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      await chatSaveRule({ data: { id: r.id || null, name: r.name, trigger: r.trigger, keywords: kw.split(",").map((k) => k.trim()).filter(Boolean), body: r.body, delaySeconds: r.delaySeconds, enabled: r.enabled, sort: r.sort } });
      setMsg("Saved"); onSaved();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <div className={`flex flex-col gap-2 rounded-xl border p-3 ${isNew ? "border-dashed border-border" : "border-border"} ${r.enabled ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder={isNew ? "New auto-reply — a name for you" : "Name"} className="min-w-[180px] flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm" />
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={r.enabled} onChange={(e) => setR({ ...r, enabled: e.target.checked })} /> on</label>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">When</span>
        <select value={r.trigger} onChange={(e) => setR({ ...r, trigger: e.target.value as ChatTrigger })} className="rounded-md border border-border bg-background px-2 py-1">
          {(Object.keys(TRIGGER_LABEL) as ChatTrigger[]).map((t) => <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>)}
        </select>
        <span className="text-muted-foreground">wait</span>
        <input type="number" min={0} max={86400} value={r.delaySeconds} onChange={(e) => setR({ ...r, delaySeconds: Math.max(0, Math.min(86400, Number(e.target.value) || 0)) })} className="w-20 rounded-md border border-border bg-background px-2 py-1" />
        <span className="text-muted-foreground">seconds ({fmtWait(r.delaySeconds)})</span>
      </div>
      {r.trigger === "keyword" && (
        <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="Keywords, comma separated — e.g. price, cost, free" className="rounded-md border border-border bg-background px-2 py-1 text-sm" />
      )}
      <textarea value={r.body} onChange={(e) => setR({ ...r, body: e.target.value })} rows={2} placeholder="hey {name}! just saw this, give me a few min" className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
      <div className="flex items-center gap-2">
        <button type="button" disabled={busy || !dirty || !r.body.trim()} onClick={() => void save()} className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50">{isNew ? "Add" : "Save"}</button>
        {!isNew && <button type="button" disabled={busy} onClick={async () => { if (!window.confirm("Delete this auto-reply?")) return; setBusy(true); try { await chatDeleteRule({ data: { id: rule.id } }); onSaved(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }} className="rounded-md border border-border px-3 py-1 text-sm text-muted-foreground">Delete</button>}
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}
