// THE PERSON CUT-OUT — MediaPipe finds Lee in the webcam frame; the GPU draws him over the chosen
// background; the finished frame lands in a canvas laid exactly over the ring's <video>.
//
// WHY THIS SHAPE (2026-09-13). Lee: "Use a reliable browser-side person/selfie segmentation library
// such as MediaPipe rather than attempting custom image segmentation … Performance needs to be good
// enough for real-time recording … Prefer GPU/WebGL/WebGPU acceleration where supported … Gracefully
// fall back to the normal camera." Every number below was measured on Lee's laptop (Radeon 780M).
//
//   the model     MediaPipe Tasks' selfie MULTICLASS model (hair / body skin / face skin / clothes /
//                 accessories / background). "Lee" is everything that is not background, so hair and
//                 glasses count as him rather than being guessed at. GPU delegate only: the CPU build
//                 measured ~360 ms a frame, which is not a camera. Loaded on first use — Original never
//                 downloads a byte of it.
//   the worker    MediaPipe blocks the thread it runs on ~11 ms a frame; on the pop-out's main thread
//                 that would stutter the slide's own animations in a 60 fps take. So the model and the
//                 compositor live in camera-bg.worker.ts; this side sends a VideoFrame and receives an
//                 ImageBitmap, both transferred, ~1 ms of main-thread time.
//   the mask      never read back to JS (that alone was ~17 ms): the compositor (cutout-gpu.ts) runs in
//                 MediaPipe's own WebGL2 context and samples the mask where it already is.
//   the frame     requestVideoFrameCallback — one frame per real camera frame, and never a second
//                 while the worker is still busy with the first (a busy worker drops, never queues).
//
// FALLBACK is always the plain <video> that was already there: no Worker / OffscreenCanvas / WebGL2,
// the model won't load, the GPU context is lost, an exception mid-frame, or frames too slow to record.
// Nothing is drawn in the shot to say so — the status goes to the picker (camera-bg.ts).
import { useEffect, useRef, useState } from "react";

import { CAM_FILL_RGBA, publishCamBgStatus, type CamBg, type CamBgState, type CamBgStatus } from "./camera-bg";
import type { CutoutReply, CutoutRequest } from "./camera-bg.worker";
import { isPopoutSearch } from "./popout";
import { POPOUT_STALE_MS, readFilmActive } from "./prompter-sync";

/** MUST match the installed @mediapipe/tasks-vision exactly — the JS and its .wasm are one build. */
export const MEDIAPIPE_VERSION = "1.0.1";
export const MEDIAPIPE_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
export const SEGMENTER_MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite";

/** Rolling frame cost above this for SLOW_WINDOW_MS is too slow to film (30 fps is 33 ms). */
const SLOW_MS = 40;
const SLOW_WINDOW_MS = 3000;
/** The first frames carry shader compiles and the model's warm-up; they don't count. */
const WARMUP_FRAMES = 15;

// ------------------------------------------------------------------------------ the worker

/** Returns true when the message was this listener's (its frame id); a frame nobody claims is closed
 *  by the engine, so a listener never touches another camera's bitmap. */
type Listener = (msg: CutoutReply) => boolean | void;

interface CutoutEngine {
  send: (msg: CutoutRequest, transfer?: Transferable[]) => void;
  listen: (fn: Listener) => () => void;
}

let enginePromise: Promise<CutoutEngine> | null = null;

/** Vite bundles the worker from this exact expression — keep it literal. */
function spawnWorker(): Worker {
  return new Worker(new URL("./camera-bg.worker.ts", import.meta.url), { type: "module" });
}

/** One worker (one model, one GPU context) per window, started on first use and kept — a remounted
 *  camera reuses it. A failure throws it away, so the next attempt starts clean. */
