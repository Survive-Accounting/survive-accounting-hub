// TAKES STORE (T1/T2) — the take records: what OBS produced, what Lee decided,
// where it belongs, and how far the upload got.
//
// IndexedDB, not localStorage: a session's records outlive a tab, and the
// folder handle (takes-folder.ts) must live here anyway — handles are
// structured-cloneable but NOT serializable to localStorage.
//
// LAW: local files are only ever READ or MOVED to Recycle. This store never
// deletes a file and never modifies one; `trashed` is a record state, and the
// file itself sits in the Recycle folder until Lee empties it from Explorer.

export type TakeStatus = "pending" | "kept" | "trashed";
export type UploadState = "idle" | "queued" | "uploading" | "done" | "error";

export interface TakeTarget {
  kind: "ceq" | "run" | "range";
  /** Frame ids (a run/range keeps the whole span; the first is the anchor). */
  ids: string[];
  label?: string;
}

export interface TakeRecord {
  id: string;
  fileName: string;
  sizeBytes: number;
  /** File mtime (ms) — with name+size this is the folder-scan identity. */
  mtimeMs: number;
  durationS?: number;
  recordedAt: string;         // ISO
  status: TakeStatus;
  target?: TakeTarget;
  /** What was on screen while OBS rolled — and, from F1, WHAT THIS TAKE
   *  ATTACHES TO on keep. */
  coverage?: { startedAt: string; stoppedAt: string; frameIds: string[] };
  /** FILMED IN (vertical filming, 08-17). Tagged at ingest from the workspace
   *  orientation, so the rail can group/filter and a 9:16 publication can draw
   *  only from vertical takes. Absent on takes banked before this existed —
   *  treated as 16:9, which is what they are. */
  orientation?: "16:9" | "9:16";
  /** SLATE (F1): ms from record-start to when the countdown cleared — the
   *  DETERMINISTIC head-trim point. Absent ⇒ the stitcher falls back to
   *  silence detection. */
  slateEndMs?: number;
  upload?: { state: UploadState; attempts: number; error?: string; url?: string; path?: string };
}

// ---- pure helpers (unit-tested) --------------------------------------------

/** Identity of a file on disk for scan-diffing. Name alone is not enough — OBS
 *  can reuse a name after a Recycle restore; size+mtime disambiguates. */
export const fileKey = (name: string, size: number, mtimeMs: number): string => `${name}|${size}|${Math.round(mtimeMs)}`;

export const takeKey = (t: TakeRecord): string => fileKey(t.fileName, t.sizeBytes, t.mtimeMs);

export interface ScannedFile { name: string; size: number; lastModified: number }

/** Which scanned files are NEW to the store. Pure; order preserved (oldest
 *  first) so a batch scan banks in recording order. */
export function newFiles(scanned: ScannedFile[], known: TakeRecord[]): ScannedFile[] {
  const seen = new Set(known.map(takeKey));
  return [...scanned]
    .sort((a, b) => a.lastModified - b.lastModified)
    .filter((f) => !seen.has(fileKey(f.name, f.size, f.lastModified)));
}

export function makeRecord(f: ScannedFile, extra?: Partial<TakeRecord>): TakeRecord {
  return {
    id: `take-${f.lastModified}-${Math.abs(hash(f.name))}`,
    fileName: f.name,
    sizeBytes: f.size,
    mtimeMs: f.lastModified,
    recordedAt: new Date(f.lastModified).toISOString(),
    status: "pending",
    ...extra,
  };
}

const hash = (s: string): number => { let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return h; };

/** WHERE A KEPT TAKE ATTACHES (F1) — the frames that were on screen while it
 *  rolled, in SPINE ORDER; falls back to the armed target when there's no
 *  coverage. One frame ⇒ a plain attach; several ⇒ run coverage across them.
 *  Pure. */
export function attachTargets(t: TakeRecord, spineOrder: string[], openFrameId?: string | null): string[] {
  const inSpine = new Set(spineOrder);
  const cov = (t.coverage?.frameIds ?? []).filter((id) => inSpine.has(id));
  const armed = (t.target?.ids ?? []).filter((id) => inSpine.has(id));
  // PRECEDENCE, most specific first:
  //   1. COVERAGE — the frames actually on screen while OBS rolled. Right for a
  //      run blast, where one take spans several frames.
  //   2. ARMED — an explicit instruction Lee gave before rolling.
  //   3. THE OPEN FRAME — the row highlighted in Attached Clips.
  //
  // (3) is the fix for the case that bit Lee (08-17): keeping a take that was
  // not filmed during a live roll left coverage empty and nothing armed, so the
  // attach resolved to NOTHING and the take banked against no frame at all —
  // "KEPT 1" beside "0/11 frames filmed". With a frame open there is now always
  // somewhere for a kept take to go.
  const open = openFrameId && inSpine.has(openFrameId) ? [openFrameId] : [];
  const ids = new Set(cov.length ? cov : armed.length ? armed : open);
  return spineOrder.filter((id) => ids.has(id)); // spine order, deduped
}

