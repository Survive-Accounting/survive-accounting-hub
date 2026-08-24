// GoTrue errors, translated once.
//
// WHY THIS EXISTS. Two sign-in surfaces each handled Supabase auth errors their own way, and both
// were wrong in a way that cost real debugging time:
//
//   * ChapterGate printed error.message verbatim, so a member saw "Error sending confirmation
//     email" — GoTrue's internal phrasing for "the SMTP call failed", which reads to a student
//     like their address was rejected and to us like Resend was down. It was neither: the project
//     was over its auth email rate limit.
//
//   * The dashboard collapsed everything except a substring match on "rate" into one apologetic
//     sentence, which meant a misconfigured redirect, a disabled signup and a genuine provider
//     outage all looked identical.
//
// So the mapping lives in one place, keyed on the machine-readable fields (status, error_code)
// before the prose, because the prose changes between GoTrue versions and the codes do not. Each
// message says what happened AND what the person should do next; none of them repeat a provider
// string at someone who cannot act on it.
//
// The raw text is not thrown away — authErrorDetail() returns it for the console and the Test Mode
// activity log, which is where a developer should be reading it.

export type AuthErrorish = { message?: string; status?: number; code?: string; name?: string } | null | undefined;

const codeOf = (e: AuthErrorish): string =>
  ((e as { code?: string; error_code?: string } | null)?.code ??
   (e as { error_code?: string } | null)?.error_code ?? "").toLowerCase();

/** What to show a person. Never a provider string. */
export function authEmailError(e: AuthErrorish): string {
  if (!e) return "Something went wrong — try again in a moment.";
  const code = codeOf(e);
  const status = e.status ?? 0;
  const msg = (e.message ?? "").toLowerCase();

  // The one that was actually happening. Project-wide, not per-address, so "wait and retry" is
  // the honest advice — trying a different email will not help.
  if (status === 429 || code.includes("rate_limit") || msg.includes("rate limit")) {
    return "Too many sign-in emails have gone out in the last hour. Give it a few minutes and try again.";
  }
  // GoTrue could not hand the message to the mail provider. Ours to fix, and worth saying so:
  // a student who thinks their address was rejected will retype it forever.
  if (code.includes("email") && (code.includes("send") || code.includes("confirmation"))) {
    return "I couldn't send that email just now — that's on my end, not your address. Try again in a minute.";
  }
  if (status >= 500 || msg.includes("error sending")) {
    return "I couldn't send that email just now — that's on my end, not your address. Try again in a minute.";
  }
  if (code.includes("validation") || msg.includes("invalid email") || msg.includes("unable to validate email")) {
    return "That email doesn't look right — check it and try again.";
  }
  if (code.includes("signup_disabled") || msg.includes("signups not allowed")) {
    return "New sign-ins are paused right now. Text me and I'll sort it out.";
  }
  if (msg.includes("redirect") || msg.includes("not allowed")) {
    return "This link came from somewhere I don't recognise — open the chapter page again and retry.";
  }
  return "Couldn't send the link — try again in a moment.";
}

/** The raw text, for logs and the Test Mode activity panel. Never rendered to a normal user. */
export function authErrorDetail(e: AuthErrorish): string {
  if (!e) return "";
  const bits = [e.status ? `status=${e.status}` : "", codeOf(e) ? `code=${codeOf(e)}` : "", e.message ?? ""];
  return bits.filter(Boolean).join(" ");
}
