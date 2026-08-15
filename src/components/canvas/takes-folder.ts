// TAKES FOLDER (T1) — the OBS recordings directory, granted once.
//
// VERIFIED available on the live origin: showDirectoryPicker ✓, removeEntry ✓,
// and FileSystemFileHandle.move ✓ — so Recycle is a TRUE MOVE, not
// copy-then-delete (no duplication, no window where the file exists twice).
//
// THE LAW: read, or move to Recycle. Never modify, never delete. Browsers
// can't reach the OS Recycle Bin, so "_trash" inside the recordings folder IS
// the bin — Lee empties it from Explorer.

import { getMeta, putMeta, type ScannedFile } from "./takes-store";

export const RECYCLE_DIR = "_trash";
const HANDLE_KEY = "takesFolderHandle";

const VIDEO_RE = /\.(mp4|mkv|mov|flv|m4v)$/i;

type DirHandle = FileSystemDirectoryHandle & {
  values?: () => AsyncIterableIterator<FileSystemHandle>;
  queryPermission?: (d: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
};
type FileHandleWithMove = FileSystemFileHandle & { move?: (dest: FileSystemDirectoryHandle | string, name?: string) => Promise<void> };

export const fsaSupported = (): boolean => typeof window !== "undefined" && typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";

/** Prompt for the recordings folder (needs a user gesture) and remember it. */
export async function pickTakesFolder(): Promise<DirHandle | null> {
  const picker = (window as unknown as { showDirectoryPicker?: (o?: { mode?: string; id?: string }) => Promise<DirHandle> }).showDirectoryPicker;
  if (!picker) return null;
  const handle = await picker({ mode: "readwrite", id: "sa-obs-takes" });
  await putMeta(HANDLE_KEY, handle);
  return handle;
}

/** The remembered folder, if permission is still (or again) granted. */
export async function savedTakesFolder(interactive = false): Promise<DirHandle | null> {
  const handle = await getMeta<DirHandle>(HANDLE_KEY);
  if (!handle) return null;
  const opts = { mode: "readwrite" as const };
  const state = (await handle.queryPermission?.(opts)) ?? "granted";
  if (state === "granted") return handle;
  if (!interactive) return null;
  const asked = (await handle.requestPermission?.(opts)) ?? "denied";
  return asked === "granted" ? handle : null;
}

/** Every video file directly in the folder (Recycle excluded). */
export async function scanFolder(dir: DirHandle): Promise<ScannedFile[]> {
  const out: ScannedFile[] = [];
  const iter = dir.values?.();
  if (!iter) return out;
  for await (const entry of iter) {
    if (entry.kind !== "file" || !VIDEO_RE.test(entry.name)) continue;
    try {
      const f = await (entry as FileSystemFileHandle).getFile();
      out.push({ name: f.name, size: f.size, lastModified: f.lastModified });
    } catch { /* locked mid-write by OBS — the next scan picks it up */ }
  }
  return out;
}

/** A local object URL for instant review — no upload, no copy. */
export async function fileUrl(dir: DirHandle, name: string): Promise<string | null> {
  try {
    const h = await dir.getFileHandle(name);
    return URL.createObjectURL(await h.getFile());
  } catch { return null; }
}

export async function getFile(dir: DirHandle, name: string): Promise<File | null> {
  try { return await (await dir.getFileHandle(name)).getFile(); } catch { return null; }
}

/** MOVE a take into Recycle. Prefers the native move(); falls back to
 *  copy-then-removeEntry so the file always survives somewhere. */
export async function moveToRecycle(dir: DirHandle, name: string): Promise<boolean> {
  try {
    const bin = await dir.getDirectoryHandle(RECYCLE_DIR, { create: true });
    const h = (await dir.getFileHandle(name)) as FileHandleWithMove;
    if (typeof h.move === "function") { await h.move(bin, name); return true; }
    const src = await h.getFile();
    const dst = await bin.getFileHandle(name, { create: true });
    const w = await dst.createWritable();
    await src.stream().pipeTo(w);
    await dir.removeEntry(name); // the copy in Recycle is safe first
    return true;
  } catch { return false; }
}

/** Restore a take out of Recycle. */
export async function restoreFromRecycle(dir: DirHandle, name: string): Promise<boolean> {
  try {
    const bin = await dir.getDirectoryHandle(RECYCLE_DIR);
    const h = (await bin.getFileHandle(name)) as FileHandleWithMove;
    if (typeof h.move === "function") { await h.move(dir as FileSystemDirectoryHandle, name); return true; }
    const src = await h.getFile();
    const dst = await dir.getFileHandle(name, { create: true });
    const w = await dst.createWritable();
    await src.stream().pipeTo(w);
    await bin.removeEntry(name);
    return true;
  } catch { return false; }
}

/** "Recycle: 14 takes · 3.2 GB" */
export async function recycleStats(dir: DirHandle): Promise<{ count: number; bytes: number }> {
  try {
    const bin = (await dir.getDirectoryHandle(RECYCLE_DIR)) as DirHandle;
    let count = 0; let bytes = 0;
    const iter = bin.values?.();
    if (!iter) return { count, bytes };
    for await (const e of iter) {
      if (e.kind !== "file") continue;
      count++;
      try { bytes += (await (e as FileSystemFileHandle).getFile()).size; } catch { /* skip */ }
    }
    return { count, bytes };
  } catch { return { count: 0, bytes: 0 }; }
}

/** Duration via a throwaway <video> — same trick the take board uses. */
export function probeDuration(file: File): Promise<number> {
  return new Promise((res) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { const d = v.duration; URL.revokeObjectURL(v.src); res(Number.isFinite(d) ? d : 0); };
    v.onerror = () => { URL.revokeObjectURL(v.src); res(0); };
    v.src = URL.createObjectURL(file);
  });
}
