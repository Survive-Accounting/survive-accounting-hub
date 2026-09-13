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
import { useRef, useState } from "react";

import { getAdminWho } from "@/components/AdminGate";
import { markGenerationBuilt, recordDraftGeneration, setGenerationStatus } from "@/lib/frame-events.functions";
import { proposeSplitRun } from "@/lib/split-run.functions";

import { CREAM, EDGE, GOLD, MUTED, PANEL } from "./BlastOffEditor";
import { FRAME_LABEL, type BlastFrame, type PlanTake } from "./plan";
import { FRAME_BUDGET, REEL_BUDGET, frameCountLabel, frameFlag } from "./reel";
import { SPLIT_PROMPT_VERSION, cardsIn, generationSlots, keyProposal, mergeSubSplit, pinSubCards, projectedCounts, proposalToFrames, reelCards, slideEdited, type SplitProposal, type SplitReel } from "./split-run";

const MINT = "#3BF5A0";
const RED = "#FF8B7E";
const AMBER = "#F59E0B";

export function SplitRunPanel({ setId, topicName, setName, take, slides, cards, opener, closer, onBuild, onClose }: {
  setId: string;
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
  /** Which candidate is being split further, while its pass runs. */
  const [subBusy, setSubBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [proposal, setProposal] = useState<SplitProposal | null>(null);
  const title = take.name.trim() || `Reel ${take.index + 1}`;
  const cardIds = cards.map((c) => c.id);
  const stemOf = (id: string) => cards.find((c) => c.id === id)?.stem ?? "";

  // THE LEDGER (frame-events): every pass is kept as a draft generation the moment it comes back —
  // a proposal Lee throws away still counts, and a discarded one never reaches the topic's frame
  // record (its slides are tied to no frame). THE CHAIN is the passes the proposal on screen is
  // made of: the first proposal plus each "split further" (which points at it as its parent).
  // Build it marks every pass in the chain built, linking each built frame to the slide that pass
  // wrote and logging the ones he changed; Propose again supersedes the chain; closing without
  // building discards it. Versions accumulate per SET (Studio prompt 3: re-runnable against the
  // same topic at any point, every run retained).
  type Draft = { generationId: string; slotIds: Record<string, string>; generated: SplitProposal };
  const chain = useRef<Promise<Draft | null>[]>([]);
  const pass = useRef(0);
  const settled = useRef(false);
  const scopeKey = `${setId}#split`;
  const record = (input: unknown, raw: SplitProposal, keyed: SplitProposal, model: string, parent: Draft | null): Promise<Draft | null> =>
    recordDraftGeneration({ data: {
      setId, scopeKey, parentGenerationId: parent?.generationId ?? null, generator: "split_run", reelCount: keyed.reels.length,
      model, promptVersion: SPLIT_PROMPT_VERSION, input, output: raw, slots: generationSlots(keyed), who: getAdminWho(),
    } })
      .then((g) => { if (g.ok) return { generationId: g.generationId, slotIds: g.slotIds, generated: keyed }; console.warn("[frame-ledger] split draft not recorded:", g.error); return null; })
      .catch((e) => { console.warn("[frame-ledger] split draft not recorded:", e); return null; });
  /** The drafts in the chain so far (the ones that recorded). */
  const drafts = async (): Promise<Draft[]> => (await Promise.all(chain.current)).filter((d): d is Draft => d !== null);
  const retire = (status: "superseded" | "discarded") => {
    const pending = chain.current;
    chain.current = [];
    if (!pending.length) return;
    void Promise.all(pending).then((ds) => {
      const ids = ds.filter((d): d is Draft => d !== null).map((d) => d.generationId);
      if (ids.length) void setGenerationStatus({ data: { ids, status } }).then((r) => { if (!r.ok) console.warn(`[frame-ledger] ${status} not recorded:`, r.error); });
    });
  };

  const propose = async () => {
    setBusy(true); setErr(null);
    try {
      const input = { topicName, setName, reelTitle: title, slides, cards, note };
      const r = await proposeSplitRun({ data: input });
      retire("superseded");
      const keyed = keyProposal(r.proposal, `p${pass.current++}.`);
      setProposal(keyed);
      if (!r.proposal.reels.length) setErr("It didn't propose a split. Say a bit more about where it should break.");
      else chain.current = [record(input, r.proposal, keyed, r.model, null)];
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  /** SPLIT THIS ONE FURTHER: a pass on just this candidate; its Reels take its place. */
  const splitFurther = async (ri: number) => {
    const reel = proposal?.reels[ri];
    if (!proposal || !reel) return;
    setSubBusy(ri); setErr(null);
    try {
      const subCards = reelCards(reel, cardIds);
      const input = {
        topicName, setName, reelTitle: reel.title,
        slides: reel.slides.map((s) => ({ kind: s.kind, words: s.kind === "ceq" ? stemOf(reelCards({ title: "", slides: [s] }, cardIds)[0] ?? "") : s.needs ?? [s.text, ...(s.bullets ?? [])].filter(Boolean).join(" · ") })),
        cards: subCards.map((id) => ({ id, stem: stemOf(id) })),
        note: [`This is one candidate Reel from a larger split, projected at ${projectedCounts(proposal, cardIds)[ri]} frames. Split it into smaller Reels.`, note.trim()].filter(Boolean).join("\n"),
      };
      const r = await proposeSplitRun({ data: input });
      const keyed = keyProposal(pinSubCards(r.proposal, subCards), `p${pass.current++}.`);
      if (!keyed.reels.length) { setErr(`It didn't split "${reel.title}" further. Say where it should break, then try again.`); return; }
      setProposal((p) => (p ? mergeSubSplit(p, ri, keyed, subCards) : p));
      const parent = (await drafts())[0] ?? null;
      chain.current = [...chain.current, record(input, r.proposal, keyed, r.model, parent)];
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setSubBusy(null); }
  };

  const edit = (fn: (reels: SplitReel[]) => SplitReel[]) => setProposal((p) => (p ? { ...p, reels: fn(p.reels.map((r) => ({ ...r, slides: [...r.slides] }))) } : p));

  const close = () => { if (!settled.current) retire("discarded"); onClose(); };

  const build = () => {
    if (!proposal?.reels.length) return;
    settled.current = true;
    const { frames, appended, sources } = proposalToFrames(proposal, { cards: cardIds, opener, closer });
    onBuild(frames, `${proposal.reels.length} Reels from ${title}${appended.length ? ` · ${appended.length} card${appended.length === 1 ? "" : "s"} kept on the last one` : ""}`);
    const pending = chain.current;
    chain.current = [];
    void Promise.all(pending).then((ds) => {
      for (const draft of ds) {
        if (!draft) continue;
        const generatedByKey = new Map(generationSlots(draft.generated).map((s) => [s.key, s.generated]));
        const links = sources.flatMap(({ frameId, slide }) => {
          const generatedId = slide.key ? draft.slotIds[slide.key] : undefined;
          const gen = slide.key ? generatedByKey.get(slide.key) : undefined;
          if (!generatedId || !gen) return [];
          const { key: _k, ...after } = slide;
          return [{ generatedId, frameId, edited: slideEdited(gen, slide) ? { before: gen, after } : null }];
        });
        void markGenerationBuilt({ data: { generationId: draft.generationId, setId, links, who: getAdminWho() } })
          .then((r) => { if (!r.ok) console.warn("[frame-ledger] split build not recorded:", r.error); })
          .catch((e) => console.warn("[frame-ledger] split build not recorded:", e));
      }
    });
  };
  const counts = proposal ? projectedCounts(proposal, cardIds) : [];
  const anyOver = counts.some((n) => frameFlag(n) !== "ok");

  const box: React.CSSProperties = { font: "inherit", fontSize: 12.5, width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: `1px solid ${EDGE}`, background: "rgba(255,255,255,0.05)", color: CREAM, outline: "none" };
  const btn = (kind: "gold" | "ghost" = "ghost"): React.CSSProperties => ({ font: "inherit", fontSize: 12, fontWeight: 800, padding: "6px 12px", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap", border: `1px solid ${kind === "gold" ? GOLD : EDGE}`, background: kind === "gold" ? "rgba(252,163,17,0.14)" : "transparent", color: kind === "gold" ? GOLD : CREAM });

  return (
    <div role="dialog" aria-label={`Split run — ${title}`} onClick={close}
      style={{ position: "fixed", inset: 0, zIndex: 95, background: "rgba(4,6,12,0.82)", display: "grid", placeItems: "center", padding: 18 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "min(880px, 100%)", maxHeight: "92vh", overflowY: "auto", background: PANEL, border: `1px solid ${GOLD}55`, borderRadius: 14, padding: 16 }}>
        <div className="flex items-center" style={{ gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'League Spartan', Rubik, system-ui, sans-serif", fontSize: 17, fontWeight: 900, color: CREAM }}>✂ Split run</span>
          <span style={{ fontSize: 12.5, color: MUTED }}>{title} · {slides.length} slides · {cards.length} card{cards.length === 1 ? "" : "s"}</span>
          <button onClick={close} style={{ ...btn(), marginLeft: "auto" }}>close</button>
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
          <button onClick={() => void propose()} disabled={busy || subBusy !== null} style={{ ...btn("gold"), opacity: busy || subBusy !== null ? 0.5 : 1 }}>{busy ? "Thinking…" : proposal ? "Propose again" : "Propose the split"}</button>
          <span style={{ fontSize: 11.5, color: MUTED }}>up to ~{FRAME_BUDGET.ceiling} frames each ({FRAME_BUDGET.max} at most, not counting the opener and sign-off) · ~{REEL_BUDGET.target}–{REEL_BUDGET.max}s · one callout each · nothing is written until you build it</span>
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
              {/* THE PROJECTED COUNT — what Build it would put in this Reel, the loose flag past the ceiling. */}
              {(() => {
                const n = counts[ri] ?? 0;
                const flag = frameFlag(n);
                return (
                  <span title={`${n} content frames if you build it now (the opener and sign-off aren't counted). Loose ceiling ${FRAME_BUDGET.ceiling}, ${FRAME_BUDGET.max} at most — a nudge, not a rule.`}
                    style={{ flex: "0 0 auto", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap", borderRadius: 999, padding: "2px 9px", border: `1px solid ${flag === "over" ? RED : flag === "long" ? AMBER : EDGE}`, color: flag === "over" ? RED : flag === "long" ? AMBER : MUTED }}>
                    {frameCountLabel(n)}
                  </span>
                );
              })()}
              <button title="Split just this Reel into smaller ones — its Reels take its place here, nothing is written until you build it"
                onClick={() => void splitFurther(ri)} disabled={busy || subBusy !== null}
                style={{ ...btn(), color: frameFlag(counts[ri] ?? 0) !== "ok" ? AMBER : CREAM, opacity: busy || (subBusy !== null && subBusy !== ri) ? 0.5 : 1 }}>
                {subBusy === ri ? "Splitting…" : "✂ further"}
              </button>
              <button title="Drop this Reel from the proposal" onClick={() => edit((rs) => rs.filter((_, i) => i !== ri))} style={btn()}>✕</button>
            </div>
            {reel.why && <div style={{ marginTop: 4, fontSize: 11.5, color: MUTED }}>{reel.why}</div>}
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
              {reel.slides.map((s, si) => {
                const cardId = s.kind === "ceq" ? reelCards({ title: "", slides: [s] }, cardIds)[0] : undefined;
                const card = cardId ? cards.find((c) => c.id === cardId) : undefined;
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
            <button onClick={build} disabled={busy || subBusy !== null} style={{ ...btn("gold"), fontSize: 13 }}>{anyOver ? "Build anyway" : "Build it"} — {proposal.reels.length} Reels</button>
            {anyOver && <span style={{ fontSize: 11.5, color: AMBER }}>Some Reels run long — fine to build; ✂ further splits one.</span>}
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
