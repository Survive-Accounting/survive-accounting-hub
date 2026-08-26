// TWILIO VERIFY — the OTP lifecycle for rep phone verification. Server-only; import DYNAMICALLY
// from *.functions.ts handlers (never at module scope of a route file).
//
// WHY VERIFY AND NOT A HOME-ROLLED OTP: Verify owns code generation, storage, expiry, rate
// limiting and brute-force lockout on Twilio's side — none of that lives in our DB, so there is no
// insecure OTP table here to audit. We only ever see "approved" or not.
//
// CONFIG. Uses the SAME Twilio account credentials the SMS stack already ships
// (TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN, confirmed present in Vercel) plus ONE new variable:
//
//   TWILIO_VERIFY_SERVICE_SID   — a Verify Service ("VA…"), created once in the Twilio console
//                                 (Verify → Services → Create). No code change needed after.
//
// TEST PATH. When the Verify service is not configured (or the rep is a test rep in Test Mode),
// verification degrades to the fixed code below so the whole flow stays testable end-to-end
// without sending SMS. Test acceptance is decided by the CALLER (rep-auth.functions), which knows
// whether Test Mode is on — this module just exposes the constant.
export const TEST_OTP_CODE = "000000";

const VERIFY_BASE = "https://verify.twilio.com/v2/Services";

function creds(): { sid: string; token: string; service: string } | null {
  const sid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const token = process.env.TWILIO_AUTH_TOKEN ?? "";
  const service = process.env.TWILIO_VERIFY_SERVICE_SID ?? "";
  return sid && token && service ? { sid, token, service } : null;
}

export function verifyConfigured(): boolean {
  return creds() !== null;
}

type VerifyOutcome = { ok: boolean; error?: string };

/** Start an SMS OTP to an E.164 number. */
export async function startVerification(phoneE164: string): Promise<VerifyOutcome> {
  const c = creds();
  if (!c) return { ok: false, error: "verify_not_configured" };
  try {
    const res = await fetch(`${VERIFY_BASE}/${c.service}/Verifications`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${c.sid}:${c.token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: phoneE164, Channel: "sms" }),
    });
    if (!res.ok) {
      console.warn("twilio verify start failed", res.status, (await res.text()).slice(0, 300));
      return { ok: false, error: `twilio-${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.warn("twilio verify start network", (e as Error).message);
    return { ok: false, error: "network" };
  }
}

/** Check a code. Only Twilio's "approved" counts. */
export async function checkVerification(phoneE164: string, code: string): Promise<VerifyOutcome> {
  const c = creds();
  if (!c) return { ok: false, error: "verify_not_configured" };
  try {
    const res = await fetch(`${VERIFY_BASE}/${c.service}/VerificationCheck`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${c.sid}:${c.token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: phoneE164, Code: code }),
    });
    if (!res.ok) return { ok: false, error: `twilio-${res.status}` };
    const body = (await res.json()) as { status?: string };
    return body.status === "approved" ? { ok: true } : { ok: false, error: "wrong_code" };
  } catch (e) {
    console.warn("twilio verify check network", (e as Error).message);
    return { ok: false, error: "network" };
  }
}
