// Inline-edit primitives for cards. Double-click any text/number to edit; whole-card edit
// mode (`editing`) forces inputs open. All inputs carry `nodrag`/`nowheel` so React Flow
// doesn't treat typing/scrolling as canvas gestures.
import { useEffect, useRef, useState } from "react";

import { parseInline } from "./variables";

/** Render `**bold**` + `~~struck~~` runs of a plain string (no tokens). */
export function renderStrike(text: string): React.ReactNode {
  const segs = parseInline(text);
  if (segs.length === 1 && !segs[0].strike && !segs[0].bold) return text;
  return segs.map((s, i) => (s.strike ? <s key={i} style={{ textDecoration: "line-through" }}>{s.t}</s> : s.bold ? <b key={i}>{s.t}</b> : <span key={i}>{s.t}</span>));
}

/** Set a field's value so React's controlled onChange fires, then dispatch input. */
function setFieldValue(el: HTMLInputElement | HTMLTextAreaElement, val: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, val); else el.value = val;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Toggle a wrapping `marker` (`**` bold / `~~` strike) around the selection (or the
 *  word under the caret) in any input/textarea. Returns true if it acted. */
export function toggleWrapInField(el: HTMLInputElement | HTMLTextAreaElement, marker: string): boolean {
  const ml = marker.length;
  const v = el.value;
  let start = el.selectionStart ?? 0;
  let end = el.selectionEnd ?? 0;
  if (start === end) {
    // no selection → wrap the word under the caret; if none, drop empty markers
    let l = start, r = start;
    while (l > 0 && /\S/.test(v[l - 1])) l--;
    while (r < v.length && /\S/.test(v[r])) r++;
    if (l === r) { setFieldValue(el, v.slice(0, start) + marker + marker + v.slice(end)); el.setSelectionRange(start + ml, start + ml); return true; }
    start = l; end = r;
  }
  const sel = v.slice(start, end);
  const wrapped = sel.startsWith(marker) && sel.endsWith(marker) && sel.length >= 2 * ml;
  const next = wrapped ? sel.slice(ml, -ml) : `${marker}${sel}${marker}`;
  setFieldValue(el, v.slice(0, start) + next + v.slice(end));
  el.setSelectionRange(start, start + next.length);
  return true;
}

/** Alt+Shift+5 (Lee): toggle `~~strike~~` around the selection. */
export const toggleStrikeInField = (el: HTMLInputElement | HTMLTextAreaElement): boolean => toggleWrapInField(el, "~~");

/** F2 GLOBAL EDIT (item 4): the route stamps a transient `_editSeq` timestamp on
 *  a node's data to say "open your inline editor now". Each editable node calls
 *  this with that value + its own open fn. Skips the mount fire so a persisted
 *  stale seq never auto-opens; fires only on a fresh change. */
export function useEditSignal(seq: number | undefined, open: () => void): void {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (seq !== undefined) open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);
}

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
  /** F2 GLOBAL EDIT (item 4): a changing openSeq opens + focuses this field ONCE,
   *  then it self-manages (blur closes) — same directive pattern as EditableNumber. */
  openSeq?: number;
}

