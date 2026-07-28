// CEQ TAKES (Lee — CEQ Studio) — stage per-question raw clips (and per-set intro/
// outro + a shared transition) in the SAME durable Supabase bucket the lesson video
// slot uses (canvas-media). Metadata (url/path/duration) rides on the scene JSON
// (CeqCard.take, DeckDef.intro/outro) or panel prefs (wrap toggle + shared
// transition) — no SQL. Staging path: canvas-media/ceq-takes/raw-<uid>.<ext>.
import { supabase } from "@/integrations/supabase/client";
import { createPipelineTestStagingUpload } from "@/lib/publish.functions";
import type { TakeRef } from "./types";

export const CEQ_TAKES_FOLDER = "ceq-takes";

/** Read a video file's duration (seconds) from its metadata; 0 on failure/timeout. */
export function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    try {
      const v = document.createElement("video");
      v.preload = "metadata";
      const url = URL.createObjectURL(file);
      const done = (d: number) => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } resolve(Number.isFinite(d) && d > 0 ? d : 0); };
      v.onloadedmetadata = () => done(v.duration);
      v.onerror = () => done(0);
      v.src = url;
      window.setTimeout(() => done(0), 8000);
    } catch { resolve(0); }
  });
}

/** Upload a raw clip to the Supabase staging bucket and return a durable TakeRef
 *  (duration read at attach). Same mechanism as the lesson video slot. */
export async function stageTake(file: File): Promise<TakeRef> {
  const ext = file.name.includes(".") ? file.name.split(".").pop()! : "mp4";
  const duration = await readDuration(file);
  const { path, token, publicUrl } = await createPipelineTestStagingUpload({ data: { ext, folder: CEQ_TAKES_FOLDER } });
  const { error } = await supabase.storage.from("canvas-media").uploadToSignedUrl(path, token, file, { contentType: file.type || "video/mp4" });
  if (error) throw new Error(error.message);
  return { url: publicUrl, path, name: file.name, duration: Math.round(duration) };
}

/** Attach a fresh take to a slot, keeping exactly ONE prior version. */
export const withPrev = (fresh: TakeRef, old?: TakeRef): TakeRef =>
  old ? { ...fresh, prev: { url: old.url, path: old.path, name: old.name, duration: old.duration } } : fresh;

/** Pull a video file out of a drop event (mp4/mov/mkv/webm/m4v or a video/* type). */
export function videoFromDrop(e: React.DragEvent): File | null {
  const fs = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("video/") || /\.(mp4|mov|mkv|webm|m4v)$/i.test(f.name));
  return fs[0] ?? null;
}

export const fmtDur = (s?: number) => { const t = Math.max(0, Math.round(s ?? 0)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };

// ---- DERIVED stitch lists (never stored independently) -----------------------
export type StitchItem = { kind: "intro" | "transition" | "ceq" | "outro"; ceqId?: string; take: TakeRef; label: string };
/** FULL = intro → transition → all clip-bearing CEQs in DECK ORDER → outro.
 *  FREE = same but only free-flagged CEQs. CEQs without a clip are skipped and
 *  returned in `missing`. Order is derived from the passed ceqs (deck order) only. */
export function buildStitch(mode: "free" | "full", opts: { intro?: TakeRef; transition?: TakeRef; outro?: TakeRef; ceqs: { id: string; prompt: string; take?: TakeRef; free?: boolean }[] }): { items: StitchItem[]; missing: { id: string; prompt: string }[] } {
  const items: StitchItem[] = [];
  const missing: { id: string; prompt: string }[] = [];
  if (opts.intro) items.push({ kind: "intro", take: opts.intro, label: "Intro" });
  if (opts.transition) items.push({ kind: "transition", take: opts.transition, label: "Transition" });
  for (const c of opts.ceqs) {
    if (mode === "free" && !c.free) continue;
    if (!c.take) { missing.push({ id: c.id, prompt: c.prompt }); continue; }
    items.push({ kind: "ceq", ceqId: c.id, take: c.take, label: c.prompt });
  }
  if (opts.outro) items.push({ kind: "outro", take: opts.outro, label: "Outro" });
  return { items, missing };
}
export const stitchRuntime = (items: StitchItem[]) => items.reduce((s, it) => s + (it.take.duration ?? 0), 0);

/** Player-progress index stored with a published video: per-CEQ [start,end] on the
 *  FINAL timeline, accounting for the audio crossfade overlap (each join pulls the
 *  next clip cf earlier). Metadata only — no player work now. */
export function stitchManifest(items: StitchItem[], crossfadeMs: number): { ceqId: string; start: number; end: number }[] {
  const cf = Math.max(0, crossfadeMs) / 1000;
  const r2 = (n: number) => Math.round(n * 1000) / 1000;
  const out: { ceqId: string; start: number; end: number }[] = [];
  let cum = 0;
  items.forEach((it, i) => {
    const start = Math.max(0, cum - i * cf);
    const dur = it.take.duration ?? 0;
    if (it.kind === "ceq" && it.ceqId) out.push({ ceqId: it.ceqId, start: r2(start), end: r2(start + dur) });
    cum += dur;
  });
  return out;
}

// ---- panel prefs (localStorage; wrap toggle + the shared transition file + the
//      GLOBAL intro/outro clips). transition has always been shared (one file for
//      every set); globalIntro/globalOutro extend that to intro & outro as a FALLBACK
//      a set inherits when it has no local drop of its own (resolved = local ?? global). ----
export interface CeqStudioPrefs { wrapStems?: boolean; transition?: TakeRef; videoLibOpen?: boolean; costOn?: boolean; globalIntro?: TakeRef; globalOutro?: TakeRef; memoScope?: "question" | "set" | "all" }
const PREFS_KEY = "sa-ceq-studio-prefs";
export function loadPrefs(): CeqStudioPrefs {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") as CeqStudioPrefs; } catch { return {}; }
}
export function savePrefs(p: CeqStudioPrefs) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ } }
