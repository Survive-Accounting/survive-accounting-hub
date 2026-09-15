// THE FILM WINDOWS STAY TOGETHER (Lee, 2026-09-15). The main /film page, its 9:16 pop-out and the Stitch Room are
// three windows of one browser; these localStorage signals keep them on the same video.
//
//   · NAV   the main window says where it is (path + video). A pop-out on another set's page moves there; on the
//           same page it follows the video. "When I move to next video, don't make me reopen the film popout."
//   · ALIVE the main window's heartbeat, so the Stitch Room knows whether there's a film page to send a Redo to.
//   · REDO  the Stitch Room asks the main window to go to a video. "I click it, it opens that exact point with
//           film pop out opened (or if film pop out already open, then navigate there)."
//   · OBS   the pop-out's "Doublecheck! Is window capture in OBS correct?" — once per pop-out window, or not at
//           all after "Don't tell me again today" (it comes back the next day).
import { POPOUT_FEATURES, POPOUT_NAME, filmPopoutHref } from "./popout";
import { POPOUT_STALE_MS, readFilmActive } from "./prompter-sync";

export const FILM_NAV_KEY = "sa-film-nav";
export const FILM_ALIVE_KEY = "sa-film-main-alive";
export const FILM_REDO_KEY = "sa-film-redo";
const OBS_DAY_KEY = "sa-obs-check-off-day";
const OBS_WINDOW_KEY = "sa-obs-checked";

export interface FilmPlace { path: string; take: number | null; at: number }

const read = <T,>(key: string): T | null => { try { return JSON.parse(localStorage.getItem(key) ?? "null") as T | null; } catch { return null; } };
const write = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked */ } };

export const writeFilmNav = (path: string, take: number | null) => write(FILM_NAV_KEY, { path, take, at: Date.now() } satisfies FilmPlace);
export const writeFilmAlive = (path: string, take: number | null) => write(FILM_ALIVE_KEY, { path, take, at: Date.now() } satisfies FilmPlace);
export function parsePlace(raw: string | null): FilmPlace | null {
  try {
    const v = JSON.parse(raw ?? "null") as FilmPlace | null;
    return v && typeof v.path === "string" && v.path.startsWith("/") ? v : null;
  } catch { return null; }
}

/** Is a main film page open right now (a heartbeat in the last few seconds)? */
export function filmMainAlive(now = Date.now()): boolean {
  const v = read<FilmPlace>(FILM_ALIVE_KEY);
  return !!v && now - v.at < 6000;
}

/** REDO, from a click in the Stitch Room: the film page goes to the video, and the pop-out opens if none is up. */
export function redoInFilm(p: { topicKey: string; setKey: string; setId: string; takeIndex: number }): "sent" | "opened" | "blocked" {
  const path = `/v4/${p.topicKey}/${p.setKey}/shoot`;
  if (filmMainAlive()) {
    write(FILM_REDO_KEY, { path, take: p.takeIndex, at: Date.now() } satisfies FilmPlace);
    const rec = readFilmActive();
    const popoutUp = !!rec?.popout && Date.now() - rec.at < POPOUT_STALE_MS;
    if (!popoutUp) {
      // inside the click, so the browser allows it; the main page follows the Redo signal
      try { window.open(filmPopoutHref(path, p.takeIndex), POPOUT_NAME, POPOUT_FEATURES); } catch { /* the main page still moves */ }
    }
    return "sent";
  }
  const w = window.open(`${path}?take=${p.takeIndex}`, "_blank");
  return w ? "opened" : "blocked";
}

const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
export function obsCheckDue(): boolean {
  try {
    if (localStorage.getItem(OBS_DAY_KEY) === today()) return false;
    return sessionStorage.getItem(OBS_WINDOW_KEY) !== "1";
  } catch { return false; }
}
export function obsCheckDone(offToday: boolean) {
  try {
    sessionStorage.setItem(OBS_WINDOW_KEY, "1");
    if (offToday) localStorage.setItem(OBS_DAY_KEY, today());
  } catch { /* shows again next open */ }
}
