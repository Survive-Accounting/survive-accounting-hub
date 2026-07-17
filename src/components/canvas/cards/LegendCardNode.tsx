// LEGEND CARD — the trading card (Luca Pacioli, companies, key concepts). Same
// frame family as the SURVIVE card back: dark frame, navy field, gold inset.
// Every field is inline-editable; the portrait window takes paste/drop/click
// uploads into canvas-media. Chromeless like the note card — hover actions only.
import { useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { Copy, ImagePlus, Lock, LockOpen, Minus, Plus, Trash2, X } from "lucide-react";

import { useCardActions } from "../BaseCard";
import { ConnectionDots } from "../ConnectionDots";
import { MemoAnchor, MemoLightbulb, memoAnchorId } from "../MemoLightbulb";
import { EditableText } from "../ui";
import { uploadImageFile } from "./ImageCardNode";
import type { LegendCard } from "../types";

const FRAME = { frame: "#0B0F1E", field: "#14213D", gold: "#E8B84B", red: "#CE1126", cream: "#F4EFE6" };

export function LegendCardNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as LegendCard;
  const { update, updateFn, remove, toFront, duplicate, addToDeck, tuck } = useCardActions(id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const takeFile = async (file: File) => {
    setErr(null);
    setBusy(true);
    try {
      const url = await uploadImageFile(file);
      update({ imageUrl: url });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const patchFact = (i: number, v: string) =>
    updateFn((prev) => ({ facts: ((prev.facts as string[]) ?? []).map((f, j) => (j === i ? v : f)) }));

  const w = d.w ?? 264;

  return (
    <div
      onPointerDownCapture={toFront}
      className="group/legend animate-in fade-in zoom-in-95 relative select-none duration-150"
      style={{
        width: w,
        background: FRAME.frame,
        borderRadius: 14,
        padding: 8,
        border: `1px solid ${selected ? FRAME.gold : "rgba(232,184,75,0.25)"}`,
        boxShadow: selected ? `0 0 0 1.5px ${FRAME.gold}, 0 16px 40px -14px rgba(0,0,0,0.7)` : "0 12px 32px -14px rgba(0,0,0,0.6)",
      }}
    >
      <ConnectionDots color={FRAME.gold} />

      {/* hover actions (film mode hides via .card-actions) */}
      <div className="card-actions absolute right-1.5 top-1.5 z-10 flex gap-0.5 opacity-0 transition-opacity group-hover/legend:opacity-100">
        {/* MEMOS ON EVERY CARD — whole-card memo (floating note + arrow to the card) */}
        <MemoLightbulb
          targetId={id}
          handleId="r"
          className="h-5 w-5"
          style={{ color: FRAME.cream, background: "rgba(11,15,30,0.8)", border: `1px solid rgba(232,184,75,0.35)` }}
        />
        {([
          d.deckMember ? (["Tuck into deck (s)", Minus, tuck] as const) : (["Add to deck", Plus, addToDeck] as const),
          ["Duplicate", Copy, duplicate] as const,
          d.posLock
            ? (["Unlock position", Lock, () => update({ posLock: false })] as const)
            : (["Lock in place (edits still work)", LockOpen, () => update({ posLock: true })] as const),
          ["Delete", X, remove] as const,
        ]).map(([title, Icon, fn]) => (
          <button
            key={title}
            title={title}
            className="nodrag grid h-5 w-5 place-items-center rounded"
            style={{ color: FRAME.cream, background: "rgba(11,15,30,0.8)", border: `1px solid rgba(232,184,75,0.35)` }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); fn(); }}
          >
            <Icon className="h-3 w-3" />
          </button>
        ))}
      </div>

      <div
        className="flex flex-col overflow-hidden"
        style={{ background: FRAME.field, borderRadius: 9, border: `1px solid rgba(232,184,75,0.55)` }}
      >
        {/* name bar + year chip */}
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          <span className="min-w-0 flex-1 truncate text-[13px] font-black tracking-wide" style={{ color: FRAME.cream }}>
            <EditableText value={d.name} onChange={(v) => update({ name: v })} placeholder="Name" />
          </span>
          <span
            className="shrink-0 rounded-full px-1.5 py-px text-[9px] font-bold tabular-nums"
            style={{ color: FRAME.frame, background: FRAME.gold }}
          >
            <EditableText value={d.year} onChange={(v) => update({ year: v })} placeholder="year" />
          </span>
        </div>

        {/* portrait window */}
        <div className="mx-2 overflow-hidden rounded" style={{ border: `1px solid rgba(232,184,75,0.45)`, background: "#0d1526" }}>
          {d.imageUrl ? (
            <img src={d.imageUrl} alt={d.name} className="block h-[150px] w-full object-cover" draggable={false} />
          ) : (
            <label
              className="nodrag grid h-[150px] w-full cursor-pointer place-items-center text-center"
              style={{ color: "rgba(244,239,230,0.5)" }}
              onPaste={(e) => {
                const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/"));
                if (f) { e.preventDefault(); void takeFile(f); }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = [...e.dataTransfer.files].find((x) => x.type.startsWith("image/"));
                if (f) void takeFile(f);
              }}
              tabIndex={0}
            >
              <div>
                <ImagePlus className="mx-auto mb-1 h-5 w-5" />
                <span className="text-[10px]">{busy ? "uploading…" : "paste / drop / click portrait"}</span>
              </div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void takeFile(f); }}
              />
            </label>
          )}
        </div>
        {err && <p className="mx-2 mt-1 text-[9.5px]" style={{ color: "#FF8B9E" }}>{err}</p>}

        {/* type line */}
        <div className="mx-2 mt-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold italic" style={{ background: "rgba(232,184,75,0.12)", color: FRAME.gold }}>
          <EditableText value={d.typeLine} onChange={(v) => update({ typeLine: v })} placeholder="Legend · Father of accounting" />
        </div>

        {/* cream rules box: 1–3 facts + flavor */}
        <div className="mx-2 mb-1.5 mt-1.5 rounded px-2 py-1.5" style={{ background: FRAME.cream, color: "#232838" }}>
          {d.facts.map((f, i) => (
            <div key={i} className="group/fact relative flex items-start gap-1 py-0.5 text-[10.5px] leading-snug">
              {/* per-SLIP memo anchor — a memo can point at THIS fact, not just the card */}
              <MemoAnchor subId={`f${i}`} />
              <span className="min-w-0 flex-1">
                <EditableText value={f} onChange={(v) => patchFact(i, v)} placeholder={`Fact ${i + 1}`} />
              </span>
              <MemoLightbulb
                targetId={id}
                handleId={memoAnchorId(`f${i}`)}
                title="Attach a memo to this fact"
                className="mt-0.5 h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover/fact:opacity-70"
                style={{ color: "#232838" }}
              />
              {d.facts.length > 1 && (
                <button
                  className="nodrag mt-0.5 shrink-0 opacity-0 transition-opacity group-hover/fact:opacity-60"
                  style={{ color: FRAME.red }}
                  title="Remove fact"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => updateFn((prev) => ({ facts: ((prev.facts as string[]) ?? []).filter((_, j) => j !== i) }))}
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          ))}
          {d.facts.length < 3 && (
            <button
              className="nodrag inline-flex items-center gap-0.5 text-[9px] font-semibold opacity-50 hover:opacity-100"
              style={{ color: "#232838" }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => updateFn((prev) => ({ facts: [...((prev.facts as string[]) ?? []), ""] }))}
            >
              <Plus className="h-2.5 w-2.5" /> fact
            </button>
          )}
          <div className="mt-1 border-t pt-1 text-[9.5px] italic leading-snug" style={{ borderColor: "rgba(35,40,56,0.25)", color: "#4A5065" }}>
            <EditableText value={d.flavor} onChange={(v) => update({ flavor: v })} placeholder="“Flavor line…”" multiline />
          </div>
        </div>

        {/* footer: set label + corner chip */}
        <div className="flex items-center px-2 pb-1.5">
          <span className="min-w-0 flex-1 truncate text-[8.5px] tracking-wide" style={{ color: "rgba(244,239,230,0.5)" }}>
            <EditableText value={d.setLabel} onChange={(v) => update({ setLabel: v })} placeholder="Legends · 001" />
          </span>
          <span
            className="shrink-0 rounded px-1.5 py-px text-[9px] font-bold"
            style={{ color: FRAME.gold, border: `1px solid rgba(232,184,75,0.5)` }}
          >
            <EditableText value={d.cornerChip} onChange={(v) => update({ cornerChip: v })} placeholder="DR = CR" />
          </span>
        </div>
      </div>
    </div>
  );
}
