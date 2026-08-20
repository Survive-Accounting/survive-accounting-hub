// PIPELINE TRANSCRIPT EDITING (Q3) — Whisper word timings drive karaoke,
// click-to-seek, and text-based cuts. The internal-cut split math is PURE and
// tested directly; transcription infra + panel are pinned.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { splitAroundCut } from "./stitch-preview";
import type { StitchItem } from "./stitch-defs";
import type { TakeRef } from "./types";

const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8").split("\r\n").join("\n");
const studio = read("CeqStudio.tsx");
const inbox = read("TakesInbox.tsx");
const detail = read("TrimDetail.tsx");
const client = read("transcript-client.ts");
const fns = read("../../lib/transcribe.functions.ts");
const sql = read("../../../migration/supabase-migrations/0118_take_transcripts.sql");

const take = (durationS: number): TakeRef => ({ url: "u", path: "p", duration: durationS });

describe("splitAroundCut — internal cut = recipe split (pure, non-destructive)", () => {
  const item: StitchItem = { takePath: "p", trimInS: 0, trimOutS: 10 };
  test("a cut inside the clip yields TWO segments around the removed span", () => {
    const parts = splitAroundCut(item, take(10), 4, 6);
    expect(parts).toEqual([
      { takePath: "p", trimInS: 0, trimOutS: 4, gapAfterMs: 0 }, // left half, seamless
      { takePath: "p", trimInS: 6, trimOutS: 10 },               // right half keeps trailing gap
    ]);
  });
  test("a cut at the head just trims the head (one segment)", () => {
    expect(splitAroundCut(item, take(10), 0, 2)).toEqual([{ takePath: "p", trimInS: 2, trimOutS: 10 }]);
  });
  test("a cut at the tail just trims the tail (one segment)", () => {
    expect(splitAroundCut(item, take(10), 8, 10)).toEqual([{ takePath: "p", trimInS: 0, trimOutS: 8, gapAfterMs: 0 }]);
  });
  test("a selection outside the clip leaves it untouched (identity)", () => {
    const parts = splitAroundCut(item, take(10), 20, 22);
    expect(parts.length).toBe(1);
    expect(parts[0]).toBe(item); // same reference — the map uses this to detect a no-op
  });
  test("a cut that would erase the whole clip leaves it be", () => {
    expect(splitAroundCut(item, take(10), 0, 10).length).toBe(1);
  });
});

describe("transcription runs on keep, in the background, toggleable", () => {
  test("a kept+uploaded take is enqueued — never blocking the film loop", () => {
    expect(inbox).toContain("enqueueTranscription(path, url, t.fileName);");
    // the CALL is AFTER the upload 'done' save, not before
    expect(inbox.indexOf("enqueueTranscription(path, url")).toBeGreaterThan(inbox.indexOf('upload: { state: "done"'));
  });
  test("a toggle (default on) governs it; the studio drains the queue on mount", () => {
    expect(inbox).toContain('localStorage.setItem("sa-transcribe-on"');
    expect(client).toContain('localStorage.getItem("sa-transcribe-on") !== "0"'); // default ON
    expect(studio).toContain("useEffect(() => { startTranscription(); }, []);");
  });
  test("the queue is never-lose: a failure keeps the item and retries", () => {
    const drain = client.slice(client.indexOf("export async function drainTranscriptions"), client.indexOf("export function startTranscription"));
    expect(drain).toContain("break;"); // a bad take stays at the head, doesn't spin
    expect(drain).toContain('q = loadQ().filter((i) => i.path !== item.path);'); // only a SUCCESS dequeues
    expect(client).toContain("if (q.some((i) => i.path === path)) return;"); // enqueue dedups
  });
});

describe("Whisper server function — word-level, not Mux", () => {
  test("verbose_json + word timestamps, keyed by storage path", () => {
    expect(fns).toContain('form.append("response_format", "verbose_json");');
    expect(fns).toContain('form.append("timestamp_granularities[]", "word");');
    expect(fns).toContain('onConflict: "take_path"');
  });
  test("it hits Whisper directly (not Mux), and it's idempotent (re-keeping never re-bills)", () => {
    expect(fns).toContain("https://api.openai.com/v1/audio/transcriptions");
    expect(fns).not.toContain("mux.server"); // no Mux API — scratch takes never go there
    // force (08-20) is the RE-RUN button's door — without it, idempotency wins
    expect(fns).toContain("if (existing.data && !data.force) return existing.data as TranscriptRow;");
  });
  test("the 25MB cap fails LOUD rather than silently truncating", () => {
    expect(fns).toContain("const MAX_BYTES = 25 * 1024 * 1024;");
    expect(fns).toContain("over Whisper's 25MB cap");
    expect(fns).toContain("process.env.OPENAI_WHISPER || process.env.OPENAI_API_KEY");
  });
  test("the store is deny-by-default, keyed by path", () => {
    expect(sql).toContain("take_path   text primary key");
    expect(sql).toContain("alter table public.take_transcripts enable row level security;");
    expect(sql).not.toContain("create policy");
  });
});

