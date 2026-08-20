// CEQ TAKES (Lee — CEQ Studio) — stage per-question raw clips (and per-set intro/
// outro + a shared transition) in the SAME durable Supabase bucket the lesson video
// slot uses (canvas-media). Metadata (url/path/duration) rides on the scene JSON
// (CeqCard.take, DeckDef.intro/outro) or panel prefs (wrap toggle + shared
// transition) — no SQL. Staging path: canvas-media/ceq-takes/raw-<uid>.<ext>.
import { createPipelineTestStagingUpload } from "@/lib/publish.functions";
import type { TakeRef, TakeRole } from "./types";

export const CEQ_TAKES_FOLDER = "ceq-takes";

/** Human labels for the clip roles (Type column + the type picker). */
export const ROLE_LABEL: Record<TakeRole, string> = { hook: "Hook", explain: "Explain", echo: "Echo", frontBumper: "Front bumper", backBumper: "Back bumper" };
/** The CONTENT roles a CEQ clip can carry (picked on upload); bumpers are their own lists. */
export const CLIP_ROLES: TakeRole[] = ["hook", "explain", "echo"];
/** Auto filename for a staged clip: role + zero-padded index. Lee's scheme — front
 *  bumpers 01,02,03…; back (out) bumpers 1001,1002,1003…; content clips role-NN. */
export function autoClipName(role: TakeRole | undefined, index1: number, ext = "mp4"): string {
  if (role === "backBumper") return `back-bumper-${String(1000 + index1).padStart(4, "0")}.${ext}`;
  if (role === "frontBumper") return `front-bumper-${String(index1).padStart(2, "0")}.${ext}`;
  return `${role ?? "clip"}-${String(index1).padStart(2, "0")}.${ext}`;
}

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

/** PUT the bytes straight onto the signed Storage URL with an XHR — the one
 *  browser primitive that reports UPLOAD progress (fetch and supabase-js's
 *  uploadToSignedUrl are both fire-and-wait, which read as a hang on a 60MB+
 *  take). Same endpoint supabase-js builds internally: PUT
 *  /storage/v1/object/upload/sign/<bucket>/<path>?token=…  Resolves null on
 *  success, or the server's error message. */
export function putSignedUpload(path: string, token: string, file: File, onProgress?: (frac: number) => void): Promise<string | null> {
  const base = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/+$/, "");
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `${base}/storage/v1/object/upload/sign/canvas-media/${path}?token=${encodeURIComponent(token)}`);
    xhr.setRequestHeader("content-type", file.type || "video/mp4");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && e.total > 0) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve(null);
      let msg = `upload rejected (HTTP ${xhr.status})`;
      try { const j = JSON.parse(xhr.responseText) as { message?: string; error?: string }; msg = j.message || j.error || msg; } catch { /* non-JSON body — keep the status line */ }
      resolve(xhr.status === 413 ? `Payload too large — ${msg}` : msg);
    };
    xhr.onerror = () => resolve("network error mid-upload — the connection dropped (or the server cut a too-large body short)");
    xhr.ontimeout = () => resolve("upload timed out");
    xhr.send(file);
  });
}

/** Upload a raw clip to the Supabase staging bucket and return a durable TakeRef
 *  (duration read at attach). Same mechanism as the lesson video slot.
 *  `knownDurationS` skips the metadata re-probe (the inbox already probed at
 *  ingest — the re-read cost up to 8s on every keep); `onProgress` gets 0..1. */
