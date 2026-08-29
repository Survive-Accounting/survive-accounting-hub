// THE BANK (B4) — one studio surface holding every APPROVED item across all
// sessions: Lee's content ledger. Browse (recency/alphabetical, kind + topic
// filters, search), refine in place (inline text, quotes from the session
// transcript, callout tags from config), generate/revise starting points on
// the micro lane, and mark FINAL — the version Lee will actually use.
// ARCHIVED hides behind a filter and is never deleted.
//
// B5 hooks live here too: any approved item can be toggled INCLUDE IN VIDEO
// for its set — the film-picks tray reads that flag.
import { useMemo, useState } from "react";
import { RefreshCw, Star, X } from "lucide-react";

import { runMicro, type BoothTopic } from "@/lib/talkthrough.functions";
import { BIG_FONT, NEON } from "./theme";
import {
  sessionSegments, stampLabel, styleNotesFor, touchRow,
  type BoardItem, type TTDoc,
} from "./talkthrough";
import { putBoardItem } from "./talkthrough-sync";

const CREAM = "#F4EFE6";
const GOLD = "#FCA311";
const PANEL = "rgba(16,24,44,0.9)";
const EDGE = "rgba(244,239,230,0.16)";

/** B4.2 — callout tags are CONFIG, not hardcoded UI: adding one later is an
 *  edit to this list. "Nerd Out" replaces "Deeper Idea" — one vocabulary with
 *  the video format. */
export const CALLOUT_TAGS = ["Memorize This", "Formula to Remember", "Cheat Code", "Real World", "Nerd Out"] as const;

const BANK_STATUSES = ["approved", "in_production", "done"] as const;
const bankEligible = (b: BoardItem): boolean =>
  ["approved", "in_production", "done", "final"].includes(b.status) || b.status === "archived";

/** The primary editable text of an item, wherever its kind keeps it. */
const bodyOf = (b: BoardItem): string => {
  const p = b.payload as Record<string, unknown>;
  return String(p.body ?? p.proposal ?? p.why ?? p.meaning ?? p.pitch ?? "");
};
const withBody = (b: BoardItem, text: string): Record<string, unknown> => {
  const p = { ...(b.payload as Record<string, unknown>) };
  if ("body" in p || !("proposal" in p || "why" in p || "meaning" in p || "pitch" in p)) p.body = text;
  else if ("proposal" in p) p.proposal = text;
  else if ("why" in p) p.why = text;
  else if ("meaning" in p) p.meaning = text;
  else p.pitch = text;
  return p;
};

export function BankView({ doc, topics }: { doc: TTDoc; topics: BoothTopic[] | null }) {
  const [sort, setSort] = useState<"recency" | "alpha">("recency");
  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const [topicFilter, setTopicFilter] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [q, setQ] = useState("");

  const setTopic = useMemo(() => {
    const m = new Map<string, string>(); // setId → topic name
    for (const t of topics ?? []) for (const s of t.sets) m.set(s.id, t.name);
    return m;
  }, [topics]);
  const sessionSet = useMemo(() => new Map(doc.sessions.map((s) => [s.id, s.setId])), [doc.sessions]);

  const items = useMemo(() => {
    let list = doc.boardItems.filter((b) => !b.archivedAt && bankEligible(b));
    list = showArchived ? list : list.filter((b) => b.status !== "archived");
    if (kindFilter) list = list.filter((b) => (b.kind === "idea" ? String((b.payload as { kind?: string }).kind) : b.kind) === kindFilter);
    if (topicFilter) list = list.filter((b) => setTopic.get(sessionSet.get(b.sessionId) ?? "") === topicFilter);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter((b) => `${b.title} ${bodyOf(b)} ${b.quote}`.toLowerCase().includes(needle));
    }
    // FINAL first within the listing, then the chosen sort.
    return list.sort((a, b) =>
      Number(b.status === "final") - Number(a.status === "final")
      || (sort === "alpha" ? a.title.localeCompare(b.title) : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
  }, [doc.boardItems, showArchived, kindFilter, topicFilter, q, sort, setTopic, sessionSet]);

  const kinds = useMemo(() => [...new Set(doc.boardItems.filter(bankEligible).map((b) => (b.kind === "idea" ? String((b.payload as { kind?: string }).kind ?? "idea") : b.kind)))].sort(), [doc.boardItems]);
  const topicNames = useMemo(() => [...new Set([...setTopic.values()])], [setTopic]);

  return (
    <div style={{ maxWidth: 980 }}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["recency", "alpha"] as const).map((v) => (
          <button key={v} className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider"
            style={v === sort ? { background: GOLD, color: "#0B1322" } : { border: `1px solid ${EDGE}`, color: NEON.muted }}
            onClick={() => setSort(v)}>
            {v === "recency" ? "Recent" : "A–Z"}
          </button>
        ))}
        <select value={kindFilter ?? ""} onChange={(e) => setKindFilter(e.target.value || null)}
          style={{ background: PANEL, color: CREAM, border: `1px solid ${EDGE}`, borderRadius: 8, fontSize: 12, padding: "4px 8px" }}>
          <option value="">all kinds</option>
          {kinds.map((k) => <option key={k} value={k}>{stampLabel(k)}</option>)}
        </select>
        <select value={topicFilter ?? ""} onChange={(e) => setTopicFilter(e.target.value || null)}
          style={{ background: PANEL, color: CREAM, border: `1px solid ${EDGE}`, borderRadius: 8, fontSize: 12, padding: "4px 8px" }}>
          <option value="">all topics</option>
          {topicNames.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input value={q} placeholder="search the bank…" onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 160, background: PANEL, border: `1px solid ${EDGE}`, borderRadius: 8, color: CREAM, fontSize: 12, padding: "5px 10px" }} />
        <label className="flex items-center gap-1.5" style={{ color: NEON.muted, fontSize: 11 }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> archived
        </label>
      </div>

      {items.length === 0 && <div style={{ color: NEON.muted, fontSize: 14, padding: 24 }}>Nothing banked yet — approve items on a session's review board and they land here.</div>}
      {items.map((b) => <BankItem key={b.id} item={b} doc={doc} setTopic={setTopic} sessionSet={sessionSet} />)}
    </div>
  );
}

