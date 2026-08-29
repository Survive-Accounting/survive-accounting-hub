// FILM HANDOFF (B5) — the bridge from the Booth to film mode. The Booth
// writes an intent and opens /study/canvas in a NEW TAB; the canvas consumes
// the intent once on mount and focuses the set's studio. Deliberately NOT a
// URL param: the canvas route's state machine stays untouched except for one
// additive consume-on-mount effect, and Recording Mode rules are untouched —
// the film popout still starts from Lee's own `\` keypress (auto-opening a
// popout from a fresh tab is popup-blocker roulette; the set being loaded
// and ready is the handoff's contract).
const KEY = "sa-film-handoff";
const TTL_MS = 2 * 60 * 1000; // stale intents die — a day-old flag must not hijack a normal open

export interface FilmHandoff { setId: string; at: number }

export function writeFilmHandoff(setId: string): void {
  try { localStorage.setItem(KEY, JSON.stringify({ setId, at: Date.now() } satisfies FilmHandoff)); } catch { /* cosmetic */ }
}

/** Read AND clear. Returns null when absent or stale. */
export function consumeFilmHandoff(): FilmHandoff | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    const h = JSON.parse(raw) as FilmHandoff;
    if (!h?.setId || Date.now() - h.at > TTL_MS) return null;
    return h;
  } catch { return null; }
}
