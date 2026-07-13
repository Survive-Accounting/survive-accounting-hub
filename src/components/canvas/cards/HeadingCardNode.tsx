// Heading node — big display text for sectioning the whiteboard. DM Serif
// Display (the home-page hero face), cream on navy, with a neon-gold underline
// that draws in once on spawn/deal (mount = both). A trailing "[sub]" in the
// text renders as a smaller bracketed sub-label:
//   "SURVIVE ACCOUNTING [5 types of accounts]"
// Full card contract: drag, deck membership, clone, delete, save/load.
import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Copy, Lock, LockOpen, Minus, Plus, X } from "lucide-react";

import { useCardActions } from "../BaseCard";
import { DISPLAY_FONT, NEON } from "../theme";
import type { HeadingCard } from "../types";

const UNDERLINE_CSS = `
@keyframes heading-underline-in { from { width: 0; } to { width: 100%; } }
`;

/** Split "MAIN [sub]" — sub is optional and must be the trailing bracket. */
function parseHeading(text: string): { main: string; sub: string | null } {
  const m = /^(.*?)\s*\[([^\]]+)\]\s*$/s.exec(text);
  return m ? { main: m[1], sub: m[2] } : { main: text, sub: null };
}

export function HeadingCardNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as HeadingCard;
  const { update, remove, toFront, duplicate, addToDeck, tuck } = useCardActions(id);
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(d.text);
  const arrowPending = !!(data as Record<string, unknown>)._arrowPending;

  const size = d.level === 1 ? 48 : 28;
  const { main, sub } = parseHeading(d.text);

  return (
    <div
      onPointerDownCapture={toFront}
      className="group/heading animate-in fade-in relative duration-200"
      style={{
        minWidth: 160,
        maxWidth: 720,
        padding: "4px 6px",
        borderRadius: 10,
        boxShadow: arrowPending
          ? `0 0 0 2px ${NEON.cyan}, 0 0 30px -4px ${NEON.cyan}`
          : selected
            ? "0 0 0 1.5px rgba(224,40,74,0.45)"
            : undefined,
      }}
    >
      <style>{UNDERLINE_CSS}</style>
      <Handle type="target" position={Position.Left} style={{ opacity: 0, pointerEvents: "none" }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: "none" }} />

      {/* hover chrome: deck-toggle · level · clone · × */}
      <div
        className={`card-actions absolute -top-6 right-0 z-[2] flex items-center gap-0.5 rounded-lg px-1 py-0.5 transition-opacity ${selected ? "opacity-100" : "opacity-0 group-hover/heading:opacity-100"}`}
        style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}` }}
      >
        {d.deckMember ? (
          <HBtn title="Tuck into deck (s)" onClick={tuck}><Minus className="h-3 w-3" /></HBtn>
        ) : (
          <HBtn title="Add to deck" onClick={addToDeck}><Plus className="h-3 w-3" /></HBtn>
        )}
        <button
          className="nodrag rounded px-1 text-[9px] font-black"
          style={{ color: NEON.yellow, border: "1px solid rgba(252,163,17,0.45)" }}
          title={d.level === 1 ? "Switch to H2" : "Switch to H1"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); update({ level: d.level === 1 ? 2 : 1 }); }}
        >
          H{d.level}
        </button>
        <HBtn title="Duplicate" onClick={duplicate}><Copy className="h-3 w-3" /></HBtn>
        <HBtn title={d.posLock ? "Unlock position" : "Lock in place (edits still work)"} onClick={() => update({ posLock: !d.posLock })}>
          {d.posLock ? <Lock className="h-3 w-3" style={{ color: NEON.yellow }} /> : <LockOpen className="h-3 w-3" />}
        </HBtn>
        <HBtn title="Delete" danger onClick={remove}><X className="h-3 w-3" /></HBtn>
      </div>

      {editing ? (
        <input
          autoFocus
          className="nodrag w-full min-w-[280px] rounded bg-black/30 px-1.5 py-1 outline-none"
          style={{ color: "#F4EFE6", fontFamily: DISPLAY_FONT, fontSize: Math.min(size, 32) }}
          value={local}
          placeholder="Heading [optional sub]"
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => { update({ text: local }); setEditing(false); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); update({ text: local }); setEditing(false); }
            if (e.key === "Escape") setEditing(false);
            e.stopPropagation();
          }}
        />
      ) : (
        <div
          className="cursor-text whitespace-nowrap leading-tight"
          title={d.text || "Click to edit"}
          onClick={() => { setLocal(d.text); setEditing(true); }}
        >
          <span style={{ color: d.text ? "#F4EFE6" : "rgba(147,160,180,0.6)", fontFamily: DISPLAY_FONT, fontSize: size, fontStyle: d.text ? undefined : "italic" }}>
            {main || "Heading"}
          </span>
          {sub && (
            <span style={{ color: NEON.muted, fontFamily: DISPLAY_FONT, fontSize: Math.round(size * 0.55), marginLeft: 10 }}>
              [{sub}]
            </span>
          )}
        </div>
      )}
      {/* neon underline — draws in once per mount (spawn AND deal both remount) */}
      <div
        className="mt-1 h-[3px] rounded-full"
        style={{
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
