// THE STITCH QUEUE — punch-in videos stitched in the background, one after another, while filming goes on.
// Lee, 2026-09-15: "I'd like for the stitch process to be queued in background... so like, if I begin the
// worker, it can be going in the background while I move to next topic."
//
// It lives in the FILM TAB (module scope, so it outlives the page moving from topic to topic): the takes are
// files in the recordings folder, which only this tab holds. Each job uploads its takes, wakes the worker,
// trims the pauses and joins (the same batches Preview always used), then saves the video to film_stitches.
// The Stitch Room popout watches it live over a BroadcastChannel and plays what's done. Closing the film tab
// mid-stitch stops the job — the page asks first.
import { uploadTake } from "@/components/v3/take-burn";
import { track } from "@/lib/analytics";
import { MISSING_FILM_STITCHES_HINT, videoKey, type StitchRecord } from "@/lib/film-stitch";
import { saveFilmStitch } from "@/lib/film-stitch.functions";
import { resolveWorkerRender, startDissectStitch, startWorkerRender, workerPreflight } from "@/lib/render-worker.functions";

import { chunks, STITCH_CHUNK } from "../punch-in";

export const STITCH_CHANNEL = "sa-stitch-room";
export const STITCH_ROOM_WINDOW = "sa-stitch-room";

export type SegmentState = "waiting" | "uploading" | "uploaded" | "joining" | "joined";
export interface StitchSegment { label: string; slides: number; state: SegmentState }
export type JobState = "waiting" | "uploading" | "waking" | "stitching" | "saving" | "done" | "error";

export interface StitchJob {
  key: string;
  setId: string; takeIndex: number; name: string; setName: string; topicName: string; topicKey: string | null; setKey: string | null;
  slides: number; fingerprint: string; endCta: "try" | "unlock" | null;
  state: JobState;
  note: string;
  segments: StitchSegment[];
  /** Goes up at every milestone — the popout's bolt strikes again. */
  strike: number;
  queuedAt: number; startedAt: number | null; finishedAt: number | null;
  error: string | null;
  /** The joined file, as soon as there is one (even if saving the row failed). */
  fileUrl: string | null;
  durationS: number | null;
  record: StitchRecord | null;
  /** Pauses left in (the worker couldn't trim them). */
  plainJoin: boolean;
}

export interface StitchInput {
  setId: string; takeIndex: number; name: string; setName: string; topicName: string;
  slides: number; fingerprint: string; endCta: "try" | "unlock" | null;
  /** The kept takes in order, with what each covers. */
  clips: { file: File; label: string; slides: number }[];
}

export type StitchMessage =
  | { type: "hello" }
  | { type: "state"; jobs: StitchJob[] }
  | { type: "focus"; key: string }
  | { type: "saved"; record: StitchRecord };

const jobs = new Map<string, StitchJob>();
const files = new Map<string, File[]>();
const listeners = new Set<() => void>();
/** Takes already uploaded in this tab, by file name + size → their URL. */
const uploaded = new Map<string, string>();
let running = false;
let channel: BroadcastChannel | null = null;
let snapshot: StitchJob[] = [];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function chan(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel(STITCH_CHANNEL);
    channel.onmessage = (e: MessageEvent<StitchMessage>) => { if (e.data?.type === "hello") broadcast(); };
    window.addEventListener("beforeunload", (e) => {
      if (![...jobs.values()].some((j) => j.state !== "done" && j.state !== "error")) return;
      e.preventDefault();
      e.returnValue = "A video is still stitching — leaving stops it.";
    });
  }
  return channel;
}

function broadcast() {
  snapshot = [...jobs.values()].sort((a, b) => a.queuedAt - b.queuedAt);
  chan()?.postMessage({ type: "state", jobs: snapshot } satisfies StitchMessage);
  for (const l of listeners) l();
}

function patch(key: string, p: Partial<StitchJob> | ((j: StitchJob) => Partial<StitchJob>)) {
  const j = jobs.get(key);
  if (!j) return;
  jobs.set(key, { ...j, ...(typeof p === "function" ? p(j) : p) });
  broadcast();
}

