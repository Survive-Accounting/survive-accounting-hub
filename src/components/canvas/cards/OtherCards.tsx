// The simpler card types: T-account (live balance), Computation (step reveal),
// CEQ (distractor feedback), Memorize (kind badge), Note (neon marker), Video (Mux).
import { useEffect, useRef } from "react";
import { type NodeProps, useReactFlow } from "@xyflow/react";
import { Plus, Trash2 } from "lucide-react";

import { BaseCard, IconBtn, useCardActions } from "../BaseCard";
import { EditableNumber, EditableText, fmtNum } from "../ui";
import { useFrameNav } from "../FrameNavContext";
import { renderInline } from "../inline-md";
import { MemoLightbulb, memoAnchorId, TextAnchor } from "../MemoLightbulb";
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
// VISUAL REDESIGN (on-camera legibility) — behaviour is UNCHANGED from the
// choreograph/live-keys build (one-step deal, auto-focus, up/down emphasis, Enter
// resolution + per-choice memos, chaching only on correct-Enter, CEQ_DISTRACTOR).
// This block is styling only.
//
// STEM TYPE-OUT (choreo Item 5): on deal / frame-entry in film the stem types itself
// in, then options fade up staggered. Plus a one-time PULSE on a correct resolve
// (synced to the chaching). Scoped under .film-mode so authoring never plays type-out.
const CEQ_TYPEOUT_CSS = `
/* -20% end margin so a stem that overflows its box isn't cropped by the held clip. */
@keyframes sa-ceq-type { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 -20% 0 0); } }
.film-mode .sa-ceq-type { animation: sa-ceq-type 520ms steps(24, end) both; }
@keyframes sa-ceq-opt { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.film-mode .sa-ceq-opt { animation: sa-ceq-opt 240ms ease both; }
@keyframes sa-ceq-pulse { 0% { transform: scale(1); } 42% { transform: scale(1.045); } 100% { transform: scale(1); } }
.sa-ceq-pulse { animation: sa-ceq-pulse 420ms ease; }
`;

// STEPPED text sizing (redesign Item 1) — 3 preset px sizes (L / M / S) chosen by
// character count, NOT continuous scaling (so a deck doesn't jitter). LEE: tune the
// numbers here — the `max` is the inclusive upper char count for that step.
const STEM_STEPS = [{ max: 46, px: 30 }, { max: 120, px: 24 }, { px: 19 }]; // L · M · S
const CHOICE_STEPS = [{ max: 22, px: 20 }, { max: 55, px: 17 }, { px: 15 }];
const CEQ_STD_W = 400;
const CEQ_WIDE_W = 560;
function stepPx(len: number, steps: { max?: number; px: number }[]): number {
  for (const s of steps) if (s.max == null || len <= s.max) return s.px;
  return steps[steps.length - 1].px;
}
const chipLetter = (i: number) => String.fromCharCode(65 + (i % 26)); // A, B, C, …
// Inline **bold** / ==highlight== now lives in ../inline-md (shared with memos).

