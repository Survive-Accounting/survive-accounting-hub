// Operator-filled public config (NOT secrets — these are just URLs/flags Lee
// pastes). No Stripe API keys ever live in code; a Stripe Payment Link is a
// plain URL.

/** Stripe Payment Link for the prepaid Premium 1-on-1 semester block
 *  ($1,250 / 10 hours). Create it in the Stripe dashboard, set its post-payment
 *  redirect to /welcome, then paste the full https://buy.stripe.com/... URL
 *  here. Until set, the "Reserve your seat" button is disabled (coming soon). */
export const STRIPE_TUTORING_PAYMENT_LINK = "";

/** Intro-call booking URL shown on /welcome after payment (Lee is setting up a
 *  TidyCal link). Until set, the "Book your intro call" button is disabled. */
export const INTRO_CALL_BOOKING_URL = "";

/** Manual availability toggle for the Premium 1-on-1 seat (Lee takes only 4
 *  students/semester). FALSE = "Available now" (Reserve your seat → Stripe).
 *  Flip to TRUE when full → the card shows "Sold out" and the CTA becomes
 *  "Join the waitlist" (capture, no payment). No automated seat counting. */
export const TUTORING_SOLD_OUT = false;

/** Optional manual "X of 4 seats left" microcopy. Leave "" to show nothing
 *  (default — absence of a counter reads stronger than "0/4"). */
export const TUTORING_SEATS_LEFT_TEXT = "";

/** Legacy master switch for routing the onboarding wizard's 1-on-1 plan through
 *  Stripe. The homepage/pricing card gates on STRIPE_TUTORING_PAYMENT_LINK
 *  directly now; this remains for the onboarding prepay branch. */
export const ENABLE_PREPAY = false;

/** Optional intro/vision video for the preview dashboard (/preview) where Lee
 *  explains what he's building and invites testers to help shape it. Paste a
 *  YouTube/Vimeo URL (or bare YouTube ID). Empty = the video slot is hidden. */
export const PREVIEW_VISION_VIDEO_URL = "";

// ── /the-campaign ─────────────────────────────────────────────────────────────────────────────
// The private page Lee shares by email with his personal network. All three slots are EMPTY
// until he supplies the files, and each one degrades to nothing rather than to a broken frame or
// a dead link — the page reads correctly with all of them blank.

/** The ~2 minute campaign video. YouTube/Vimeo URL, a bare YouTube ID, or a direct media URL.
 *  Empty = the player is not rendered at all. Never autoplays with sound either way. */
export const CAMPAIGN_VIDEO_URL = "";

/** Poster frame for the video. Empty = a plain dark frame with the play button. */
export const CAMPAIGN_VIDEO_POSTER = "";

/** The full written report, as a PDF. Empty = the link under the deck is not rendered, rather
 *  than shipped pointing at a 404. */
export const CAMPAIGN_REPORT_PDF = "";

// ── /offer/mckenzie ───────────────────────────────────────────────────────────────────────────
/** Mckenzie's headshot, shown in a circle at the top of the offer. EMPTY until the real photo is
 *  dropped in — the page renders without it rather than substituting anything.
 *
 *  Drop the file at public/offer/mckenzie.jpg and set this to "/offer/mckenzie.jpg". */
export const OFFER_PHOTO_URL = "/offer/mckenzie.jpg";

// ── Greek share funnel (learn-share-flow) ───────────────────────────────────────────────────
/** Where the "How to buy" kit page and the chapter seat CTA point a chapter that
 *  decides to fund seats. EMPTY until Lee has a cart/invoice link — until then the kit PDF and the
 *  panel say "text Lee and he sends it" rather than shipping a dead button. Paste a Stripe/cart URL
 *  or an invoice-request link when there is one; nothing here breaks when it stays "".
 *  Typed `string` (not the literal "") so a `URL ? … : …` check doesn't narrow the set branch to
 *  never — this is operator-filled config, not a constant. */
export const CHAPTER_SEATS_BUY_URL: string = "";
