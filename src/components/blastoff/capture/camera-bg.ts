// THE CAMERA'S BACKGROUND — Original / Blur / Remove, and what sits behind Lee when it's removed.
//
// Lee (2026-09-13): "Add camera background modes: Original / Blur / Remove … Allow me to choose the
// replacement behind it: transparent, black, or our existing Survive navy." And: "Keep the cream
// ring … I'm interested to try cream border with navy background as a default."
//
// ONE SETTING FOR THE RIG, not per slide: it describes Lee's room, not the content. It lives in
// localStorage under "sa-cam-bg", the same way the OBS chip's sa-obs-* keys do, and every window
// that mounts a camera listens for the cross-window `storage` event — so the picker in the main
// /film window changes the pop-out (the window OBS captures) with nothing else to wire. That is
// prompter-sync.ts's channel, for the same reason: two windows of one browser, no server.
//
// "TRANSPARENT" MEANS THE SLIDE SHOWS THROUGH. OBS window-captures the pop-out, and a window
// capture has no alpha — so a transparent background is whatever the phone draws behind the
// ring (black, the bolt, the banner, the blurred slide in the hero moment). Navy and black are
// painted inside the ring.
//
// THE STATUS goes the other way: the window that actually segments (the pop-out, when one is
// live) writes a small record under "sa-cam-bg-status", so the picker in the main window can say
// "live · GPU · 7 ms" or why it fell back, without Lee having to look inside the shot.
import { useEffect, useState } from "react";

export const CAM_BG_MODES = ["original", "blur", "remove"] as const;
export type CamBgMode = (typeof CAM_BG_MODES)[number];
export const CAM_BG_FILLS = ["transparent", "black", "navy"] as const;
export type CamBgFill = (typeof CAM_BG_FILLS)[number];

export interface CamBg { mode: CamBgMode; fill: CamBgFill }

export const CAM_BG_KEY = "sa-cam-bg";
export const CAM_BG_STATUS_KEY = "sa-cam-bg-status";

/** Lee's first try: removed, on Survive navy, inside the cream ring. Original is one click away. */
export const CAM_BG_DEFAULT: CamBg = { mode: "remove", fill: "navy" };

export const CAM_BG_LABEL: Record<CamBgMode, string> = { original: "Original", blur: "Blur", remove: "Remove" };
export const CAM_FILL_LABEL: Record<CamBgFill, string> = { transparent: "Transparent", black: "Black", navy: "Navy" };

/** The brand navy (styles.css --brand-navy). Straight RGB, 0–1, for the compositor. */
export const SURVIVE_NAVY = "#14213D";
export const CAM_FILL_CSS: Record<CamBgFill, string> = { transparent: "transparent", black: "#000", navy: SURVIVE_NAVY };
export const CAM_FILL_RGBA: Record<CamBgFill, readonly [number, number, number, number]> = {
  transparent: [0, 0, 0, 0],
  black: [0, 0, 0, 1],
  navy: [0x14 / 255, 0x21 / 255, 0x3d / 255, 1],
};

const isMode = (v: unknown): v is CamBgMode => typeof v === "string" && (CAM_BG_MODES as readonly string[]).includes(v);
const isFill = (v: unknown): v is CamBgFill => typeof v === "string" && (CAM_BG_FILLS as readonly string[]).includes(v);

/** Pure: whatever was stored (or nothing) → a whole setting. A bad field falls back on its own. */
export function parseCamBg(raw: string | null): CamBg {
  if (!raw) return { ...CAM_BG_DEFAULT };
  try {
    const v = JSON.parse(raw) as Partial<CamBg> | null;
    return { mode: isMode(v?.mode) ? v!.mode : CAM_BG_DEFAULT.mode, fill: isFill(v?.fill) ? v!.fill : CAM_BG_DEFAULT.fill };
  } catch { return { ...CAM_BG_DEFAULT }; }
}