export async function stageTake(file: File, opts?: { knownDurationS?: number; onProgress?: (frac: number) => void }): Promise<TakeRef> {
  const ext = file.name.includes(".") ? file.name.split(".").pop()! : "mp4";
  const duration = opts?.knownDurationS && opts.knownDurationS > 0 ? opts.knownDurationS : await readDuration(file);
  const { path, token, publicUrl } = await createPipelineTestStagingUpload({ data: { ext, folder: CEQ_TAKES_FOLDER } });
  const errMsg = await putSignedUpload(path, token, file, opts?.onProgress);
  if (errMsg) {
    // The take upload goes straight to Supabase Storage, so the only "too big"
    // error is the bucket / project upload limit — surface WHAT to do, not just
    // the raw "object exceeded the maximum allowed size".
    if (/maximum allowed size|exceeded|too large|payload/i.test(errMsg)) {
      const mb = (file.size / 1048576).toFixed(0);
      throw new Error(`Take is ${mb}MB — over the Supabase upload limit. Raise it: Storage → Settings → Upload file size limit (project), and the canvas-media bucket's file_size_limit. Then retry — the local file is untouched.`);
    }
    throw new Error(errMsg);
  }
  // 0.1s precision (was whole seconds): the preview's rendered-file seek and the
  // manifest offsets sum these — integer rounding drifted up to ±0.5s per clip.
  return { url: publicUrl, path, name: file.name, duration: Math.round(duration * 10) / 10 };
}

/** Attach a fresh take to a slot, keeping exactly ONE prior version. */
export const withPrev = (fresh: TakeRef, old?: TakeRef): TakeRef =>
  old ? { ...fresh, prev: { url: old.url, path: old.path, name: old.name, duration: old.duration } } : fresh;

/** Pull a video file out of a drop event (mp4/mov/mkv/webm/m4v or a video/* type). */
export function videoFromDrop(e: React.DragEvent): File | null {
  const fs = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("video/") || /\.(mp4|mov|mkv|webm|m4v)$/i.test(f.name));
  return fs[0] ?? null;
}
/** ALL video files from a drop (batch take ingest). */
export function videosFromDrop(e: React.DragEvent): File[] {
  return Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("video/") || /\.(mp4|mov|mkv|webm|m4v)$/i.test(f.name));
}

