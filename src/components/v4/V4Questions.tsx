// STEP 1 · QUESTIONS (v4). Review the proposed questions group by group: edit, reject, regroup, add,
// mark placeholders — then "Questions final". Every change is saved on the card AND recorded as an edit
// (teach_edits), with an optional why, typed or talked.
//
// Lee, 2026-09-13: "I edit, reject, regroup and add until they're right, then click 'Questions final'.
// Save the AI's original version, my final version, and each edit I make. Let me optionally record or
// type WHY I changed something." And on placeholders: "I can mark any question as a placeholder: either
// a format the app can't build yet, or one that's half-done and needs polish. It stays in the list with
// my notes on what it should be, and it doesn't block 'Questions final.'"
import { useEffect, useMemo, useRef, useState } from "react";

import { getAdminWho } from "@/components/AdminGate";
import { track } from "@/lib/analytics";
import { V3_CREAM, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { finalizeV4Questions, v4QuestionsChange, type V4QuestionsOp } from "@/lib/v4.functions";

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
  const [showRejected, setShowRejected] = useState(false);
  const [finalNote, setFinalNote] = useState<string | null>(null);

  const grouped = useMemo(() => groupedCards(state, cards), [state, cards]);
  const summary = useMemo(() => questionsSummary(cards, cardProblems, state.groups.length), [cards, state.groups.length]);
  const rejected = cards.filter((c) => c.rejected && !c.noteOnly);
  const isFinal = !!state.final.questions;

  // No "why" any more (Lee, 2026-09-15: "remove the 'add why' stuff. Just save edits in background and we can
  // infer later the 'why'"). Every change still lands in teach_edits with before / after.
  const dataRef = useRef(data);
  dataRef.current = data;
  const run = async (op: Op, _label: string) => {
    setBusy(true); setErr(null);
    try {
      const r = await v4QuestionsChange({ data: { setId: data.setId, op, why: null, who: getAdminWho() } });
      onData({ ...dataRef.current, state: r.state, cards: r.cards });
      setWarn(r.logWarning);
      return r;
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); return null; }
    finally { setBusy(false); }
  };

  // SAVE IN THE BACKGROUND (Lee, 2026-09-15: "Saving work … is slow and feels clunky … save edits in background
  // … just the text changing to Saved!"). The edit shows at once; saves go out one after another; the button
  // says Saving… then Saved!. The server's answer is taken only when nothing newer is waiting behind it.
  const [saveState, setSaveState] = useState<Record<string, "saving" | "saved" | "error">>({});
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);
  const saveEdit = (cardId: string, edit: { stem: string; choices: Choice[]; format: QuestionFormat }) => {
    const cur = dataRef.current;
    // the choices the way the server hands them back (feedback null, not missing), so nothing reads as unsaved
    const patch = { ...edit, choices: edit.choices.map((c) => ({ ...c, feedback: c.feedback ?? null })) };
        onData({ ...cur, cards: cur.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)) });
    // SAVE CLOSES THE CARD (Lee, 2026-09-16: "After saving a question in /questions, collapse its toggle. It saves
    // me a click. And feels more natural.") — the row folds up at once; the save goes on behind it.
    setOpenId((o) => (o === cardId ? null : o));
    setSaveState((s) => ({ ...s, [cardId]: "saving" }));
    track("v4_question_saved", { set_id: cur.setId });
    setErr(null);
    pending.current++;
    chain.current = chain.current.then(async () => {
      try {
        const r = await v4QuestionsChange({ data: { setId: cur.setId, op: { type: "edit", cardId, ...patch }, why: null, who: getAdminWho() } });
        pending.current--;
        if (pending.current === 0) onData({ ...dataRef.current, state: r.state, cards: r.cards });
        setWarn(r.logWarning);
        setSaveState((s) => ({ ...s, [cardId]: "saved" }));
        window.setTimeout(() => setSaveState((s) => (s[cardId] === "saved" ? (({ [cardId]: _gone, ...rest }) => rest)(s) : s)), 2500);
      } catch (e) {
        pending.current--;
        setSaveState((s) => ({ ...s, [cardId]: "error" }));
        setErr(`Not saved: ${e instanceof Error ? e.message : String(e)} — refresh to see what's saved.`);
      }
    });
  };

  const setGroups = (groups: V4Group[], label: string) => run({ type: "groups", groups }, label);

  // REMOVE / CLONE, UNDOABLE. Lee, 2026-09-14: "a hover to the right of it that lets me just exit out
  // no confirmation either just like X and then I can control Z if I want to bring it back."
  // A removed question is rejected (it stays under Rejected); Ctrl+Z restores it. Ctrl+Z after a clone
  // or an added question takes that one back out.
  const undo = useRef<{ kind: "removed" | "cloned" | "added"; cardId: string }[]>([]);
  const [undoNote, setUndoNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [rowOver, setRowOver] = useState<{ id: string; below: boolean } | null>(null);
  const short = (c: V4Card) => (c.stem || "a question").slice(0, 40);

  const remove = async (c: V4Card) => {
    if (openId === c.id) setOpenId(null);
    const r = await run({ type: "reject", cardId: c.id }, `removed "${short(c)}"`);
    if (r) { undo.current.push({ kind: "removed", cardId: c.id }); setUndoNote(`Removed "${short(c)}"`); }
  };
  const clone = async (c: V4Card) => {
    const r = await run({ type: "clone", cardId: c.id }, `cloned "${short(c)}"`);
    const added = r?.cards.find((x) => !cards.some((y) => y.id === x.id));
    if (added) { undo.current.push({ kind: "cloned", cardId: added.id }); setOpenId(added.id); setUndoNote(`Cloned "${short(c)}"`); }
  };

  // THE GROUP ON SCREEN, by id (so a rename or reorder keeps you where you are). Opening a question in
  // another group — from the to-fix list, or a clone — brings its group up.
  const [viewId, setViewId] = useState<string | null>(null);
  const viewIdx = Math.max(0, grouped.findIndex((g) => g.group.id === viewId));
  const step = (d: -1 | 1) => { const k = Math.min(grouped.length - 1, Math.max(0, viewIdx + d)); setViewId(grouped[k]?.group.id ?? null); setOpenId(null); };
  useEffect(() => {
    if (!openId) return;
    const g = grouped.find((x) => x.cards.some((c) => c.id === openId));
    if (g && g.group.id !== grouped[viewIdx]?.group.id) setViewId(g.group.id);
  }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
      stepRef.current(e.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const busyRef = useRef(false);
  busyRef.current = busy;
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== "z") return;
      const t = e.target as HTMLElement | null;
      // Inside a text box, Ctrl+Z is the text box's own undo.
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const last = undo.current[undo.current.length - 1];
      if (!last || busyRef.current) return;
      e.preventDefault();
      undo.current.pop();
      if (last.kind === "removed") { void runRef.current({ type: "restore", cardId: last.cardId }, "brought a question back"); setUndoNote("Brought it back"); }
      else { setOpenId((o) => (o === last.cardId ? null : o)); void runRef.current({ type: "reject", cardId: last.cardId }, "took back a new question"); setUndoNote("Took it back out"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const finalize = async () => {
    setBusy(true); setErr(null); setFinalNote(null);
    try {
      const r = await finalizeV4Questions({ data: { setId: data.setId } });
      if (!r.ok) { setFinalNote(`${r.summary.problems.length} question${r.summary.problems.length === 1 ? "" : "s"} still need work — fix them, or mark them placeholders.`); return; }
      onData({ ...data, state: r.state });
      setWarn(r.logWarning);
      track("v4_questions_final", { set_id: data.setId, questions: r.summary.questions, placeholders: r.summary.placeholders });
      setFinalNote(`Questions final — ${r.summary.questions - r.summary.placeholders} live, ${r.summary.placeholders} placeholder${r.summary.placeholders === 1 ? "" : "s"}. On to Slides.`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div>
      {/* TALK → PROPOSE (phase 3) */}
      <div style={{ maxWidth: 980 }}><V4ProposeQuestions data={data} onData={onData} topicName={topicName} /></div>
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
            return <li key={i}><button type="button" onClick={() => { setOpenId(p.cardId); document.getElementById(`v4q-${p.cardId}`)?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" }); }} style={{ all: "unset", cursor: "pointer", textDecoration: "underline" }}>{(c?.stem || "(no words)").slice(0, 70)}</button> — {p.problem}</li>;
          })}
        </ul>
      )}
      {err && <div style={{ marginTop: 8, fontSize: 13, color: V4_RED }}>{err}</div>}
      {warn && <div style={{ marginTop: 8, fontSize: 12.5, color: V4_AMBER }}>Saved, but not recorded for learning — {warn}</div>}

      {undoNote && (
        <div role="status" style={{ marginTop: 10, fontSize: 12.5, color: V3_MUTED }}>{undoNote} · <b style={{ color: V3_CREAM }}>Ctrl+Z</b> to undo</div>
      )}

      {/* THE GROUPS — ONE AT A TIME. Lee, 2026-09-14: "I'm picturing it more like where I view each group
          one at a time. And have < > on either side." The tabs above jump to any group (and take a dragged
          question); ‹ › and the ← → keys step through them. */}
      <div role="tablist" aria-label="Groups" style={{ marginTop: 16, display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, alignItems: "center" }}>
        {grouped.map(({ group, cards: gc }, k) => {
          const on = k === viewIdx;
          const dropHere = dragging && dragOver === group.id;
          return (
            <button key={group.id} type="button" role="tab" aria-selected={on} onClick={() => setViewId(group.id)}
              onDragOver={(e) => { if (!dragging) return; e.preventDefault(); setDragOver(group.id); }}
              onDragLeave={() => setDragOver((g) => (g === group.id ? null : g))}
              onDrop={(e) => {
                e.preventDefault(); setDragOver(null);
                const c = cards.find((x) => x.id === dragging);
                setDragging(null);
                const to = state.groups.some((g) => g.id === group.id) ? group.id : null;
                if (c && (c.group ?? null) !== to) void run({ type: "group", cardId: c.id, groupId: to }, `moved "${(c.stem || "a question").slice(0, 40)}" to ${group.name}`);
              }}
              style={{ ...v4Button(on ? "gold" : "ghost"), flex: "0 0 auto", fontSize: 12, padding: "5px 11px", borderColor: dropHere ? V3_GOLD : on ? V3_GOLD : V3_EDGE, borderStyle: dropHere ? "dashed" : "solid", color: on ? V3_GOLD : k === grouped.length - 1 && group.id === UNGROUPED.id ? V3_MUTED : V3_CREAM }}>
              {group.name} <span style={{ color: V3_MUTED, fontWeight: 700 }}>{gc.length}</span>
            </button>
          );
        })}
        <button type="button" disabled={busy} style={{ ...v4Button(), flex: "0 0 auto", fontSize: 12, padding: "5px 11px", borderStyle: "dashed", color: V3_MUTED }} onClick={() => { const name = window.prompt("Name the new group"); if (!name?.trim()) return; const id = nextGroupId(state.groups); void setGroups([...state.groups, { id, name: name.trim() }], `added the group "${name.trim()}"`).then(() => setViewId(id)); }}>+ Group</button>
      </div>

      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "44px minmax(0, 760px) 44px", gap: 10, alignItems: "start" }}>
        <button type="button" onClick={() => step(-1)} disabled={viewIdx <= 0} aria-label="Previous group" title="Previous group (←)"
          style={{ ...v4Button(), position: "sticky", top: 90, height: 120, fontSize: 26, padding: 0, opacity: viewIdx <= 0 ? 0.3 : 1 }}>‹</button>
        {grouped.filter((_, k) => k === viewIdx).map(({ group, cards: gc }) => {
          const gi = state.groups.findIndex((g) => g.id === group.id);
          const real = gi >= 0;
          return (
            <section key={group.id} aria-label={group.name}
              style={{ border: `1.5px solid ${V3_EDGE}`, borderRadius: 12, background: "rgba(255,255,255,0.02)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 8px 6px 10px" }}>
                <span style={{ fontSize: 11, color: V3_MUTED, whiteSpace: "nowrap" }}>{viewIdx + 1} of {grouped.length}</span>
                {real ? (
                  <input defaultValue={group.name} key={group.name} aria-label="Group name"
                    onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== group.name) void setGroups(state.groups.map((g) => (g.id === group.id ? { ...g, name } : g)), `renamed a group to "${name}"`); }}
                    style={{ ...v4Field, flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 800, background: "transparent", border: "1px solid transparent", padding: "4px 6px" }} />
                ) : <span style={{ flex: 1, fontSize: 14.5, fontWeight: 800, color: V3_MUTED, padding: "4px 6px" }}>{UNGROUPED.name}</span>}
                <span style={{ fontSize: 12, color: V3_MUTED }}>{gc.length}</span>
                {real && <>
                  <button type="button" disabled={busy || gi === 0} style={{ ...v4Button(), padding: "3px 7px", fontSize: 11 }} title="Move this group earlier in the order" onClick={() => { const g = [...state.groups]; [g[gi - 1], g[gi]] = [g[gi], g[gi - 1]]; void setGroups(g, `moved "${group.name}" earlier`); }}>Move earlier</button>
                  <button type="button" disabled={busy || gi === state.groups.length - 1} style={{ ...v4Button(), padding: "3px 7px", fontSize: 11 }} title="Move this group later in the order" onClick={() => { const g = [...state.groups]; [g[gi + 1], g[gi]] = [g[gi], g[gi + 1]]; void setGroups(g, `moved "${group.name}" later`); }}>Move later</button>
                  <button type="button" disabled={busy} style={{ ...v4Button("red"), padding: "3px 7px" }} title="Remove the group — its questions move to Not grouped yet" onClick={() => { if (window.confirm(`Remove the group "${group.name}"? Its ${gc.length} question(s) stay, under Not grouped yet.`)) void setGroups(state.groups.filter((g) => g.id !== group.id), `removed the group "${group.name}"`); }}>✕</button>
                </>}
              </div>
              <div style={{ borderTop: `1px solid ${V3_EDGE}` }}>
                {gc.length === 0 && <div style={{ padding: 12, fontSize: 12.5, color: V3_MUTED }}>No questions here yet.</div>}
                {gc.map((c, i) => (
                  <QuestionRow key={c.id} card={c} first={i === 0} open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? null : c.id)}
                    groups={state.groups} busy={busy} run={run} saveEdit={saveEdit} saving={saveState[c.id]} onClone={() => void clone(c)} onRemove={() => void remove(c)}
                    onDragStart={() => setDragging(c.id)} onDragEnd={() => { setDragging(null); setDragOver(null); setRowOver(null); }}
                    dropLine={dragging && dragging !== c.id && rowOver?.id === c.id ? (rowOver.below ? "below" : "above") : null}
                    onRowOver={(below) => { if (dragging && dragging !== c.id) setRowOver((r) => (r?.id === c.id && r.below === below ? r : { id: c.id, below })); }}
                    onRowDrop={() => {
                      const moving = cards.find((x) => x.id === dragging);
                      const over = rowOver;
                      setDragging(null); setRowOver(null); setDragOver(null);
                      if (!moving || !over || moving.id === c.id) return;
                      // DRAG TO REORDER (Lee, 2026-09-14). Dropped on a row in ANOTHER group, it moves there first.
                      const ids = gc.map((x) => x.id).filter((id) => id !== moving.id);
                      const at = ids.indexOf(c.id) + (over.below ? 1 : 0);
                      ids.splice(at, 0, moving.id);
                      const to = state.groups.some((g) => g.id === group.id) ? group.id : null;
                      void (async () => {
                        if ((moving.group ?? null) !== to) await run({ type: "group", cardId: moving.id, groupId: to }, `moved "${(moving.stem || "a question").slice(0, 40)}" to ${group.name}`);
                        await run({ type: "reorder", cardIds: ids }, `reordered "${group.name}"`);
                      })();
                    }} />
                ))}
              </div>
              <div style={{ padding: 8, borderTop: `1px solid ${V3_EDGE}` }}>
                <button type="button" disabled={busy} style={{ ...v4Button("gold"), width: "100%" }} onClick={async () => {
                  const r = await run({ type: "add", groupId: real ? group.id : null, stem: "", choices: [{ text: "", correct: true }, { text: "", correct: false }, { text: "", correct: false }], format: "mc" }, `added a question to "${group.name}"`);
                  const added = r?.cards.find((c) => !cards.some((x) => x.id === c.id));
                  if (added) { setOpenId(added.id); undo.current.push({ kind: "added", cardId: added.id }); }
                }}>+ Question</button>
              </div>
            </section>
          );
        })}
        <button type="button" onClick={() => step(1)} disabled={viewIdx >= grouped.length - 1} aria-label="Next group" title="Next group (→)"
          style={{ ...v4Button(), position: "sticky", top: 90, height: 120, fontSize: 26, padding: 0, opacity: viewIdx >= grouped.length - 1 ? 0.3 : 1 }}>›</button>
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

