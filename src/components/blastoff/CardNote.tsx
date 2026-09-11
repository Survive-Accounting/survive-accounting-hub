// THE NOTE ON A SET CARD — a box over the card (card-note.ts has the rules and Lee's words).
//
// A phone-level layer, like a placed picture: PhoneFrame mounts it over the stage with the capture
// camera's transform, so it zooms with the slide. On the Review stage it drags (move) and its
// corner grip resizes, width and height both; the box is saved as fractions of the phone. The
// words shrink to fit whatever box it is — a binary search over the font size, measured in place.
//
// The answer choices dimming behind it is PhoneFrame's (a stylesheet keyed on the phone), since
// the choices are the card's, not the note's. Hoisted function declarations only — this file is
// on the canvas graph via PhoneFrame.
import { useLayoutEffect, useRef, useState } from "react";

import { BRAND_CREAM } from "@/components/brand-cards/bolt-boil";
import { renderInline } from "@/components/canvas/inline-md";

import { NOTE_FONT, clampNoteBox, fitFont, noteBox, type CardNoteSpec, type NoteBox } from "./card-note";
import type { SlideLayout } from "./layout";
import { DISPLAY_FONT } from "./stage";

const GOLD = "#FCA311";
const NAVY = "#14213D";

/** The stylesheet that dims the card's choices while a dimming note is up. Keyed on the phone's
 *  own attribute; !important because a choice carries inline filter / opacity for its own states. */
export const NOTE_DIM_CSS = `
[data-sa-note-dim] .sa-ceq-choice { filter: blur(2.5px) brightness(0.85) !important; opacity: 0.32 !important; transition: filter 260ms ease, opacity 260ms ease; }
@media (prefers-reduced-motion: reduce) { [data-sa-note-dim] .sa-ceq-choice { transition: none; } }`;

export function CardNote({ note, w, h, layout, onPlace, stageStyle }: {
  note: CardNoteSpec; w: number; h: number; layout: SlideLayout;
  /** Review only: the drag and the grip commit the new box here. */
  onPlace?: (b: NoteBox) => void;
  stageStyle?: React.CSSProperties;
}) {
  const k = w / 306;
  const [drag, setDrag] = useState<NoteBox | null>(null);
  const start = useRef<{ mode: "move" | "size"; px: number; py: number; from: NoteBox } | null>(null);
  const b = drag ?? noteBox(note, layout);
  const left = Math.round(b.x * w), top = Math.round(b.y * h), bw = Math.round(b.w * w), bh = Math.round(b.h * h);
  const text = note.text.trim();

  // FIT THE WORDS TO THE BOX. Measured in place: the font is set on the element, the overflow read,
  // and the search settles; then the size is kept in state so a re-render doesn't undo it.
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [font, setFont] = useState(NOTE_FONT.max * k);
  useLayoutEffect(() => {
    const box = boxRef.current, el = textRef.current;
    if (!box || !el) return;
    const fits = (px: number) => { el.style.fontSize = `${px}px`; return el.scrollHeight <= box.clientHeight + 0.5 && el.scrollWidth <= box.clientWidth + 0.5; };
    const px = fitFont(fits, NOTE_FONT.max * k, NOTE_FONT.min * k);
    el.style.fontSize = `${px}px`;
    setFont(px);
  }, [note.text, bw, bh, k]);

  function down(mode: "move" | "size") {
    return (e: React.PointerEvent) => {
      if (!onPlace || e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      start.current = { mode, px: e.clientX, py: e.clientY, from: b };
      setDrag(b);
    };
  }
  function move(e: React.PointerEvent) {
    const s = start.current; if (!s) return;
    const dx = (e.clientX - s.px) / w, dy = (e.clientY - s.py) / h;
    // The grip is the bottom-right corner: the top-left stays where it was.
    setDrag(clampNoteBox(s.mode === "move" ? { ...s.from, x: s.from.x + dx, y: s.from.y + dy } : { ...s.from, w: s.from.w + dx, h: s.from.h + dy }));
  }
  function up() {
    const s = start.current; start.current = null;
    if (s && drag && onPlace) onPlace(drag);
    setDrag(null);
  }

  const pad = Math.max(4, Math.round(8 * k));
  return (
    <div data-sa-card-note="" onPointerDown={down("move")} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      title={onPlace ? "Drag to move · the corner grip resizes" : undefined}
      style={{ position: "absolute", left, top, width: bw, height: bh, zIndex: 20, touchAction: "none", userSelect: onPlace ? "none" : undefined,
        cursor: onPlace ? (drag ? "grabbing" : "grab") : undefined, ...stageStyle }}>
      <div ref={boxRef} style={{ position: "absolute", inset: 0, boxSizing: "border-box", overflow: "hidden", background: NAVY, border: `${Math.max(1.5, 2 * k)}px solid ${GOLD}`,
        borderRadius: Math.round(12 * k), padding: `${pad}px ${Math.round(pad * 1.3)}px`, boxShadow: "0 10px 30px rgba(0,0,0,0.45)", display: "flex", alignItems: "center" }}>
        <div ref={textRef} style={{ width: "100%", fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: font, lineHeight: 1.2, whiteSpace: "pre-line", overflowWrap: "break-word", color: text ? BRAND_CREAM : "rgba(244,239,230,0.45)" }}>
          {text ? renderInline(text, { bg: GOLD, color: NAVY }) : "Type the note in the Editor."}
        </div>
      </div>
      {onPlace && (
        <>
          <span aria-hidden style={{ position: "absolute", inset: -3, border: `1px dashed rgba(252,163,17,${drag ? 0.9 : 0.4})`, borderRadius: Math.round(14 * k), pointerEvents: "none" }} />
          <span role="button" aria-label="Resize the note" onPointerDown={down("size")}
            style={{ position: "absolute", right: -18, bottom: -18, width: 36, height: 36, cursor: "nwse-resize", touchAction: "none", display: "grid", placeItems: "center" }}>
            <span aria-hidden style={{ width: 14, height: 14, borderRadius: 4, background: GOLD, border: "2px solid #0B1220", boxShadow: drag ? "0 0 0 4px rgba(252,163,17,0.25)" : "none" }} />
          </span>
        </>
      )}
    </div>
  );
}
