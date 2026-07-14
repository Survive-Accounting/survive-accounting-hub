// Inline-edit primitives for cards. Double-click any text/number to edit; whole-card edit
// mode (`editing`) forces inputs open. All inputs carry `nodrag`/`nowheel` so React Flow
// doesn't treat typing/scrolling as canvas gestures.
import { useEffect, useRef, useState } from "react";

export function fmtNum(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function parseNum(s: string): number | null {
  const cleaned = s.replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

interface EditableTextProps {
  value: string;
  onChange: (v: string) => void;
  editing?: boolean; // whole-card edit mode forces open
  placeholder?: string;
  className?: string;
  multiline?: boolean;
  autoFocus?: boolean;
}

export function EditableText({ value, onChange, editing, placeholder, className, multiline, autoFocus }: EditableTextProps) {
  const [local, setLocal] = useState(value);
  const [open, setOpen] = useState(!!autoFocus);
  useEffect(() => setLocal(value), [value]);
  const active = editing || open;

  if (active) {
    const commit = () => { onChange(local); setOpen(false); };
    const common = {
      className: `nodrag nowheel w-full rounded bg-black/5 px-1.5 py-0.5 text-inherit outline-none ring-1 ring-[rgba(20,33,61,0.30)] focus:ring-[rgba(194,24,50,0.55)] ${className ?? ""}`,
      value: local,
      placeholder,
      autoFocus: !editing,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setLocal(e.target.value),
      onBlur: commit,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !multiline) { e.preventDefault(); commit(); }
        if (e.key === "Escape") { setLocal(value); setOpen(false); }
        e.stopPropagation(); // don't trigger canvas hotkeys while typing
      },
    };
    return multiline ? <textarea rows={3} {...common} /> : <input {...common} />;
  }
  return (
    <span
      onDoubleClick={(e) => { e.stopPropagation(); setOpen(true); }}
      className={`cursor-text ${!value ? "italic opacity-40" : ""} ${className ?? ""}`}
    >
      {value || placeholder || "—"}
    </span>
  );
}

interface EditableNumberProps {
  value: number | null;
  onChange: (v: number | null) => void;
  editing?: boolean;
  className?: string;
  placeholder?: string;
  /** ONE click opens entry (JE amounts: ??? is a button, not a label). Default
   *  stays double-click so table cells don't open while selecting cards. */
  clickToEdit?: boolean;
  /** Fillability styling for the EMPTY display state only (JE amount ??? →
   *  amber dashed affordance). Replaces the default dim-opacity; ignored while
   *  editing. Other callers leave these unset for the plain look. */
  emptyClassName?: string;
  emptyStyle?: React.CSSProperties;
}

export function EditableNumber({ value, onChange, editing, className, placeholder, clickToEdit, emptyClassName, emptyStyle }: EditableNumberProps) {
  const [local, setLocal] = useState(value == null ? "" : String(value));
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setLocal(value == null ? "" : String(value)), [value]);
  const active = editing || open;

  if (active) {
    const commit = () => { onChange(parseNum(local)); setOpen(false); };
    return (
      <input
        ref={ref}
        className={`nodrag nowheel w-full rounded bg-black/5 px-1.5 py-0.5 text-right tabular-nums text-inherit outline-none ring-1 ring-[rgba(20,33,61,0.30)] focus:ring-[rgba(194,24,50,0.55)] ${className ?? ""}`}
        value={local}
        placeholder={placeholder}
        inputMode="decimal"
        autoFocus={!editing}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { setLocal(value == null ? "" : String(value)); setOpen(false); }
          e.stopPropagation();
        }}
      />
    );
  }
  const isEmpty = value == null;
  // empty + custom fillability style → use it (no dimming); else the old dim.
  const emptyLook = isEmpty && emptyClassName ? emptyClassName : isEmpty ? (clickToEdit ? "opacity-50" : "opacity-30") : "";
  return (
    <span
      onDoubleClick={(e) => { e.stopPropagation(); setOpen(true); }}
      onClick={clickToEdit ? (e) => { e.stopPropagation(); setOpen(true); } : undefined}
      title={clickToEdit && isEmpty ? "Click to set the amount" : undefined}
      className={`cursor-text tabular-nums ${emptyLook} ${className ?? ""}`}
      style={isEmpty && emptyClassName ? emptyStyle : undefined}
    >
      {isEmpty ? (placeholder ?? "—") : fmtNum(value)}
    </span>
  );
}
