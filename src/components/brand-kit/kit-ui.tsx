// The small controls the brand-kit editors share — chips, labelled fields, the campus picker, the
// export button that says what happened, and reading a picked picture into the art.
import { useState, type CSSProperties, type ReactNode } from "react";

import { V3_CREAM, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { NEUTRAL_COLORWAY_ID } from "@/lib/brand-kit/tokens";
import type { KitImage } from "@/lib/brand-kit/thumbnail";
import { orderedSchoolsForPicker } from "@/lib/schools";

export const MINT = "#3BF5A0";
export const BAD = "#FF8B7E";

export const small: CSSProperties = { font: "inherit", fontSize: 11.5, fontWeight: 700, padding: "5px 11px", borderRadius: 8, border: `1px solid ${V3_EDGE}`, background: "transparent", color: V3_CREAM, cursor: "pointer", whiteSpace: "nowrap" };
export const primary: CSSProperties = { ...small, fontSize: 12.5, padding: "7px 14px", border: `1.5px solid ${V3_GOLD}`, background: "rgba(252,163,17,0.12)" };
export const input: CSSProperties = { width: "100%", boxSizing: "border-box", font: "inherit", fontSize: 13, lineHeight: 1.45, padding: "6px 9px", borderRadius: 8, border: `1px solid ${V3_EDGE}`, background: "rgba(244,239,230,0.05)", color: V3_CREAM, outline: "none" };

export function Chip({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button type="button" onClick={onClick} title={title}
      style={{ ...small, borderColor: on ? `${V3_GOLD}aa` : V3_EDGE, color: on ? V3_GOLD : V3_MUTED, background: on ? "rgba(252,163,17,0.10)" : "transparent" }}>
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: V3_GOLD }}>{label}</div>
      <div style={{ marginTop: 6 }}>{children}</div>
      {hint && <div style={{ marginTop: 5, fontSize: 11, color: V3_MUTED, lineHeight: 1.45 }}>{hint}</div>}
    </div>
  );
}

/** A download that reports: busy while it renders, then the file's size, or exactly why it failed. */
export function ExportButton({ label, run, blocked, strong = false }: { label: string; run: () => Promise<unknown>; blocked?: string | null; strong?: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [note, setNote] = useState<string | null>(null);
  const go = async () => {
    setState("busy"); setNote(null);
    try {
      const out = await run();
      setState("done");
      setNote(out instanceof Blob ? `saved · ${Math.max(1, Math.round(out.size / 1024))} KB` : "saved");
    } catch (e) {
      setState("error");
      setNote(e instanceof Error ? e.message : String(e));
    }
  };
  const base = strong ? primary : small;
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}>
      <button type="button" onClick={() => void go()} disabled={!!blocked || state === "busy"} title={blocked ?? undefined}
        style={{ ...base, opacity: blocked || state === "busy" ? 0.5 : 1, cursor: blocked ? "not-allowed" : "pointer" }}>
        {state === "busy" ? "Rendering…" : label}
      </button>
      {blocked && <span style={{ fontSize: 10.5, color: V3_MUTED }}>{blocked}</span>}
      {!blocked && note && <span style={{ fontSize: 10.5, color: state === "error" ? BAD : MINT, maxWidth: 260 }}>{note}</span>}
    </span>
  );
}

/** "Survive" (no campus) plus every school in the picker's own order. */
export function CampusSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...input, width: "auto", colorScheme: "dark", padding: "5px 8px" }}>
      <option value={NEUTRAL_COLORWAY_ID}>Survive (no campus)</option>
      {orderedSchoolsForPicker().map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
}

export function imageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = () => reject(new Error("That picture wouldn't load."));
    im.src = src;
  });
}

export async function fileToKitImage(f: File): Promise<KitImage> {
  if (!f.type.startsWith("image/")) throw new Error("That isn't a picture.");
  const src = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error ?? new Error("Couldn't read the file."));
    fr.readAsDataURL(f);
  });
  return { src, ...(await imageSize(src)) };
}
