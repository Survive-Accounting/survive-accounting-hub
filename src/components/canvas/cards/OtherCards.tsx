// The simpler card types: T-account (live balance), Computation (step reveal),
// CEQ (distractor feedback), Memorize (kind badge), Note (neon marker), Video (Mux).
import type { NodeProps } from "@xyflow/react";
import { Plus, Trash2 } from "lucide-react";

import { BaseCard, IconBtn, useCardActions } from "../BaseCard";
import { EditableNumber, EditableText, fmtNum } from "../ui";
import { useFrameNav } from "../FrameNavContext";
import { playSfx } from "../sfx";
import { NEON, NOTE_COLORS, PAPER } from "../theme";
import {
  cardId,
  type CeqCard,
  type ComputationCard,
  type MemorizeCard,
  type TAccountCard,
  type TAccountEntry,
} from "../types";

// ============================== T-ACCOUNT ==============================
export function TAccountCardNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as TAccountCard;
  const { update, updateFn } = useCardActions(id);
  const editing = !!d.editMode;

  const sum = (xs: TAccountEntry[]) => xs.reduce((s, e) => s + (e.amount ?? 0), 0);
  const dr = sum(d.debits);
  const cr = sum(d.credits);
  const net = dr - cr;

  const side = (key: "debits" | "credits") => {
    const list = d[key];
    // Functional: rapid commits on both sides must not clobber each other.
    const patch = (eid: string, p: Partial<TAccountEntry>) =>
      updateFn((prev) => ({ [key]: ((prev[key] as TAccountEntry[]) ?? []).map((e) => (e.id === eid ? { ...e, ...p } : e)) }));
    return (
      <div className="min-w-0 flex-1">
        {list.map((e) => (
          <div key={e.id} className="flex items-center gap-1 py-0.5 text-[12.5px]">
            <span className="min-w-0 flex-1 truncate text-[10.5px]" style={{ color: PAPER.inkMuted }}>
              <EditableText value={e.label ?? ""} onChange={(v) => patch(e.id, { label: v })} editing={editing} placeholder="" />
            </span>
            <span className="w-16 text-right">
              <EditableNumber value={e.amount} onChange={(v) => patch(e.id, { amount: v })} editing={editing} />
            </span>
            {editing && (
              <IconBtn title="Remove" danger onClick={() => update({ [key]: list.filter((x) => x.id !== e.id) })}><Trash2 className="h-2.5 w-2.5" /></IconBtn>
            )}
          </div>
        ))}
        {editing && (
          <button
            className="nodrag mt-0.5 inline-flex items-center gap-0.5 rounded px-1 text-[10.5px] font-semibold"
            style={{ color: PAPER.navy }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => update({ [key]: [...list, { id: cardId("e"), label: "", amount: null }] })}
          >
            <Plus className="h-2.5 w-2.5" /> row
          </button>
        )}
      </div>
    );
  };

  return (
    <BaseCard
      id={id}
      data={d}
      selected={selected}
      accent={NEON.cyan}
      headerRight={
        editing ? (
          <IconBtn title="Clear all amounts" onClick={() => update({
            debits: d.debits.map((e) => ({ ...e, amount: null })),
            credits: d.credits.map((e) => ({ ...e, amount: null })),
          })}>
            <Trash2 className="h-3 w-3" />
          </IconBtn>
        ) : undefined
      }
    >
      <div className="text-center text-[13.5px] font-bold" style={{ color: PAPER.ink }}>
        <EditableText value={d.account} onChange={(v) => update({ account: v })} editing={editing} placeholder="Account" />
      </div>
      <div className="mx-auto mt-1 h-px w-4/5" style={{ background: PAPER.navy }} />
      <div className="flex gap-2 pt-1">
        {side("debits")}
        <div className="w-px self-stretch" style={{ background: PAPER.navy }} />
        {side("credits")}
      </div>
      <div className="mt-2 text-center text-[12px] font-bold tabular-nums" style={{ color: net === 0 ? PAPER.inkMuted : PAPER.green }}>
        bal {fmtNum(Math.abs(net))} {net === 0 ? "" : net > 0 ? "DR" : "CR"}
      </div>
    </BaseCard>
  );
}