describe("the transcript panel — karaoke, click-seek, select → trim / cut", () => {
  test("it shows the SELECTED clip's transcript and karaoke-tracks playback", () => {
    expect(detail).toContain("transcriptFor(take.path)");
    expect(detail).toContain("const i = words.findIndex((w) => t >= w.s && t < w.e); setCurWord(i);");
  });
  test("clicking a word seeks the preview; shift-click extends a selection", () => {
    expect(detail).toContain("previewFrom(w.s * 1000)");
    expect(detail).toContain("if (e.shiftKey && sel) setSel({ a: sel.a, b: i });");
  });
  test("a selection can TRIM to the span or CUT it (internal cut)", () => {
    expect(detail).toContain("onClick={() => { onTrim(words[selRange.a].s, words[selRange.b].e, \"drag\"); setSel(null); }}");
    expect(detail).toContain("onClick={() => { onCut(words[selRange.a].s, words[selRange.b].e); setSel(null); }}");
  });
});

describe("big takes transcribe via the AUDIO SIDECAR (Lee, 08-20)", () => {
  test("over ~24MB the client extracts 16kHz mono WAV and hands Whisper that file", () => {
    expect(client).toContain("export async function transcribeSmart(");
    expect(client).toContain("if (size > 24 * 1024 * 1024) {");
    expect(client).toContain('await import("./transcribe-audio")');
    // the row stays keyed by the TAKE's path even when the url is the sidecar
    expect(client).toContain("const row = await transcribeTake({ data: { path, url: sendUrl,");
  });
  test("the background queue rides the same door — a 60MB blast no longer wedges it", () => {
    const drain = client.slice(client.indexOf("export async function drainTranscriptions"), client.indexOf("export function startTranscription"));
    expect(drain).toContain("await transcribeSmart(item.path, item.url, item.name);");
  });
  test("the transcript panel has a ↻ button wired through the studio's one door", () => {
    const stage = read("PipelineStage.tsx");
    expect(stage).toContain('{busy ? "transcribing…" : status === "none" ? "↻ transcribe" : "↻ re-run"}');
    expect(studio).toContain("onRetranscribe={(c) => transcribeSmart(c.path, c.url, c.name, { force: true, onNote: setNote })");
  });
  test("wavBlob packs a valid 16-bit mono PCM header", async () => {
    const { wavBlob } = await import("./transcribe-audio");
    const blob = wavBlob(new Float32Array([0, 0.5, -0.5, 1]), 16000);
    expect(blob.size).toBe(44 + 4 * 2);
    const dv = new DataView(await blob.arrayBuffer());
    expect(String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3))).toBe("RIFF");
    expect(dv.getUint16(22, true)).toBe(1);      // mono
    expect(dv.getUint32(24, true)).toBe(16000);  // sample rate
    expect(dv.getUint16(34, true)).toBe(16);     // bit depth
    expect(dv.getInt16(44 + 6, true)).toBe(0x7fff); // full-scale sample
  });
});

describe("the studio side of cuts", () => {
  test("cut selection splits the recipe and logs the span to edit-telemetry (Q3.5)", () => {
    const s0 = studio.indexOf("const splitClipAt =");
    const fn = studio.slice(s0, s0 + 1400);
    expect(fn).toContain("splitAroundCut(it, take, cutStartS, cutEndS)");
    expect(fn).toContain("persistStitch(recut(pipelineStitch, { items }));");
    expect(fn).toContain('logTrim(path, { inS: cutStartS, outS: cutEndS }, "drag", null);'); // the cut span, logged
    expect(fn).not.toContain("moveToRecycle"); // non-destructive — never a file op
  });
  test("split segments are marked, not individually draggable, still selectable", () => {
    expect(studio).toContain("const split = (pathCount.get(s.takePath) ?? 0) > 1;");
    expect(read("PipelineStage.tsx")).toContain("const canDrag = clip.frameId != null && !clip.split;");
  });
  test("detach keeps the recipe in sync — strips every item for the path", () => {
    const det = studio.slice(studio.indexOf("const detachClip ="), studio.indexOf("const clearAllClips ="));
    expect(det).toContain("const items = saved.items.filter((i) => i.takePath !== gone.path);");
  });
});
