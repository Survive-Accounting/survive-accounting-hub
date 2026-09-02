// THE DEVICE ID — one random first-party value per browser, and nothing else.
//
// Extracted from useRecordRefVisit (2026-08-31) because a second caller needs it: the member
// gate de-duplicates on it, so a student tapping "Start Exam 1" twice is one member instead of
// two. Two implementations of "which browser is this" would drift, and the moment they drift the
// de-duplication silently stops working — the member count would creep back up and look real.
//
// ── WHAT IT IS NOT ────────────────────────────────────────────────────────────────────────────
// Not a fingerprint. Not derived from the user agent, the screen, the fonts, the canvas, or
// anything else about the person or the machine. It is `crypto.randomUUID()` in a first-party
// cookie. It says "this browser has been here before" and it cannot say anything else — which is
// exactly the strength needed to stop double-counting and no more.
//
// ── WHAT IT COSTS ─────────────────────────────────────────────────────────────────────────────
// Said plainly because it decides a number a scholarship chair will be shown: two members sharing
// a laptop collapse into one row, and one member on a phone and a laptop is two rows. Both are
// wrong. Both are far less wrong than one tap = one member, which is what produced five members
// for one person in nine seconds.

const ANON_COOKIE = "sa_anon";
const ANON_MAX_AGE = 60 * 60 * 24 * 365;

/** This browser's id, minting one on first read. Null on the server, where there is no browser
 *  to identify — callers must treat null as "cannot de-duplicate", never as an id. */
export function deviceAnonId(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${ANON_COOKIE}=([^;]*)`));
  if (m) return decodeURIComponent(m[1]);
  try {
    const id = crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${ANON_COOKIE}=${encodeURIComponent(id)}; Path=/; Max-Age=${ANON_MAX_AGE}; SameSite=Lax${secure}`;
    return id;
  } catch {
    // Cookies blocked. No id means no de-duplication, which the caller handles by recording
    // nothing rather than by recording a member it cannot identify.
    return null;
  }
}
