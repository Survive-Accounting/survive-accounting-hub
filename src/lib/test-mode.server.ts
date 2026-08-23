// TEST MODE — the rules that decide who may be a test destination. Pure: no request, no cookies,
// no database, and deliberately no import of @tanstack/react-start/server.
//
// WHY PURE. The cookie itself is read and written by handlers in test-mode.functions.ts. Those
// handler bodies are stripped from the client bundle; a plain module like this one is not, so a
// server-only import here follows the dynamic-import chain into the browser graph and the build
// refuses it (correctly — it is exactly the leak that protection exists to catch). Keeping the
// POLICY here and the REQUEST ACCESS in handlers means both halves live where they are safe, and
// the policy stays unit-testable without a request to fake.
//
// THE PROMISE THIS KEEPS. test-mode.ts says: "the send route takes the address from the session
// record, never from its caller, so this can never become an open relay." That was a description
// of intent with nothing behind it — the tester's email lived only in sessionStorage, and no
// outbound message consulted it. A test chapter claim mailed whatever address was typed into the
// form. Now the destination comes from an HTTP-ONLY cookie, which JavaScript on the page cannot
// read or write, and no send takes a recipient argument a caller could aim somewhere else.
//
// TWO LOCKS ON INSTALLING ONE:
//   1. TEST_MODE_ENABLED in the environment, and
//   2. the address on the tester allow-list below.
// Sharing a run with a new tester is one env var edit — which is the point of a list rather than a
// hard-coded name — and an address nobody added can never be a destination, even with the flag on
// and even with a hand-built URL.
//
// SMS HAS NO TEST DESTINATION ON PURPOSE. We never collect the tester's mobile, so the only phone
// available is the one typed into a form: a real number belonging to a real person. Test SMS is
// rendered and logged, never sent — see send.server.ts.

/** The cookie the tester session lives in. Named here so the handlers and any future reader agree. */
export const TEST_TO_COOKIE = "sa-test-to";

/** The env guard. Duplicated from test-mode.functions.ts on purpose: this module must not import
 *  anything that would drag a server-only dependency into the client graph. */
export const testModeOn = (): boolean => {
  const on = (process.env.TEST_MODE_ENABLED ?? "").trim().toLowerCase();
  return on === "1" || on === "true";
};

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Who may be a test destination. Not a preference — the boundary that stops this being a relay. */
export function testerAllowList(): string[] {
  const fromEnv = (process.env.TEST_MODE_EMAILS ?? "")
    .split(",").map((s) => s.trim().toLowerCase()).filter((s) => EMAIL_RE.test(s));
  const founder = (process.env.FOUNDER_ALERT_EMAIL ?? "lee@survivestudios.com").trim().toLowerCase();
  return [...new Set([
    ...fromEnv,
    "lee@surviveaccounting.com",
    "king@surviveaccounting.com",
    founder,
  ])];
}

export const isAllowedTester = (email: string): boolean =>
  testerAllowList().includes(email.trim().toLowerCase());

/** May this address be installed as the session's destination? Returns the refusal reason rather
 *  than a bare false — a tester whose address is not on the list needs telling, not silence. */
export function checkTester(email: string): { ok: boolean; email?: string; error?: string } {
  const e = email.trim().toLowerCase();
  if (!testModeOn()) return { ok: false, error: "TEST_MODE_ENABLED is not set." };
  if (!EMAIL_RE.test(e)) return { ok: false, error: "That doesn't look like an email address." };
  if (!isAllowedTester(e)) return { ok: false, error: `${e} is not on the tester list — add it to TEST_MODE_EMAILS.` };
  return { ok: true, email: e };
}

/** Validate a cookie value on the way BACK out. Re-checked on every read so that turning the flag
 *  off, or removing someone from the list, takes effect at once — a cookie from a previous
 *  configuration must not outlive it. */
export function readTesterCookie(raw: string | undefined | null): string | null {
  const e = (raw ?? "").trim().toLowerCase();
  if (!testModeOn()) return null;
  if (!EMAIL_RE.test(e) || !isAllowedTester(e)) return null;
  return e;
}