function BankItem({ item, doc, setTopic, sessionSet }: {
  item: BoardItem; doc: TTDoc;
  setTopic: Map<string, string>; sessionSet: Map<string, string>;
}) {
  const p = item.payload as Record<string, unknown>;
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingBody, setEditingBody] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(bodyOf(item));
  const [quotePicker, setQuotePicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  const kind = item.kind === "idea" ? String(p.kind ?? "idea") : item.kind;
  const topic = setTopic.get(sessionSet.get(item.sessionId) ?? "") ?? null;
  const quotes: string[] = Array.isArray(p.quotes) ? (p.quotes as string[]) : [];
  const tags: string[] = Array.isArray(p.calloutTags) ? (p.calloutTags as string[]) : [];
  const isFinal = item.status === "final";

  const save = (patch: Partial<BoardItem>) => putBoardItem(touchRow(item, patch));
  const savePayload = (pp: Record<string, unknown>) => save({ payload: pp } as Partial<BoardItem>);

  const cycleStatus = () => {
    if (isFinal || item.status === "archived") return;
    const i = (BANK_STATUSES as readonly string[]).indexOf(item.status);
    save({ status: BANK_STATUSES[(i + 1) % BANK_STATUSES.length] } as Partial<BoardItem>);
  };

  /** B4.2 — "Generate a starting point" / revise on the micro lane. */
  const generate = async () => {
    setBusy(true); setErr(null);
    try {
      const notes = styleNotesFor(doc, "memo");
      const system = [
        "You draft ONE short piece of teaching content for Lee (accounting tutor). Match his cadence — plain, confident, a little loose. Return PLAIN TEXT only, no JSON, no headings.",
        notes.length ? `STYLE NOTES (obey):\n${notes.map((n) => `- ${n}`).join("\n")}` : "",
        comment ? `LEE'S REVISION NOTES (obey these over everything):\n${comment}` : "",
      ].filter(Boolean).join("\n\n");
      const user = [
        `KIND: ${stampLabel(kind)}`,
        `TITLE: ${item.title}`,
        body ? `CURRENT DRAFT (revise, don't restart unless the notes say so):\n${body}` : "(no draft yet — write the starting point)",
        quotes.length || item.quote ? `LEE'S VERBATIM MOMENTS:\n${[item.quote, ...quotes].filter(Boolean).map((x) => `"${x}"`).join("\n")}` : "",
      ].filter(Boolean).join("\n\n");
      const r = await runMicro({ data: { system, user, maxOutput: 800 } });
      setBody(r.text.trim());
      savePayload({ ...withBody(item, r.text.trim()), _usage: r.usage });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const sessionSegs = sessionSegments(doc, item.sessionId).filter((s) => s.text.trim());

  return (
    <div className="mb-2 rounded-2xl p-4" style={{ background: PANEL, border: `1.5px solid ${isFinal ? GOLD : EDGE}`, opacity: item.status === "archived" ? 0.55 : 1 }}>
      <div className="flex items-center gap-2">
        <span className="rounded-full px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wider" style={{ border: `1px solid ${EDGE}`, color: GOLD }}>{stampLabel(kind)}</span>
        {topic && <span style={{ color: NEON.muted, fontSize: 10.5 }}>{topic}</span>}
        {editingTitle ? (
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { setEditingTitle(false); if (title.trim() && title !== item.title) save({ title: title.trim() } as Partial<BoardItem>); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            style={{ flex: 1, background: "rgba(9,13,26,0.7)", border: `1px solid ${GOLD}`, borderRadius: 6, color: CREAM, fontSize: 13.5, fontWeight: 700, padding: "2px 8px" }} />
        ) : (
          <div style={{ fontWeight: 700, fontSize: 14, color: CREAM, cursor: "text" }} title="Click to edit" onClick={() => setEditingTitle(true)}>{item.title}</div>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            title={isFinal ? "FINAL — the version Lee will use (click to unmark)" : "Mark FINAL"}
            className="rounded-full p-1"
            style={{ color: isFinal ? GOLD : NEON.muted }}
            onClick={() => save({ status: isFinal ? "approved" : "final" } as Partial<BoardItem>)}
          >
            <Star className="h-3.5 w-3.5" fill={isFinal ? GOLD : "none"} />
          </button>
          <button className="rounded-full px-2.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider"
            title="Cycle APPROVED → IN PRODUCTION → DONE"
            style={{ border: `1px solid ${EDGE}`, color: item.status === "done" ? "#A78BFA" : item.status === "in_production" ? "#7DD3FC" : "#3BF5A0" }}
            onClick={cycleStatus}>
            {isFinal ? "final" : item.status.replace("_", " ")}
          </button>
          <button className="rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider"
            style={{ border: `1px solid ${EDGE}`, color: NEON.muted }}
            onClick={() => save({ status: item.status === "archived" ? "approved" : "archived" } as Partial<BoardItem>)}>
            {item.status === "archived" ? "restore" : "archive"}
          </button>
        </div>
      </div>

      {/* body — inline editable */}
      {editingBody ? (
        <textarea autoFocus value={body} rows={3} onChange={(e) => setBody(e.target.value)}
          onBlur={() => { setEditingBody(false); if (body !== bodyOf(item)) savePayload(withBody(item, body)); }}
          className="mt-2 w-full"
          style={{ background: "rgba(9,13,26,0.7)", border: `1px solid ${GOLD}`, borderRadius: 8, color: CREAM, fontSize: 13, padding: "6px 10px" }} />
      ) : (
        <div className="mt-2" style={{ fontSize: 13, lineHeight: 1.5, color: body ? CREAM : NEON.muted, cursor: "text", whiteSpace: "pre-wrap" }} title="Click to edit" onClick={() => setEditingBody(true)}>
          {body || "(no draft yet — generate a starting point below)"}
        </div>
      )}

      {/* quotes — add from the session transcript, remove inline */}
      <div className="mt-2 flex flex-col gap-1">
        {[item.quote, ...quotes].filter(Boolean).map((qt, i) => (
          <div key={i} className="flex items-start gap-1.5" style={{ fontSize: 12, fontStyle: "italic", color: NEON.muted, borderLeft: `2px solid ${GOLD}66`, paddingLeft: 8 }}>
            <span className="min-w-0 flex-1">“{qt}”</span>
            {i > 0 && (
              <button title="Remove quote" style={{ color: NEON.muted }} onClick={() => savePayload({ ...p, quotes: quotes.filter((x) => x !== qt) })}>
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        <button className="self-start text-[11px]" style={{ color: NEON.muted, textDecoration: "underline" }} onClick={() => setQuotePicker((v) => !v)}>
          + add a quote from the transcript
        </button>
        {quotePicker && (
          <div className="rounded-xl p-2" style={{ border: `1px solid ${EDGE}`, maxHeight: 180, overflowY: "auto" }}>
            {sessionSegs.length === 0 && <div style={{ color: NEON.muted, fontSize: 12 }}>No transcript on this session.</div>}
            {sessionSegs.map((s) => (
              <button key={s.id} className="block w-full rounded-md px-2 py-1 text-left" style={{ fontSize: 11.5, color: CREAM }}
                onClick={() => { savePayload({ ...p, quotes: [...quotes, s.text.trim()] }); setQuotePicker(false); }}>
                [S{s.seq}] {s.text.slice(0, 110)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* callout tags — config-driven */}
      <div className="mt-2 flex flex-wrap gap-1">
        {CALLOUT_TAGS.map((t) => {
          const on = tags.includes(t);
          return (
            <button key={t} className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={on ? { background: "rgba(252,163,17,0.2)", color: GOLD, border: `1px solid ${GOLD}` } : { border: `1px solid ${EDGE}`, color: NEON.muted }}
              onClick={() => savePayload({ ...p, calloutTags: on ? tags.filter((x) => x !== t) : [...tags, t] })}>
              {t}
            </button>
          );
        })}
      </div>

      {/* generate / revise on the micro lane */}
      <div className="mt-3 flex items-center gap-2">
        <input value={comment} placeholder="revision notes (optional)…" onChange={(e) => setComment(e.target.value)}
          style={{ flex: 1, background: "rgba(9,13,26,0.7)", border: `1px solid ${EDGE}`, borderRadius: 8, color: CREAM, fontSize: 12, padding: "5px 10px" }} />
        <button className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs" style={{ border: `1px solid ${GOLD}88`, color: busy ? NEON.muted : GOLD }} disabled={busy} onClick={() => void generate()}>
          <RefreshCw className="h-3 w-3" /> {busy ? "drafting…" : body ? "Regenerate with my notes" : "Generate a starting point"}
        </button>
      </div>
      {err && <div className="mt-1" style={{ color: "#F87171", fontSize: 11 }}>{err}</div>}
    </div>
  );
}
