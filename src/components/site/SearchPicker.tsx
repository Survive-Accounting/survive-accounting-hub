// ONE PICKER, USED EVERYWHERE A LIST IS CHOSEN FROM.
//
// Replaces two native <select>s on /chapters (which render as an OS dropdown — white, system font,
// nothing to do with the site) and the hand-rolled professor combobox in landing.tsx. Three
// patterns for the same job is how they drifted apart in the first place.
//
// TWO BUGS THIS FIXES BY CONSTRUCTION:
//
//   1. CROPPING. The professor popup was an absolutely-positioned child inside the player card,
//      which is `overflow-hidden rounded-2xl` — so the list was clipped at the card's edge. This
//      renders the popup in a PORTAL and positions it from the trigger's rect, so no ancestor's
//      overflow can cut it off.
//
//      (The portal is positioned, not naked. A previous portalled panel here rendered detached at
//      the viewport's top-left because it inherited no position at all; that bug is why the
//      coordinates below are computed from getBoundingClientRect and refreshed on scroll/resize.)
//
//   2. CLICK-AWAY DID NOTHING. The old popup stayed open when you clicked elsewhere, which reads
//      as broken. Dismissal is the shared useDismiss hook, so Esc and outside-press both close it.
//
// Keyboard: ArrowUp/Down move, Home/End jump, Enter picks, Escape closes. aria-activedescendant
// keeps a screen reader on the highlighted row without moving DOM focus out of the search field.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { BRAND_SANS } from "@/components/canvas/brand";
import { revealInContainer } from "@/lib/ui-scroll";
import { useDismiss } from "@/lib/use-dismiss";

export type PickerItem = {
  value: string;
  label: string;
  /** Optional right-hand detail — the course code on the school picker. */
  meta?: string;
  /** Optional leading node, e.g. a school's bolt. */
  icon?: React.ReactNode;
};

export function SearchPicker({ items, value, placeholder, searchPlaceholder, disabled, disabledHint, onPick, ariaLabel }: {
  items: PickerItem[];
  value: string | null;
  placeholder: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  /** Shown in the closed trigger when disabled — "Pick your school first". */
  disabledHint?: string;
  onPick: (value: string) => void;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; maxH: number } | null>(null);

  const panelRef = useDismiss<HTMLDivElement>(() => setOpen(false), { enabled: open });

  const needle = q.trim().toLowerCase();
  const results = useMemo(
    () => (needle ? items.filter((i) => i.label.toLowerCase().includes(needle) || (i.meta ?? "").toLowerCase().includes(needle)) : items),
    [items, needle],
  );
  const current = items.find((i) => i.value === value) ?? null;

  // Position from the trigger, and FLIP UP when there is not room below. Without this the popup
  // runs off the bottom of the screen whenever the field sits low on the page — which on a phone
  // is most of the time, because the player is near the fold.
  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const b = el.getBoundingClientRect();
    const GAP = 6, MARGIN = 12;
    const below = window.innerHeight - b.bottom - GAP - MARGIN;
    const above = b.top - GAP - MARGIN;
    // Prefer below; flip only when above genuinely has more room, so the list does not jump
    // sides for a few pixels' difference.
    const flip = below < 200 && above > below;
    const maxH = Math.max(160, Math.min(flip ? above : below, Math.round(window.innerHeight * 0.55)));
    setRect({ left: b.left, width: b.width, maxH, top: flip ? b.top - GAP - maxH : b.bottom + GAP });
  }, []);
  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [open, place]);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => { setActive((i) => Math.min(i, Math.max(0, results.length - 1))); }, [results.length]);
  useEffect(() => {
    if (!open) return;
    revealInContainer(listRef.current?.querySelector<HTMLElement>('[data-active="1"]'));
  }, [active, open]);

  const choose = (v: string) => { setOpen(false); setQ(""); onPick(v); };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(results.length - 1); }
    else if (e.key === "Enter") { const x = results[active]; if (x) { e.preventDefault(); choose(x.value); } }
  };

  const listId = `picker-${placeholder.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel ?? placeholder}
        className="flex w-full items-center justify-between gap-2 rounded-xl px-3.5 text-left text-[14.5px] font-bold outline-none transition-opacity focus-visible:ring-2 disabled:opacity-45"
        style={{
          minHeight: 52, fontFamily: BRAND_SANS,
          background: "rgba(245,239,230,0.06)",
          border: `1px solid ${open ? "var(--accent)" : "rgba(245,239,230,0.16)"}`,
          color: current ? "var(--brand-cream)" : "var(--text-muted)",
        }}
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          {current?.icon}
          <span className="truncate">{current ? current.label : (disabled && disabledHint ? disabledHint : placeholder)}</span>
        </span>
        <span aria-hidden className="shrink-0 transition-transform" style={{ color: "var(--accent)", fontSize: 12, transform: open ? "rotate(180deg)" : "none" }}>▾</span>
      </button>

      {open && rect && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[240] flex flex-col overflow-hidden rounded-xl"
          style={{
            left: rect.left, top: rect.top, width: rect.width, maxHeight: rect.maxH, fontFamily: BRAND_SANS,
            background: "var(--sa-surface-1, #1B2B4D)",
            border: "1px solid rgba(245,239,230,0.18)",
            boxShadow: "0 26px 60px -12px rgba(0,0,0,0.7)",
          }}
        >
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={results[active] ? `${listId}-${results[active].value}` : undefined}
            placeholder={searchPlaceholder ?? `Search ${items.length}…`}
            autoCorrect="off" autoCapitalize="none" spellCheck={false}
            className="w-full border-b px-3.5 outline-none"
            // 16px explicitly — under it iOS zooms the page on focus and never zooms back.
            style={{ fontSize: 16, minHeight: 48, background: "transparent", borderColor: "rgba(245,239,230,0.12)", color: "var(--brand-cream)" }}
          />
          <ul id={listId} ref={listRef} role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1">
            {results.map((it, i) => (
              <li key={it.value} role="option" id={`${listId}-${it.value}`} aria-selected={i === active} data-active={i === active ? "1" : undefined}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(it.value)}
                  className="flex w-full items-center justify-between gap-3 px-3.5 text-left"
                  style={{ minHeight: 46, color: "var(--brand-cream)", background: i === active ? "rgba(252,163,17,0.14)" : "transparent" }}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    {it.icon}
                    <span className="truncate text-[14.5px] font-bold">{it.label}</span>
                  </span>
                  {it.meta && <span className="shrink-0 text-[12px] font-bold" style={{ color: "var(--text-muted)" }}>{it.meta}</span>}
                </button>
              </li>
            ))}
            {!results.length && <li className="px-3.5 py-3 text-[13px] italic" style={{ color: "var(--text-muted)" }}>No matches.</li>}
          </ul>
        </div>,
        document.body,
      )}
    </>
  );
}
