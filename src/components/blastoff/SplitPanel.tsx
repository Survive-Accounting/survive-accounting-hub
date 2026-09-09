// THE KNIFE — split one set into sibling Shorts-sized sets, from the Editor.
//
// Lee, 2026-09-09: "the splitting has to be ruthless… I wanna split it into a short for assets,
// one for liabilities, one for equity, one for revenue, one for expense." A set is already in
// teaching order, so the gesture is a CUT between two cards, not a sort into buckets: the
// running order is listed, a ✂ sits between every pair of cards, each run between cuts is a
// piece with a name, and the counts say when a piece is over the twelve-card ceiling. Four
// clicks and five names → five sets, siblings of this one, under the same topic. The logic is
// components/blastoff/split-set.ts (pure, tested); the moving is lib/split-set.functions.ts.
//
// AFTER THE CUT the page goes to the topic, where the new sets sit right after this one, each
// with its own Brainstorm → Editor → Film. That is the whole point: "edit five videos at once
// and then push them to filming and then film five back to back."
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import type { BoothSetInfo, BoothTopic } from "@/lib/talkthrough.functions";
import { splitSet } from "@/lib/split-set.functions";
import { refreshBank } from "@/components/v3/use-bank";
import { V3_CREAM, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";

import { PIECE_CARD_CEILING, cuttable, pieceStatus, piecesFromCuts, splitProblem, suggestPieceName } from "./split-set";

const RED = "#F87171";
const MINT = "#6EE7B7";

export function SplitPanel({ set, topic, onClose }: { set: BoothSetInfo; topic: BoothTopic; onClose: () => void }) {
  const navigate = useNavigate();
  const cards = useMemo(() => cuttable(set.ceqs.map((c) => ({ id: c.id, stem: c.stem, noteOnly: c.noteOnly, draft: c.draft }))), [set.ceqs]);
  const byId = useMemo(() => new Map(set.ceqs.map((c) => [c.id, c])), [set.ceqs]);
  const [cuts, setCuts] = useState<Set<number>>(() => new Set());
  const [names, setNames] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pieces = useMemo(() => piecesFromCuts(cards, cuts, names), [cards, cuts, names]);
  const problem = useMemo(() => splitProblem(cards.map((c) => c.id), pieces), [cards, pieces]);

  // The suggestion for a run: the shared correct answer when there is one ("Assets"), else the
  // first stem's tail. Shown as the placeholder — Lee's typing always wins.
  const suggested = (p: { ceqIds: string[] }) => suggestPieceName(
    p.ceqIds.map((id) => byId.get(id)?.stem ?? ""),
    p.ceqIds.map((id) => byId.get(id)?.choices.find((ch) => ch.correct)?.text ?? null),
  );

  const toggleCut = (i: number) => setCuts((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const setName = (k: number, v: string) => setNames((arr) => { const n = [...arr]; while (n.length <= k) n.push(""); n[k] = v; return n; });

  const go = async () => {
    if (problem || busy) return;
    setBusy(true); setErr(null);
    try {
      // A blank field takes its own suggestion — so four cuts and zero typing still names five.
      const final = pieces.map((p, k) => ({ ...p, name: (names[k] ?? "").trim() || suggested(p) }));
      const res = await splitSet({ data: { setId: set.id, pieces: final } });
      refreshBank();
      void navigate({ to: `/v3/${topic.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}` });
      onClose();
      void res;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not split the set.");
      setBusy(false);
    }
  };

  // Which piece a card is in, for the colour band on its row.
  const pieceOf = new Map<string, number>();
  pieces.forEach((p, k) => p.ceqIds.forEach((id) => pieceOf.set(id, k)));

  return (
    <section style={{ border: `1px solid ${V3_GOLD}66`, borderRadius: 14, padding: "14px 16px", marginBottom: 18, background: "rgba(252,163,17,0.04)" }}>
      <div className="flex items-baseline" style={{ gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontFamily: "'League Spartan', Rubik, system-ui, sans-serif", fontSize: 18, fontWeight: 900 }}>✂ Split this set</span>
        <span style={{ color: V3_MUTED, fontSize: 12.5 }}>Click between two cards to cut. Every run becomes its own set, right after this one. {PIECE_CARD_CEILING} cards is the ceiling for one Short.</span>
        <button onClick={onClose} style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${V3_EDGE}`, color: V3_MUTED, borderRadius: 8, padding: "3px 10px", cursor: "pointer", fontSize: 12 }}>close</button>
      </div>

      {/* THE PIECES — a name per run, with its count and whether it is over the ceiling. */}
      <div className="flex" style={{ gap: 8, flexWrap: "wrap", margin: "10px 0 12px" }}>
        {pieces.map((p, k) => {
          const st = pieceStatus(p);
          return (
            <label key={k} className="flex items-center" style={{ gap: 6, border: `1px solid ${st.over ? RED : V3_EDGE}`, borderRadius: 10, padding: "5px 8px", background: "rgba(0,0,0,0.25)" }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: bandColor(k) }} />
              <input value={names[k] ?? ""} placeholder={suggested(p)} onChange={(e) => setName(k, e.target.value)}
                style={{ background: "transparent", border: "none", borderBottom: `1px solid ${V3_EDGE}`, color: V3_CREAM, fontSize: 13, width: 150, outline: "none" }} />
              <span style={{ fontSize: 11.5, color: st.over ? RED : V3_MUTED, fontVariantNumeric: "tabular-nums" }} title={st.over ? `over the ${PIECE_CARD_CEILING}-card ceiling — cut again` : undefined}>
                {st.n} card{st.n === 1 ? "" : "s"}{st.over ? " · over" : ""}
              </span>
            </label>
          );
        })}
      </div>

      {/* THE RUNNING ORDER, with a knife between every pair. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0, maxHeight: 420, overflowY: "auto", border: `1px solid ${V3_EDGE}`, borderRadius: 10 }}>
        {cards.map((c, i) => (
          <div key={c.id}>
            <div className="flex items-center" style={{ gap: 10, padding: "6px 10px", borderLeft: `4px solid ${bandColor(pieceOf.get(c.id) ?? 0)}` }}>
              <span style={{ fontSize: 10.5, color: V3_MUTED, width: 26, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
              <span style={{ fontSize: 13, color: V3_CREAM, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.stem || "(untitled card)"}</span>
              <span style={{ fontSize: 11, color: V3_MUTED }}>{byId.get(c.id)?.choices.find((ch) => ch.correct)?.text.replace(/\s*[—–-].*$/, "") ?? ""}</span>
            </div>
            {i < cards.length - 1 && (
              <button onClick={() => toggleCut(i)} title={cuts.has(i) ? "Remove this cut" : "Cut here — the cards above become one set, the cards below another"}
                style={{ display: "block", width: "100%", background: cuts.has(i) ? `${V3_GOLD}22` : "transparent", border: "none", borderTop: `1px ${cuts.has(i) ? "solid" : "dashed"} ${cuts.has(i) ? V3_GOLD : V3_EDGE}`, color: cuts.has(i) ? V3_GOLD : V3_MUTED, fontSize: 11, padding: cuts.has(i) ? "4px 0" : "1px 0", cursor: "pointer", letterSpacing: "0.12em" }}>
                {cuts.has(i) ? "✂ CUT" : "· · ·"}
              </button>
            )}
          </div>
        ))}
        {!cards.length && <div style={{ padding: 12, color: V3_MUTED, fontSize: 13 }}>No filmable cards to cut.</div>}
      </div>

      <div className="flex items-center" style={{ gap: 12, marginTop: 12, flexWrap: "wrap" }}>
        <button onClick={() => void go()} disabled={busy}
          style={{ background: problem ? "transparent" : `${MINT}22`, border: `1.5px solid ${problem ? V3_EDGE : MINT}`, color: problem ? V3_MUTED : V3_CREAM, borderRadius: 10, padding: "8px 16px", fontWeight: 800, fontSize: 13.5, cursor: busy ? "wait" : "pointer" }}
          title={problem ?? `Split into ${pieces.length} sets`}>
          {busy ? "Splitting…" : `Split into ${pieces.length} set${pieces.length === 1 ? "" : "s"}`}
        </button>
        <span style={{ fontSize: 12.5, color: problem ? V3_MUTED : MINT }}>{problem ?? "The pieces land right after this set. Cards you don't cut stay here."}</span>
        {err && <span style={{ fontSize: 12.5, color: RED }}>{err}</span>}
      </div>
    </section>
  );
}

/** A band per piece, cycling — enough to tell five runs apart at a glance. */
function bandColor(k: number): string {
  const bands = ["#FCA311", "#6EE7B7", "#93C5FD", "#F9A8D4", "#C4B5FD", "#FDE68A", "#F87171"];
  return bands[k % bands.length];
}
