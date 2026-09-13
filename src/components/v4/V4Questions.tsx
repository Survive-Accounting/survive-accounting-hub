// STEP 1 · QUESTIONS (v4). Review the proposed questions group by group: edit, reject, regroup, add,
// mark placeholders — then "Questions final". Every change is saved on the card AND recorded as an edit
// (teach_edits), with an optional why, typed or talked.
//
// Lee, 2026-09-13: "I edit, reject, regroup and add until they're right, then click 'Questions final'.
// Save the AI's original version, my final version, and each edit I make. Let me optionally record or
// type WHY I changed something." And on placeholders: "I can mark any question as a placeholder: either
// a format the app can't build yet, or one that's half-done and needs polish. It stays in the list with
// my notes on what it should be, and it doesn't block 'Questions final.'"
import { useMemo, useState } from "react";

import { getAdminWho } from "@/components/AdminGate";
import { V3_CREAM, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { useDictation } from "@/lib/use-dictation";
import { finalizeV4Questions, v4EditWhy, v4QuestionsChange, type V4QuestionsOp } from "@/lib/v4.functions";

import { FORMATS, QUESTION_FORMATS, cardProblems, formatOf, markCorrect, switchFormat, type Choice, type QuestionFormat } from "./formats";
import { V4_AMBER, V4_MINT, V4_RED, v4Button, v4Field } from "./V4Chrome";
import { V4ProposeQuestions } from "./V4ProposeQuestions";
import type { V4TopicData } from "./V4TopicPage";
import { UNGROUPED, groupedCards, nextGroupId, questionsSummary, type V4Card, type V4Group, type V4Placeholder } from "./v4-topic";

type Op = V4QuestionsOp;

export function V4Questions({ data, onData, topicName = "" }: { data: V4TopicData; onData: (d: V4TopicData) => void; topicName?: string }) {
  const state = data.state!;
  const cards = data.cards as V4Card[];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [lastEdit, setLastEdit] = useState<{ editId: string; label: string } | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const [finalNote, setFinalNote] = useState<string | null>(null);

  const grouped = useMemo(() => groupedCards(state, cards), [state, cards]);
  const summary = useMemo(() => questionsSummary(cards, cardProblems, state.groups.length), [cards, state.groups.length]);
  const rejected = cards.filter((c) => c.rejected && !c.noteOnly);
  const isFinal = !!state.final.questions;

  const run = async (op: Op, label: string, why?: string | null) => {
    setBusy(true); setErr(null);
    try {
      const r = await v4QuestionsChange({ data: { setId: data.setId, op, why: why ?? null, who: getAdminWho() } });
      onData({ ...data, state: r.state, cards: r.cards });
      setWarn(r.logWarning);
      setLastEdit(r.editId && !why ? { editId: r.editId, label } : null);
      return r;
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); return null; }
    finally { setBusy(false); }
  };

  const setGroups = (groups: V4Group[], label: string) => run({ type: "groups", groups }, label);
  const finalize = async () => {
    setBusy(true); setErr(null); setFinalNote(null);
    try {
      const r = await finalizeV4Questions({ data: { setId: data.setId } });
      if (!r.ok) { setFinalNote(`${r.summary.problems.length} question${r.summary.problems.length === 1 ? "" : "s"} still need work — fix them, or mark them placeholders.`); return; }
      onData({ ...data, state: r.state });
      setWarn(r.logWarning);
      setFinalNote(`Questions final — ${r.summary.questions - r.summary.placeholders} live, ${r.summary.placeholders} placeholder${r.summary.placeholders === 1 ? "" : "s"}. On to Slides.`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ maxWidth: 980 }}>
      {/* TALK → PROPOSE (phase 3) */}
      <V4ProposeQuestions data={data} onData={onData} topicName={topicName} />
      {/* THE SUMMARY + FINAL */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 14px", border: `1px solid ${V3_EDGE}`, borderRadius: 12 }}>
        <span style={{ fontSize: 13.5, color: V3_CREAM }}>
          <b>{summary.questions}</b> questions · <b>{summary.groups}</b> groups · <span style={{ color: summary.placeholders ? V4_AMBER : V3_MUTED }}>{summary.placeholders} placeholder{summary.placeholders === 1 ? "" : "s"}</span> · <span style={{ color: V3_MUTED }}>{summary.rejected} rejected</span>
        </span>
        {summary.problems.length > 0 && <span style={{ fontSize: 12.5, color: V4_RED }}>{summary.problems.length} to fix before final</span>}
        <span style={{ flex: 1 }} />
        {isFinal && <span style={{ fontSize: 12.5, color: V4_MINT, fontWeight: 700 }}>✓ Final {new Date(state.final.questions!).toLocaleDateString()}</span>}
        <button type="button" onClick={() => void finalize()} disabled={busy} style={{ ...v4Button("gold"), fontSize: 13.5, padding: "8px 16px", opacity: busy ? 0.6 : 1 }}
          title="Every complete question goes live for students; placeholders stay hidden and don't block this.">
          {isFinal ? "Mark final again" : "Questions final"}
        </button>
      </div>
      {finalNote && <div style={{ marginTop: 8, fontSize: 13, color: summary.problems.length ? V4_RED : V4_MINT }}>{finalNote}</div>}
      {summary.problems.length > 0 && finalNote && (
        <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5, color: V3_CREAM }}>
          {summary.problems.slice(0, 12).map((p, i) => {
            const c = cards.find((x) => x.id === p.cardId);
            return <li key={i}><button type="button" onClick={() => { setOpenId(p.cardId); document.getElementById(`v4q-${p.cardId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }); }} style={{ all: "unset", cursor: "pointer", textDecoration: "underline" }}>{(c?.stem || "(no words)").slice(0, 70)}</button> — {p.problem}</li>;
          })}
        </ul>
      )}
      {err && <div style={{ marginTop: 8, fontSize: 13, color: V4_RED }}>{err}</div>}
      {warn && <div style={{ marginTop: 8, fontSize: 12.5, color: V4_AMBER }}>Saved, but not recorded for learning — {warn}</div>}

      {/* WHY, after any change */}
      {lastEdit && <WhyBar key={lastEdit.editId} label={lastEdit.label} onSave={async (why) => { const r = await v4EditWhy({ data: { editId: lastEdit.editId, why } }); if (!r.ok) setWarn(r.error ?? "why not saved"); setLastEdit(null); }} onDismiss={() => setLastEdit(null)} />}

      {/* THE GROUPS */}
      {grouped.map(({ group, cards: gc }) => {
        const gi = state.groups.findIndex((g) => g.id === group.id);
        const real = gi >= 0;
        return (
          <section key={group.id} style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {real ? (
                <input defaultValue={group.name} key={group.name} aria-label="Group name"
                  onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== group.name) void setGroups(state.groups.map((g) => (g.id === group.id ? { ...g, name } : g)), `renamed a group to "${name}"`); }}
                  style={{ ...v4Field, width: 280, fontSize: 15, fontWeight: 800, background: "transparent" }} />
              ) : <span style={{ fontSize: 15, fontWeight: 800, color: V3_MUTED }}>{UNGROUPED.name}</span>}
              <span style={{ fontSize: 12, color: V3_MUTED }}>{gc.length}</span>
              <span style={{ flex: 1 }} />
              {real && <>
                <button type="button" disabled={busy || gi === 0} style={v4Button()} title="Move this group up" onClick={() => { const g = [...state.groups]; [g[gi - 1], g[gi]] = [g[gi], g[gi - 1]]; void setGroups(g, `moved "${group.name}" up`); }}>↑</button>
                <button type="button" disabled={busy || gi === state.groups.length - 1} style={v4Button()} title="Move this group down" onClick={() => { const g = [...state.groups]; [g[gi + 1], g[gi]] = [g[gi], g[gi + 1]]; void setGroups(g, `moved "${group.name}" down`); }}>↓</button>
                <button type="button" disabled={busy} style={v4Button("red")} title="Remove the group — its questions move to Not grouped yet" onClick={() => { if (window.confirm(`Remove the group "${group.name}"? Its ${gc.length} question(s) stay, under Not grouped yet.`)) void setGroups(state.groups.filter((g) => g.id !== group.id), `removed the group "${group.name}"`); }}>Remove group</button>
              </>}
              <button type="button" disabled={busy} style={v4Button("gold")} onClick={async () => {
                const r = await run({ type: "add", groupId: real ? group.id : null, stem: "", choices: [{ text: "", correct: true }, { text: "", correct: false }, { text: "", correct: false }], format: "mc" }, `added a question to "${group.name}"`);
                const added = r?.cards.find((c) => !cards.some((x) => x.id === c.id));
                if (added) setOpenId(added.id);
              }}>+ Question</button>
            </div>
            <div style={{ marginTop: 8, border: `1px solid ${V3_EDGE}`, borderRadius: 12, overflow: "hidden" }}>
              {gc.length === 0 && <div style={{ padding: 12, fontSize: 12.5, color: V3_MUTED }}>No questions here yet.</div>}
              {gc.map((c, i) => (
                <QuestionRow key={c.id} card={c} first={i === 0} open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? null : c.id)}
                  groups={state.groups} busy={busy} run={run} />
              ))}
            </div>
          </section>
        );
      })}

      <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
        <button type="button" disabled={busy} style={v4Button()} onClick={() => { const name = window.prompt("Name the new group"); if (name?.trim()) void setGroups([...state.groups, { id: nextGroupId(state.groups), name: name.trim() }], `added the group "${name.trim()}"`); }}>+ Group</button>
      </div>

      {rejected.length > 0 && (
        <section style={{ marginTop: 22 }}>
          <button type="button" onClick={() => setShowRejected((v) => !v)} style={{ ...v4Button(), color: V3_MUTED }}>{showRejected ? "▾" : "▸"} Rejected · {rejected.length}</button>
          {showRejected && (
            <div style={{ marginTop: 8, border: `1px solid ${V3_EDGE}`, borderRadius: 12 }}>
              {rejected.map((c, i) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderTop: i ? `1px solid ${V3_EDGE}` : "none" }}>
                  <span style={{ flex: 1, fontSize: 13, color: V3_MUTED, textDecoration: "line-through", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.stem || "(no words)"}</span>
                  <button type="button" disabled={busy} style={v4Button()} onClick={() => void run({ type: "restore", cardId: c.id }, "restored a question")}>Restore</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function QuestionRow({ card, first, open, onToggle, groups, busy, run }: {
  card: V4Card; first: boolean; open: boolean; onToggle: () => void; groups: V4Group[]; busy: boolean;
  run: (op: Op, label: string, why?: string | null) => Promise<unknown>;
}) {
  const spec = formatOf(card);
  const problems = card.placeholder ? [] : cardProblems(card);
  const correct = card.choices.filter((c) => c.correct && c.text.trim()).map((c) => c.text.trim());
  return (
    <div id={`v4q-${card.id}`} style={{ borderTop: first ? "none" : `1px solid ${V3_EDGE}`, background: open ? "rgba(255,255,255,0.03)" : "transparent" }}>
      <button type="button" onClick={onToggle} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", width: "100%", boxSizing: "border-box" }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: spec.id === "mc" ? V3_MUTED : "#7DD3FC", minWidth: 62 }}>{spec.short}</span>
        {card.placeholder && <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", color: "#0B0F1E", background: V4_AMBER, borderRadius: 5, padding: "1px 6px" }}>PLACEHOLDER</span>}
        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: card.stem ? V3_CREAM : V3_MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.stem || (card.placeholder ? card.placeholder.note || "(placeholder)" : "(no words yet)")}</span>
        {!card.placeholder && correct.length > 0 && <span style={{ fontSize: 12, color: V4_MINT, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>✓ {correct.join(", ")}</span>}
        {problems.length > 0 && <span title={problems.join(" ")} style={{ fontSize: 12, color: V4_RED }}>● {problems.length}</span>}
        {card.draft && !card.placeholder && <span style={{ fontSize: 10.5, color: V3_MUTED }}>draft</span>}
        <span style={{ color: V3_MUTED, fontSize: 11 }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && <QuestionEditor key={card.id + JSON.stringify(card.choices) + card.stem + card.format} card={card} groups={groups} busy={busy} run={run} onClose={onToggle} />}
    </div>
  );
}

function QuestionEditor({ card, groups, busy, run, onClose }: {
  card: V4Card; groups: V4Group[]; busy: boolean; run: (op: Op, label: string, why?: string | null) => Promise<unknown>; onClose: () => void;
}) {
  const [stem, setStem] = useState(card.stem);
  const [format, setFormat] = useState<QuestionFormat>(card.format);
  const [choices, setChoices] = useState<Choice[]>(card.choices.length ? card.choices : [{ text: "", correct: true }, { text: "", correct: false }]);
  const [why, setWhy] = useState("");
  const [ph, setPh] = useState<V4Placeholder | null>(card.placeholder);
  const [phOpen, setPhOpen] = useState(!!card.placeholder);
  const [showFeedback, setShowFeedback] = useState(false);
  const spec = FORMATS[format];
  const problems = cardProblems({ format, stem, choices });
  const dirty = stem !== card.stem || format !== card.format || JSON.stringify(choices) !== JSON.stringify(card.choices);
  const short = (card.stem || "a question").slice(0, 40);

  return (
    <div style={{ padding: "4px 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {QUESTION_FORMATS.map((f) => (
          <button key={f} type="button" onClick={() => { setFormat(f); setChoices((c) => switchFormat(c, f)); }} aria-pressed={format === f}
            style={{ ...v4Button(format === f ? "gold" : "ghost"), fontSize: 11.5, padding: "4px 10px" }}>{FORMATS[f].label}</button>
        ))}
        <span style={{ flex: 1 }} />
        <label style={{ fontSize: 12, color: V3_MUTED, display: "flex", alignItems: "center", gap: 6 }}>Group
          <select value={card.group ?? ""} disabled={busy} onChange={(e) => void run({ type: "group", cardId: card.id, groupId: e.target.value || null }, `moved "${short}" to ${groups.find((g) => g.id === e.target.value)?.name ?? UNGROUPED.name}`)}
            style={{ ...v4Field, width: 200, padding: "4px 8px", colorScheme: "dark" }}>
            <option value="">{UNGROUPED.name}</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
      </div>
      <textarea value={stem} onChange={(e) => setStem(e.target.value)} rows={2} placeholder="The question" style={{ ...v4Field, fontSize: 14, fontWeight: 600, resize: "vertical" }} />
      {format === "select_all" && <div style={{ fontSize: 12, color: "#7DD3FC" }}>Select all that apply — tick every correct answer; keep at least one tricky wrong one.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {choices.map((c, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type={spec.multiCorrect ? "checkbox" : "radio"} name={`correct-${card.id}`} checked={c.correct} onChange={() => setChoices((cs) => markCorrect(cs, i, format))}
                title={spec.multiCorrect ? "A correct answer" : "The correct answer"} style={{ accentColor: V4_MINT, width: 16, height: 16 }} />
              <input value={c.text} onChange={(e) => setChoices((cs) => cs.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))} placeholder={`Choice ${i + 1}`}
                style={{ ...v4Field, borderColor: c.correct ? `${V4_MINT}88` : V3_EDGE }} />
              <button type="button" onClick={() => setChoices((cs) => cs.filter((_, k) => k !== i))} disabled={choices.length <= 2} title="Remove this choice" style={{ ...v4Button(), padding: "4px 8px" }}>✕</button>
            </div>
            {showFeedback && (
              <input value={c.feedback ?? ""} onChange={(e) => setChoices((cs) => cs.map((x, k) => (k === i ? { ...x, feedback: e.target.value } : x)))} placeholder="Feedback when a student picks this"
                style={{ ...v4Field, marginLeft: 24, width: "calc(100% - 24px)", fontSize: 12 }} />
            )}
          </div>
        ))}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => setChoices((cs) => [...cs, { text: "", correct: false }])} disabled={choices.length >= 12} style={{ ...v4Button(), fontSize: 11.5 }}>+ Choice</button>
          <button type="button" onClick={() => setShowFeedback((v) => !v)} style={{ ...v4Button(), fontSize: 11.5, color: V3_MUTED }}>{showFeedback ? "Hide feedback" : "Feedback"}</button>
        </div>
      </div>
      {problems.length > 0 && !card.placeholder && <div style={{ fontSize: 12, color: V4_RED }}>{problems.join(" ")}</div>}

      {/* SAVE, WITH AN OPTIONAL WHY */}
      {dirty && <WhyInput value={why} onChange={setWhy} />}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" disabled={busy || !dirty} style={{ ...v4Button("gold"), opacity: busy || !dirty ? 0.5 : 1 }}
          onClick={() => void run({ type: "edit", cardId: card.id, stem, choices, format }, `edited "${short}"`, why || null)}>Save changes</button>
        {dirty && <button type="button" style={v4Button()} onClick={() => { setStem(card.stem); setFormat(card.format); setChoices(card.choices); setWhy(""); }}>Undo changes</button>}
        <span style={{ flex: 1 }} />
        <button type="button" style={{ ...v4Button(), color: V4_AMBER, borderColor: `${V4_AMBER}88` }} onClick={() => setPhOpen((v) => !v)}>{card.placeholder ? "Placeholder ▾" : "Mark placeholder"}</button>
        <button type="button" disabled={busy} style={v4Button("red")} onClick={() => { void run({ type: "reject", cardId: card.id }, `rejected "${short}"`); onClose(); }}>Reject</button>
      </div>

      {phOpen && (
        <div style={{ border: `1px dashed ${V4_AMBER}88`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 12.5, color: V3_CREAM }}>
            <span style={{ color: V4_AMBER, fontWeight: 800 }}>Placeholder:</span>
            {(["format", "polish"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={ph?.kind === k} onClick={() => setPh({ kind: k, note: ph?.note ?? "" })}
                style={{ ...v4Button(ph?.kind === k ? "gold" : "ghost"), fontSize: 11.5, padding: "3px 9px" }}>{k === "format" ? "A format the app can't build yet" : "Half-done — needs polish"}</button>
            ))}
          </div>
          <textarea value={ph?.note ?? ""} onChange={(e) => setPh({ kind: ph?.kind ?? "polish", note: e.target.value })} rows={2}
            placeholder="What it should be — e.g. sort these into current / long-term; or: tighten the distractors" style={{ ...v4Field, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" disabled={busy || !ph} style={v4Button("gold")} onClick={() => ph && void run({ type: "placeholder", cardId: card.id, placeholder: ph }, `marked "${short}" a placeholder`)}>{card.placeholder ? "Update placeholder" : "Save as placeholder"}</button>
            {card.placeholder && <button type="button" disabled={busy} style={{ ...v4Button(), color: V4_MINT, borderColor: `${V4_MINT}88` }} onClick={() => { setPh(null); setPhOpen(false); void run({ type: "placeholder", cardId: card.id, placeholder: null }, `resolved the placeholder "${short}"`); }}>Resolve — it's a real question now</button>}
          </div>
          <div style={{ fontSize: 11.5, color: V3_MUTED }}>A placeholder stays in the list, is never shown to students, and doesn't block Questions final.</div>
        </div>
      )}
    </div>
  );
}

/** The optional why — typed, or talked (browser dictation fills the box). */
function WhyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [interim, setInterim] = useState("");
  const mic = useDictation((final, live) => { setInterim(live); if (final.trim()) onChange(`${value} ${final}`.trim()); });
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input value={mic.on && interim ? `${value} ${interim}`.trim() : value} onChange={(e) => onChange(e.target.value)} placeholder="Why? (optional — helps the AI learn how you teach)" style={{ ...v4Field, fontSize: 12.5 }} />
      {mic.supported && (
        <button type="button" onClick={() => { if (mic.on) { mic.stop(); setInterim(""); } else mic.start(); }} aria-pressed={mic.on}
          style={{ ...v4Button(), padding: "5px 10px", color: mic.on ? V4_RED : V3_CREAM, borderColor: mic.on ? V4_RED : V3_EDGE }}>{mic.on ? "● stop" : "🎙"}</button>
      )}
    </div>
  );
}

/** After a change that didn't carry a why: ask once, quietly. */
function WhyBar({ label, onSave, onDismiss }: { label: string; onSave: (why: string) => Promise<void>; onDismiss: () => void }) {
  const [why, setWhy] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <div style={{ position: "sticky", top: 8, zIndex: 5, marginTop: 10, display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", borderRadius: 10, border: `1px solid ${V3_GOLD}55`, background: "#101a30" }}>
      <span style={{ fontSize: 12.5, color: V3_MUTED, whiteSpace: "nowrap" }}>Saved: {label}</span>
      <div style={{ flex: 1 }}><WhyInput value={why} onChange={setWhy} /></div>
      <button type="button" disabled={!why.trim() || saving} style={{ ...v4Button("gold"), opacity: !why.trim() || saving ? 0.5 : 1 }} onClick={async () => { setSaving(true); await onSave(why); setSaving(false); }}>Add why</button>
      <button type="button" style={{ ...v4Button(), color: V3_MUTED }} onClick={onDismiss}>✕</button>
    </div>
  );
}
