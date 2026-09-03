// REVIEW DECK — Step 2 as the film draft.
//
// Lee (2026-09-03): "The main thing I want to get is a way to see the slides
// and edit them / approve them … spin up quick slides for Memorize This,
// Deeper Ideas, Cheat Codes and place them in the middle of a CEQ set …
// quickly remove a CEQ slide, duplicate, edit text, rearrange … Talkthrough is
// just talking. Review is seeing the filming draft as it stands … A third
// slide to the right of the current one … the teleprompter."
//
// Three columns. LEFT: the Blast Off plan — the same frames film mode walks —
// drag to reorder, insert, duplicate, skip. MIDDLE: the selected slide, drawn
// by the canvas's own card, editable underneath; a CEQ edit shows before and
// after and saves to the bank through the one existing door (applyCeqEdit).
// RIGHT: the teleprompter — Lee's own words for this slide, click to keep;
// AI proofreads on request and may add ONE line of its own, marked as such.
//
// Nothing here is a new store. The plan is deck.blastOff, as always; the
// teleprompter lines live on the frame they belong to, so film mode shows them.
import { useCallback, useEffect, useMemo, useState } from "react";

import { applyCeqEdit, runMicro, type BoothCeq, type BoothSetInfo, type BoothTopic } from "@/lib/talkthrough.functions";
import type { TTDoc } from "@/components/canvas/talkthrough";
import { NOTE_EYEBROW } from "@/components/canvas/frame-copy";
import { refreshBank } from "@/components/v3/use-bank";
import { BankPicker } from "./BankPicker";
import { CREAM, EDGE, FrameView, GOLD, MUTED, PANEL, questionProgress, usePlan } from "./BlastOffEditor";
import { SetCard } from "./SetCard";
import {
  FRAME_LABEL, dropFrame, duplicateFrame, filmFrames, insertFrame, insertStem, isInsert, isStandard, moveFrame, newFrameId, patchFrame, toggleSkip,
  type BlastFrame, type BlastFrameKind,
} from "./plan";
import { buildTidyMessages, parseTidy, prompterCandidates, type TidyResult } from "./prompter";

/** What the AI board hands the deck: "＋ slide" on an idea card. */
export interface DeckApi { addSlide: (kind: BlastFrameKind, patch: Partial<BlastFrame>) => void }

const QUICK: readonly { kind: BlastFrameKind; label: string }[] = [
  { kind: "phrase", label: "Memorize this" },
  { kind: "cheat", label: "Cheat code" },
  { kind: "tip", label: "Deeper idea" },
];

const SKY = "#7DD3FC";
const MINT = "#3BF5A0";
const RED = "#F87171";

type CeqDraft = { stem: string; choices: { text: string; correct: boolean; feedback: string }[] };
const draftOf = (c: BoothCeq): CeqDraft => ({ stem: c.stem, choices: c.choices.map((x) => ({ text: x.text, correct: x.correct, feedback: x.feedback ?? "" })) });
const sameDraft = (a: CeqDraft, b: CeqDraft): boolean => JSON.stringify(a) === JSON.stringify(b);

const chip = (on: boolean, color = GOLD): React.CSSProperties => ({
  border: `1px solid ${on ? color : EDGE}`, background: on ? `${color}22` : "transparent", color: on ? color : CREAM,
  borderRadius: 9, padding: "4px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
});
const tiny: React.CSSProperties = { background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 13, padding: "0 4px", lineHeight: 1 };
const field: React.CSSProperties = {
  width: "100%", background: "rgba(9,13,26,0.7)", border: `1px solid ${EDGE}`, borderRadius: 9, color: CREAM,
  padding: "7px 9px", fontSize: 13, lineHeight: 1.45, fontFamily: "inherit", boxSizing: "border-box",
};
const eyebrow: React.CSSProperties = { fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: GOLD, fontWeight: 800 };

