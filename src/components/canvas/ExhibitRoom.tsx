// EXHIBIT MODE (B6) — the second room. Everything stamped Exhibit (or
// approved as an exhibit idea) lands here as a card under its topic. Opening
// a card lets Lee KEEP DICTATING on it (the same capture mechanics — an
// exhibit card gets its own session, transcript anchored to the card),
// reference any shipped exhibit from the registry ("what I'd keep / what I'd
// change"), and draft a conveyor-format, Bible-compliant Claude Code prompt:
// summary + full prompt + COPY. Copy/paste into the conveyor remains the
// integration.
import { useMemo, useState } from "react";
import { Check, Copy, Mic, RefreshCw } from "lucide-react";

import { EXHIBIT_REGISTRY, runExhibitDraft, type BoothTopic } from "@/lib/talkthrough.functions";
import { BIG_FONT, NEON } from "./theme";
import {
  sessionSegments, styleNotesFor, touchRow,
  type BoardItem, type TTDoc,
} from "./talkthrough";
import { putBoardItem, ttState } from "./talkthrough-sync";
import { extractJsonObject } from "./talkthrough-pass";

const CREAM = "#F4EFE6";
const GOLD = "#FCA311";
const PANEL = "rgba(16,24,44,0.9)";
const EDGE = "rgba(244,239,230,0.16)";

/** An exhibit card's dedicated dictation session id (B6.2). */
export const exhibitSessionId = (itemId: string): string => `exhibit:${itemId}`;

const isExhibitCard = (b: BoardItem): boolean =>
  !b.archivedAt && b.status !== "archived"
  && (b.kind === "exhibit" || (b.kind === "idea" && String((b.payload as { kind?: string }).kind) === "exhibit"));

export function ExhibitRoom({ doc, topics, onDictate }: {
  doc: TTDoc; topics: BoothTopic[] | null;
  /** Open the Booth on the card's own session (same capture mechanics). */
  onDictate: (item: BoardItem) => void;
}) {
  const setTopic = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of topics ?? []) for (const s of t.sets) m.set(s.id, t.name);
    return m;
  }, [topics]);
  const sessionSet = useMemo(() => new Map(doc.sessions.map((s) => [s.id, s.setId])), [doc.sessions]);
  const cards = useMemo(() => doc.boardItems.filter(isExhibitCard), [doc.boardItems]);
  const byTopic = useMemo(() => {
    const m = new Map<string, BoardItem[]>();
    for (const c of cards) {
      const t = setTopic.get(sessionSet.get(c.sessionId) ?? "") ?? "Unplaced";
      m.set(t, [...(m.get(t) ?? []), c]);
    }
    return m;
  }, [cards, setTopic, sessionSet]);

  return (
    <div style={{ maxWidth: 980 }}>
      {cards.length === 0 && (
        <div style={{ color: NEON.muted, fontSize: 14, padding: 24 }}>
          No exhibit cards yet — stamp Exhibit in the booth, or approve an exhibit idea on a review board.
        </div>
      )}
      {[...byTopic.entries()].map(([topic, list]) => (
        <div key={topic} className="mb-5">
          <h3 style={{ fontSize: 11, letterSpacing: "0.2em", color: GOLD, textTransform: "uppercase", marginBottom: 8 }}>{topic}</h3>
          {list.map((c) => <ExhibitCard key={c.id} item={c} doc={doc} onDictate={onDictate} />)}
        </div>
      ))}
    </div>
  );
}

