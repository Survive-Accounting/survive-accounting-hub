// FILM SLATE (F1) — the countdown that lives IN FRAME, like a real slate.
//
// Correction to the earlier film-safe rule (Lee, 08-16): the countdown is the
// ONE status-ish thing allowed inside the capture window, because it isn't
// status — it's a slate. Everything else (recording dot, armed badge, OBS
// chip, take counts) still stays on the studio window only.
//
// The payoff is DETERMINISTIC TRIMMING: the app knows exactly when the slate
// cleared, so a take records `slateEndMs` — the offset from record-start to
// "speak". The stitcher trims there instead of guessing at head silence
// (silence detection stays as the tail refinement and the fallback for takes
// with no slate).
//
// A module-level store, not React state: the studio window and the film popout
// are ONE React tree (PanelPopout portals into the popout's document), so both
// subscribe to the same source and can never disagree.

export interface SlateState {
  /** Seconds remaining; null = no slate running. */
  count: number | null;
  /** The brief "speak" beat after zero. */
  speak: boolean;
}

const KEY = "sa-slate-seconds";
export const SLATE_CHOICES = [3, 5, 10] as const;
export const SPEAK_MS = 700;

export function slateSeconds(): number {
  const v = Number(typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : NaN);
  return SLATE_CHOICES.includes(v as never) ? v : 3;
}
export function setSlateSeconds(n: number): void {
  try { localStorage.setItem(KEY, String(n)); } catch { /* session-only */ }
}

let state: SlateState = { count: null, speak: false };
const subs = new Set<(s: SlateState) => void>();
const emit = () => subs.forEach((f) => f(state));

export function subscribeSlate(fn: (s: SlateState) => void): () => void {
  subs.add(fn);
  fn(state);
  return () => { subs.delete(fn); };
}
export const slateState = (): SlateState => state;

/** Epoch ms when the last slate CLEARED (speak began) — the trim point. */
let lastEndMs = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let speakTimer: ReturnType<typeof setTimeout> | undefined;

/** Start the slate. Returns the epoch ms it started (the caller pairs this
 *  with OBS's record-start so the offset is honest). */
export function startSlate(seconds = slateSeconds()): number {
  const startedAt = Date.now();
  if (timer) clearInterval(timer);
  if (speakTimer) clearTimeout(speakTimer);
  if (seconds <= 0) { lastEndMs = startedAt; state = { count: null, speak: false }; emit(); return startedAt; }
  state = { count: seconds, speak: false };
  emit();
  timer = setInterval(() => {
    const next = (state.count ?? 1) - 1;
    if (next > 0) { state = { count: next, speak: false }; emit(); return; }
    if (timer) clearInterval(timer);
    lastEndMs = Date.now();               // ← the deterministic trim point
    state = { count: 0, speak: true };
    emit();
    speakTimer = setTimeout(() => { state = { count: null, speak: false }; emit(); }, SPEAK_MS);
  }, 1000);
  return startedAt;
}

/** Cancel without recording a trim point (record aborted). */
export function cancelSlate(): void {
  if (timer) clearInterval(timer);
  if (speakTimer) clearTimeout(speakTimer);
  state = { count: null, speak: false };
  emit();
}

/** The offset (ms) from a record-start epoch to when the slate cleared, or
 *  null when this take had no slate. Pure-ish: reads the recorded end only. */
export function slateEndOffsetMs(recordStartMs: number): number | null {
  if (!lastEndMs || lastEndMs < recordStartMs) return null;
  const off = lastEndMs - recordStartMs;
  // A slate longer than a minute means the timestamps don't belong together.
  return off >= 0 && off < 60_000 ? off : null;
}

/** Test seam: pretend a slate ended at this epoch ms. */
export const __setLastSlateEnd = (ms: number): void => { lastEndMs = ms; };
