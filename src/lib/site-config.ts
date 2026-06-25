// Operator-filled public config (NOT secrets — these are just URLs Lee pastes).
// No Stripe API keys ever live in code; a Stripe Payment Link is a plain URL.

/** Stripe Payment Link for the prepaid 1-on-1 semester block. Create it in the
 *  Stripe dashboard, set its post-payment redirect to the confirmation page
 *  (/welcome), then paste the full https://buy.stripe.com/... URL here. Until
 *  set, the "Reserve your seat" button is disabled. */
export const STRIPE_TUTORING_PAYMENT_LINK = "";

/** Booking URL for the post-payment intro call (Square/Calendly/etc.). Until
 *  set, the "Book your intro call" button on /welcome is disabled. */
export const INTRO_CALL_BOOKING_URL = "";
