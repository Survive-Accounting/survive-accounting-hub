// THE SPLIT RUN PANEL — one Reel in, smaller Reels out.
//
// Lee, 2026-09-12: "I just talk through how to split, how to split. Once we split all the way down
// like we want.... we will review slides produced, then 'build it' when ready … Make it super
// simple and comically minimal."
//
// So: the Reel as it stands, one box to say what should happen, one button. What comes back is a
// list of Reels he can edit in place — rename one, fix a line, drop a slide, drop a whole Reel —
// and nothing touches the plan until Build it. No stamping, no per-card pass, no suggestions bar.
//
// The rules and the safety live in split-run.ts (every card survives the build; a placeholder is a
// loud blank slide). This file is the room they happen in.
import { useState } from "react";

import { proposeSplitRun } from "@/lib/split-run.functions";

import { CREAM, EDGE, GOLD, MUTED, PANEL } from "./BlastOffEditor";
import { FRAME_LABEL, type BlastFrame, type PlanTake } from "./plan";
import { REEL_BUDGET } from "./reel";
import { cardsIn, proposalToFrames, type SplitProposal, type SplitReel } from "./split-run";

const MINT = "#3BF5A0";
const RED = "#FF8B7E";

export function SplitRunPanel({ topicName, setName, take, slides, cards, opener, closer, onBuild, onClose }: {
  topicName: string;
  setName: string;
  take: PlanTake;
  /** The Reel's slides, in order, as the prompt and the list both read them. */
  slides: { kind: string; words: string }[];
  /** Its cards: the short id the model uses, and the question. */
  cards: { id: string; stem: string }[];
  opener: () => BlastFrame[];
  closer: () => BlastFrame[];
  onBuild: (frames: BlastFrame[], summary: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [proposal, setProposal] = useState<SplitProposal | null>(null);
  const title = take.name.trim() || `Reel ${take.index + 1}`;

  const propose = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await proposeSplitRun({ data: { topicName, setName, reelTitle: title, slides, cards, note } });
      setProposal(r.proposal);
      if (!r.proposal.reels.length) setErr("It didn't propose a split. Say a bit more about where it should break.");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const edit = (fn: (reels: SplitReel[]) => SplitReel[]) => setProposal((p) => (p ? { ...p, reels: fn(p.reels.map((r) => ({ ...r, slides: [...r.slides] }))) } : p));

  const build = () => {
    if (!proposal?.reels.length) return;
    const { frames, appended } = proposalToFrames(proposal, { cards: cards.map((c) => c.id), opener, closer });
    onBuild(frames, `${proposal.reels.length} Reels from ${title}${appended.length ? ` · ${appended.length} card${appended.length === 1 ? "" : "s"} kept on the last one` : ""}`);
  };

  const box: React.CSSProperties = { font: "inherit", fontSize: 12.5, width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: `1px solid ${EDGE}`, background: "rgba(255,255,255,0.05)", color: CREAM, outline: "none" };
  const btn = (kind: "gold" | "ghost" = "ghost"): React.CSSProperties => ({ font: "inherit", fontSize: 12, fontWeight: 800, padding: "6px 12px", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap", border: `1px solid ${kind === "gold" ? GOLD : EDGE}`, background: kind === "gold" ? "rgba(252,163,17,0.14)" : "transparent", color: kind === "gold" ? GOLD : CREAM });

  return (
    <div role="dialog" aria-label={`Split run — ${title}`} onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 95, background: "rgba(4,6,12,0.82)", display: "grid", placeItems: "center", padding: 18 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "min(880px, 100%)", maxHeight: "92vh", overflowY: "auto", background: PANEL, border: `1px solid ${GOLD}55`, borderRadius: 14, padding: 16 }}>
        <div className="flex items-center" style={{ gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'League Spartan', Rubik, system-ui, sans-serif", fontSize: 17, fontWeight: 900, color: CREAM }}>✂ Split run</span>
          <span style={{ fontSize: 12.5, color: MUTED }}>{title} · {slides.length} slides · {cards.length} card{cards.length === 1 ? "" : "s"}</span>
          <button onClick={onClose} style={{ ...btn(), marginLeft: "auto" }}>close</button>
        </div>

        {/* WHAT IS IN IT — so he can see what he is splitting without leaving the panel. */}
        <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
          {slides.map((s, i) => (
            <span key={i} title={s.words} style={{ fontSize: 10.5, color: MUTED, border: `1px solid ${EDGE}`, borderRadius: 7, padding: "2px 7px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {FRAME_LABEL[s.kind as keyof typeof FRAME_LABEL] ?? s.kind}{s.words ? ` · ${s.words}` : ""}
            </span>
          ))}
        </div>

        <label style={{ display: "block", marginTop: 12, fontSize: 11, color: MUTED }}>
          Say how it should split
          <textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} rows={3}
            placeholder="e.g. this is really two — prepaids is its own thing, and the LT assets list wants its own video with the depreciation cheat code"
            style={{ ...box, marginTop: 4, minHeight: 64, resize: "vertical" }} />
        </label>
        <div className="flex items-center" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <button onClick={() => void propose()} disabled={busy} style={{ ...btn("gold"), opacity: busy ? 0.5 : 1 }}>{busy ? "Thinking…" : proposal ? "Propose again" : "Propose the split"}</button>
          <span style={{ fontSize: 11.5, color: MUTED }}>{REEL_BUDGET.target}–{REEL_BUDGET.max}s each · one callout each · nothing is written until you build it</span>
          {err && <span style={{ fontSize: 12, color: RED }}>{err}</span>}
        </div>

        {proposal?.note && <div style={{ marginTop: 10, fontSize: 12, color: MUTED }}>{proposal.note}</div>}

        {/* THE PROPOSAL — editable in place. */}
        {proposal?.reels.map((reel, ri) => (
          <div key={ri} style={{ marginTop: 10, border: `1px solid ${EDGE}`, borderRadius: 10, padding: 10 }}>
            <div className="flex items-center" style={{ gap: 8 }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: GOLD }}>REEL {ri + 1}</span>
              <input value={reel.title} onChange={(e) => edit((rs) => rs.map((r, i) => (i === ri ? { ...r, title: e.target.value } : r)))}
                style={{ ...box, fontWeight: 800, flex: 1 }} />
              <button title="Drop this Reel from the proposal" onClick={() => edit((rs) => rs.filter((_, i) => i !== ri))} style={btn()}>✕</button>
            </div>
            {reel.why && <div style={{ marginTop: 4, fontSize: 11.5, color: MUTED }}>{reel.why}</div>}
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
              {reel.slides.map((s, si) => {
                const card = s.kind === "ceq" ? cards.find((c) => c.id === s.card) : undefined;
                return (
                  <div key={si} className="flex items-center" style={{ gap: 6 }}>
                    <span style={{ flex: "0 0 auto", fontSize: 10, fontWeight: 800, color: s.needs ? RED : s.kind === "ceq" ? MINT : CREAM, minWidth: 96 }}>
                      {s.needs ? "NEEDS BUILDING" : FRAME_LABEL[s.kind as keyof typeof FRAME_LABEL] ?? s.kind}{s.big ? " · big" : ""}
                    </span>
                    {card ? (
                      <span style={{ flex: 1, fontSize: 12, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.stem}</span>
                    ) : (
                      <input value={s.needs ?? s.text ?? ""} onChange={(e) => edit((rs) => rs.map((r, i) => (i === ri ? { ...r, slides: r.slides.map((x, k) => (k === si ? (x.needs ? { ...x, needs: e.target.value } : { ...x, text: e.target.value }) : x)) } : r)))} style={{ ...box, flex: 1 }} />
                    )}
                    <button title="Drop this slide" onClick={() => edit((rs) => rs.map((r, i) => (i === ri ? { ...r, slides: r.slides.filter((_, k) => k !== si) } : r)))} style={{ ...btn(), padding: "4px 8px" }}>✕</button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {!!proposal?.reels.length && (
          <div className="flex items-center" style={{ gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <button onClick={build} style={{ ...btn("gold"), fontSize: 13 }}>Build it — {proposal.reels.length} Reels</button>
            <span style={{ fontSize: 11.5, color: MUTED }}>
              Replaces {title} in the running order. Every card in it comes out the other side — any the split forgot ride on the last Reel.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** The cards a take carries, as the panel and the prompt both name them. */
export const takeCards = (take: PlanTake, stemOf: (ceqId: string) => string): { id: string; stem: string }[] =>
  cardsIn(take.frames).map((ceqId, i) => ({ id: ceqId, stem: stemOf(ceqId) || `card ${i + 1}` }));
