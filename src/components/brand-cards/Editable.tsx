// EDITABLE TEXT on a slide — click, change, done.
//
// Lee (2026-09-04): "Really make any text on these slides editable. For
// example, I want to change 'tutored by Lee Ingram' to 'Exam prep by Lee
// Ingram'. I should just be able to click and change."
//
// A brand slide draws its lines through this. With no `onEdit` it is plain
// text (the film, the canvas, the arrange preview). With one — the Review
// stage provides it — the line is contentEditable: Enter or clicking away
// commits, Escape puts the old words back. Keys never leave the field (the
// Review deck's space-walk stays out of the way), and pointer events are
// switched back on because the slide's text block is otherwise inert.
//
// Function declarations only: BoltZoom is on the canvas render path.
import type { CSSProperties, FocusEvent, KeyboardEvent, PointerEvent } from "react";

function stop(e: PointerEvent | KeyboardEvent): void { e.stopPropagation(); }

export function Editable({ value, onEdit, style, className, multiline = false, title }: {
  value: string;
  /** Commit the new text; absent = plain text. */
  onEdit?: (value: string) => void;
  style?: CSSProperties;
  className?: string;
  /** Enter inserts a line break instead of committing. */
  multiline?: boolean;
  title?: string;
}) {
  if (!onEdit) return <div style={style} className={className}>{value}</div>;
  function onKey(e: KeyboardEvent<HTMLDivElement>): void {
    stop(e);
    if (e.key === "Enter" && !multiline) { e.preventDefault(); e.currentTarget.blur(); }
    if (e.key === "Escape") { e.preventDefault(); e.currentTarget.textContent = value; e.currentTarget.blur(); }
  }
  function onBlur(e: FocusEvent<HTMLDivElement>): void {
    const next = (e.currentTarget.textContent ?? "").replace(/ /g, " ").trim();
    if (next !== value) onEdit!(next);
  }
  return (
    <div contentEditable suppressContentEditableWarning spellCheck={false} role="textbox" tabIndex={0}
      title={title ?? "Click to edit · Enter saves · Esc puts it back"}
      className={className} onPointerDown={stop} onKeyDown={onKey} onKeyUp={stop} onBlur={onBlur}
      style={{ ...style, outline: "none", cursor: "text", pointerEvents: "auto", minWidth: 8, borderRadius: 4, boxShadow: "0 0 0 1px rgba(252,163,17,0)", transition: "box-shadow 120ms" }}
      onFocus={(e) => { e.currentTarget.style.boxShadow = "0 0 0 1px rgba(252,163,17,0.7)"; }}
      onBlurCapture={(e) => { e.currentTarget.style.boxShadow = "0 0 0 1px rgba(252,163,17,0)"; }}>
      {value}
    </div>
  );
}