export const fmtDur = (s?: number) => { const t = Math.max(0, Math.round(s ?? 0)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };

// ---- DERIVED stitch lists (never stored independently) -----------------------
export type StitchItem = { kind: "intro" | "frontBumper" | "hook" | "ceq" | "wrap" | "backBumper" | "outro"; ceqId?: string; clip?: number; take: TakeRef; label: string };
/** FULL = intro → transition → all clip-bearing CEQs in DECK ORDER (each CEQ's CLIP
 *  STACK plays base→lookbacks) → WRAP clips → outro. FREE = same but only free-flagged
 *  CEQs. A CEQ with NO clips is skipped and returned in `missing`. Order is derived
 *  from the passed ceqs (deck order) only. */
export function buildStitch(mode: "free" | "full", opts: { intro?: TakeRef; hook?: TakeRef; outro?: TakeRef; wrap?: TakeRef[]; frontBumpers?: TakeRef[]; backBumpers?: TakeRef[]; ceqs: { id: string; prompt: string; take?: TakeRef; takes?: TakeRef[]; stitched?: TakeRef; free?: boolean }[] }): { items: StitchItem[]; missing: { id: string; prompt: string }[] } {
  const items: StitchItem[] = [];
  const missing: { id: string; prompt: string }[] = [];
  if (opts.intro) items.push({ kind: "intro", take: opts.intro, label: "Intro" });
  // FRONT BUMPERS (0..n) — global clips stitched right after the intro (extra hooks,
  // sponsor tags, etc). Numbered 01,02,03… in the order given.
  (opts.frontBumpers ?? []).forEach((t, i) => items.push({ kind: "frontBumper", clip: i, take: t, label: `Front bumper ${i + 1}` }));
  // SET INTRO (the filmed hook frame): boilerplate intro → THIS → the CEQ takes
  // (hard cut, no transition). Both cuts include it; absent ⇒ skipped silently.
  if (opts.hook) items.push({ kind: "hook", take: opts.hook, label: "Set intro" });
  for (const c of opts.ceqs) {
    if (mode === "free" && !c.free) continue;
    // A question's CLIP STACK plays in order (base first, then lookbacks); fall back to
    // the legacy single `take`. A question with NO clips at all is `missing`.
    // SMART STITCH: a dissected CEQ with an ingest-stitched asset plays THAT
    // one seamless file; its raw moment clips stay archived in takes[].
    const clips = c.stitched ? [c.stitched] : c.takes && c.takes.length ? c.takes : c.take ? [c.take] : [];
    if (clips.length === 0) { missing.push({ id: c.id, prompt: c.prompt }); continue; }
    clips.forEach((t, ci) => items.push({ kind: "ceq", ceqId: c.id, clip: ci, take: t, label: ci === 0 ? c.prompt : `${c.prompt} — lookback ${ci}` }));
  }
  // WRAP clips (0..n) — end-of-video lookback/summary, after the last question clip.
  (opts.wrap ?? []).forEach((t, i) => items.push({ kind: "wrap", clip: i, take: t, label: `Wrap ${i + 1}` }));
  // BACK (OUT) BUMPERS (0..n) — global clips stitched right before the outro. Numbered
  // 1001,1002,1003… (Lee's scheme) so they sort after everything else.
  (opts.backBumpers ?? []).forEach((t, i) => items.push({ kind: "backBumper", clip: i, take: t, label: `Back bumper ${i + 1}` }));
  if (opts.outro) items.push({ kind: "outro", take: opts.outro, label: "Outro" });
  return { items, missing };
}
export const stitchRuntime = (items: StitchItem[]) => items.reduce((s, it) => s + (it.take.duration ?? 0), 0);

/** Player-progress index stored with a published video: per-CEQ [start,end] on the
 *  FINAL timeline, accounting for the audio crossfade overlap (each join pulls the
 *  next clip cf earlier). Metadata only — no player work now. */
export function stitchManifest(items: StitchItem[], crossfadeMs: number): { ceqId?: string; clip?: number; kind?: "ceq" | "wrap" | "intro"; start: number; end: number }[] {
  const cf = Math.max(0, crossfadeMs) / 1000;
  const r2 = (n: number) => Math.round(n * 1000) / 1000;
  const out: { ceqId?: string; clip?: number; kind?: "ceq" | "wrap" | "intro"; start: number; end: number }[] = [];
  let cum = 0;
  items.forEach((it, i) => {
    const start = Math.max(0, cum - i * cf);
    const dur = it.take.duration ?? 0;
    // PER-CLIP entries: each CEQ clip carries its ceqId + clip index; wrap clips are
    // tagged kind:"wrap". Player/shorts consumers get layer visibility for free.
    if (it.kind === "ceq" && it.ceqId) out.push({ ceqId: it.ceqId, clip: it.clip ?? 0, kind: "ceq", start: r2(start), end: r2(start + dur) });
    else if (it.kind === "wrap") out.push({ kind: "wrap", clip: it.clip ?? 0, start: r2(start), end: r2(start + dur) });
    // The SET INTRO is tagged "intro" for players — not a ceqId entry (it isn't a
    // question), and distinct from the boilerplate intro, which stays unindexed.
    else if (it.kind === "hook") out.push({ kind: "intro", clip: 0, start: r2(start), end: r2(start + dur) });
    cum += dur;
  });
  return out;
}

// ---- panel prefs (localStorage; wrap toggle + the shared transition file + the
//      GLOBAL intro/outro clips). transition has always been shared (one file for
//      every set); globalIntro/globalOutro extend that to intro & outro as a FALLBACK
//      a set inherits when it has no local drop of its own (resolved = local ?? global). ----
export interface CeqStudioPrefs { wrapStems?: boolean; wrapMemos?: boolean; transition?: TakeRef; videoLibOpen?: boolean; costOn?: boolean; globalIntro?: TakeRef; globalOutro?: TakeRef; frontBumpers?: TakeRef[]; backBumpers?: TakeRef[]; memoScope?: "question" | "set" | "all"; setsOutline?: Record<string, boolean>; topTab?: "videos" | "topics" | "preview" | "student" | "sets" | "tools"; misconceptions?: Record<string, string>; warpIntro?: boolean }
const PREFS_KEY = "sa-ceq-studio-prefs";
export function loadPrefs(): CeqStudioPrefs {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") as CeqStudioPrefs; } catch { return {}; }
}
export function savePrefs(p: CeqStudioPrefs) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ } }
