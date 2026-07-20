// Heading — an ELEMENT (design furniture, not a card): DISPLAY_FONT (Sora), cream
// on navy, neon-gold underline draw-in. Never in the deck, no flip-help, no
// teaching settings — chrome is H-level · clone · position-lock · ×, plus
// corner resize (font scales with box height). Supports template variables
// ({first_name} …) rendered from the Preview student; a trailing "[sub]"
// renders as a smaller bracketed sub-label.
import { useRef, useState } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { Braces, Contrast, Copy, GripVertical, Keyboard, Lock, LockOpen, X } from "lucide-react";

import { useCardActions } from "../BaseCard";
import { CardPopover } from "../CardPopover";
import { ConnectionDots } from "../ConnectionDots";
import { useCanvasSettings } from "../CanvasSettingsContext";
import { useFrameNav } from "../FrameNavContext";
import { ElementResizer } from "./elements";
import { useEditSignal } from "../ui";
import { DISPLAY_FONT, NEON } from "../theme";
import { renderTokens, TokenMenu } from "../variables";
import type { HeadingCard } from "../types";

const UNDERLINE_CSS = `
/* draw-in via scaleX so the underline STAYS width:100% (tracks the resizable box)
   — animating width with fill:both froze a pixel width that ignored later resizes. */
@keyframes heading-underline-in { from { transform: scaleX(0); } to { transform: scaleX(1); } }
`;

/** TYPEWRITER (item 11) — film-mode only: the text types itself in (~600ms,
 *  stepped clip reveal) when the heading's frame is entered. Scoped under
 *  .film-mode so authoring never plays it. */
const TYPEWRITER_CSS = `
@keyframes sa-typewrite { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 -2% 0 0); } }
.film-mode .sa-typewrite { animation: sa-typewrite 1250ms steps(30, end) both; }
`;

/** Split "MAIN [sub]" — sub is optional and must be the trailing bracket. */
function parseHeading(text: string): { main: string; sub: string | null } {
  const m = /^(.*?)\s*\[([^\]]+)\]\s*$/s.exec(text);
  return m ? { main: m[1], sub: m[2] } : { main: text, sub: null };
}

