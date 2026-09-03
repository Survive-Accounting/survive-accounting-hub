// TWILIO REQUEST SIGNATURE — proves a webhook POST came from Twilio and not from anyone who found
// the URL. Twilio signs: the exact URL it requested (query string included) followed by every POST
// parameter's name+value sorted by name, HMAC-SHA1 with the account's auth token, base64.
// https://www.twilio.com/docs/usage/webhooks/webhooks-security
//
// node:crypto is imported DYNAMICALLY inside the functions (the admin-session module does the
// same): a static import here reaches the browser bundle through the route files and fails the
// production build with "createHmac is not exported by __vite-browser-external".

export async function twilioSignatureFor(authToken: string, url: string, params: Record<string, string>): Promise<string> {
  const { createHmac } = await import("node:crypto");
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

/** Constant-time compare of the header against the signature for any of the candidate URLs. A
 *  request behind a proxy can be seen at more than one URL (public host vs. internal), so the
 *  caller passes every URL Twilio might have signed and any match is a pass. */
export async function twilioSignatureValid(
  authToken: string,
  header: string | null | undefined,
  urls: string[],
  params: Record<string, string>,
): Promise<boolean> {
  if (!header) return false;
  const { timingSafeEqual } = await import("node:crypto");
  const got = Buffer.from(header);
  for (const url of urls) {
    const want = Buffer.from(await twilioSignatureFor(authToken, url, params));
    if (want.length === got.length && timingSafeEqual(want, got)) return true;
  }
  return false;
}
