// Server-only Resend helper. Import DYNAMICALLY inside server-function handlers
// (`await import("@/lib/email.server")`) — never at the top of a *.functions.ts
// file, which ships to the client bundle.
//
// NOTE: RESEND_API_KEY must be present in the RUNTIME env (Vercel) for these to
// send. The Deno edge functions (notify-waitlist/notify-order) read it from
// Supabase secrets; these Vercel server functions read process.env.RESEND_API_KEY.
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const FROM = "Lee Ingram <lee@mail.surviveaccounting.com>";
const REPLY_TO = "lee@surviveaccounting.com";

export type EmailResult = { ok: boolean; id?: string; error?: string };

export async function sendResendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<EmailResult> {
  if (!RESEND_API_KEY) return { ok: false, error: "RESEND_API_KEY not set in this environment" };
  const to = opts.to.trim();
  if (!to) return { ok: false, error: "no recipient" };
  try {
    const payload: Record<string, unknown> = {
      from: FROM,
      to: [to],
      reply_to: REPLY_TO,
      subject: opts.subject,
      text: opts.text,
    };
    if (opts.html) payload.html = opts.html;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = (await res.json().catch(() => ({}))) as { id?: string };
    if (!res.ok)
      return { ok: false, error: `Resend ${res.status}: ${JSON.stringify(j).slice(0, 200)}` };
    return { ok: true, id: j.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