export function HeadingCardNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as HeadingCard;
  const { update, remove, toFront, duplicate } = useCardActions(id);
  const ctx = useCanvasSettings();
  const rf = useReactFlow();
  const nav = useFrameNav();
  const [editing, setEditing] = useState(false);
  // TYPEWRITER (item 11): re-mount the text span when THIS heading's frame is
  // entered, so the film-mode animation replays exactly once per frame entry.
  const parentId = rf.getNode(id)?.parentId;
  const inCurrentFrame = !!parentId && nav.currentFrameId === parentId;
  const typeKey = d.typewriter && inCurrentFrame ? `tw-${nav.currentFrameId}` : "tw-static";
  const [tokenMenu, setTokenMenu] = useState<HTMLElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEditSignal((data as { _editSeq?: number })._editSeq, () => setEditing(true)); // F2 global edit (item 4)

  // QUICK RESIZE: box height drives the font (min readable size)
  const base = d.level === 1 ? 48 : 28;
  const size = d.h ? Math.max(16, Math.min(120, d.h - 22)) : base;
  const { main, sub } = parseHeading(d.text);

  return (
    <div
      onPointerDownCapture={toFront}
      className="group/el animate-in fade-in relative duration-200"
      style={{
        width: d.w ?? undefined,
        height: d.h ?? undefined,
        minWidth: 160,
        maxWidth: d.w ? undefined : 720,
        padding: "4px 6px",
        borderRadius: 10,
        boxShadow: selected ? "0 0 0 1.5px rgba(224,40,74,0.45)" : undefined,
      }}
    >
      <style>{UNDERLINE_CSS}</style>
      {d.typewriter && <style>{TYPEWRITER_CSS}</style>}
      <ConnectionDots />
      <ElementResizer id={id} selected={selected} minWidth={160} minHeight={40} />

      {/* GRAB HANDLE (L4): a bare heading is hard to grab — this hover grip is a
          clear drag affordance. It's NOT nodrag, so pointer-down on it drags the
          node (the whole padding box drags too); text edits on DOUBLE-click. */}
      <div
        className={`absolute -left-5 top-1/2 flex -translate-y-1/2 cursor-move items-center transition-opacity ${selected || d.posLock ? "opacity-70" : "opacity-0 group-hover/el:opacity-70"}`}
        title="Drag to move"
        style={{ color: NEON.muted }}
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {/* ELEMENT chrome: level · clone · lock · × — no deck, no flip, no gear */}
      <div
        className={`card-actions absolute -top-6 right-0 z-[2] flex items-center gap-0.5 rounded-lg px-1 py-0.5 transition-opacity ${selected || d.posLock ? "opacity-100" : "opacity-0 group-hover/el:opacity-100"}`}
        style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}` }}
      >
        <button
          className="nodrag rounded px-1 text-[9px] font-black"
          style={{ color: NEON.yellow, border: "1px solid rgba(252,163,17,0.45)" }}
          title={d.level === 1 ? "Switch to H2" : "Switch to H1"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); update({ level: d.level === 1 ? 2 : 1, h: undefined, w: undefined }); }}
        >
          H{d.level}
        </button>
        <HBtn title={d.scrim ? "Scrim on — dark halo for bright backgrounds (click to turn off)" : "Add a dark scrim so the title reads over bright loops"} onClick={() => update({ scrim: !d.scrim })}>
          <Contrast className="h-3 w-3" style={d.scrim ? { color: NEON.yellow } : undefined} />
        </HBtn>
        {/* TYPEWRITER (item 11): plays on frame entry in FILM mode, ~600ms */}
        <HBtn title={d.typewriter ? "Typewriter entrance on — types in when its frame is entered in film (click to turn off)" : "Typewriter entrance — the title types itself in on frame entry (film mode)"} onClick={() => update({ typewriter: !d.typewriter })}>
          <Keyboard className="h-3 w-3" style={d.typewriter ? { color: NEON.yellow } : undefined} />
        </HBtn>
        <HBtn title="Duplicate" onClick={duplicate}><Copy className="h-3 w-3" /></HBtn>
        <HBtn title={d.posLock ? "Unlock position" : "Lock in place (edits still work)"} onClick={() => update({ posLock: !d.posLock })}>
          {d.posLock ? <Lock className="h-3 w-3" style={{ color: NEON.yellow }} /> : <LockOpen className="h-3 w-3" />}
        </HBtn>
        <HBtn title="Delete" danger onClick={remove}><X className="h-3 w-3" /></HBtn>
      </div>

      {editing ? (
        <div className="relative">
          <textarea
            ref={inputRef}
            autoFocus
            rows={Math.max(1, d.text.split("\n").length)}
            className="nodrag nowheel w-full min-w-[280px] resize-none overflow-hidden rounded bg-black/30 px-1.5 py-1 pr-7 leading-tight outline-none"
            style={{ color: "#F4EFE6", fontFamily: DISPLAY_FONT, fontSize: Math.min(size, 32) }}
            defaultValue={d.text}
            placeholder="Heading [optional sub]"
            onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = `${t.scrollHeight}px`; }}
            onBlur={(e) => { if (!tokenMenu) { update({ text: e.target.value }); setEditing(false); } }}
            onKeyDown={(e) => {
              // Plain Enter commits; Shift+Enter inserts a line break (Lee's call).
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); update({ text: (e.target as HTMLTextAreaElement).value }); setEditing(false); }
              if (e.key === "Escape") setEditing(false);
              e.stopPropagation();
            }}
          />
          <button
            className="nodrag absolute right-1 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded"
            style={{ color: NEON.cyan }}
            title="Insert variable ({first_name} …)"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setTokenMenu(tokenMenu ? null : e.currentTarget); }}
          >
            <Braces className="h-3.5 w-3.5" />
          </button>
          {tokenMenu && (
            <CardPopover anchor={tokenMenu} align="right" onClose={() => setTokenMenu(null)}>
              <TokenMenu
                student={ctx.previewStudent}
                onInsert={(tok) => {
                  const inp = inputRef.current;
                  if (inp) {
                    const at = inp.selectionStart ?? inp.value.length;
                    inp.value = inp.value.slice(0, at) + tok + inp.value.slice(inp.selectionEnd ?? at);
                    inp.focus();
                  }
                  setTokenMenu(null);
                }}
              />
            </CardPopover>
          )}
        </div>
      ) : (
        <div
          key={typeKey}
          className={`relative cursor-move whitespace-pre-line leading-tight${d.typewriter ? " sa-typewrite" : ""}`}
          title={d.text ? "Double-click to edit · drag to move" : "Double-click to edit"}
          onDoubleClick={() => setEditing(true)}
        >
          {/* SCRIM (item 5): a soft dark halo BEHIND the glyphs so the title pops
              over bright loops — a blurred dark pad plus a heavy text-shadow. */}
          {d.scrim && (
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-3 -inset-y-2 -z-[1] rounded-xl"
              style={{ background: "radial-gradient(ellipse at center, rgba(6,10,20,0.72) 0%, rgba(6,10,20,0.5) 55%, transparent 100%)", filter: "blur(3px)" }}
            />
          )}
          <span style={{ color: d.text ? "#F4EFE6" : "rgba(147,160,180,0.6)", fontFamily: DISPLAY_FONT, fontSize: size, fontStyle: d.text ? undefined : "italic", textShadow: d.scrim ? "0 2px 14px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.95)" : undefined }}>
            {main ? renderTokens(main, ctx.previewStudent) : "Heading"}
          </span>
          {sub && (
            <span style={{ color: NEON.muted, fontFamily: DISPLAY_FONT, fontSize: Math.round(size * 0.55), marginLeft: 10, textShadow: d.scrim ? "0 2px 14px rgba(0,0,0,0.9)" : undefined }}>
              [{renderTokens(sub, ctx.previewStudent)}]
            </span>
          )}
        </div>
      )}
      {/* neon underline — draws in once per mount (spawn AND deal both remount) */}
      <div
        className="mt-1 h-[3px] rounded-full"
        style={{
          width: "100%", // tracks the resizable box width — shrinks with the header
          transformOrigin: "left center",
          background: `linear-gradient(90deg, ${NEON.yellow}, rgba(224,40,74,0.9))`,
          boxShadow: "0 0 10px rgba(252,163,17,0.6)",
          animation: "heading-underline-in 0.4s ease-out both",
        }}
      />
    </div>
  );
}

function HBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button
      title={title}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="nodrag grid h-5 w-5 place-items-center rounded transition-colors"
      style={{ color: NEON.muted }}
      onMouseEnter={(e) => (e.currentTarget.style.color = danger ? "#FF5C6C" : "#FCA311")}
      onMouseLeave={(e) => (e.currentTarget.style.color = NEON.muted)}
    >
      {children}
    </button>
  );
}
