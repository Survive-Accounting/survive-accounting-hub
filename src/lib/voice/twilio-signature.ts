// TWILIO REQUEST SIGNATURE — proves a webhook POST came from Twilio and not from anyone who found
// the URL. Twilio signs: the exact URL it requested (query string included) followed by every POST
// parameter's name+value sorted by name, HMAC-SHA1 with the account's auth token, base64.
// https://www.twilio.com/docs/usage/webhooks/webhooks-security
//
// Server-only (node:crypto). Import dynamically from route handlers.
import { createHmac, timingSafeEqual } from "node:crypto";

export function twilioSignatureFor(authToken: string, url: string, params: Record<string, string>): string {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

/** Constant-time compare of the header against the signature for any of the candidate URLs. A
 *  request behind a proxy can be seen at more than one URL (public host vs. internal), so the
 *  caller passes every URL Twilio might have signed and any match is a pass. */
export function twilioSignatureValid(
  authToken: string,
  header: string | null | undefined,
  urls: string[],
  params: Record<string, string>,
): boolean {
  if (!header) return false;
  const got = Buffer.from(header);
  for (const url of urls) {
    const want = Buffer.from(twilioSignatureFor(authToken, url, params));
    if (want.length === got.length && timingSafeEqual(want, got)) return true;
  }
  return false;
}