export function ReviewDeck({ set, topic, doc, register }: {
  set: BoothSetInfo; topic: BoothTopic; doc: TTDoc;
  /** Hands the deck's verbs to whoever mounts it (the AI board's "＋ slide"). */
  register?: (api: DeckApi | null) => void;
}) {
  // CEQ edits saved this visit: the bank reloads on the next page load; until
  // then the preview and the list read the edited card from here.
  const [overrides, setOverrides] = useState<Record<string, CeqDraft>>({});
  const viewSet = useMemo<BoothSetInfo>(() => ({
    ...set,
    ceqs: set.ceqs.map((c) => {
      const o = overrides[c.id];
      return o ? { ...c, stem: o.stem, choices: o.choices.map((x) => ({ text: x.text, correct: x.correct, feedback: x.feedback || undefined })) } : c;
    }),
  }), [set, overrides]);

  const { plan, commit, saving } = usePlan(set);
  const frames = useMemo(() => plan?.frames ?? [], [plan]);
  const ceqById = useMemo(() => new Map(viewSet.ceqs.map((c) => [c.id, c])), [viewSet.ceqs]);
  const progress = useMemo(() => questionProgress(filmFrames(frames), ceqById), [frames, ceqById]);

  const [selId, setSelId] = useState<string | null>(null);
  const sel = frames.find((f) => f.id === selId) ?? frames[0] ?? null;
  const selIdx = sel ? frames.indexOf(sel) : -1;

  const [picker, setPicker] = useState<BlastFrameKind | null>(null);
  const add = useCallback((kind: BlastFrameKind, patch: Partial<BlastFrame> = {}) => {
    if (!plan) return;
    const f: BlastFrame = { id: newFrameId(kind), kind, ...patch };
    commit(insertFrame(plan.frames, f, selIdx < 0 ? plan.frames.length - 1 : selIdx));
    setSelId(f.id); setPicker(null);
  }, [plan, commit, selIdx]);
  useEffect(() => { register?.({ addSlide: add }); return () => register?.(null); }, [register, add]);

  const patch = useCallback((id: string, p: Partial<BlastFrame>) => { if (plan) commit(patchFrame(plan.frames, id, p)); }, [plan, commit]);

  // DRAG TO REORDER — plain HTML5 drag, no library; the arrows stay for
  // one-step nudges and for touch.
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const drop = (to: number) => {
    if (plan && dragId) {
      const from = plan.frames.findIndex((f) => f.id === dragId);
      if (from >= 0 && from !== to) commit(moveFrame(plan.frames, from, to));
    }
    setDragId(null); setOverIdx(null);
  };

  const snippet = (f: BlastFrame): string => {
    const ceq = f.ceqId ? ceqById.get(f.ceqId) : undefined;
    if (f.kind === "intro") return f.text?.trim() || set.name;
    if (f.kind === "bio") return "Lee Ingram · BAccy · MAccy — Ole Miss";
    if (f.kind === "outro") return f.text?.trim() || "Cram what's on your exam.";
    if (f.kind === "ceq") return ceq ? (ceq.noteOnly ? ceq.stem : `${ceq.label} · ${ceq.stem}`) : "— card missing from the set —";
    if (f.kind === "cheat") return [f.title, f.body].filter(Boolean).join(" — ") || "(empty cheat code)";
    if (f.kind === "exhibit") return f.text?.trim() || (f.exhibitRef ? `Exhibit: ${f.exhibitRef}` : "Exhibit");
    return f.text?.trim() || `(empty ${FRAME_LABEL[f.kind].toLowerCase()})`;
  };
  const labelOf = (f: BlastFrame): string => {
    const ceq = f.kind === "ceq" && f.ceqId ? ceqById.get(f.ceqId) : undefined;
    return ceq?.noteOnly ? "Note frame" : FRAME_LABEL[f.kind];
  };

  if (!plan) return <div style={{ color: MUTED, fontSize: 13 }}>Loading the film draft…</div>;

  const filmed = filmFrames(frames).length;
  const skipped = frames.length - filmed;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 340px) minmax(460px, 1fr) minmax(300px, 380px)", gap: 18, alignItems: "start" }}>
      {/* ------------------------------------------------ LEFT: the spine */}
      <section>
        <div className="flex items-center" style={{ gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={eyebrow}>Film draft</span>
          <span style={{ fontSize: 11.5, color: MUTED }}>{filmed} slides{skipped ? ` · ${skipped} skipped` : ""}</span>
          {saving && <span style={{ fontSize: 11, color: saving.startsWith("⚠") ? RED : saving === "saved" ? MINT : MUTED, marginLeft: "auto" }}>{saving}</span>}
        </div>
        <div className="flex" style={{ gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {QUICK.map((q) => (
            <button key={q.kind} style={chip(false)} title={`Insert a ${q.label} slide after slide ${selIdx + 1}`} onClick={() => add(q.kind)}>＋ {q.label}</button>
          ))}
          <button style={chip(picker === "exhibit")} title="Insert an exhibit after the selected slide" onClick={() => setPicker(picker === "exhibit" ? null : "exhibit")}>＋ Exhibit</button>
          <button style={chip(false)} title="Insert a bare frame" onClick={() => add("blank")}>＋ Blank</button>
        </div>
        {picker && <BankPicker kind={picker} setId={set.id} setName={set.name} onPick={(p) => add(picker, p)} onClose={() => setPicker(null)} />}

        <div className="flex flex-col" style={{ gap: 5 }}>
          {frames.map((f, i) => {
            const on = f.id === sel?.id;
            const insert = isInsert(f.kind);
            return (
              <div key={f.id} draggable
                onDragStart={() => setDragId(f.id)}
                onDragOver={(e) => { e.preventDefault(); setOverIdx(i); }}
                onDragLeave={() => setOverIdx((v) => (v === i ? null : v))}
                onDrop={(e) => { e.preventDefault(); drop(i); }}
                onDragEnd={() => { setDragId(null); setOverIdx(null); }}
                onClick={() => setSelId(f.id)}
                title="Click to open · drag to reorder"
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 10, background: PANEL,
                  border: `1px solid ${on ? GOLD : overIdx === i && dragId !== f.id ? SKY : EDGE}`,
                  opacity: f.skipped ? 0.45 : dragId === f.id ? 0.5 : 1, cursor: "grab",
                }}>
                <span style={{ color: MUTED, fontSize: 11, fontWeight: 800, minWidth: 18, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: insert ? GOLD : isStandard(f.kind) ? SKY : MUTED, minWidth: 84 }}>{labelOf(f)}</span>
                <span style={{ fontSize: 12, color: CREAM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textDecoration: f.skipped ? "line-through" : "none" }}>{snippet(f)}</span>
                {(f.prompter?.length ?? 0) > 0 && <span title={`${f.prompter!.length} teleprompter line${f.prompter!.length > 1 ? "s" : ""}`} style={{ fontSize: 10, color: MINT, fontWeight: 800 }}>🗒{f.prompter!.length}</span>}
              </div>
            );
          })}
        </div>
      </section>

      {/* --------------------------------------------- MIDDLE: the slide */}
      <section>
        {sel && (
          <>
            <div className="flex items-center" style={{ gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              <span style={eyebrow}>Slide {selIdx + 1} of {frames.length}</span>
              <span style={{ fontSize: 11.5, color: MUTED }}>{labelOf(sel)}{sel.skipped ? " · skipped" : ""}</span>
              <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                <button style={tiny} title="Move up" onClick={() => commit(moveFrame(frames, selIdx, selIdx - 1))}>↑</button>
                <button style={tiny} title="Move down" onClick={() => commit(moveFrame(frames, selIdx, selIdx + 1))}>↓</button>
                <button style={chip(false)} title="A copy right after this one" onClick={() => { const next = duplicateFrame(frames, sel.id); commit(next); setSelId(next[selIdx + 1]?.id ?? sel.id); }}>⧉ duplicate</button>
                {sel.skipped ? (
                  <button style={chip(true, MINT)} title="Film this slide again" onClick={() => commit(toggleSkip(frames, sel.id))}>↺ film it</button>
                ) : (
                  <button style={chip(false, RED)} title={isInsert(sel.kind) ? "Remove this slide" : "Skip this card in the film (it stays in the set)"} onClick={() => {
                    const next = dropFrame(frames, sel.id); commit(next);
                    if (isInsert(sel.kind)) setSelId(next[Math.min(selIdx, next.length - 1)]?.id ?? null);
                  }}>✕ {isInsert(sel.kind) ? "remove" : "skip"}</button>
                )}
              </span>
            </div>
            <div style={{ border: `1px solid ${EDGE}`, borderRadius: 10, overflow: "hidden", display: "inline-block", maxWidth: "100%", opacity: sel.skipped ? 0.5 : 1 }}>
              <FrameView frame={sel} set={viewSet} scale={0.78} topicName={topic.name} progress={progress.get(sel.id)} />
            </div>
            <div style={{ marginTop: 12 }}>
              {sel.kind === "ceq" && sel.ceqId && ceqById.get(sel.ceqId) && (
                <CeqEditor key={sel.ceqId} ceq={ceqById.get(sel.ceqId)!} topicName={topic.name}
                  onSaved={(d) => setOverrides((o) => ({ ...o, [sel.ceqId!]: d }))} />
              )}
              {sel.kind === "ceq" && sel.ceqId && !ceqById.get(sel.ceqId) && <div style={{ fontSize: 12, color: RED }}>This card is no longer in the set — skip it.</div>}
              {sel.kind === "cheat" && (
                <div className="flex flex-col" style={{ gap: 8 }}>
                  <label style={{ fontSize: 11, color: MUTED }}>The rule (highlighted in gold)
                    <input style={field} value={sel.title ?? ""} placeholder="e.g. Assets = Liabilities + Equity" onChange={(e) => patch(sel.id, { title: e.target.value })} /></label>
                  <label style={{ fontSize: 11, color: MUTED }}>Under it
                    <textarea style={{ ...field, minHeight: 64 }} value={sel.body ?? ""} placeholder="one line of why, in your words" onChange={(e) => patch(sel.id, { body: e.target.value })} /></label>
                </div>
              )}
              {(sel.kind === "phrase" || sel.kind === "tip" || sel.kind === "blank" || sel.kind === "exhibit") && (
                <label style={{ fontSize: 11, color: MUTED }}>{sel.kind === "phrase" ? "The phrase (highlighted in gold)" : sel.kind === "tip" ? "The deeper idea" : sel.kind === "exhibit" ? `Caption${sel.exhibitRef ? ` · exhibit: ${sel.exhibitRef}` : ""}` : "Text on the bare frame"}
                  <textarea style={{ ...field, minHeight: 72, marginTop: 4 }} value={sel.text ?? ""} placeholder="say it the way you'd say it on camera" onChange={(e) => patch(sel.id, { text: e.target.value })} /></label>
              )}
              {sel.kind === "intro" && (
                <label style={{ fontSize: 11, color: MUTED }}>Topic line on the intro (blank = the set's name)
                  <input style={{ ...field, marginTop: 4 }} value={sel.text ?? ""} placeholder={set.name} onChange={(e) => patch(sel.id, { text: e.target.value })} /></label>
              )}
              {sel.kind === "outro" && (
                <label style={{ fontSize: 11, color: MUTED }}>Tagline on the outro (blank = the standard one)
                  <input style={{ ...field, marginTop: 4 }} value={sel.text ?? ""} placeholder="Cram what's on your exam." onChange={(e) => patch(sel.id, { text: e.target.value })} /></label>
              )}
              {sel.kind === "bio" && <div style={{ fontSize: 12, color: MUTED }}>The bio card is the brand card — nothing to edit here. Skip it if this rip doesn't need it.</div>}
            </div>
          </>
        )}
      </section>

      {/* ------------------------------------------- RIGHT: teleprompter */}
      <Prompter frame={sel} slideLabel={sel ? `${labelOf(sel)} — ${snippet(sel)}` : ""} slideText={sel ? slideText(sel, ceqById) : ""} set={set} doc={doc}
        onLines={(lines) => { if (sel) patch(sel.id, { prompter: lines }); }} />
    </div>
  );
}

const slideText = (f: BlastFrame, byId: Map<string, BoothCeq>): string => {
  if (f.kind === "ceq" && f.ceqId) { const c = byId.get(f.ceqId); return c ? [c.stem, ...c.choices.map((x) => `${x.correct ? "✓" : "·"} ${x.text}`)].join("\n") : ""; }
  return insertStem(f);
};

// --------------------------------------------------------- CEQ: before → after

/** Edit the card itself. The bank is the truth, so a save goes through the
 *  one door the review board already uses (applyCeqEdit) — the slide that
 *  films IS the card. Before and after side by side while it is dirty. */
function CeqEditor({ ceq, topicName, onSaved }: { ceq: BoothCeq; topicName: string; onSaved: (d: CeqDraft) => void }) {
  const base = useMemo(() => draftOf(ceq), [ceq]);
  const [d, setD] = useState<CeqDraft>(base);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { setD(base); setNote(null); }, [base]);
  const dirty = !sameDraft(d, base);
  const oneCorrect = ceq.noteOnly || d.choices.filter((c) => c.correct).length === 1;
  const setChoice = (i: number, p: Partial<CeqDraft["choices"][number]>) =>
    setD((v) => ({ ...v, choices: v.choices.map((c, k) => (k === i ? { ...c, ...p } : p.correct ? { ...c, correct: false } : c)) }));

  const save = async () => {
    setBusy(true); setNote(null);
    try {
      await applyCeqEdit({ data: {
        ceqNodeId: ceq.id,
        ...(d.stem !== base.stem ? { stem: d.stem } : {}),
        ...(!ceq.noteOnly && JSON.stringify(d.choices) !== JSON.stringify(base.choices) ? { choices: d.choices.map((c) => ({ text: c.text, correct: c.correct, feedback: c.feedback || null })) } : {}),
      } });
      onSaved(d);
      refreshBank();
      setNote("✓ saved to the bank — this is the card that films");
    } catch (e) { setNote(`⚠ ${e instanceof Error ? e.message : String(e)}`); } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="flex items-center" style={{ gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={eyebrow}>Edit the card</span>
        {dirty && <span style={{ fontSize: 11, color: GOLD }}>unsaved</span>}
        {note && <span style={{ fontSize: 11, color: note.startsWith("⚠") ? RED : MINT }}>{note}</span>}
        {dirty && (
          <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button style={chip(false)} onClick={() => setD(base)} disabled={busy}>discard</button>
            <button style={{ ...chip(true, MINT), opacity: oneCorrect && !busy ? 1 : 0.5 }} disabled={!oneCorrect || busy} title={oneCorrect ? "Write this to the bank" : "Exactly one choice must be correct"} onClick={() => void save()}>
              {busy ? "saving…" : "✓ Save to bank"}
            </button>
          </span>
        )}
      </div>
      {dirty && (
        <div className="flex" style={{ gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 10, color: MUTED, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 3 }}>Before</div>
            <div style={{ border: `1px solid ${EDGE}`, borderRadius: 8, overflow: "hidden" }}>
              <SetCard id={`${ceq.id}-before`} stem={base.stem} choices={base.choices} topic={ceq.noteOnly ? NOTE_EYEBROW : topicName} scale={0.42} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: GOLD, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 3 }}>After</div>
            <div style={{ border: `1px solid ${GOLD}`, borderRadius: 8, overflow: "hidden" }}>
              <SetCard id={`${ceq.id}-after`} stem={d.stem} choices={d.choices} topic={ceq.noteOnly ? NOTE_EYEBROW : topicName} scale={0.42} />
            </div>
          </div>
        </div>
      )}
      <label style={{ fontSize: 11, color: MUTED }}>Stem
        <textarea style={{ ...field, minHeight: 64, marginTop: 4 }} value={d.stem} onChange={(e) => setD((v) => ({ ...v, stem: e.target.value }))} /></label>
      {!ceq.noteOnly && (
        <div className="flex flex-col" style={{ gap: 6, marginTop: 8 }}>
          <div style={{ fontSize: 11, color: MUTED }}>Choices — tick the correct one</div>
          {d.choices.map((c, i) => (
            <div key={i} className="flex items-start" style={{ gap: 6 }}>
              <input type="radio" name={`correct-${ceq.id}`} checked={c.correct} onChange={() => setChoice(i, { correct: true })} title="Correct" style={{ marginTop: 9, accentColor: MINT }} />
              <div style={{ flex: 1 }}>
                <input style={field} value={c.text} onChange={(e) => setChoice(i, { text: e.target.value })} placeholder={`Choice ${String.fromCharCode(65 + i)}`} />
                <input style={{ ...field, fontSize: 11.5, color: MUTED, marginTop: 3 }} value={c.feedback} onChange={(e) => setChoice(i, { feedback: e.target.value })} placeholder="feedback (optional)" />
              </div>
              <button style={tiny} title="Remove this choice" disabled={d.choices.length <= 2} onClick={() => setD((v) => ({ ...v, choices: v.choices.filter((_, k) => k !== i) }))}>✕</button>
            </div>
          ))}
          <button style={{ ...chip(false), alignSelf: "flex-start" }} onClick={() => setD((v) => ({ ...v, choices: [...v.choices, { text: "", correct: false, feedback: "" }] }))}>＋ choice</button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ the prompter

function Prompter({ frame, slideLabel, slideText: text, set, doc, onLines }: {
  frame: BlastFrame | null; slideLabel: string; slideText: string; set: BoothSetInfo; doc: TTDoc;
  onLines: (lines: string[]) => void;
}) {
  const kept = useMemo(() => frame?.prompter ?? [], [frame]);
  const cands = useMemo(() => (frame ? prompterCandidates(frame, doc, set.id) : []), [frame, doc, set.id]);
  const [tidy, setTidy] = useState<Record<string, { res?: TidyResult; busy?: boolean; err?: string }>>({});
  const [typed, setTyped] = useState("");
  const t = frame ? tidy[frame.id] : undefined;
  const has = (s: string) => kept.some((k) => k.trim().toLowerCase() === s.trim().toLowerCase());
  const keep = (s: string) => { const v = s.trim(); if (v && !has(v)) onLines([...kept, v]); };
  const setLine = (i: number, v: string) => onLines(kept.map((k, j) => (j === i ? v : k)));
  const dropLine = (i: number) => onLines(kept.filter((_, j) => j !== i));
  const moveLine = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= kept.length) return; const n = [...kept]; [n[i], n[j]] = [n[j], n[i]]; onLines(n); };

  const proofread = async () => {
    if (!frame || !cands.length) return;
    setTidy((v) => ({ ...v, [frame.id]: { ...v[frame.id], busy: true, err: undefined } }));
    try {
      const { system, user } = buildTidyMessages({ slideLabel, slideText: text, candidates: cands, kept });
      const r = await runMicro({ data: { system, user, maxOutput: 1800 } });
      setTidy((v) => ({ ...v, [frame.id]: { res: parseTidy(r.text, cands), busy: false } }));
    } catch (e) {
      setTidy((v) => ({ ...v, [frame.id]: { ...v[frame.id], busy: false, err: e instanceof Error ? e.message : String(e) } }));
    }
  };

  if (!frame) return <section />;
  const tidyById = new Map((t?.res?.lines ?? []).map((l) => [l.id, l.text]));
  return (
    <section style={{ background: PANEL, border: `1px solid ${EDGE}`, borderRadius: 12, padding: "10px 12px", position: "sticky", top: 12 }}>
      <div className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
        <span style={eyebrow}>Teleprompter</span>
        <span style={{ fontSize: 11, color: MUTED }}>{kept.length} line{kept.length === 1 ? "" : "s"} on this slide</span>
      </div>

      {kept.length > 0 && (
        <div className="flex flex-col" style={{ gap: 5, marginBottom: 10 }}>
          {kept.map((k, i) => (
            <div key={i} className="flex items-center" style={{ gap: 4 }}>
              <input style={{ ...field, padding: "5px 8px", fontSize: 12.5 }} value={k} onChange={(e) => setLine(i, e.target.value)} />
              <button style={tiny} title="Up" onClick={() => moveLine(i, -1)}>↑</button>
              <button style={tiny} title="Down" onClick={() => moveLine(i, 1)}>↓</button>
              <button style={{ ...tiny, color: RED }} title="Drop this line" onClick={() => dropLine(i)}>✕</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED, fontWeight: 800, marginBottom: 5 }}>
        Your words for this slide {cands.length ? `· ${cands.length}` : ""}
      </div>
      {cands.length === 0 ? (
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
          {frame.kind === "ceq" ? "Nothing was captured while this card was up. Talk about it in Step 1, or type a line below." : "No stamp of this kind in the talkthrough. Type a line below."}
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 4, marginBottom: 8 }}>
          {cands.map((c) => {
            const clean = tidyById.get(c.id);
            const shown = clean ?? c.text;
            const on = has(shown);
            return (
              <button key={c.id} onClick={() => keep(shown)} title={on ? "Already on the prompter" : `Keep this line${clean ? ` (proofread — original: "${c.text.slice(0, 120)}")` : ""}`}
                style={{ textAlign: "left", background: on ? "rgba(59,245,160,0.10)" : "rgba(9,13,26,0.6)", border: `1px solid ${on ? MINT : EDGE}`, borderRadius: 9, padding: "6px 9px", color: CREAM, fontSize: 12.5, lineHeight: 1.4, cursor: on ? "default" : "pointer", opacity: on ? 0.7 : 1 }}>
                {on ? "✓ " : ""}{shown}
                {clean && <span style={{ display: "block", fontSize: 10, color: MUTED, marginTop: 2 }}>proofread · {c.source === "stamp" ? "from a stamp" : c.source === "bank" ? "from the bank" : "said on this card"}</span>}
              </button>
            );
          })}
        </div>
      )}

      {t?.res?.suggestion && !has(t.res.suggestion) && (
        <button onClick={() => keep(t.res!.suggestion!)} title="The one line the AI thinks is missing — take it or leave it"
          style={{ textAlign: "left", width: "100%", background: "rgba(125,211,252,0.08)", border: `1px dashed ${SKY}`, borderRadius: 9, padding: "6px 9px", color: CREAM, fontSize: 12.5, lineHeight: 1.4, cursor: "pointer", marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: SKY, fontWeight: 800, letterSpacing: "0.12em", display: "block", marginBottom: 2 }}>✨ ONE AI SUGGESTION</span>
          {t.res.suggestion}
        </button>
      )}

      <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap" }}>
        <button style={{ ...chip(false, SKY), opacity: cands.length && !t?.busy ? 1 : 0.5 }} disabled={!cands.length || !!t?.busy} onClick={() => void proofread()} title="Tighten your words — same meaning, fewer of them — and one suggestion at most">
          {t?.busy ? "proofreading…" : t?.res ? "✨ proofread again" : "✨ Proofread with AI"}
        </button>
        {t?.err && <span style={{ fontSize: 11, color: RED }}>⚠ {t.err}</span>}
      </div>
      <form className="flex" style={{ gap: 4, marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); keep(typed); setTyped(""); }}>
        <input style={{ ...field, padding: "5px 8px", fontSize: 12.5 }} value={typed} placeholder="type a line…" onChange={(e) => setTyped(e.target.value)} />
        <button type="submit" style={chip(false)} disabled={!typed.trim()}>add</button>
      </form>
    </section>
  );
}
