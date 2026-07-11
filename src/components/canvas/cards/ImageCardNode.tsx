// Image card — pasted/uploaded picture stored in the canvas-media bucket.
// Three ways in: Ctrl+V on the canvas (route spawns one pre-loaded), the
// "paste or upload" drop state here, or a direct URL in edit mode. Upload goes
// through the service-role server fn; failures render ON the card (fail loud).
import { useRef, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { ImagePlus, Link2 } from "lucide-react";

import { uploadCanvasMedia } from "@/lib/canvas.functions";
import { BaseCard, useCardActions } from "../BaseCard";
import { EditableText } from "../ui";
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
  const { update } = useCardActions(id);
  const editing = !!d.editMode;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const takeFile = async (file: File | Blob & { type: string }) => {
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

  return (
    <BaseCard id={id} data={d} selected={selected} accent={NEON.cyan}>
      {d.url ? (
        <img
          src={d.url}
          alt={d.caption || "canvas image"}
          className="w-full rounded"
          style={{ objectFit: d.fit, maxHeight: 560 }}
          draggable={false}
        />
      ) : (
        <div
          className="nodrag grid min-h-[120px] cursor-pointer place-items-center rounded border border-dashed p-3 text-center"
          style={{ borderColor: PAPER.line, color: PAPER.inkMuted }}
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
      {err && (
        <p className="mt-1.5 rounded px-2 py-1 text-[11px]" style={{ background: "rgba(194,24,50,0.07)", color: PAPER.red, border: "1px solid rgba(194,24,50,0.3)" }}>
          {err}
        </p>
      )}
      {(d.caption || editing) && (
        <p className="mt-1.5 text-center text-[11.5px] italic" style={{ color: PAPER.inkMuted }}>
          <EditableText value={d.caption ?? ""} onChange={(v) => update({ caption: v })} editing={editing} placeholder="Caption" />
        </p>
      )}
      {editing && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px]" style={{ color: PAPER.inkMuted }}>
          <Link2 className="h-3 w-3 shrink-0" />
          <input
            className="nodrag min-w-0 flex-1 rounded bg-black/5 px-1.5 py-0.5 outline-none ring-1 ring-[rgba(20,33,61,0.30)]"
            defaultValue={d.url}
            placeholder="…or paste an image URL"
            onBlur={(e) => update({ url: e.target.value.trim() })}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <button
            className="nodrag rounded px-1.5 py-0.5 font-semibold"
            style={{ color: PAPER.navy, border: "1px solid rgba(20,33,61,0.35)" }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => update({ fit: d.fit === "cover" ? "contain" : "cover" })}
          >
            {d.fit}
          </button>
        </div>
      )}
    </BaseCard>
  );
}