export function EditableText({ value, onChange, editing, placeholder, className, multiline, autoFocus, openSeq }: EditableTextProps) {
  const [local, setLocal] = useState(value);
  const [open, setOpen] = useState(!!autoFocus);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => {
    if (openSeq === undefined) return;
    setOpen(true);
    let tries = 0, raf = 0;
    const grab = () => { const el = ref.current; if (el) { el.focus(); el.select(); } else if (tries++ < 10) raf = requestAnimationFrame(grab); };
    raf = requestAnimationFrame(grab);
    return () => cancelAnimationFrame(raf);
  }, [openSeq]);
  const active = editing || open;

  if (active) {
    const commit = () => { onChange(local); setOpen(false); };
    const common = {
      ref: ref as React.Ref<HTMLInputElement & HTMLTextAreaElement>,
      className: `nodrag nowheel w-full rounded bg-black/5 px-1.5 py-0.5 text-inherit outline-none ring-1 ring-[rgba(20,33,61,0.30)] focus:ring-[rgba(194,24,50,0.55)] ${className ?? ""}`,
      value: local,
      placeholder,
      autoFocus: !editing,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setLocal(e.target.value),
      onBlur: commit,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
          // LV2 item 6: SHIFT+ENTER = line break (multiline only — let the textarea
          // insert it); plain ENTER commits, consistent across every inline editor.
          if (e.shiftKey) { if (!multiline) e.preventDefault(); e.stopPropagation(); return; }
          e.preventDefault();
          commit();
        }
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
      {value ? renderStrike(value) : (placeholder || "—")}
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
  /** TAB AUTHORING (#2/#3, JE only): a changing `openSeq` opens + focuses the
   *  input once (the card's keyboard directive); onFieldTab advances focus; a
   *  GHOST balancing figure rides in dim. All optional — other callers keep
   *  click-to-edit and never pass these. */
  openSeq?: number;
  /** Called on Tab (back=Shift+Tab) inside the input. The card advances focus
   *  AND commits `commitVal` atomically (typed value, or the ghost when empty),
   *  so the commit can't race a concurrent spawn/move. */
  onFieldTab?: (back: boolean, commitVal: number | null) => void;
  /** ENTER (JT1): the card adds a block on this side and commits `commitVal`
   *  atomically. When set, Enter no longer just closes the input. */
  onEnter?: (commitVal: number | null) => void;
  /** Dim balancing suggestion shown while empty; committed if you Tab/Enter off
   *  an empty field. Typing overrides it. Never auto-commits on its own (#3). */
  ghost?: number | null;
}

export function EditableNumber({ value, onChange, editing, className, placeholder, clickToEdit, emptyClassName, emptyStyle, openSeq, onFieldTab, onEnter, ghost }: EditableNumberProps) {
  const [local, setLocal] = useState(value == null ? "" : String(value));
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setLocal(value == null ? "" : String(value)), [value]);
  const active = editing || open;
  // keyboard authoring: a new openSeq opens + focuses this field ONCE, then it
  // manages its own open state again (so blur still closes it). Retry across a
  // few frames because a just-spawned block's input mounts a tick later.
  useEffect(() => {
    if (openSeq === undefined) return;
    setOpen(true);
    let tries = 0, raf = 0;
    const grab = () => {
      const el = ref.current;
      if (el) { el.focus(); el.select(); }
      else if (tries++ < 10) raf = requestAnimationFrame(grab);
    };
    raf = requestAnimationFrame(grab);
    return () => cancelAnimationFrame(raf);
  }, [openSeq]);

  if (active) {
    const commit = () => { onChange(parseNum(local)); setOpen(false); };
    // accept the ghost when Tabbing/Entering off an empty field (never auto)
    const commitWithGhost = () => {
      if (local.trim() === "" && ghost != null) { onChange(ghost); return; }
      onChange(parseNum(local));
    };
    return (
      <input
        ref={ref}
        className={`nodrag nowheel w-full rounded bg-black/5 px-1.5 py-0.5 text-right tabular-nums text-inherit outline-none ring-1 ring-[rgba(20,33,61,0.30)] focus:ring-[rgba(194,24,50,0.55)] ${className ?? ""}`}
        value={local}
        // ghost balancing figure rides in as a dim placeholder when empty (#3)
        placeholder={local === "" && ghost != null ? fmtNum(ghost) : placeholder}
        inputMode="decimal"
        autoFocus={!editing}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Tab" && onFieldTab) {
            // hand the value to the card, which commits it ATOMICALLY with the
            // focus advance (empty + ghost → accept the ghost)
            e.preventDefault();
            const commitVal = local.trim() === "" ? (ghost ?? null) : parseNum(local);
            setOpen(false);
            onFieldTab(e.shiftKey, commitVal);
            e.stopPropagation();
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            setOpen(false);
            if (onEnter) { const commitVal = local.trim() === "" ? (ghost ?? null) : parseNum(local); onEnter(commitVal); e.stopPropagation(); return; }
            commitWithGhost();
          }
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
