// /offer/mckenzie — the password gate.
//
// The page is unlisted, but an unlisted URL is not a lock: it gets forwarded, it sits in a text
// thread, it ends up in a screenshot. So the contents are gated.
//
// ── THE PASSWORD NEVER REACHES THE BROWSER ────────────────────────────────────────────────────
// It lives in OFFER_PASSWORD (an environment variable, not the source) and is compared HERE, on
// the server. The client sends a candidate and gets back yes or no; it never receives anything it
// could compare against, so the answer cannot be read out of the bundle.
//
// This is a family page, not a vault — there is no attempt counter, no lockout, no logging of
// failures. Getting it wrong is a small shake and a "nope", as specified.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Set on success so a refresh at an airport does not re-prompt. */
export const OFFER_COOKIE = "sa_offer_ok";

/** How long the pass lasts. Long enough to read the page, close it, and come back to it later
 *  the same trip; short enough that a borrowed phone does not stay unlocked forever. */
const MAX_AGE = 60 * 60 * 24 * 30;

/** The value the cookie carries. Not the password — a marker. Anyone who can set a cookie can
 *  set this one, which is fine: the cookie only says "this browser already answered", and the
 *  page behind it is a job offer, not money. */
const PASS = "1";

export const checkOfferPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ password: z.string().max(200) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const expected = (process.env.OFFER_PASSWORD ?? "").trim();
    // NO PASSWORD CONFIGURED MEANS LOCKED, never open. An env var that failed to reach
    // production must not silently publish the page.
    if (!expected) return { ok: false };
    if (data.password.trim() !== expected) return { ok: false };

    const { setCookie } = await import("@tanstack/react-start/server");
    setCookie(OFFER_COOKIE, PASS, {
      path: "/",
      maxAge: MAX_AGE,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return { ok: true };
  });

/** Read by the route loader, so a returning visit renders the offer server-side rather than
 *  flashing the gate first. */
export const offerUnlocked = createServerFn({ method: "GET" }).handler(
  async (): Promise<boolean> => {
    const { getCookie } = await import("@tanstack/react-start/server");
    return getCookie(OFFER_COOKIE) === PASS;
  },
);