export function loadCutoutEngine(): Promise<CutoutEngine> {
  if (!enginePromise) {
    enginePromise = new Promise<CutoutEngine>((resolve, reject) => {
      if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") { reject(new Error("this browser can't run it off the main thread")); return; }
      let worker: Worker;
      try { worker = spawnWorker(); } catch (e) { reject(e instanceof Error ? e : new Error(String(e))); return; }
      const listeners = new Set<Listener>();
      let ready = false;
      const discard = () => { worker.terminate(); enginePromise = null; };
      worker.onmessage = (e: MessageEvent<CutoutReply>) => {
        const msg = e.data;
        if (!ready) {
          if (msg.type === "ready") {
            ready = true;
            resolve({
              send: (m, transfer = []) => worker.postMessage(m, transfer),
              listen: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
            });
          } else if (msg.type === "error") { discard(); reject(new Error(msg.message)); }
          return;
        }
        if (msg.type === "error" && msg.fatal) discard();
        let claimed = false;
        [...listeners].forEach((fn) => { if (fn(msg) === true) claimed = true; });
        if (msg.type === "frame" && !claimed) msg.bitmap.close();
      };
      worker.onerror = (e) => {
        const message = e.message || "the worker crashed";
        discard();
        if (!ready) reject(new Error(message));
        else listeners.forEach((fn) => fn({ type: "error", message, fatal: true }));
      };
      worker.postMessage({ type: "init", wasm: MEDIAPIPE_WASM, model: SEGMENTER_MODEL } satisfies CutoutRequest);
    });
  }
  return enginePromise;
}

/** The camera's current frame, as something transferable. VideoFrame is a GPU-backed handle (no
 *  copy); createImageBitmap is the fallback where VideoFrame is missing. */
async function grabFrame(video: HTMLVideoElement): Promise<VideoFrame | ImageBitmap> {
  if (typeof VideoFrame !== "undefined") return new VideoFrame(video);
  return createImageBitmap(video);
}

// ------------------------------------------------------------------------------ which window

/** Does THIS window do the cutting? The pop-out always does — it is the shot. The main /film window
 *  does only while no pop-out is live (rehearsing without one), so two windows never run the model
 *  at once. Polled, because the pop-out's heartbeat is how "live" is known (prompter-sync.ts). */
export function useSegmentHere(live: boolean): boolean {
  const popout = typeof window !== "undefined" && isPopoutSearch(window.location.search);
  const [popoutLive, setPopoutLive] = useState(false);
  useEffect(() => {
    if (!live || popout) return;
    const tick = () => {
      const rec = readFilmActive();
      setPopoutLive(!!rec?.popout && Math.abs(Date.now() - rec.at) <= POPOUT_STALE_MS);
    };
    tick();
    const t = window.setInterval(tick, 2000);
    return () => window.clearInterval(t);
  }, [live, popout]);
  return live && (popout || !popoutLive);
}

// ------------------------------------------------------------------------------ the hook

/** Runs the cut-out from `videoRef` into `canvasRef` while `enabled` and the mode isn't Original.
 *  `active` is true once the canvas holds a finished frame — until then (and after any fallback)
 *  the caller keeps showing the plain video. */
