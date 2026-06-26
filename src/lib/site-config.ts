// Operator-filled public config (NOT secrets — these are just URLs/flags Lee
// pastes). No Stripe API keys ever live in code; a Stripe Payment Link is a
// plain URL.

/** Stripe Payment Link for the prepaid Premium 1-on-1 semester block
 *  ($2,250 / 15 hours). Create it in the Stripe dashboard, set its post-payment
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