// ============================== COMPUTATION ==============================
export function ComputationCardNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ComputationCard;
  const { update, updateFn } = useCardActions(id);
  const editing = !!d.editMode;
  const patchStep = (sid: string, p: Record<string, unknown>) =>
    updateFn((prev) => ({ steps: ((prev.steps as ComputationCard["steps"]) ?? []).map((s) => (s.id === sid ? { ...s, ...p } : s)) }));

  return (
    <BaseCard id={id} data={d} selected={selected} accent={NEON.yellow}>
      {(d.narration || editing) && (
        <p className="mb-1.5 text-[12px] leading-relaxed" style={{ color: PAPER.inkMuted }}>
          <EditableText value={d.narration ?? ""} onChange={(v) => update({ narration: v })} editing={editing} multiline placeholder="Narration" />
        </p>
      )}
      <ol className="space-y-1">
        {d.steps.map((s, i) => (
          <li key={s.id} className="flex items-start gap-1.5 text-[12.5px]" style={{ opacity: s.hidden ? 0.18 : 1 }}>
            <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9.5px] font-bold" style={{ border: `1px solid ${PAPER.gold}`, color: PAPER.gold }}>
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-medium" style={{ color: PAPER.ink }}>
                <EditableText value={s.label} onChange={(v) => patchStep(s.id, { label: v })} editing={editing} placeholder="Step" />
              </span>
              {(s.formulaText || editing) && (
                <span className="ml-1.5 text-[11.5px]" style={{ color: PAPER.inkMuted }}>
                  <EditableText value={s.formulaText ?? ""} onChange={(v) => patchStep(s.id, { formulaText: v })} editing={editing} placeholder="formula" />
                </span>
              )}
            </span>
            <span className="w-20 text-right font-semibold tabular-nums" style={{ color: PAPER.navy }}>
              <EditableText value={s.value ?? ""} onChange={(v) => patchStep(s.id, { value: v })} editing={editing} placeholder="" className="text-right block" />
            </span>
            {editing && (
              <IconBtn title="Remove step" danger onClick={() => update({ steps: d.steps.filter((x) => x.id !== s.id) })}><Trash2 className="h-3 w-3" /></IconBtn>
            )}
          </li>
        ))}
      </ol>
      {editing && (
        <button
          className="nodrag mt-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold"
          style={{ color: PAPER.navy, border: `1px solid rgba(20,33,61,0.35)` }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => update({ steps: [...d.steps, { id: cardId("s"), label: `Step ${d.steps.length + 1}`, formulaText: "", value: "" }] })}
        >
          <Plus className="h-3 w-3" /> step
        </button>
      )}
    </BaseCard>
  );
}