export function readCamBg(): CamBg {
  try { return parseCamBg(localStorage.getItem(CAM_BG_KEY)); } catch { return { ...CAM_BG_DEFAULT }; }
}

/** False when storage is unavailable — this window still changes; the other one doesn't hear it. */
export function writeCamBg(bg: CamBg): boolean {
  try { localStorage.setItem(CAM_BG_KEY, JSON.stringify(bg)); } catch { return false; }
  // `storage` never fires in the window that wrote, so tell this window's own listeners directly.
  try { window.dispatchEvent(new CustomEvent(CAM_BG_EVENT)); } catch { /* old browser: other windows still hear it */ }
  return true;
}
const CAM_BG_EVENT = "sa-cam-bg-change";

/** The setting, live: this window's writes and every other window's. */
export function useCamBg(): [CamBg, (next: Partial<CamBg>) => void] {
  // Default on the first render (SSR has no storage), the stored value straight after.
  const [bg, setBg] = useState<CamBg>(CAM_BG_DEFAULT);
  useEffect(() => {
    const sync = () => setBg((prev) => { const next = readCamBg(); return prev.mode === next.mode && prev.fill === next.fill ? prev : next; });
    sync();
    const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === CAM_BG_KEY) sync(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CAM_BG_EVENT, sync);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(CAM_BG_EVENT, sync); };
  }, []);
  const update = (next: Partial<CamBg>) => { const merged = { ...readCamBg(), ...next }; setBg(merged); writeCamBg(merged); };
  return [bg, update];
}

// ------------------------------------------------------------------------------ the status

export type CamBgState = "off" | "loading" | "live" | "fallback";

export interface CamBgStatus {
  state: CamBgState;
  /** "GPU" | "CPU" while live. */
  delegate?: "GPU" | "CPU";
  /** Rolling average, per camera frame, from handing the frame to the worker to having it on screen. */
  ms?: number;
  /** Why it fell back to the plain camera. */
  reason?: string;
  /** True when the pop-out wrote it (the window OBS films). */
  popout?: boolean;
  at: number;
}

/** A status older than this came from a window that has since closed. */
export const CAM_BG_STATUS_STALE_MS = 6000;

export function publishCamBgStatus(s: Omit<CamBgStatus, "at">): void {
  try { localStorage.setItem(CAM_BG_STATUS_KEY, JSON.stringify({ ...s, at: Date.now() })); } catch { /* nothing reads it but the picker */ }
}

export function readCamBgStatus(now: number = Date.now()): CamBgStatus | null {
  try {
    const v = JSON.parse(localStorage.getItem(CAM_BG_STATUS_KEY) ?? "null") as CamBgStatus | null;
    if (!v || typeof v !== "object" || typeof v.at !== "number" || typeof v.state !== "string") return null;
    return Math.abs(now - v.at) > CAM_BG_STATUS_STALE_MS ? null : v;
  } catch { return null; }
}

/** The picker's side: the freshest status any window has written, polled once a second. */
export function useCamBgStatus(): CamBgStatus | null {
  const [s, setS] = useState<CamBgStatus | null>(null);
  useEffect(() => {
    const tick = () => setS(readCamBgStatus());
    tick();
    const t = window.setInterval(tick, 1000);
    window.addEventListener("storage", tick);
    return () => { window.clearInterval(t); window.removeEventListener("storage", tick); };
  }, []);
  return s;
}

export function describeCamBgStatus(s: CamBgStatus | null, bg: CamBg): string {
  if (bg.mode === "original") return "plain camera";
  if (!s) return "waiting for a live camera";
  const where = s.popout ? "pop-out" : "this window";
  switch (s.state) {
    case "loading": return `${where}: loading the model…`;
    case "live": return `${where}: live · ${s.delegate ?? "?"}${typeof s.ms === "number" ? ` · ${Math.round(s.ms)} ms` : ""}`;
    case "fallback": return `${where}: plain camera — ${s.reason ?? "segmentation unavailable"}`;
    default: return "plain camera";
  }
}