function QuestionRow({ card, first, open, onToggle, groups, busy, run, saveEdit, saving, onClone, onRemove, onDragStart, onDragEnd, dropLine, onRowOver, onRowDrop }: {
  card: V4Card; first: boolean; open: boolean; onToggle: () => void; groups: V4Group[]; busy: boolean;
  run: (op: Op, label: string) => Promise<unknown>;
  saveEdit: (cardId: string, patch: { stem: string; choices: Choice[]; format: QuestionFormat }) => void;
  saving: "saving" | "saved" | "error" | undefined;
  onClone: () => void; onRemove: () => void; onDragStart: () => void; onDragEnd: () => void;
  /** A question being dragged over this row: where it would land. */
  dropLine: "above" | "below" | null;
  onRowOver: (below: boolean) => void;
  onRowDrop: () => void;
}) {
  const [hover, setHover] = useState(false);
  const spec = formatOf(card);
  const problems = card.placeholder ? [] : cardProblems(card);
  const correct = card.choices.filter((c) => c.correct && c.text.trim()).map((c) => c.text.trim());
  const tool: React.CSSProperties = { all: "unset", cursor: busy ? "default" : "pointer", width: 24, height: 24, display: "grid", placeItems: "center", borderRadius: 6, fontSize: 13, color: V3_MUTED, border: `1px solid ${V3_EDGE}`, background: "#0e1629" };
  return (
    <div id={`v4q-${card.id}`} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onDragOver={(e) => { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); onRowOver(e.clientY > r.top + r.height / 2); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onRowDrop(); }}
      style={{ borderTop: first ? "none" : `1px solid ${V3_EDGE}`, background: open ? "rgba(255,255,255,0.04)" : hover ? "rgba(255,255,255,0.025)" : "transparent",
        boxShadow: dropLine === "above" ? `inset 0 3px 0 0 ${V3_GOLD}` : dropLine === "below" ? `inset 0 -3px 0 0 ${V3_GOLD}` : "none" }}>
      <div style={{ position: "relative" }}>
        <div role="button" tabIndex={0} draggable={!open} onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", card.id); onDragStart(); }} onDragEnd={onDragEnd}
          onClick={onToggle} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
          style={{ cursor: "pointer", display: "flex", flexDirection: "column", gap: 3, padding: "9px 64px 9px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!open && <span aria-hidden title="Drag to reorder, or onto a group tab to move it" style={{ fontSize: 12, lineHeight: 1, color: hover ? V3_CREAM : "transparent", cursor: "grab", marginLeft: -4 }}>⠿</span>}
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: spec.id === "mc" ? V3_MUTED : "#7DD3FC" }}>{spec.short}</span>
            {card.placeholder && <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.1em", color: "#0B0F1E", background: V4_AMBER, borderRadius: 5, padding: "0 5px" }}>PLACEHOLDER</span>}
            {card.draft && !card.placeholder && <span style={{ fontSize: 10, color: V3_MUTED }}>draft</span>}
            {problems.length > 0 && <span title={problems.join(" ")} style={{ fontSize: 11.5, color: V4_RED }}>● {problems.length}</span>}
          </div>
          <span style={{ fontSize: 13.5, lineHeight: 1.35, color: card.stem ? V3_CREAM : V3_MUTED, display: "-webkit-box", WebkitLineClamp: open ? 6 : 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {card.stem || (card.placeholder ? card.placeholder.note || "(placeholder)" : "(no words yet)")}
          </span>
          {!card.placeholder && correct.length > 0 && <span style={{ fontSize: 12, color: V4_MINT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>✓ {correct.join(", ")}</span>}
        </div>
        {/* Clone and ✕ on hover (always there for the keyboard). No confirm — Ctrl+Z brings it back. */}
        <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 4, opacity: hover || open ? 1 : 0, transition: "opacity 100ms" }}>
          <button type="button" disabled={busy} onClick={onClone} title="Clone this question" aria-label="Clone this question" style={tool}>⧉</button>
          <button type="button" disabled={busy} onClick={onRemove} title="Remove (Ctrl+Z brings it back)" aria-label="Remove this question" style={{ ...tool, color: V4_RED }}>✕</button>
        </div>
      </div>
      {open && <QuestionEditor key={card.id} card={card} groups={groups} busy={busy} run={run} saveEdit={saveEdit} saving={saving} onClone={onClone} />}
    </div>
  );
}

function QuestionEditor({ card, groups, busy, run, saveEdit, saving, onClone }: {
  card: V4Card; groups: V4Group[]; busy: boolean; run: (op: Op, label: string) => Promise<unknown>; onClone: () => void;
  saveEdit: (cardId: string, patch: { stem: string; choices: Choice[]; format: QuestionFormat }) => void;
  saving: "saving" | "saved" | "error" | undefined;
}) {
  const [stem, setStem] = useState(card.stem);
  const [format, setFormat] = useState<QuestionFormat>(card.format);
  const [choices, setChoices] = useState<Choice[]>(card.choices.length ? card.choices : [{ text: "", correct: true }, { text: "", correct: false }]);
  const [ph, setPh] = useState<V4Placeholder | null>(card.placeholder);
  const [phOpen, setPhOpen] = useState(!!card.placeholder);
  const [showFeedback, setShowFeedback] = useState(false);
  const spec = FORMATS[format];
  const problems = cardProblems({ format, stem, choices });
  const dirty = stem !== card.stem || format !== card.format || choiceKey(choices) !== choiceKey(card.choices);
  // THE CARD CHANGED UNDER THE EDITOR (a saved edit coming back, a group move): take it, unless there are
  // unsaved changes here — those stay put.
  const seen = useRef({ stem: card.stem, format: card.format, choices: choiceKey(card.choices) });
  useEffect(() => {
    const prev = seen.current;
    const now = { stem: card.stem, format: card.format, choices: choiceKey(card.choices) };
    if (prev.stem === now.stem && prev.format === now.format && prev.choices === now.choices) return;
    const untouched = stem === prev.stem && format === prev.format && choiceKey(choices) === prev.choices;
    const savedMine = stem === now.stem && format === now.format;
    seen.current = now;
    if (untouched || savedMine) { setStem(card.stem); setFormat(card.format); setChoices(card.choices.length ? card.choices : choices); }
  }, [card.stem, card.format, card.choices]); // eslint-disable-line react-hooks/exhaustive-deps
  const short = (card.stem || "a question").slice(0, 40);

  return (
    <div style={{ padding: "4px 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {QUESTION_FORMATS.map((f) => (
          <button key={f} type="button" onClick={() => { setFormat(f); setChoices((c) => switchFormat(c, f)); }} aria-pressed={format === f}
            style={{ ...v4Button(format === f ? "gold" : "ghost"), fontSize: 11.5, padding: "4px 10px" }}>{FORMATS[f].label}</button>
        ))}
      </div>
      {/* The group, as chips you can see all at once (the dropdown was hard to read). */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11.5, color: V3_MUTED, marginRight: 2 }}>Group</span>
        {[...groups, UNGROUPED].map((g) => {
          const on = (card.group ?? UNGROUPED.id) === g.id || (g.id === UNGROUPED.id && !!card.group && !groups.some((x) => x.id === card.group));
          return (
            <button key={g.id} type="button" disabled={busy || on} aria-pressed={on}
              onClick={() => void run({ type: "group", cardId: card.id, groupId: g.id === UNGROUPED.id ? null : g.id }, `moved "${short}" to ${g.name}`)}
              style={{ ...v4Button(on ? "gold" : "ghost"), fontSize: 11, padding: "3px 9px", cursor: on ? "default" : "pointer", color: on ? V3_GOLD : g.id === UNGROUPED.id ? V3_MUTED : V3_CREAM }}>{g.name}</button>
          );
        })}
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

      {/* SAVE — in the background; the button says how it went */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" disabled={!dirty} style={{ ...v4Button(dirty ? "gold" : "ghost"), opacity: dirty || saving ? 1 : 0.5, minWidth: 116, color: !dirty && saving === "saved" ? V4_MINT : !dirty && saving === "error" ? V4_RED : undefined, borderColor: !dirty && saving === "saved" ? `${V4_MINT}88` : undefined }}
          onClick={() => saveEdit(card.id, { stem, choices, format })}>
          {dirty ? "Save changes" : saving === "saving" ? "Saving…" : saving === "saved" ? "Saved!" : saving === "error" ? "Not saved" : "Saved"}
        </button>
        {dirty && <button type="button" style={v4Button()} onClick={() => { setStem(card.stem); setFormat(card.format); setChoices(card.choices); }}>Undo changes</button>}
        <span style={{ flex: 1 }} />
        <button type="button" style={{ ...v4Button(), color: V4_AMBER, borderColor: `${V4_AMBER}88` }} onClick={() => setPhOpen((v) => !v)}>{card.placeholder ? "Placeholder ▾" : "Mark placeholder"}</button>
        <button type="button" disabled={busy || dirty} title={dirty ? "Save or undo your changes first" : "A copy of this question, right after it"} style={v4Button()} onClick={onClone}>Clone</button>
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

/** Choices compared by what they say (a missing feedback and a null one are the same). */
const choiceKey = (cs: readonly Choice[]): string => JSON.stringify(cs.map((c) => ({ text: c.text, correct: c.correct, feedback: c.feedback || null })));
