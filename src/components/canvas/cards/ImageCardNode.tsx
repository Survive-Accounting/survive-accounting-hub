// Image — a chromeless DESIGN ELEMENT (Lee's call): a pasted/uploaded picture is
// just a draggable, resizable image you can hang a memo off — NOT a "card" with
// header/teaching chrome. Three ways in: Ctrl+V on the canvas (route spawns one
// pre-loaded), the "paste or upload" drop state here, or a direct URL in edit
// mode. Upload goes through the service-role server fn; failures render ON it.
import { useRef, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { GripVertical, ImagePlus, Link2 } from "lucide-react";

import { uploadCanvasMedia } from "@/lib/canvas.functions";
import { useCardActions } from "../BaseCard";
import { ConnectionDots } from "../ConnectionDots";
import { ElementChrome, ElementResizer } from "./elements";
import { NEON, PAPER } from "../theme";
import type { ImageCard } from "../types";

/** File/blob → data URL base64 (no prefix) for the server fn. */
export async function fileToB64(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

const OK_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
type OkType = (typeof OK_TYPES)[number];

export async function uploadImageFile(file: Blob & { type: string }): Promise<string> {
  if (!OK_TYPES.includes(file.type as OkType)) throw new Error(`unsupported image type: ${file.type || "unknown"}`);
  const b64 = await fileToB64(file);
  const { url } = await uploadCanvasMedia({ data: { b64, contentType: file.type as OkType } });
  return url;
}

export function ImageCardNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ImageCard;
  const { update, toFront } = useCardActions(id);
  const editing = !!d.editMode;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const takeFile = async (file: File | (Blob & { type: string })) => {
    setErr(null);
    setBusy(true);
    try {
      const url = await uploadImageFile(file);
      update({ url, editMode: false });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const w = d.w ?? 320;

  return (
    <div
      onPointerDownCapture={toFront}
      className="group/el animate-in fade-in relative rounded-lg duration-150"
      style={{ width: w, minHeight: d.h ?? 80 }}
    >
      {/* memo-attach handles (drag a dot → arrow/memo), element chrome + resizer */}
      <ConnectionDots color={NEON.cyan} />
      <ElementChrome id={id} posLock={d.posLock} selected={selected} />
      <ElementResizer id={id} selected={selected} minWidth={120} minHeight={80} />
      {/* GRAB HANDLE — a bare image is hard to grab; the picture itself drags too. */}
      <div
        className={`absolute -left-5 top-1/2 flex -translate-y-1/2 cursor-move items-center transition-opacity ${selected || d.posLock ? "opacity-70" : "opacity-0 group-hover/el:opacity-70"}`}
        title="Drag to move"
        style={{ color: NEON.muted }}
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {d.url ? (
        <img
          src={d.url}
          alt={d.caption || "canvas image"}
          className="block w-full rounded-lg"
          style={{ height: d.h ?? "auto", objectFit: d.fit }}
          draggable={false}
        />
      ) : (
        <div
          className="nodrag grid min-h-[100px] cursor-pointer place-items-center rounded-lg border border-dashed p-3 text-center"
          style={{ borderColor: NEON.borderSoft, color: NEON.muted }}
          onClick={() => fileRef.current?.click()}
          onPaste={(e) => {
            const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/"));
            if (f) { e.preventDefault(); void takeFile(f); }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = [...e.dataTransfer.files].find((x) => x.type.startsWith("image/"));
            if (f) void takeFile(f);
          }}
          tabIndex={0}
        >
          <div>
            <ImagePlus className="mx-auto mb-1 h-5 w-5" />
            <p className="text-[11.5px] font-medium">{busy ? "uploading…" : "paste, drop, or click to upload"}</p>
          </div>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void takeFile(f); }}
      />
      {(err || d.caption) && (
        <p className="mt-1 rounded px-2 py-0.5 text-center text-[10.5px]" style={err ? { background: "rgba(194,24,50,0.12)", color: PAPER.red } : { color: NEON.muted }}>
          {err || d.caption}
        </p>
      )}
      {editing && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px]" style={{ color: NEON.muted }}>
          <Link2 className="h-3 w-3 shrink-0" />
          <input
            className="nodrag min-w-0 flex-1 rounded bg-black/30 px-1.5 py-0.5 outline-none"
            style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }}
            defaultValue={d.url}
            placeholder="…or paste an image URL"
            onBlur={(e) => update({ url: e.target.value.trim() })}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <button
            className="nodrag rounded px-1.5 py-0.5 font-semibold"
            style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => update({ fit: d.fit === "cover" ? "contain" : "cover" })}
          >
            {d.fit}
          </button>
        </div>
      )}
    </div>
  );
}