// ============================== CEQ ==============================
export function CeqCardNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as CeqCard;
  const { update } = useCardActions(id);
  const nav = useFrameNav();
  const editing = !!d.editMode;
  const [picked, setPicked] = ((): [string | null, (v: string | null) => void] => {
    // picked choice lives in node data so it round-trips through scenes
    const v = (d as unknown as { picked?: string | null }).picked ?? null;
    return [v, (nv) => update({ picked: nv })];
  })();
  const patchChoice = (cid: string, p: Record<string, unknown>) => update({ choices: d.choices.map((c) => (c.id === cid ? { ...c, ...p } : c)) });
  const chosen = d.choices.find((c) => c.id === picked);

  return (
    <BaseCard id={id} data={d} selected={selected} accent={NEON.pink}>
      <p className="mb-2 text-[13px] leading-relaxed" style={{ color: PAPER.ink }}>
        <EditableText value={d.prompt} onChange={(v) => update({ prompt: v })} editing={editing} multiline placeholder="Prompt" />
      </p>
      <div className="space-y-1">
        {d.choices.map((c) => {
          const revealed = d.revealedAnswer || picked === c.id;
          const showState = revealed && (c.correct ? "right" : picked === c.id ? "wrong" : null);
          return (
            <div
              key={c.id}
              className="nodrag flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-[12.5px] transition-colors"
              style={{
                borderColor: showState === "right" ? PAPER.green : showState === "wrong" ? PAPER.red : PAPER.line,
                color: showState === "right" ? PAPER.green : PAPER.ink,
                background: showState === "right" ? "rgba(30,127,79,0.07)" : showState === "wrong" ? "rgba(194,24,50,0.06)" : "transparent",
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => { if (editing) return; if (nav.film && c.correct && picked !== c.id && d.confirmSfx !== false) playSfx("confirm"); setPicked(c.id); }}
            >
              <span className="min-w-0 flex-1">
                <EditableText value={c.text} onChange={(v) => patchChoice(c.id, { text: v })} editing={editing} placeholder="Choice" />
              </span>
              {editing && (
                <>
                  <button
                    className="nodrag rounded px-1 text-[9.5px] font-bold"
                    style={{ color: c.correct ? PAPER.green : PAPER.inkMuted, border: `1px solid ${c.correct ? PAPER.green : PAPER.line}` }}
                    onClick={(e) => { e.stopPropagation(); update({ choices: d.choices.map((x) => ({ ...x, correct: x.id === c.id })) }); }}
                  >
                    ✓
                  </button>
                  <IconBtn title="Remove" danger onClick={() => update({ choices: d.choices.filter((x) => x.id !== c.id) })}><Trash2 className="h-3 w-3" /></IconBtn>
                </>
              )}
            </div>
          );
        })}
      </div>
      {editing && chosen == null && (
        <div className="mt-1.5">
          <button
            className="nodrag inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold"
            style={{ color: PAPER.navy, border: `1px solid rgba(20,33,61,0.35)` }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => update({ choices: [...d.choices, { id: cardId("ch"), text: "", feedback: "" }] })}
          >
            <Plus className="h-3 w-3" /> choice
          </button>
        </div>
      )}
      {chosen && !chosen.correct && (chosen.feedback || editing) && (
        <div className="mt-1.5 rounded px-2 py-1 text-[11.5px]" style={{ background: "rgba(194,24,50,0.06)", color: PAPER.red, border: "1px solid rgba(194,24,50,0.3)" }}>
          <EditableText value={chosen.feedback ?? ""} onChange={(v) => patchChoice(chosen.id, { feedback: v })} editing={editing} multiline placeholder="Feedback for this distractor" />
        </div>
      )}
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button
            className="nodrag rounded px-1.5 py-0.5 text-[11px] font-semibold"
            style={{ color: PAPER.gold, border: "1px solid rgba(138,90,0,0.4)" }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => update({ revealedAnswer: !d.revealedAnswer })}
          >
            {d.revealedAnswer ? "hide answer" : "reveal answer"}
          </button>
          {/* CORRECT-ANSWER SOUND toggle (Lee) — per CEQ: plays the confirm SFX
              when the right choice is picked in film. Authoring chrome (hidden on
              camera). Default on. */}
          <button
            className="sa-chrome nodrag rounded px-1.5 py-0.5 text-[10px] font-bold"
            title="Correct-answer sound for THIS question — plays when the right choice is picked (film). Click to toggle."
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => update({ confirmSfx: d.confirmSfx === false ? true : false })}
            style={{ color: d.confirmSfx === false ? PAPER.inkFaint : PAPER.green, border: `1px solid ${d.confirmSfx === false ? PAPER.line : "rgba(31,157,87,0.5)"}` }}
          >
            🔔 {d.confirmSfx === false ? "off" : "on"}
          </button>
        </div>
        {picked && (
          <button className="nodrag text-[10.5px] underline" style={{ color: PAPER.inkMuted }} onPointerDown={(e) => e.stopPropagation()} onClick={() => setPicked(null)}>
            reset
          </button>
        )}
      </div>
    </BaseCard>
  );
}

// ============================== MEMORIZE ==============================
const KIND_COLOR: Record<MemorizeCard["itemKind"], string> = {
  formula: PAPER.navy,
  mnemonic: PAPER.gold,
  watchout: PAPER.red,
  tip: PAPER.green,
};

export function MemorizeCardNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as MemorizeCard;
  const { update } = useCardActions(id);
  const editing = !!d.editMode;
  const color = KIND_COLOR[d.itemKind] ?? PAPER.navy;

  return (
    <BaseCard id={id} data={d} selected={selected} accent={color}>
      <div className="mb-1.5">
        {editing ? (
          <select
            className="nodrag rounded bg-black/5 px-1 py-0.5 text-[10px] font-bold uppercase outline-none"
            style={{ color }}
            value={d.itemKind}
            onChange={(e) => update({ itemKind: e.target.value })}
          >
            {(["formula", "mnemonic", "watchout", "tip"] as const).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        ) : (
          <span className="rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider" style={{ color, border: `1px solid ${color}66` }}>
            {d.itemKind}
          </span>
        )}
      </div>
      <p className="text-[13.5px] leading-relaxed" style={{ color: PAPER.ink }}>
        <EditableText value={d.body} onChange={(v) => update({ body: v })} editing={editing} multiline placeholder="The thing to remember" />
      </p>
    </BaseCard>
  );
}

// NOTE: the note card moved to NoteCardNode.tsx (TipTap rich text).
// NOTE: the video card moved to VideoCardNode.tsx (HLS.js + Mux signed playback).