export function useCameraBackground({ videoRef, canvasRef, bg, enabled, videoReady }: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  bg: CamBg;
  enabled: boolean;
  videoReady: boolean;
}): { active: boolean; state: CamBgState } {
  const [active, setActive] = useState(false);
  const [state, setState] = useState<CamBgState>("off");
  const bgRef = useRef(bg);
  bgRef.current = bg;
  const wanted = enabled && videoReady && bg.mode !== "original";

  useEffect(() => {
    if (!wanted) { setActive(false); setState("off"); return; }
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas) return;
    const popout = isPopoutSearch(window.location.search);
    const publish = (s: Omit<CamBgStatus, "at" | "popout">) => publishCamBgStatus({ ...s, popout });

    let stopped = false;
    let frameHandle = 0;
    let usedVfc = false;
    let unlisten = () => {};
    const fail = (reason: string) => {
      if (stopped) return;
      stopped = true;
      unlisten();
      console.warn(`[camera-bg] falling back to the plain camera: ${reason}`);
      setActive(false);
      setState("fallback");
      publish({ state: "fallback", reason });
    };

    setState("loading");
    publish({ state: "loading" });

    (async () => {
      const out = canvas.getContext("bitmaprenderer");
      if (!out) return fail("this browser can't present GPU frames (bitmaprenderer)");
      let engine: CutoutEngine;
      try { engine = await loadCutoutEngine(); }
      catch (e) { return fail(`the model didn't load (${e instanceof Error ? e.message : String(e)})`); }
      if (stopped) return;

      // Ids are per window, so a frame that comes back after this effect was torn down (and another
      // started) is recognised as someone else's and dropped.
      // Each id's send time: the cost that counts is send → on screen, which includes the GPU queue and
      // everything else competing for it (OBS's encoder among them), not just the worker's own time.
      const sentAt = new Map<number, number>();
      let busy = false, frames = 0, ema = 0, slowSince = 0, lastPublish = 0, shown = false;

      unlisten = engine.listen((msg) => {
        if (msg.type === "error") { fail(msg.message); return; }
        if (msg.type !== "frame" && msg.type !== "skip") return;
        const sent = sentAt.get(msg.id);
        if (sent === undefined) return;
        sentAt.delete(msg.id);
        busy = false;
        if (msg.type === "skip") return true;
        if (stopped) return;
        // A bitmaprenderer canvas scales the bitmap to its OWN size, so it must be the frame's for the
        // CSS cover crop to match the video's.
        if (canvas.width !== msg.bitmap.width || canvas.height !== msg.bitmap.height) { canvas.width = msg.bitmap.width; canvas.height = msg.bitmap.height; }
        out.transferFromImageBitmap(msg.bitmap);
        const now = performance.now();
        frames++;
        if (frames > WARMUP_FRAMES) {
          const dt = now - sent;
          ema = ema ? ema * 0.9 + dt * 0.1 : dt;
          if (ema > SLOW_MS) { slowSince ||= now; if (now - slowSince > SLOW_WINDOW_MS) { fail(`too slow to record (${Math.round(ema)} ms a frame)`); return true; } }
          else slowSince = 0;
        }
        if (!shown) { shown = true; setActive(true); setState("live"); }
        if (now - lastPublish > 2000) { lastPublish = now; publish({ state: "live", delegate: "GPU", ...(frames > WARMUP_FRAMES ? { ms: ema } : {}) }); }
        return true;
      });

      const step = async () => {
        if (stopped) return;
        schedule();
        if (busy || video.readyState < 2 || !video.videoWidth) return;
        busy = true;
        let frame: VideoFrame | ImageBitmap;
        try { frame = await grabFrame(video); }
        catch { busy = false; return; }   // no frame to grab this tick (a seek, a device change)
        if (stopped) { frame.close(); return; }
        const id = nextFrameId++;
        sentAt.set(id, performance.now());
        const b = bgRef.current;
        engine.send({ type: "frame", id, frame, mode: b.mode === "blur" ? 1 : 2, fill: CAM_FILL_RGBA[b.fill] }, [frame]);
      };
      const schedule = () => {
        if (stopped) return;
        if (typeof video.requestVideoFrameCallback === "function") { usedVfc = true; frameHandle = video.requestVideoFrameCallback(() => void step()); }
        else frameHandle = requestAnimationFrame(() => void step());
      };
      schedule();
    })();

    return () => {
      stopped = true;
      unlisten();
      if (usedVfc) video.cancelVideoFrameCallback?.(frameHandle); else cancelAnimationFrame(frameHandle);
      setActive(false);
    };
    // bg is read through bgRef: switching Blur ↔ Remove or the fill never restarts anything.
  }, [wanted, videoRef, canvasRef]);

  return { active, state };
}

let nextFrameId = 1;

