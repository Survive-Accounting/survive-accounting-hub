// CONTACT ATTRIBUTION — the `?ref=` that rides on every outbound message.
//
// ── THE COLLISION THIS FILE EXISTS TO AVOID ───────────────────────────────────────────────────
// `?ref=` WAS ALREADY TAKEN. Campus rep tracked links go through /r/<code>, which sets the
// HttpOnly `sa_ref` cookie (`code~epochSeconds`) and then decorates the destination with
// `?ref=<code>` as a readable marker (see lib/referral.server.ts, decorateDestination). Orders
// read that cookie at submit time to pay commission.
//
// So a contact ref written into `sa_ref` would not be a tracking bug — it would be a PAYMENTS
// bug, silently reassigning a rep's commission to a cold contact. The brief's own rule is "a ref
// never overrides an explicit campus rep tracked link; rep links win", and this is how that rule
// is enforced in code rather than in a comment:
//
//   1. Contact refs live in their OWN cookie (CONTACT_REF_COOKIE). `sa_ref` is never written here.
//   2. A `?ref=` value that resolves to a real rep link code is IGNORED by this module entirely —
//      the rep system already handled it on the /r/ hop.
//   3. Contact ids are uuids and rep codes are short slugs, so the two are distinguishable before
//      any lookup; the lookup is the belt to that braces.
//
// Last-touch, like the rep cookie, and the same 30-day window, so the two systems age out
// together rather than one outliving the other and producing attribution nobody can explain.

/** Contact attribution's own cookie. NOT `sa_ref` — see the note above; that one is the rep
 *  system's and carries money. */
export const CONTACT_REF_COOKIE = "sa_cref";

/** 30 days, matching the rep cookie's window. */
export const CONTACT_REF_MAX_AGE = 60 * 60 * 24 * 30;

/** The query parameter every outbound link carries. */
export const CONTACT_REF_PARAM = "ref";

/** Contact ids are uuids. Rep codes are short human-readable slugs, so anything that is not a
 *  uuid is not ours and is left for the rep system. This is a cheap first gate that means the
 *  common case never needs a database round trip. */
export function isContactRef(v: string | null | undefined): boolean {
  if (!v) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim());
}

/** Pull the ref out of a URL's query, or null. */
export function readRefFromSearch(search: string | URLSearchParams): string | null {
  const p = typeof search === "string" ? new URLSearchParams(search) : search;
  const v = (p.get(CONTACT_REF_PARAM) ?? "").trim();
  return v || null;
}

/** APPEND THE TAG WITHOUT CLOBBERING. Used by every share screen so a link a person copies keeps
 *  the ref that brought them — which is how a council officer forwarding to twenty chapters turns
 *  one DM into twenty attributed visits. An existing `ref` on the URL always wins: it was put
 *  there deliberately (often by the rep system) and this must never overwrite it. */
export function withRef(url: string, ref: string | null | undefined): string {
  if (!ref) return url;
  try {
    // A base is required for relative paths and is discarded when the input was absolute.
    const abs = new URL(url, "https://surviveaccounting.com");
    if (abs.searchParams.has(CONTACT_REF_PARAM)) return url;
    abs.searchParams.set(CONTACT_REF_PARAM, ref);
    return /^https?:\/\//i.test(url) ? abs.toString() : `${abs.pathname}${abs.search}${abs.hash}`;
  } catch {
    return url;
  }
}

/** Read the contact ref this browser is carrying: the URL wins (this visit), then the cookie
 *  (an earlier visit in the window). Client-side only — the cookie is deliberately readable so a
 *  copied link can carry the tag onward without a server round trip. */
export function currentContactRef(): string | null {
  if (typeof window === "undefined") return null;
  const fromUrl = readRefFromSearch(window.location.search);
  if (isContactRef(fromUrl)) return fromUrl;
  const m = document.cookie.match(new RegExp(`(?:^|; )${CONTACT_REF_COOKIE}=([^;]*)`));
  const v = m ? decodeURIComponent(m[1]) : null;
  return isContactRef(v) ? v : null;
}

/** Persist this visit's ref for the window, so it survives the hop into signup and checkout.
 *  Not HttpOnly on purpose: share screens read it in the browser to tag the links they hand out.
 *  It carries no secret — a contact id is already in the URL that set it. */
export function rememberContactRef(ref: string | null | undefined): void {
  if (typeof document === "undefined" || !isContactRef(ref)) return;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${CONTACT_REF_COOKIE}=${encodeURIComponent(ref!.trim())}; Path=/; Max-Age=${CONTACT_REF_MAX_AGE}; SameSite=Lax${secure}`;
}
