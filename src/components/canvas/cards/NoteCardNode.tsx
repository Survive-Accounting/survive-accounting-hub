// Note card v2 — TipTap rich text on the marker-style sticky. Bold/italic,
// bullet + numbered lists, card-level font steps (Ctrl+Shift+> / <), inline
// image paste → canvas-media. The editor region is nodrag/nowheel and owns its
// keyboard (incl. ProseMirror's own Ctrl+Z history — the canvas bus stands
// down while a contenteditable has focus); drag the card by its top strip.
// Plain-text bodies from old scenes migrate on first render.
import { useEffect, useRef } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { GripHorizontal, Trash2 } from "lucide-react";

import { useCardActions } from "../BaseCard";
import { NEON, NOTE_COLORS } from "../theme";
import { uploadImageFile } from "./ImageCardNode";
import type { NoteCard } from "../types";

const FONT_STEPS = [12, 15, 18, 22, 28];

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Old scenes stored plain text in `body`; render it as paragraphs once. */
function initialContent(d: NoteCard): string {
  if (d.bodyHtml) return d.bodyHtml;
  if (!d.body) return "";
  return d.body
    .split(/\r?\n/)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

export function NoteCardNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as NoteCard;
  const rf = useReactFlow();
  const { update, remove, toFront } = useCardActions(id);
  const c = NOTE_COLORS[d.color % NOTE_COLORS.length];
  const arrowPending = !!(data as Record<string, unknown>)._arrowPending;
  const fontSize = d.fontSize ?? 15;
  const lastHtml = useRef<string | null>(null);

  const editor = useEditor({
    extensions: [StarterKit, Image.configure({ inline: true })],
    content: initialContent(d),
    editorProps: {
      attributes: { class: "note-editor outline-none min-h-[48px]" },
      handlePaste: (_view, event) => {
        const file = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
        if (!file) return false; // plain text/HTML: let TipTap handle it
        event.preventDefault();
        void uploadImageFile(file)
          .then((url) => editor?.chain().focus().setImage({ src: url }).run())
          .catch((err) => console.warn("[note] image paste failed:", err instanceof Error ? err.message : err));
        return true;
      },
    },
    onCreate: ({ editor: ed }) => {
      // migrate legacy plain-text bodies ONCE: persist the rendered HTML so the
      // resync effect has a stable anchor (direct write — migration isn't undoable)
      if (!d.bodyHtml && d.body) {
        const html = ed.getHTML();
        lastHtml.current = html;
        rf.updateNodeData(id, { bodyHtml: html });
      }
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      lastHtml.current = html;
      // coalesceKey (same data keys) folds a typing burst into ONE canvas undo step;
      // character-level undo stays inside ProseMirror while the editor is focused.
      update({ bodyHtml: html, body: ed.getText() });
    },
  });

  // External data change (canvas Ctrl+Z after blur, scene load) → resync the editor.
  // Guard on undefined: a legacy note has no bodyHtml until onCreate migrates it —
  // syncing "" here would wipe the migrated content.
  useEffect(() => {
    if (!editor || d.bodyHtml === undefined) return;
    if (d.bodyHtml !== lastHtml.current && d.bodyHtml !== editor.getHTML()) {
      lastHtml.current = d.bodyHtml;
      editor.commands.setContent(d.bodyHtml, { emitUpdate: false });
    }
  }, [editor, d.bodyHtml]);

  return (
    <div
      onPointerDownCapture={toFront}
      className="rounded-lg"
      style={{
        width: d.w ?? 260,
        minHeight: d.h ?? 96,
        background: c.bg,
        border: `1.5px solid ${arrowPending ? NEON.cyan : c.border}`,
        boxShadow: arrowPending
          ? `0 0 0 2px ${NEON.cyan}, 0 0 24px -4px ${NEON.cyan}`
          : selected
            ? `0 0 0 1px ${c.ink}, 0 12px 26px -12px rgba(0,0,0,0.55)`
            : "0 10px 24px -14px rgba(0,0,0,0.5)",
        color: c.ink,
        fontFamily: "'Comic Sans MS', 'Segoe Print', cursive",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0, pointerEvents: "none" }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: "none" }} />

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

      {/* editor region — nodrag/nowheel; keyboard + scroll stay inside */}
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
        <EditorContent editor={editor} />
        <style>{`
          .note-editor p { margin: 0 0 0.2em; }
          .note-editor ul { list-style: disc; padding-left: 1.2em; margin: 0.2em 0; }
          .note-editor ol { list-style: decimal; padding-left: 1.2em; margin: 0.2em 0; }
          .note-editor img { max-width: 100%; border-radius: 6px; }
          .note-editor p.is-editor-empty:first-child::before { content: "write…"; opacity: 0.4; float: left; height: 0; pointer-events: none; }
        `}</style>
      </div>
    </div>
  );
}
