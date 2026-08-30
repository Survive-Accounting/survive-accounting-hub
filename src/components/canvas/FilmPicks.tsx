// FILM PICKS (B5) — the payoff step: the bridge from planning heat to
// filming. Any approved item toggles "INCLUDE IN VIDEO" for a set
// (payload.filmPick = { setId, order }); each set gets this tray — Lee's
// picks in HIS order (▲▼ + native drag), inserted as memo frames through the
// existing card system, and the OPEN FILM MODE → handoff.
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Clapperboard, ExternalLink, X } from "lucide-react";

import { insertFilmPicks } from "@/lib/talkthrough.functions";
import { writeFilmHandoff } from "@/lib/film-handoff";
import { BIG_FONT, NEON } from "./theme";
import { stampLabel, touchRow, type BoardItem, type TTDoc } from "./talkthrough";
import { putBoardItem } from "./talkthrough-sync";

const CREAM = "#F4EFE6";
const GOLD = "#FCA311";
const PANEL = "rgba(16,24,44,0.9)";
const EDGE = "rgba(244,239,230,0.16)";

export interface FilmPick { setId: string; order: number }
export const filmPickOf = (b: BoardItem): FilmPick | null => {
  const p = (b.payload as { filmPick?: FilmPick }).filmPick;
  return p?.setId ? p : null;
};

export function picksForSet(doc: TTDoc, setId: string): BoardItem[] {
  return doc.boardItems
    .filter((b) => !b.archivedAt && b.status !== "archived" && filmPickOf(b)?.setId === setId)
    .sort((a, b) => (filmPickOf(a)!.order - filmPickOf(b)!.order));
}

/** Toggle INCLUDE IN VIDEO for an item on a set — appended at the tray's end. */
export function toggleFilmPick(doc: TTDoc, item: BoardItem, setId: string): void {
  const cur = filmPickOf(item);
  const p = { ...(item.payload as Record<string, unknown>) };
  if (cur?.setId === setId) delete p.filmPick;
  else p.filmPick = { setId, order: picksForSet(doc, setId).length } satisfies FilmPick;
  putBoardItem(touchRow(item, { payload: p } as Partial<BoardItem>));
}

const bodyOf = (b: BoardItem): string => {
  const p = b.payload as Record<string, unknown>;
  return String(p.body ?? p.proposal ?? p.why ?? p.meaning ?? p.pitch ?? "");
};

export function openFilmMode(setId: string): void {
  writeFilmHandoff(setId);
  window.open("/study/canvas", "_blank", "noopener");
}

export function FilmPicksTray({ doc, setId, setName }: { doc: TTDoc; setId: string; setName: string }) {
  const picks = useMemo(() => picksForSet(doc, setId), [doc, setId]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const reorder = (from: number, to: number) => {
    if (to < 0 || to >= picks.length) return;
    const next = [...picks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    next.forEach((b, i) => {
      const p = { ...(b.payload as Record<string, unknown>), filmPick: { setId, order: i } };
      putBoardItem(touchRow(b, { payload: p } as Partial<BoardItem>));
    });
  };

  const insert = async () => {
    setBusy(true); setNote(null);
    try {
      const r = await insertFilmPicks({
        data: {
          setId,
          picks: picks.map((b, i) => ({
            itemId: b.id, title: b.title, body: bodyOf(b),
            tags: Array.isArray((b.payload as { calloutTags?: string[] }).calloutTags) ? (b.payload as { calloutTags: string[] }).calloutTags : [],
            order: i,
          })),
        },
      });
      setNote(`✓ ${r.inserted} memo frame${r.inserted === 1 ? "" : "s"} in the set — on screen while filming`);
    } catch (e) { setNote(`⚠ ${e instanceof Error ? e.message : String(e)}`); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl p-4" style={{ background: PANEL, border: `1px solid ${EDGE}` }}>
      <div className="flex items-center gap-2">
        <Clapperboard className="h-4 w-4" style={{ color: GOLD }} />
        <div style={{ fontFamily: BIG_FONT, fontWeight: 800, fontSize: 13, color: CREAM, letterSpacing: "0.04em" }}>FILM PICKS · {setName}</div>
        <button
          className="ml-auto flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold"
          style={{ background: GOLD, color: "#0B1322" }}
          onClick={() => openFilmMode(setId)}
          title="New tab, this set loaded and ready — \\ pops the film window (Recording Mode rules untouched)"
        >
          Open film mode <ExternalLink className="h-3 w-3" />
        </button>
      </div>
      {picks.length === 0 ? (
        <div style={{ color: NEON.muted, fontSize: 12, marginTop: 8 }}>No picks yet — toggle 🎬 INCLUDE IN VIDEO on any approved item.</div>
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-1.5">
            {picks.map((b, i) => (
              <div
                key={b.id}
                draggable
                onDragStart={() => setDragId(b.id)}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={() => { if (dragId && dragId !== b.id) { const from = picks.findIndex((x) => x.id === dragId); reorder(from, i); } setDragId(null); }}
                className="flex items-center gap-2 rounded-xl px-3 py-2"
                style={{ background: "rgba(9,13,26,0.6)", border: `1px solid ${dragId === b.id ? GOLD : EDGE}`, cursor: "grab" }}
              >
                <span style={{ color: NEON.muted, fontSize: 11, fontFamily: BIG_FONT, fontWeight: 800 }}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div style={{ color: CREAM, fontSize: 12.5, fontWeight: 700 }}>{b.title}</div>
                  <div style={{ color: NEON.muted, fontSize: 10.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stampLabel(b.kind === "idea" ? String((b.payload as { kind?: string }).kind ?? "idea") : b.kind)} · {bodyOf(b).slice(0, 70)}</div>
                </div>
                <button title="Up" style={{ color: NEON.muted }} onClick={() => reorder(i, i - 1)}><ArrowUp className="h-3.5 w-3.5" /></button>
                <button title="Down" style={{ color: NEON.muted }} onClick={() => reorder(i, i + 1)}><ArrowDown className="h-3.5 w-3.5" /></button>
                <button title="Remove from picks" style={{ color: NEON.muted }} onClick={() => toggleFilmPick(doc, b, setId)}><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button className="rounded-xl px-3 py-2 text-xs font-bold" style={{ border: `1.5px solid ${GOLD}`, color: busy ? NEON.muted : GOLD }} disabled={busy} onClick={() => void insert()}>
              {busy ? "inserting…" : "Insert picks into the set → frames"}
            </button>
            {note && <span style={{ color: note.startsWith("✓") ? "#3BF5A0" : "#F87171", fontSize: 11.5 }}>{note}</span>}
          </div>
        </>
      )}
    </div>
  );
}
