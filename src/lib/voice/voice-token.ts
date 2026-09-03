// TWILIO VOICE ACCESS TOKEN — what the browser softphone hands Twilio to place a call. Built by
// hand (HS256 JWT with Twilio's `twilio-fpa;v=1` content type) rather than pulling the whole
// twilio SDK into the server bundle for one signed JSON object.
// https://www.twilio.com/docs/iam/access-tokens
//
// Server-only (node:crypto). The API key SECRET signs it and never leaves the server; the browser
// gets a token that expires in an hour and can only place calls through ONE TwiML App.
// node:crypto is imported dynamically inside the function — a static import here reaches the
// browser bundle through the route files and breaks the production build.

export interface VoiceTokenInput {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  twimlAppSid: string;
  identity: string;
  /** Seconds until expiry. Twilio caps tokens at 24h; an hour is plenty for a call. */
  ttlSeconds?: number;
  now?: number;
}

const b64url = (input: string | Buffer) =>
  Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

export async function voiceAccessToken(i: VoiceTokenInput): Promise<string> {
  const { createHmac, randomUUID } = await import("node:crypto");
  const now = Math.floor((i.now ?? Date.now()) / 1000);
  const ttl = i.ttlSeconds ?? 3600;
  const header = { cty: "twilio-fpa;v=1", typ: "JWT", alg: "HS256" };
  const payload = {
    jti: `${i.apiKeySid}-${randomUUID()}`,
    iss: i.apiKeySid,
    sub: i.accountSid,
    nbf: now,
    exp: now + ttl,
    grants: {
      identity: i.identity,
      voice: {
        outgoing: { application_sid: i.twimlAppSid },
        // No incoming grant: nothing in the product rings the browser. Lee always calls back.
      },
    },
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = createHmac("sha256", i.apiKeySecret).update(signingInput).digest();
  return `${signingInput}.${b64url(sig)}`;
}

/** Decode (no verify) — for tests and the admin page's "token expires in" readout. */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split(".")[1] ?? "";
  const pad = part + "=".repeat((4 - (part.length % 4)) % 4);
  return JSON.parse(Buffer.from(pad.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as Record<string, unknown>;
}
