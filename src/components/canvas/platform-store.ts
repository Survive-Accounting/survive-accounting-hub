// PLATFORM STORE — which vertical platform's safe-zones the 9:16 guides show,
// and whether that overlay is on. Module-level for the same reason as the
// orientation store: the studio window and the capture popout are ONE React
// tree, and the pipeline strip picker + the authoring View-menu picker must
// agree. Remembered across reloads.
import { VERTICAL_PLATFORMS, type VerticalPlatform } from "./orientation";

const PKEY = "sa-vplatform";
const GKEY = "sa-platform-guides";

const readP = (): VerticalPlatform => {
  try { const v = localStorage.getItem(PKEY); return (VERTICAL_PLATFORMS as readonly string[]).includes(v ?? "") ? (v as VerticalPlatform) : "tiktok"; } catch { return "tiktok"; }
};
const readG = (): boolean => { try { return localStorage.getItem(GKEY) === "1"; } catch { return false; } };

let curP: VerticalPlatform = typeof localStorage === "undefined" ? "tiktok" : readP();
let curG: boolean = typeof localStorage === "undefined" ? false : readG();
const pSubs = new Set<(p: VerticalPlatform) => void>();
const gSubs = new Set<(on: boolean) => void>();

export const platform = (): VerticalPlatform => curP;
export function setPlatform(p: VerticalPlatform): void {
  if (p === curP) return;
  curP = p;
  try { localStorage.setItem(PKEY, p); } catch { /* session-only */ }
  pSubs.forEach((f) => f(p));
}
export function subscribePlatform(fn: (p: VerticalPlatform) => void): () => void {
  pSubs.add(fn); fn(curP); return () => { pSubs.delete(fn); };
}

export const platformGuidesOn = (): boolean => curG;
export function setPlatformGuides(on: boolean): void {
  if (on === curG) return;
  curG = on;
  try { localStorage.setItem(GKEY, on ? "1" : "0"); } catch { /* session-only */ }
  gSubs.forEach((f) => f(on));
}
export function subscribePlatformGuides(fn: (on: boolean) => void): () => void {
  gSubs.add(fn); fn(curG); return () => { gSubs.delete(fn); };
}
