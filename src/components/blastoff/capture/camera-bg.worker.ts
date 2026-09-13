// THE CUT-OUT WORKER — MediaPipe and the compositor, off the main thread.
//
// Measured on Lee's laptop (Radeon 780M, 2026-09-13): MediaPipe's segment call blocks whatever thread
// it runs on for ~11 ms a frame while the GPU catches up. On the /film pop-out's main thread that is a
// third of every camera frame — the bolt, the ticker and the cold open would stutter in a 60 fps OBS
// take. Here it blocks only this worker; the page hands over a VideoFrame and gets a finished
// ImageBitmap back (both transferred, never copied).
//
// One per window (segmentation.ts owns it). Messages:
//   in   { type: "init", wasm, model }                                  → "ready" | "error"
//   in   { type: "frame", id, frame, mode, fill }  (frame transferred)  → "frame" { id, bitmap, ms } | "error"
import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";

import { CutoutCompositor, type CutoutMode, type Rgba } from "./cutout-gpu";

export type CutoutRequest =
  | { type: "init"; wasm: string; model: string }
  | { type: "frame"; id: number; frame: VideoFrame | ImageBitmap; mode: CutoutMode; fill: Rgba };

export type CutoutReply =
  | { type: "ready" }
  | { type: "frame"; id: number; bitmap: ImageBitmap; ms: number }
  | { type: "skip"; id: number }
  | { type: "error"; message: string; fatal: boolean };

const post = (msg: CutoutReply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);

let segmenter: ImageSegmenter | null = null;
let compositor: CutoutCompositor | null = null;
let canvas: OffscreenCanvas | null = null;
let lastTimestamp = -1;
let dead = false;

async function init(wasm: string, model: string): Promise<void> {
  if (typeof OffscreenCanvas === "undefined") throw new Error("OffscreenCanvas isn't available");
  canvas = new OffscreenCanvas(1, 1);
  canvas.addEventListener("contextlost", () => { dead = true; post({ type: "error", message: "the GPU context was lost", fatal: true }); });
  // `true`: this is a module worker, so MediaPipe loads its ES-module Wasm build (no importScripts).
  const fileset = await FilesetResolver.forVisionTasks(wasm, true);
  segmenter = await ImageSegmenter.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: model, delegate: "GPU" },
    canvas,
    runningMode: "VIDEO",
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  });
  const gl = canvas.getContext("webgl2") as WebGL2RenderingContext | null;
  if (!gl) throw new Error("WebGL2 isn't available");
  compositor = CutoutCompositor.create(gl);
  if (!compositor) throw new Error("this GPU can't run the compositor");
}

function frame(id: number, src: VideoFrame | ImageBitmap, mode: CutoutMode, fill: Rgba): void {
  try {
    if (dead || !segmenter || !compositor || !canvas) { post({ type: "skip", id }); return; }
    const t0 = performance.now();
    const ts = Math.max(Math.round(t0), lastTimestamp + 1);
    lastTimestamp = ts;
    let drew = false;
    segmenter.segmentForVideo(src, ts, (result) => {
      const mask = result.confidenceMasks?.[0];
      if (!mask) return;
      compositor!.draw(src, mask, mode, fill);
      drew = true;
    });
    if (!drew) { post({ type: "skip", id }); return; }
    const bitmap = canvas.transferToImageBitmap();
    post({ type: "frame", id, bitmap, ms: performance.now() - t0 }, [bitmap]);
  } catch (e) {
    post({ type: "error", message: `a frame failed (${e instanceof Error ? e.message : String(e)})`, fatal: true });
  } finally {
    src.close();
  }
}

self.onmessage = (e: MessageEvent<CutoutRequest>) => {
  const msg = e.data;
  if (msg.type === "init") {
    init(msg.wasm, msg.model).then(
      () => post({ type: "ready" }),
      (err) => post({ type: "error", message: err instanceof Error ? err.message : String(err), fatal: true }),
    );
  } else if (msg.type === "frame") {
    frame(msg.id, msg.frame, msg.mode, msg.fill);
  }
};

