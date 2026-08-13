// NOTE EDITOR (lazy) — the heavy TipTap rich-text editor for a note card, split out
// of the canvas chunk and loaded ON FIRST EDIT (React.lazy in NoteCardNode). Because
// @tiptap is imported ONLY here, it lands in its own async chunk and never ships with
// the canvas bundle — a note that is only DISPLAYED (film mode, un-edited notes) never
// pays for it. Behaviour is identical to the previous inline editor; it just mounts
// on demand and autofocuses so the click that opened it lands the cursor.
import { useEffect, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";

import { useCardActions } from "../BaseCard";
import { uploadImageFile } from "./ImageCardNode";
import { initialContent } from "./note-content";
import type { NoteCard } from "../types";

export default function NoteEditor({ id, d }: { id: string; d: NoteCard }) {
  const rf = useReactFlow();
  const { update } = useCardActions(id);
  const lastHtml = useRef<string | null>(null);

  const editor = useEditor({
    extensions: [StarterKit, Image.configure({ inline: true })],
    content: initialContent(d),
    autofocus: "end",
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

  return <EditorContent editor={editor} />;
}