export function subscribeStitches(fn: () => void): () => void {
  chan();
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export const stitchSnapshot = (): StitchJob[] => snapshot;
export const stitchJob = (setId: string, takeIndex: number): StitchJob | undefined => jobs.get(videoKey(setId, takeIndex));

/** /v4/<topic>/<set>/… → the keys the Stitch Room links back with. */
function routeKeys(): { topicKey: string | null; setKey: string | null } {
  const m = typeof window === "undefined" ? null : /^\/v4\/([^/]+)\/([^/]+)\//.exec(window.location.pathname);
  return { topicKey: m?.[1] ?? null, setKey: m?.[2] ?? null };
}

/** QUEUE A VIDEO. The same video already waiting or stitching isn't queued twice. */
export function enqueueStitch(input: StitchInput): StitchJob {
  chan();
  const key = videoKey(input.setId, input.takeIndex);
  const cur = jobs.get(key);
  if (cur && cur.state !== "done" && cur.state !== "error") return cur;
  const job: StitchJob = {
    key, setId: input.setId, takeIndex: input.takeIndex, name: input.name, setName: input.setName, topicName: input.topicName, ...routeKeys(),
    slides: input.slides, fingerprint: input.fingerprint, endCta: input.endCta,
    state: "waiting", note: running ? "waiting for the video ahead" : "starting…",
    segments: input.clips.map((c) => ({ label: c.label, slides: c.slides, state: "waiting" })),
    strike: 0, queuedAt: Date.now(), startedAt: null, finishedAt: null, error: null, fileUrl: null, durationS: null, record: null, plainJoin: false,
  };
  jobs.set(key, job);
  files.set(key, input.clips.map((c) => c.file));
  track("stitch_started", { set_id: input.setId, video: input.takeIndex + 1, slides: input.slides, clips: input.clips.length });
  broadcast();
  void pump();
  return job;
}

/** Take a finished or failed job off the list. */
export function dismissStitch(key: string) {
  const j = jobs.get(key);
  if (!j || (j.state !== "done" && j.state !== "error")) return;
  jobs.delete(key); files.delete(key);
  broadcast();
}

async function pump() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      // in video order within a set (a #8 queued before #7 waits for it); sets in the order they were queued
      const waiting = [...jobs.values()].filter((j) => j.state === "waiting");
      const setFirst = new Map<string, number>();
      for (const j of waiting) setFirst.set(j.setId, Math.min(setFirst.get(j.setId) ?? Infinity, j.queuedAt));
      const next = waiting.sort((a, b) => (a.setId === b.setId ? a.takeIndex - b.takeIndex : setFirst.get(a.setId)! - setFirst.get(b.setId)!))[0];
      if (!next) break;
      await runJob(next.key);
    }
  } finally { running = false; }
}