/** RECORDS WHOSE FILE IS GONE (Lee, 08-17). Deleting a recording in Explorer used
 *  to leave its row in the inbox forever — Scan only ever ADDED. These are the ids
 *  to drop.
 *
 *  TRASHED records are exempt: their file lives in Recycle/, which the root scan
 *  never sees, so pruning them would delete the record of a restorable file. This
 *  drops the RECORD only; no file is ever touched, because the file is already
 *  gone by the time we notice. */
export function missingRecords(list: TakeRecord[], scanned: ScannedFile[]): string[] {
  const onDisk = new Set(scanned.map((f) => f.name));
  return list.filter((t) => t.status !== "trashed" && !onDisk.has(t.fileName)).map((t) => t.id);
}

/** The take a triage hotkey acts on: the most recent PENDING one. */
export function latestPending(list: TakeRecord[]): TakeRecord | null {
  const p = list.filter((t) => t.status === "pending").sort((a, b) => b.mtimeMs - a.mtimeMs);
  return p[0] ?? null;
}

/** Human size for the Recycle counter. */
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

// ---- IndexedDB + a tiny subscribable store ---------------------------------

const DB = "sa-takes";
const STORE = "records";
const META = "meta";

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error ?? new Error("indexedDB open failed"));
  });
}

const tx = async <T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await idb();
  return new Promise<T>((res, rej) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error ?? new Error("indexedDB request failed"));
  });
};

export const putMeta = (key: string, value: unknown): Promise<unknown> => tx(META, "readwrite", (s) => s.put(value, key) as unknown as IDBRequest<unknown>);
export const getMeta = <T>(key: string): Promise<T | undefined> => tx(META, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>);

let cache: TakeRecord[] = [];
const subs = new Set<(l: TakeRecord[]) => void>();
const emit = () => { const snap = [...cache].sort((a, b) => b.mtimeMs - a.mtimeMs); subs.forEach((f) => f(snap)); };

/** Subscribe to the record list (newest first). Returns an unsubscriber. */
export function subscribeTakes(fn: (l: TakeRecord[]) => void): () => void {
  subs.add(fn);
  fn([...cache].sort((a, b) => b.mtimeMs - a.mtimeMs));
  return () => { subs.delete(fn); };
}

export async function loadTakes(): Promise<TakeRecord[]> {
  try { cache = (await tx<TakeRecord[]>(STORE, "readonly", (s) => s.getAll() as IDBRequest<TakeRecord[]>)) ?? []; }
  catch { cache = []; }
  emit();
  return cache;
}

export async function saveTake(t: TakeRecord): Promise<void> {
  cache = [...cache.filter((x) => x.id !== t.id), t];
  emit();
  try { await tx(STORE, "readwrite", (s) => s.put(t) as unknown as IDBRequest<unknown>); } catch { /* memory copy still live */ }
}

/** Drop a RECORD (never a file) — used when a Recycle restore re-banks it. */
export async function dropTakeRecord(id: string): Promise<void> {
  cache = cache.filter((x) => x.id !== id);
  emit();
  try { await tx(STORE, "readwrite", (s) => s.delete(id) as unknown as IDBRequest<unknown>); } catch { /* ignore */ }
}

export const currentTakes = (): TakeRecord[] => [...cache].sort((a, b) => b.mtimeMs - a.mtimeMs);

// ---- the triage bus (film-controller hotkeys reach the store) --------------
type TriageFn = (action: "keep" | "trash") => void;
let triageHandler: TriageFn | null = null;
/** The inbox registers the real handler; the film keymap just fires. */
export const setTriageHandler = (fn: TriageFn | null): void => { triageHandler = fn; };
export const triageLatest = (action: "keep" | "trash"): void => { triageHandler?.(action); };

// ---- the drop bus (P3): a rail row dragged onto the clip stack ------------
// Carries the FULL frame range (08-20): a scratch take dropped on N checked
// frames used to collapse to frames[0] here, so the blast lost its span.
type KeepToFn = (takeId: string, frameIds: string[], at?: number) => void;
let keepToHandler: KeepToFn | null = null;
/** The inbox registers the real handler (it owns the folder handle and the
 *  upload path); the studio's drop target just fires. */
export const setKeepToHandler = (fn: KeepToFn | null): void => { keepToHandler = fn; };
export const keepTakeTo = (takeId: string, frameIds: string[], at?: number): void => { keepToHandler?.(takeId, frameIds, at); };
