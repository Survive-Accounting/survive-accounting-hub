// TEAM ALERTS (2026-09-13) — the internal emails the chair funnel sends to Lee AND King.
//
// Lee: "give the email to King too" (chair clicks), "Let the 'Activate your chapter dashboard'
// email King too", and "Email me and King if any of these get done" (dashboard action steps). One
// helper so every one of those goes to the same two inboxes the same way.
//
// A TEST RUN EMAILS THE TESTER ONLY. King walks the whole funnel on the fixture chapter; if these
// went to Lee every time King pressed a button, Lee's inbox would fill with fake chapters. The
// tester address comes from the server-held test cookie (test-mode.functions), never the client,
// and the subject is stamped [TEST] so a forwarded one can't be mistaken for a real chapter.
//
// Imported dynamically from server-fn handlers only.

export const KING_ALERT_EMAIL = "jking.cim@gmail.com";

/** `opts.testTo` — for work that runs AFTER the response (the claim intake), where the request's
 *  test cookie can no longer be read: the caller resolves it inside the handler and passes it.
 *  A string means "test run, send only there" ("" = test run with no destination: send nothing);
 *  null means "a real run". Omitted, it is read from the current request. */
export async function emailTeam(msg: { subject: string; text: string; html?: string }, opts?: { testTo: string | null }): Promise<{ ok: boolean; test: boolean }> {
  try {
    let tester: string | null;
    if (opts) tester = opts.testTo;
    else {
      const { testerEmailForRequest } = await import("@/lib/test-mode.functions");
      tester = await testerEmailForRequest().catch(() => null);
    }
    if (tester === "") return { ok: false, test: true };
    const { FOUNDER_EMAIL } = await import("@/lib/comms/send.server");
    const { sendResendEmail } = await import("@/lib/email.server");
    if (tester) {
      const r = await sendResendEmail({ to: tester, subject: `[TEST] ${msg.subject}`, text: msg.text, html: msg.html });
      return { ok: r.ok, test: true };
    }
    const lee = process.env.CHAIR_ALERT_EMAIL || FOUNDER_EMAIL;
    const r = await sendResendEmail({ to: lee, cc: [KING_ALERT_EMAIL], subject: msg.subject, text: msg.text, html: msg.html });
    return { ok: r.ok, test: false };
  } catch (e) {
    console.warn("emailTeam failed:", (e as Error).message);
    return { ok: false, test: false };
  }
}

/** Is this request part of a test run? (The same predicate the claim path uses.) */
export async function isTestRun(): Promise<boolean> {
  try {
    const { isTestRequest } = await import("@/lib/test-mode.functions");
    return await isTestRequest();
  } catch { return false; }
}

export const escHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
