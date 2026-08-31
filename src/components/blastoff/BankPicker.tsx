// THE INSERT PICKER — what Talk Through already banked, offered where Lee is
// about to film it.
//
// Two ways in, and the second is the point: pick something already banked, OR
// type it fresh — and anything typed here is WRITTEN BACK to the bank, so the
// phrase Lee improvised on camera tonight is on the list next time. Otherwise
// the bank slowly becomes a museum while the real phrases live in videos.
//
// Reads the same local-first Talkthrough store the booth writes, so a bank item
// approved thirty seconds ago is already here.
import { useEffect, useMemo, useState } from "react";

import {
  newTTId, touchRow, type BoardItem, type TTDoc,
} from "@/components/canvas/talkthrough";
import { putBoardItem, startTT, subscribeTT, ttState } from "@/components/canvas/talkthrough-sync";
import { EXHIBIT_REGISTRY } from "@/lib/talkthrough.functions";
import type { BlastFrame, BlastFrameKind } from "./plan";

const GOLD = "#FCA311";
const CREAM = "#F4EFE6";
const MUTED = "#9AA3B8";
const EDGE = "rgba(244,239,230,0.16)";

/** Which banked things belong behind each insert button. A bank item's kind
 *  lives either on the row (kind "phrase") or in its payload (idea kinds). */
const MATCHES: Record<string, (b: BoardItem) => boolean> = {
  phrase: (b) => b.kind === "phrase" || pk(b) === "phrase" || pk(b) === "trigger_word",
  cheat: (b) => pk(b) === "cheat_code" || tagged(b, "Cheat Code"),
  tip: (b) => pk(b) === "tip_trick" || tagged(b, "Memorize This") || tagged(b, "Formula to Remember"),
};
const pk = (b: BoardItem): string => String((b.payload as { kind?: string }).kind ?? "");
const tagged = (b: BoardItem, tag: string): boolean =>
  Array.isArray((b.payload as { calloutTags?: string[] }).calloutTags)
  && (b.payload as { calloutTags: string[] }).calloutTags.includes(tag);

const bodyOf = (b: BoardItem): string => {
  const p = b.payload as Record<string, unknown>;
  return String(p.body ?? p.meaning ?? p.proposal ?? "");
};

