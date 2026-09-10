// THE UPLOAD DOORS — one per platform, and the paste-back that ticks the row.
//
// Lee, 2026-09-09: "an icon per platform that takes me to its upload page, then paste the URL
// back." Nothing here posts: the ↗ on a /v3/post row copies the caption, opens the platform's
// own upload page in a new tab, and the link he pastes back into the row is what marks the
// destination posted. Pure — the row (routes/v3.post.tsx) owns the clipboard, the tab and the
// server call; this file only knows where each door is and when a pasted link counts.
import type { PublishDestination } from "@/lib/publish-queue.functions";

/** Where each platform takes an upload. `site` is null: the site is this app, there is no
 *  upload page to open, so the row shows no ↗ for it.
 *
 *  Instagram is the ROOT on purpose. There is no reliable deep link to "new reel" — the
 *  /create/ paths change without notice and 404 when signed out — so the front door, where the
 *  ＋ is one click away, is the link that still works next month. */
export const DEST_UPLOAD_URL: Record<PublishDestination, string | null> = {
  youtube: "https://www.youtube.com/upload",
  tiktok: "https://www.tiktok.com/tiktokstudio/upload",
  instagram: "https://www.instagram.com/",
  site: null,
};

/** True for something a browser would open: http(s), with at least one character after the
 *  scheme. Whitespace around it is forgiven — a paste from a share sheet often carries one. */
export function looksLikeUrl(s: string): boolean {
  return /^https?:\/\/\S+$/i.test(s.trim());
}

/** Should a link just pasted into the row ALSO tick the destination posted? Yes when it is a
 *  real URL, it is new (retyping the same link is not an event), and the destination isn't
 *  already posted — a pasted URL for one that is just updates the link and leaves the tick
 *  alone. Clearing the field never un-posts anything: that stays the ✓/○ button's job. */
export function shouldAutoTick(prevUrl: string | null | undefined, nextUrl: string, posted: boolean): boolean {
  if (posted) return false;
  const next = nextUrl.trim();
  if (!looksLikeUrl(next)) return false;
  return next !== (prevUrl ?? "").trim();
}
