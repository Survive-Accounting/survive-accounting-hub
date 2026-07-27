// Note card v2 — marker-style sticky. RICH TEXT (TipTap) loads ON FIRST EDIT: a note
// that is only DISPLAYED renders its stored HTML statically (no @tiptap), so film mode
// and un-edited notes never pay for the editor bundle. Click the body to edit — the
// heavy editor (bold/italic, lists, font steps, image paste, ProseMirror undo) mounts
// lazily and autofocuses. Static DISPLAY is byte-identical to the editor's render (same
// `.note-editor` HTML + CSS). Plain-text bodies from old scenes migrate on first edit.
import { lazy, Suspense, useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { GripHorizontal, Lock, LockOpen, Trash2 } from "lucide-react";

import { CardResizeFrame, useCardActions, useCardScale } from "../BaseCard";
import { ConnectionDots } from "../ConnectionDots";
import { MemoLightbulb } from "../MemoLightbulb";
import { NOTE_COLORS } from "../theme";
import { initialContent } from "./note-content";
import type { CardBase, NoteCard } from "../types";

const FONT_STEPS = [12, 15, 18, 22, 28];
const NoteEditor = lazy(() => import("./NoteEditor"));
const NOTE_EDITOR_CSS = `
  .note-editor p { margin: 0 0 0.2em; }
  .note-editor ul { list-style: disc; padding-left: 1.2em; margin: 0.2em 0; }
  .note-editor ol { list-style: decimal; padding-left: 1.2em; margin: 0.2em 0; }
  .note-editor img { max-width: 100%; border-radius: 6px; }
  .note-editor p.is-editor-empty:first-child::before { content: "write…"; opacity: 0.4; float: left; height: 0; pointer-events: none; }
`;

export function NoteCardNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as NoteCard;
  const { update, remove, toFront } = useCardActions(id);
  const scale = useCardScale(id, d as unknown as CardBase);
  const c = NOTE_COLORS[d.color % NOTE_COLORS.length];
  const fontSize = d.fontSize ?? 15;
  const [editing, setEditing] = useState(false);
  const html = initialContent(d);

  return (
    <div
      onPointerDownCapture={toFront}
      className="group/shell relative rounded-lg"
      style={{
        width: d.w ?? 260,
        minHeight: d.h ?? 96,
        background: c.bg,
        border: `1.5px solid ${c.border}`,
        boxShadow: selected
          ? `0 0 0 1px ${c.ink}, 0 12px 26px -12px rgba(0,0,0,0.55)`
          : "0 10px 24px -14px rgba(0,0,0,0.5)",
        color: c.ink,
        fontFamily: "'Comic Sans MS', 'Segoe Print', cursive",
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: "top left",
      }}
    >
      <ConnectionDots />
      {/* drag-resize (Item 1+2): grips scale the note (text scales); the top strip
          below stays the move surface. */}
      <CardResizeFrame scale={scale} onScale={(s) => update({ scale: s })} accent={c.ink} />

      {/* drag strip — the ONLY drag surface; also hosts colors + delete */}
      <div className="card-actions flex items-center gap-1 px-2 pt-1.5">
        <GripHorizontal className="h-3 w-3 shrink-0 opacity-40" />
        <span className="flex-1" />
        {NOTE_COLORS.map((nc, i) => (
          <button
            key={nc.name}
            className="nodrag h-3 w-3 rounded-full"
            style={{ background: nc.ink, opacity: i === d.color ? 1 : 0.35 }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => update({ color: i })}
            title={nc.name}
          />
        ))}
        {/* MEMOS ON EVERY CARD — whole-card memo (floating note + arrow) */}
        <MemoLightbulb targetId={id} handleId="r" className="nodrag ml-0.5 h-3.5 w-3.5" style={{ color: c.ink, opacity: 0.6 }} />
        <button
          className="nodrag ml-0.5"
          style={{ color: c.ink, opacity: d.posLock ? 1 : 0.45 }}
          title={d.posLock ? "Unlock position" : "Lock in place (edits still work)"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => update({ posLock: !d.posLock })}
        >
          {d.posLock ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
        </button>
        <button
          className="nodrag ml-0.5"
          style={{ color: c.ink, opacity: 0.6 }}
          title="Delete"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={remove}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {/* editor region — nodrag/nowheel; keyboard + scroll stay inside. DISPLAY is a
          static HTML render; the first click/focus mounts the lazy TipTap editor. */}
      <div
        className="nodrag nowheel px-3 pb-3 pt-1"
        style={{ fontSize, lineHeight: 1.45 }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === ">" || e.key === "<")) {
            e.preventDefault();
            const i = FONT_STEPS.indexOf(fontSize);
            const at = i === -1 ? 1 : i;
            const next = FONT_STEPS[Math.max(0, Math.min(FONT_STEPS.length - 1, at + (e.key === ">" ? 1 : -1)))];
            if (next !== fontSize) update({ fontSize: next });
          }
          if (e.key === "Escape") (e.target as HTMLElement).blur?.();
          e.stopPropagation(); // canvas hotkeys never see editor keys
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {editing ? (
          <Suspense
            fallback={
              html
                ? <div className="note-editor outline-none min-h-[48px]" dangerouslySetInnerHTML={{ __html: html }} />
                : <div className="note-editor outline-none min-h-[48px]" />
            }
          >
            <NoteEditor id={id} d={d} />
          </Suspense>
        ) : html ? (
          <div
            className="note-editor outline-none min-h-[48px] cursor-text"
            tabIndex={0}
            onFocus={() => setEditing(true)}
            onPointerDown={() => setEditing(true)}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <div
            className="note-editor outline-none min-h-[48px] cursor-text"
            tabIndex={0}
            onFocus={() => setEditing(true)}
            onPointerDown={() => setEditing(true)}
          >
            <p style={{ opacity: 0.4 }}>write…</p>
          </div>
        )}
        <style>{NOTE_EDITOR_CSS}</style>
      </div>
    </div>
  );
}