export function BankPicker({ kind, setId, setName, onPick, onClose }: {
  kind: BlastFrameKind;
  setId: string;
  setName: string;
  onPick: (patch: Partial<BlastFrame>) => void;
  onClose: () => void;
}) {
  const [doc, setDoc] = useState<TTDoc | null>(null);
  const [q, setQ] = useState("");
  const [free, setFree] = useState("");
  const [freeBody, setFreeBody] = useState("");

  useEffect(() => {
    startTT();
    setDoc(ttState().doc);
    return subscribeTT(() => setDoc(ttState().doc));
  }, []);

  const items = useMemo(() => {
    const match = MATCHES[kind];
    if (!doc || !match) return [];
    const needle = q.trim().toLowerCase();
    return doc.boardItems
      .filter((b) => !b.archivedAt && b.status !== "archived" && match(b))
      .filter((b) => !needle || `${b.title} ${bodyOf(b)}`.toLowerCase().includes(needle))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 40);
  }, [doc, kind, q]);

  if (kind === "exhibit") {
    return (
      <Shell title="Exhibit" onClose={onClose}>
        {(EXHIBIT_REGISTRY as readonly { id: string; label: string }[]).length === 0 ? (
          <Empty>No exhibits yet — open Exhibit Lab ↗</Empty>
        ) : (
          <div className="flex flex-col gap-1">
            {(EXHIBIT_REGISTRY as readonly { id: string; label: string }[]).map((e) => (
              <Row key={e.id} onClick={() => onPick({ exhibitRef: e.id, text: e.label })}>{e.label}</Row>
            ))}
          </div>
        )}
        <div style={{ fontSize: 10.5, color: MUTED, marginTop: 8 }}>
          A shipped exhibit is filmed from Exhibit Lab — this frame marks where it goes in the run.
        </div>
      </Shell>
    );
  }

  /** Free text becomes a real bank item so it exists for the next set too. */
  const addFree = () => {
    const title = free.trim();
    if (!title) return;
    const iso = new Date().toISOString();
    const payloadKind = kind === "phrase" ? "phrase" : kind === "cheat" ? "cheat_code" : "tip_trick";
    const item: BoardItem = {
      id: newTTId("ttb"), sessionId: `blastoff:${setId}`, runId: "blastoff",
      kind: kind === "phrase" ? "phrase" : "idea",
      title,
      payload: { kind: payloadKind, body: freeBody.trim(), origin: "blast-off", setName },
      quote: "", ceqIds: [], status: "approved", comment: "",
      createdAt: iso, updatedAt: iso, syncedAt: null,
    };
    putBoardItem(item);
    onPick(kind === "cheat" ? { title, body: freeBody.trim() || undefined, bankItemId: item.id } : { text: title, bankItemId: item.id });
    setFree(""); setFreeBody("");
  };

  return (
    <Shell title={kind === "phrase" ? "Phrase" : kind === "cheat" ? "Cheat code" : "Tip / Trick"} onClose={onClose}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search the bank…"
        style={inputStyle} />
      {items.length === 0 ? (
        <Empty>Nothing banked yet for this — type it below and it joins the bank.</Empty>
      ) : (
        <div className="flex flex-col gap-1" style={{ maxHeight: 220, overflowY: "auto", marginTop: 8 }}>
          {items.map((b) => (
            <Row key={b.id} onClick={() => onPick(
              kind === "cheat"
                ? { title: b.title, body: bodyOf(b) || undefined, bankItemId: b.id }
                : { text: b.title, bankItemId: b.id },
            )}>
              <span style={{ color: CREAM }}>{b.title}</span>
              {bodyOf(b) ? <span style={{ color: MUTED, fontSize: 11 }}> — {bodyOf(b).slice(0, 70)}</span> : null}
            </Row>
          ))}
        </div>
      )}

      <div style={{ borderTop: `1px dashed ${EDGE}`, marginTop: 10, paddingTop: 10 }}>
        <div style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: MUTED, fontWeight: 800, marginBottom: 6 }}>
          Not banked yet
        </div>
        <input value={free} onChange={(e) => setFree(e.target.value)}
          placeholder={kind === "cheat" ? "The rule" : "In Lee's words"} style={inputStyle}
          onKeyDown={(e) => { if (e.key === "Enter") addFree(); }} />
        {kind === "cheat" && (
          <input value={freeBody} onChange={(e) => setFreeBody(e.target.value)} placeholder="Why / when (optional)"
            style={{ ...inputStyle, marginTop: 6 }} onKeyDown={(e) => { if (e.key === "Enter") addFree(); }} />
        )}
        <button onClick={addFree} disabled={!free.trim()}
          style={{ marginTop: 8, background: free.trim() ? GOLD : "transparent", color: free.trim() ? "#0B1322" : MUTED, border: `1px solid ${free.trim() ? GOLD : EDGE}`, borderRadius: 10, padding: "5px 12px", fontSize: 12, fontWeight: 800, cursor: free.trim() ? "pointer" : "default" }}>
          Add + bank it
        </button>
      </div>
    </Shell>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", background: "rgba(9,13,26,0.7)", border: `1px solid ${EDGE}`,
  borderRadius: 9, color: CREAM, fontSize: 12.5, padding: "6px 10px", outline: "none",
};

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-3.5" style={{ background: "rgba(16,24,44,0.96)", border: `1px solid ${GOLD}55`, marginBottom: 14 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
        <span style={{ fontFamily: "'League Spartan', sans-serif", fontWeight: 800, fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: GOLD }}>{title}</span>
        <button onClick={onClose} className="ml-auto" style={{ color: MUTED, background: "none", border: "none", fontSize: 12, cursor: "pointer" }}>close</button>
      </div>
      {children}
    </div>
  );
}

const Row = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} className="rounded-lg px-2.5 py-1.5 text-left"
    style={{ background: "rgba(9,13,26,0.6)", border: `1px solid ${EDGE}`, color: CREAM, fontSize: 12.5, cursor: "pointer" }}>
    {children}
  </button>
);

const Empty = ({ children }: { children: React.ReactNode }) => (
  <div style={{ color: MUTED, fontSize: 12, padding: "10px 2px" }}>{children}</div>
);
