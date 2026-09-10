// THE QUICK QUEUE — Ctrl+I on the production line: one line, Enter saves.
//
// Lee (2026-09-09): "Ctrl+I, type, done, no clicking — for shorts ideas (offshoots that come
// to me mid-take)." The full Ideas Bank modal costs a click on the kind step and a Ctrl+Enter,
// and it lands in the middle of the screen — mid-take that is two clicks too many and a box in
// the eye line. So on /v3 the same hotkey opens a single line near the top instead, pre-tagged
// SHORTS with the topic, set and slide it was had on, and bare Enter is the whole save.
// Ctrl+Shift+I still opens the full bank; off the line Ctrl+I is what it always was.
//
// Pure — no React, no storage, no network. The dock reads the route and readFilmActive() and
// hands both in, so a test can say exactly what a capture on /v3/e1s/2-1/blast-off/results
// carries. Everything here is a `function` declaration (the TDZ ratchet's house style).
import type { FilmActive } from "@/components/blastoff/capture/prompter-sync";
import { deriveTitle, type Idea } from "./model";

/** THE PRODUCTION LINE: /v3 and everything under it — the topic and set pages, the editor,
 *  film, post, the teleprompter. Any depth; "/v30" is not it. */
export function isProductionPath(pathname: string): boolean {
  return pathname === "/v3" || pathname.startsWith("/v3/");
}

/** /v3's own pages — a first segment that is a PAGE, not a topic (routes/v3.post.tsx,
 *  v3.teleprompter.tsx, v3.values.tsx). A capture there is on the line but on no set. */
const V3_PAGES = ["post", "teleprompter", "values"];

/** The prompter-sync node id for a plan frame is "blast-<frame id>" (prompter-sync.ts,
 *  filmNodeIdForFrameId); a SET CARD publishes its CEQ node id instead (filmNodeId). */
export const FRAME_NODE_PREFIX = "blast-";

function segment(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

/** WHAT A CAPTURE ON THE LINE CARRIES, as `ideas.context` keys (jsonb, no migration):
 *    shorts   "1" — always; the flag the server's lanes and /admin/ideas read
 *    topic    the /v3/$topic slug           set      the /v3/$topic/$set slug
 *    setId    the deck id in the film record (sa-film-active) — the set being filmed
 *    frameId  the slide up in that record, prefix stripped ("blast-<frameId>")
 *    ceqId    instead of frameId when the slide is a set card (its node id IS the CEQ id)
 *  `split` is left for the film surface to publish later — the frame id is enough to derive
 *  it (plan.ts planTakes). Off the line: nothing, `{}` — Ctrl+I there is not this feature. */
export function productionContext(pathname: string, film: FilmActive | null): Record<string, string> {
  if (!isProductionPath(pathname)) return {};
  const out: Record<string, string> = { shorts: "1" };
  const [topic, set] = pathname.split("/").filter(Boolean).slice(1).map(segment);
  if (topic && !V3_PAGES.includes(topic)) {
    out.topic = topic;
    if (set) out.set = set;
  }
  if (film) {
    out.setId = film.setId;
    // A null qId is the countdown ("slide 0") or no slide up yet — nothing to point at.
    if (film.qId) {
      if (film.qId.startsWith(FRAME_NODE_PREFIX)) out.frameId = film.qId.slice(FRAME_NODE_PREFIX.length);
      else out.ceqId = film.qId;
    }
  }
  return out;
}

export type IdeasHotkey = "quick" | "full" | null;

/** WHAT Ctrl/⌘+I MEANS WHERE. On the line: plain → the quick box, Shift → the full bank.
 *  Off it: the full bank, Shift or not — exactly what the hotkey did before (2026-09-03). */
export function ideasHotkey(e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }, pathname: string): IdeasHotkey {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "i") return null;
  return isProductionPath(pathname) && !e.shiftKey ? "quick" : "full";
}

export interface QuickCapture {
  id: string;
  text: string;
  pathname: string;
  pageTitle: string;
  href: string;
  createdBy: string;
  /** productionContext(...) — merged after the modal's own keys, so `shorts` and the set ride along. */
  context: Record<string, string>;
}

/** The row without the two timestamps the database stamps. */
export type QuickIdeaRow = Omit<Idea, "createdAt" | "updatedAt">;

/** THE ROW A QUICK CAPTURE SAVES — every column, because saveIdea is a whole-row upsert
 *  (admin.ideas.tsx spells out the trap: omit attachments and a voice note is gone). The same
 *  defaults the full modal's save() uses, with the two decisions made for Lee: the category is
 *  SHORTS, and the production context is merged into the modal's title/href/intent keys. */
export function quickIdeaRow(c: QuickCapture): QuickIdeaRow {
  const body = c.text.trim();
  return {
    id: c.id,
    title: deriveTitle(body),
    body,
    categories: ["SHORTS"],
    subcategory: "",
    status: "IDEA",
    sourcePath: c.pathname,
    context: { title: c.pageTitle, href: c.href, intent: "general", ...c.context },
    promptMd: null,
    promptFilename: null,
    createdBy: c.createdBy,
    sourceKind: "web",
    attachments: [],
    audioPath: null,
    transcriptStatus: null,
  };
}

/** The toast lives 2.5 s, not the modal's 7 — Lee is mid-take and it must not linger. */
export const QUICK_TOAST_MS = 2500;
/** "Queued · <first 40 chars>" — the words, so he knows which thought landed. */
export function quickToastText(text: string): string {
  return `Queued · ${text.trim().slice(0, 40)}`;
}
export const QUICK_PLACEHOLDER = "Short idea… Enter saves · Esc closes · Ctrl+Shift+I for the full bank";
/** Shown in the re-opened box when the save failed; the words come back with it. */
export const QUICK_RETRY = "didn't save — Enter to retry";