export function CeqCardNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as CeqCard;
  const { update } = useCardActions(id);
  const nav = useFrameNav();
  const rf = useReactFlow();
  const editing = !!d.editMode;
  // TYPE-OUT: re-key the stem + options when THIS CEQ's frame is entered so the
  // film animation replays exactly once per entry (mirrors HeadingCardNode).
  const parentId = rf.getNode(id)?.parentId;
  const inCurrentFrame = !!parentId && nav.currentFrameId === parentId;
  const typeKey = inCurrentFrame ? `ceq-${nav.currentFrameId}` : "ceq-static";
  // KEYPAD on stem type-out — CEQ defaults ON (the deal IS a type-out); silence by
  // toggling keypadSfx === false. Fires once per frame entry in film (caller-gated).
  // KEYPAD on stem type-out (Item 5): fire once each time this CEQ's frame becomes
  // the live film frame — tracked off the (film && in-frame) EDGE so it also fires
  // when film is toggled on while already parked in the frame (not just on deal).
  // Per-choice memos are hidden DERIVEDLY in the route (film-gated), never here, so
  // they can't strand invisible in authoring.
  const wasFilmInFrame = useRef(false);
  useEffect(() => {
    const live = nav.film && inCurrentFrame;
    const entering = live && !wasFilmInFrame.current;
    wasFilmInFrame.current = live;
    if (entering && d.keypadSfx !== false) playSfx("keypad");
  }, [inCurrentFrame, nav.film, d.keypadSfx]);
  const [picked, setPicked] = ((): [string | null, (v: string | null) => void] => {
    // picked choice lives in node data so it round-trips through scenes
    const v = (d as unknown as { picked?: string | null }).picked ?? null;
    return [v, (nv) => update({ picked: nv })];
  })();
  const patchChoice = (cid: string, p: Record<string, unknown>) => update({ choices: d.choices.map((c) => (c.id === cid ? { ...c, ...p } : c)) });
  const chosen = d.choices.find((c) => c.id === picked);
  // Stepped, char-count text sizing (Item 1) + width preset (Item 6). Manual resize (w) wins.
  const stemPx = stepPx((d.prompt || "").length, STEM_STEPS);
  const choicePx = stepPx(d.choices.reduce((mx, c) => Math.max(mx, (c.text || "").length), 0), CHOICE_STEPS);
  const cardW = d.w ?? (d.wide ? CEQ_WIDE_W : CEQ_STD_W);

  return (
    <BaseCard id={id} data={d} selected={selected} accent={NEON.pink} fixedWidth={cardW}>
      <style>{CEQ_TYPEOUT_CSS}</style>
      {/* STEM — large, bold, top-aligned, generous line height. Inline **bold** / ==highlight==. */}
      <p key={typeKey} className={editing ? "mb-3" : "mb-3 sa-ceq-type"} style={{ fontSize: stemPx, fontWeight: 800, lineHeight: 1.28, color: PAPER.ink }}>
        {editing
          ? <EditableText value={d.prompt} onChange={(v) => update({ prompt: v })} editing multiline placeholder="Prompt" />
          : renderInline(d.prompt || "")}
      </p>
      <div key={`${typeKey}-opts`} className="space-y-2">
        {d.choices.map((c, ci) => {
          // STATE (Item 3, VISUAL ONLY — logic unchanged): a choice is "revealed" via
          // Enter-resolve (c.resolved), the legacy student click (picked), or reveal-all.
          const resolved = !!c.resolved;
          const revealed = d.revealedAnswer || picked === c.id || resolved;
          const st = revealed ? (c.correct ? "right" : picked === c.id || resolved ? "wrong" : null) : null;
          // EMPHASIS = amber ring + amber chip, NO fill (distinct from resolution).
          const emphasized = !!selected && !editing && d.emphasis === c.id;
          const chip = st === "right" ? PAPER.green : st === "wrong" ? PAPER.red : emphasized ? "#B8860B" : PAPER.inkMuted;
          const chipSize = Math.round(choicePx * 1.55);
          return (
            <div
              key={c.id}
              className={`group/choice nodrag relative flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors${editing ? "" : " sa-ceq-opt"}${st === "right" ? " sa-ceq-pulse" : ""}`}
              style={{
                borderColor: st === "right" ? PAPER.green : st === "wrong" ? PAPER.red : emphasized ? "rgba(184,134,11,0.95)" : PAPER.line,
                background: st === "right" ? "rgba(30,127,79,0.12)" : st === "wrong" ? "rgba(194,24,50,0.09)" : "transparent",
                boxShadow: emphasized ? "0 0 0 2px rgba(184,134,11,0.85), 0 0 16px rgba(184,134,11,0.3)" : undefined,
                filter: st === "wrong" ? "grayscale(0.35)" : undefined,
                animationDelay: editing ? undefined : `${520 + ci * 80}ms`,
              }}
              onPointerDown={(e) => e.stopPropagation()}
              // CLICK = EMPHASISE (Lee, item 4): a click puts the amber ring on this
              // choice and SELECTS the card so Enter resolves it. It does NOT reveal
              // right/wrong (that's Enter's job). The win sound fires ONLY on a
              // correct-Enter (route resolveCeqChoice), never on a click.
              onClick={() => {
                if (editing) return;
                rf.setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, selected: true } : n.selected ? { ...n, selected: false } : n)));
                update({ emphasis: c.id });
              }}
            >
              {/* LETTER CHIP (A, B, C… by position) */}
              <span
                className="grid shrink-0 place-items-center rounded-md font-black"
                style={{
                  width: chipSize, height: chipSize, fontSize: Math.round(choicePx * 0.82),
                  color: st ? "#fff" : chip,
                  background: st === "right" ? PAPER.green : st === "wrong" ? PAPER.red : emphasized ? "rgba(184,134,11,0.16)" : "transparent",
                  border: `1.5px solid ${chip}`,
                }}
              >
                {chipLetter(ci)}
              </span>
              <span
                className="min-w-0 flex-1"
                style={{ fontSize: choicePx, fontWeight: 600, lineHeight: 1.3, color: st === "right" ? PAPER.green : PAPER.ink }}
              >
                {/* strike lives on TextAnchor's inline-block span (line-through does
                    not inherit across inline-block), sized in em so it survives the
                    1080p downscale. */}
                <TextAnchor subId={c.id} nodeId={id} strike={st === "wrong"}>
                  {editing
                    ? <EditableText value={c.text} onChange={(v) => patchChoice(c.id, { text: v })} editing placeholder="Choice" />
                    : renderInline(c.text || "")}
                </TextAnchor>
              </span>
              {!editing && (
                <MemoLightbulb
                  targetId={id}
                  handleId={memoAnchorId(c.id)}
                  title="Attach a memo to this choice — reveals when the choice is resolved (Enter)"
                  className="opacity-0 transition-opacity group-hover/choice:opacity-100"
                  style={{ color: PAPER.inkMuted }}
                />
              )}
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
      {/* AUTHORING CHROME (hidden on camera) — sound toggles + width preset. The legacy
          "reveal answer" button is REMOVED (Item 5): Enter-resolution is the only path. */}
      <div className="sa-chrome mt-2 flex items-center gap-1.5">
        <button
          className="nodrag rounded px-1.5 py-0.5 text-[10px] font-bold"
          title="Correct-answer win sound — plays when the correct choice is resolved (Enter, film). Toggle."
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => update({ confirmSfx: d.confirmSfx === false ? true : false })}
          style={{ color: d.confirmSfx === false ? PAPER.inkFaint : PAPER.green, border: `1px solid ${d.confirmSfx === false ? PAPER.line : "rgba(31,157,87,0.5)"}` }}
        >
          🔔 {d.confirmSfx === false ? "off" : "on"}
        </button>
        <button
          className="nodrag rounded px-1.5 py-0.5 text-[10px] font-bold"
          title="Keypad type-out sound for the stem (film). Toggle."
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => update({ keypadSfx: d.keypadSfx === false ? true : false })}
          style={{ color: d.keypadSfx === false ? PAPER.inkFaint : PAPER.navy, border: `1px solid ${d.keypadSfx === false ? PAPER.line : "rgba(20,33,61,0.4)"}` }}
        >
          ⌨ {d.keypadSfx === false ? "off" : "on"}
        </button>
        <span className="mx-0.5 h-4 w-px" style={{ background: PAPER.line }} />
        {/* WIDTH PRESET (Item 6): standard | wide — the ONLY design knob. Clears manual resize. */}
        <button className="nodrag rounded px-1.5 py-0.5 text-[10px] font-bold" title="Standard width" onPointerDown={(e) => e.stopPropagation()} onClick={() => update({ wide: false, w: undefined })} style={{ color: !d.wide ? PAPER.navy : PAPER.inkFaint, border: `1px solid ${!d.wide ? "rgba(20,33,61,0.5)" : PAPER.line}` }}>std</button>
        <button className="nodrag rounded px-1.5 py-0.5 text-[10px] font-bold" title="Wide width" onPointerDown={(e) => e.stopPropagation()} onClick={() => update({ wide: true, w: undefined })} style={{ color: d.wide ? PAPER.navy : PAPER.inkFaint, border: `1px solid ${d.wide ? "rgba(20,33,61,0.5)" : PAPER.line}` }}>wide</button>
        {(d.emphasis || d.choices.some((c) => c.resolved)) && (
          <button className="nodrag ml-auto text-[10.5px] underline" style={{ color: PAPER.inkMuted }} onPointerDown={(e) => e.stopPropagation()} onClick={() => update({ emphasis: undefined, choices: d.choices.map((c) => ({ ...c, resolved: false })) })}>reset</button>
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