async function runJob(key: string) {
  const clips = files.get(key) ?? [];
  const segs = (fn: (s: StitchSegment, i: number) => SegmentState) => (j: StitchJob) => ({ segments: j.segments.map((s, i) => ({ ...s, state: fn(s, i) })) });
  patch(key, { state: "uploading", startedAt: Date.now(), note: "uploading the takes" });
  try {
    if (!clips.length) throw new Error("No takes to stitch.");
    const urls: string[] = [];
    for (let i = 0; i < clips.length; i++) {
      const f = clips[i];
      const id = `${f.name}:${f.size}`;
      patch(key, (j) => ({ ...segs((s, k) => (k === i ? "uploading" : s.state))(j), note: `uploading take ${i + 1} of ${clips.length}` }));
      let url = uploaded.get(id);
      if (!url) { url = await uploadTake(f); uploaded.set(id, url); }
      urls.push(url);
      patch(key, (j) => ({ ...segs((s, k) => (k === i ? "uploaded" : s.state))(j), strike: j.strike + 1 }));
    }

    patch(key, { state: "waking", note: "waking the video joiner" });
    for (let tries = 0; ; tries++) {
      const h = await workerPreflight().catch((e) => ({ configured: true, healthy: false, detail: e instanceof Error ? e.message : String(e) }));
      if (!h.configured) throw new Error("The video joiner isn't set up on the site (RENDER_WORKER_URL / RENDER_WORKER_TOKEN).");
      if (h.healthy) break;
      if (tries >= 5) throw new Error(`The video joiner didn't wake up: ${h.detail}. Stitch again in a minute.`);
      await wait(5000);
    }

    let plain = false;
    const join = async (list: string[], label: string, trims?: ({ start: number; end: number } | null)[]) => {
      const job = await startDissectStitch({ data: { urls: list, gapMs: 220, vertical: true, ...(trims ? { trims } : {}) } }).catch(async (e) => {
        if (!/unknown stage/i.test(e instanceof Error ? e.message : String(e))) throw e;
        plain = true;
        return startWorkerRender({ data: { urls: list, mode: "full" } });
      });
      let misses = 0;
      for (;;) {
        await wait(3000);
        const r = await resolveWorkerRender({ data: { jobId: job.jobId, path: job.path, machineId: job.machineId } }).catch((e) => {
          if (++misses > 8) throw e;
          return { state: "rendering" as const, note: "checking again…", fileUrl: null, error: null, result: null };
        });
        if (r.state !== "rendering" || r.note !== "checking again…") misses = 0;
        if (r.state === "done" && r.fileUrl) return { fileUrl: r.fileUrl, totalS: r.result?.totalS ?? null };
        if (r.state === "error") throw new Error(r.error ?? "The joiner failed.");
        patch(key, { note: `${label} · ${r.state}${r.note && r.note !== "checking again…" ? ` · ${r.note}` : ""}` });
      }
    };

    patch(key, { state: "stitching", note: "trimming pauses and joining" });
    const batches = chunks(urls);
    let whole: { fileUrl: string; totalS: number | null };
    if (batches.length === 1) {
      patch(key, (j) => segs(() => "joining")(j));
      whole = await join(urls, "trimming pauses and joining");
    } else {
      let parts: { fileUrl: string; totalS: number | null }[] = [];
      let at = 0;
      for (let b = 0; b < batches.length; b++) {
        const from = at, to = at + batches[b].length;
        patch(key, (j) => segs((s, k) => (k >= from && k < to ? "joining" : s.state))(j));
        parts.push(await join(batches[b], `batch ${b + 1} of ${batches.length}`));
        patch(key, (j) => ({ ...segs((s, k) => (k >= from && k < to ? "joined" : s.state))(j), strike: j.strike + 1 }));
        at = to;
      }
      if (!plain && parts.some((p) => p.totalS == null)) throw new Error("A batch came back without its length, so the batches can't be joined cleanly — stitch again.");
      while (parts.length > STITCH_CHUNK) {
        const groups = chunks(parts);
        const next: typeof parts = [];
        for (let g = 0; g < groups.length; g++) next.push(await join(groups[g].map((p) => p.fileUrl), `joining batches ${g + 1} of ${groups.length}`, plain ? undefined : groups[g].map((p) => ({ start: 0, end: p.totalS! }))));
        parts = next;
      }
      whole = await join(parts.map((p) => p.fileUrl), "joining the batches", plain ? undefined : parts.map((p) => ({ start: 0, end: p.totalS! })));
    }
    patch(key, (j) => ({ ...segs(() => "joined")(j), state: "saving", note: "saving the video", fileUrl: whole.fileUrl, durationS: whole.totalS, plainJoin: plain, strike: j.strike + 1 }));

    const j = jobs.get(key)!;
    let record: StitchRecord | null = null;
    let saveError: string | null = null;
    try {
      record = await saveFilmStitch({ data: { setId: j.setId, takeIndex: j.takeIndex, name: j.name, topicKey: j.topicKey, setKey: j.setKey, setName: j.setName, topicName: j.topicName, slides: j.slides, fingerprint: j.fingerprint, sourceUrl: whole.fileUrl, durationS: whole.totalS, endCta: j.endCta } });
    } catch (e) { saveError = e instanceof Error ? e.message : String(e); }
    patch(key, { state: "done", finishedAt: Date.now(), record, note: plain ? "stitched — the pauses stayed in (the joiner needs its update)" : "stitched", error: saveError ? `Stitched, but not saved: ${saveError}${/film_stitches/.test(saveError) ? "" : ` (${MISSING_FILM_STITCHES_HINT} if the table is missing)`}` : null });
    if (record) chan()?.postMessage({ type: "saved", record } satisfies StitchMessage);
    const fin = jobs.get(key)!;
    track("stitch_done", { set_id: fin.setId, video: fin.takeIndex + 1, slides: fin.slides, clips: fin.segments.length, seconds: fin.startedAt ? Math.round((Date.now() - fin.startedAt) / 1000) : null, video_seconds: whole.totalS, saved: !!record });
  } catch (e) {
    patch(key, { state: "error", finishedAt: Date.now(), error: e instanceof Error ? e.message : String(e), note: "stopped" });
    const bad = jobs.get(key);
    track("stitch_failed", { set_id: bad?.setId, video: bad ? bad.takeIndex + 1 : null, error: (e instanceof Error ? e.message : String(e)).slice(0, 200) });
  } finally {
    files.delete(key);
  }
}

/** OPEN THE STITCH ROOM, or bring it forward on this video (no reload when it's already open). */
export function openStitchRoom(key?: string) {
  const url = `/v4/stitch-room${key ? `?v=${encodeURIComponent(key)}` : ""}`;
  let w: Window | null = null;
  try { w = window.open("", STITCH_ROOM_WINDOW, "popup,width=1180,height=900"); } catch { w = null; }
  if (!w) { window.open(url, "_blank"); return; }
  let blank = true;
  try { blank = w.location.href === "about:blank"; } catch { blank = true; }
  if (blank) w.location.href = url;
  else if (key) chan()?.postMessage({ type: "focus", key } satisfies StitchMessage);
  try { w.focus(); } catch { /* the browser decides */ }
}
