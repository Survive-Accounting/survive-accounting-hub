// TESTIMONIAL CARD — a student review shown on a frame. IMPORTANT: there is NO
// testimonials DB table in this repo (the marketing carousel is a third-party
// testimonial.to iframe the app can't read), so this card holds LOCAL, card-only
// values the author types/pastes in. Nothing here reads or writes any source
// testimonial row — editing is purely scene-local, like every other card.
import { useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { ImagePlus, Settings2, Star, X } from "lucide-react";

import { BaseCard, useCardActions } from "../BaseCard";
import { CardPopover } from "../CardPopover";
import { renderInline } from "../inline-md";
import { EditableText, useEditSignal } from "../ui";
import { NEON, PAPER } from "../theme";
import { uploadImageFile } from "./ImageCardNode";
import type { AttrMode, TestimonialCard } from "../types";

const HL = { bg: "rgba(252,163,17,0.30)", color: "#7a5200" }; // ==highlight== on paper

/** The attribution line per the selected preset. Default "generic" is the portable
 *  one (describe the context, not hard coordinates) so a card reuses across frames. */
export function attrLine(d: TestimonialCard): string {
  const name = d.studentName?.trim() ?? "";
  const join = (extra?: string) => [name, extra?.trim()].filter(Boolean).join(" · ");
  switch (d.attrMode) {
    case "none": return name; // name + stars only (no course)
    case "specific": return join(d.attrSpecific); // e.g. "Maya R. · ACCY 201 · Ole Miss"
    case "custom": return d.attrCustom?.trim() ?? ""; // free text
    case "generic":
    default: return join(d.attrGeneric); // e.g. "Maya R. · Intro Accounting student"
  }
}

export function TestimonialCardNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as TestimonialCard;
  const { update } = useCardActions(id);
  const editing = !!d.editMode;
  useEditSignal((data as { _editSeq?: number })._editSeq, () => update({ editMode: !d.editMode })); // F2 global edit
  const [gear, setGear] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const takePhoto = async (file: File) => {
    setErr(null); setBusy(true);
    try { update({ photoUrl: await uploadImageFile(file) }); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const stars = Math.max(0, Math.min(5, Math.round(d.stars ?? 5)));
  const showPhoto = d.showPhoto !== false;
  const attribution = attrLine(d);

  return (
    <BaseCard
      id={id}
      data={d}
      selected={selected}
      accent={NEON.pink}
      noEditBtn
      titleNode={<span className="min-w-0 flex-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: PAPER.headerMuted }}>Testimonial</span>}
      headerRight={
        <button
          title="Testimonial settings"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setGear(gear ? null : e.currentTarget); }}
          className="nodrag grid h-5 w-5 place-items-center rounded"
          style={{ color: gear ? NEON.yellow : NEON.muted }}
        >
          <Settings2 className="h-3 w-3" />
        </button>
      }
    >
      {gear && (
        <CardPopover anchor={gear} side="left" onClose={() => setGear(null)}>
          <TestimonialSettings d={d} onUpdate={update} onClose={() => setGear(null)} />
        </CardPopover>
      )}

      <div className="flex gap-3">
        {showPhoto && (
          <div className="shrink-0">
            {d.photoUrl ? (
              <div className="relative">
                <img src={d.photoUrl} alt={d.studentName} className="h-14 w-14 rounded-full object-cover" style={{ border: `2px solid ${PAPER.line}` }} draggable={false} />
                {editing && (
                  <button className="nodrag absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full" title="Remove photo" style={{ background: PAPER.card, border: `1px solid ${PAPER.cardEdge}`, color: PAPER.red }} onPointerDown={(e) => e.stopPropagation()} onClick={() => update({ photoUrl: undefined })}><X className="h-2.5 w-2.5" /></button>
                )}
              </div>
            ) : editing ? (
              <label
                className="nodrag grid h-14 w-14 cursor-pointer place-items-center rounded-full text-center"
                style={{ border: `1px dashed ${PAPER.cardEdge}`, color: PAPER.inkMuted }}
                title="Paste / drop / click a student photo"
                onPaste={(e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/")); if (f) { e.preventDefault(); void takePhoto(f); } }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = [...e.dataTransfer.files].find((x) => x.type.startsWith("image/")); if (f) void takePhoto(f); }}
              >
                <ImagePlus className="h-4 w-4" />
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void takePhoto(f); }} />
              </label>
            ) : null}
            {busy && <p className="mt-0.5 text-[8px]" style={{ color: PAPER.inkMuted }}>uploading…</p>}
            {err && <p className="mt-0.5 text-[8px]" style={{ color: PAPER.red }}>{err}</p>}
          </div>
        )}

        <div className="min-w-0 flex-1">
          {/* STAR RATING — visual; click a star in edit mode to set (local override) */}
          <div className="mb-1 flex items-center gap-0.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <button
                key={i}
                className={editing ? "nodrag" : "pointer-events-none"}
                title={editing ? `Set ${i + 1} star${i ? "s" : ""}` : `${stars} of 5`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={editing ? (e) => { e.stopPropagation(); update({ stars: i + 1 }); } : undefined}
              >
                <Star className="h-3.5 w-3.5" style={{ color: "#F5A623", fill: i < stars ? "#F5A623" : "transparent" }} />
              </button>
            ))}
          </div>

          {/* QUOTE — editable on the card (trim / excerpt). Display renders the shared
              markdown subset (**bold** / ==highlight==); malformed markers stay literal. */}
          <blockquote className="text-[15px] leading-snug" style={{ color: PAPER.ink }}>
            {editing ? (
              <EditableText value={d.quote} onChange={(v) => update({ quote: v })} editing multiline placeholder="Paste the review, then trim to a tight excerpt…" />
            ) : d.quote ? (
              <>“{renderInline(d.quote, HL)}”</>
            ) : (
              <span className="italic" style={{ color: PAPER.inkMuted }}>Open settings (gear) or edit to add a review…</span>
            )}
          </blockquote>

          {/* ATTRIBUTION — a separate field (never baked into the quote) */}
          {attribution && (
            <div className="mt-1.5 text-[12px] font-semibold" style={{ color: PAPER.navy }}>— {attribution}</div>
          )}
        </div>
      </div>
    </BaseCard>
  );
}

/** SETTINGS popover — name, attribution preset + text, star rating, photo toggle.
 *  (The quote is edited inline on the card.) Mirrors the List/Legend settings look. */
function TestimonialSettings({ d, onUpdate, onClose }: { d: TestimonialCard; onUpdate: (p: Partial<TestimonialCard>) => void; onClose: () => void }) {
  const row = "flex items-center justify-between gap-2 py-0.5 text-[11.5px]";
  const field = "w-full rounded bg-black/40 px-1.5 py-0.5 text-[11px] outline-none";
  const modes: { key: AttrMode; label: string }[] = [
    { key: "none", label: "Name only" },
    { key: "generic", label: "Generic" },
    { key: "specific", label: "Specific" },
    { key: "custom", label: "Custom" },
  ];
  return (
    <div className="nodrag w-60 rounded-lg p-2 shadow-xl" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="mb-1 text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.yellow }}>Testimonial</div>

      <div className={row}>
        <span>Edit mode <span className="opacity-60">(F2 too)</span></span>
        <button className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ color: d.editMode ? NEON.yellow : NEON.muted, background: d.editMode ? "rgba(252,163,17,0.12)" : "transparent", border: `1px solid ${d.editMode ? "rgba(252,163,17,0.5)" : NEON.borderSoft}` }} onClick={() => onUpdate({ editMode: !d.editMode })}>{d.editMode ? "on" : "off"}</button>
      </div>

      <label className="mb-1 mt-1 block text-[9.5px] font-semibold uppercase tracking-wide" style={{ color: NEON.muted }}>Student name</label>
      <input className={field} style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} value={d.studentName} placeholder="e.g. Maya R." onChange={(e) => onUpdate({ studentName: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />

      <div className={`${row} mt-1.5`}>
        <span>Rating</span>
        <div className="flex items-center gap-1">
          <button className="rounded px-1 text-[12px] font-bold" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => onUpdate({ stars: Math.max(0, (d.stars ?? 5) - 1) })}>−</button>
          <span className="w-6 text-center tabular-nums">{Math.max(0, Math.min(5, Math.round(d.stars ?? 5)))}</span>
          <button className="rounded px-1 text-[12px] font-bold" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => onUpdate({ stars: Math.min(5, (d.stars ?? 5) + 1) })}>+</button>
        </div>
      </div>

      <div className={row}>
        <span>Photo</span>
        <button className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ color: d.showPhoto !== false ? NEON.yellow : NEON.muted, background: d.showPhoto !== false ? "rgba(252,163,17,0.12)" : "transparent", border: `1px solid ${d.showPhoto !== false ? "rgba(252,163,17,0.5)" : NEON.borderSoft}` }} onClick={() => onUpdate({ showPhoto: !(d.showPhoto !== false) })}>{d.showPhoto !== false ? "shown" : "hidden"}</button>
      </div>

      <div className="mt-1.5 border-t pt-1.5" style={{ borderColor: NEON.borderSoft }}>
        <div className="mb-1 text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.cyan }}>Attribution</div>
        <div className="mb-1 flex flex-wrap gap-1">
          {modes.map((m) => {
            const active = (d.attrMode ?? "generic") === m.key;
            return (
              <button key={m.key} className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ color: active ? "#0B1322" : NEON.muted, background: active ? NEON.yellow : "transparent", border: `1px solid ${active ? NEON.yellow : NEON.borderSoft}` }} onClick={() => onUpdate({ attrMode: m.key })}>{m.label}</button>
            );
          })}
        </div>
        {(d.attrMode ?? "generic") === "generic" && (
          <input className={field} style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} value={d.attrGeneric ?? ""} placeholder="e.g. Intro Accounting student" onChange={(e) => onUpdate({ attrGeneric: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
        )}
        {d.attrMode === "specific" && (
          <input className={field} style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} value={d.attrSpecific ?? ""} placeholder="e.g. ACCY 201 · Ole Miss" onChange={(e) => onUpdate({ attrSpecific: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
        )}
        {d.attrMode === "custom" && (
          <input className={field} style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} value={d.attrCustom ?? ""} placeholder="free text" onChange={(e) => onUpdate({ attrCustom: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
        )}
        <p className="mt-1 text-[9px] leading-snug" style={{ color: NEON.muted }}>Default is the portable “generic” line — reference the context, not hard coordinates, so the card reuses across frames.</p>
      </div>

      <div className="mt-1.5 flex justify-end">
        <button className="rounded px-2 py-0.5 text-[10.5px] font-semibold" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={onClose}>done</button>
      </div>
    </div>
  );
}