function ExhibitCard({ item, doc, onDictate }: { item: BoardItem; doc: TTDoc; onDictate: (item: BoardItem) => void }) {
  const p = item.payload as Record<string, unknown>;
  const draft = p.draft as { summary?: string; prompt?: string } | undefined;
  const [refId, setRefId] = useState<string | null>(String(p.exhibitRef ?? "") || null);
  const [keepChange, setKeepChange] = useState(String(p.keepChange ?? ""));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  // The card's dictation lives in session(s) whose SET id is the card's
  // exhibit id — gather across sittings, in order.
  const cardSegs = doc.sessions
    .filter((x) => x.setId === exhibitSessionId(item.id))
    .flatMap((x) => sessionSegments(doc, x.id))
    .filter((s) => s.text.trim());
  const save = (patch: Record<string, unknown>) => putBoardItem(touchRow(item, { payload: { ...item.payload, ...patch } } as Partial<BoardItem>));

  const generate = async () => {
    setBusy(true); setErr(null);
    try {
      const quotes = [item.quote, ...(Array.isArray(p.quotes) ? (p.quotes as string[]) : [])].filter(Boolean);
      const r = await runExhibitDraft({
        data: {
          title: item.title,
          body: String(p.body ?? p.summary ?? ""),
          quotes,
          transcript: cardSegs.map((s) => s.text.trim()).join(" ").slice(0, 60_000),
          referenceId: refId,
          keepChange,
          styleNotes: styleNotesFor(ttState().doc, "exhibit"),
        },
      });
      const raw = extractJsonObject(r.text);
      if (!raw || typeof raw.prompt !== "string" || !raw.prompt.trim()) throw new Error("draft didn't parse — retry");
      save({ draft: { summary: String(raw.summary ?? ""), prompt: raw.prompt }, exhibitRef: refId, keepChange, _usage: r.usage });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(draft?.prompt ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="mb-2 rounded-2xl p-4" style={{ background: PANEL, border: `1px solid ${EDGE}` }}>
      <div className="flex items-center gap-2">
        <div style={{ fontWeight: 700, fontSize: 14, color: CREAM }}>{item.title}</div>
        <button className="ml-auto flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold" style={{ border: `1px solid #3BF5A0`, color: "#3BF5A0" }} onClick={() => onDictate(item)}>
          <Mic className="h-3 w-3" /> {cardSegs.length ? `Keep dictating (${cardSegs.length} segments)` : "Dictate on this card"}
        </button>
      </div>
      {!!p.body && <div className="mt-1.5" style={{ fontSize: 12.5, color: CREAM }}>{String(p.body)}</div>}
      {item.quote && <div className="mt-1.5" style={{ fontSize: 12, fontStyle: "italic", color: NEON.muted, borderLeft: `2px solid ${GOLD}66`, paddingLeft: 8 }}>“{item.quote}”</div>}

      {/* B6.3 — reference a shipped exhibit + keep/change notes */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select value={refId ?? ""} onChange={(e) => { const v = e.target.value || null; setRefId(v); save({ exhibitRef: v }); }}
          style={{ background: "rgba(9,13,26,0.7)", color: CREAM, border: `1px solid ${EDGE}`, borderRadius: 8, fontSize: 12, padding: "4px 8px" }}>
          <option value="">no reference exhibit</option>
          {EXHIBIT_REGISTRY.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        {refId && (
          <input value={keepChange} placeholder="what I'd keep / what I'd change for this context…"
            onChange={(e) => setKeepChange(e.target.value)} onBlur={() => save({ keepChange })}
            style={{ flex: 1, minWidth: 220, background: "rgba(9,13,26,0.7)", border: `1px solid ${EDGE}`, borderRadius: 8, color: CREAM, fontSize: 12, padding: "5px 10px" }} />
        )}
      </div>

      {/* B6.4 — the conveyor draft */}
      <div className="mt-3 flex items-center gap-2">
        <button className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ border: `1.5px solid ${GOLD}`, color: busy ? NEON.muted : GOLD }} disabled={busy} onClick={() => void generate()}>
          <RefreshCw className="h-3 w-3" /> {busy ? "drafting…" : draft ? "Redraft the conveyor prompt" : "Draft the conveyor prompt"}
        </button>
        {draft?.prompt && (
          <>
            <button className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: GOLD, color: "#0B1322" }} onClick={() => void copy()}>
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? "Copied" : "COPY prompt"}
            </button>
            <button className="text-xs" style={{ color: NEON.muted, textDecoration: "underline" }} onClick={() => setShowPrompt((v) => !v)}>
              {showPrompt ? "hide" : "view"} prompt
            </button>
          </>
        )}
      </div>
      {err && <div className="mt-1" style={{ color: "#F87171", fontSize: 11 }}>{err}</div>}
      {draft?.summary && <div className="mt-2" style={{ fontSize: 12.5, color: CREAM }}>{draft.summary}</div>}
      {showPrompt && draft?.prompt && (
        <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", background: "rgba(9,13,26,0.7)", borderRadius: 10, padding: 10, marginTop: 8, maxHeight: 320, overflowY: "auto", color: CREAM, fontFamily: "inherit" }}>{draft.prompt}</pre>
      )}
      <div style={{ marginTop: 6, fontSize: 10, color: NEON.muted, fontFamily: BIG_FONT }}>Copy/paste into the conveyor is the integration — nothing runs itself.</div>
    </div>
  );
}
