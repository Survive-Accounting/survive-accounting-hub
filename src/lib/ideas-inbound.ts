// INBOUND CAPTURE — the shared half of the text-message and email paths.
//
// THE ALLOWLIST IS THE WHOLE SECURITY MODEL. These endpoints are public URLs
// (Twilio and a mail provider have to reach them), so the sender check is what
// stands between Lee's vault and the internet. An unknown sender gets NO REPLY
// and NOTHING IS STORED — no bounce, no error, no acknowledgement that the
// endpoint exists.
//
// Numbers and addresses live in ENV, never in the repo: they are personal
// contact details for three real people.
//
//   IDEAS_SMS_LEE / IDEAS_SMS_KING / IDEAS_SMS_MCKINSEY      E.164, e.g. +16015551234
//   IDEAS_EMAIL_LEE / IDEAS_EMAIL_KING / IDEAS_EMAIL_MCKINSEY
//
// Anything unset simply has no sender — the path stays closed rather than open.
import { PEOPLE, type Person } from "@/components/ideas/model";

/** Digits only, so +1 (601) 555-1234 and +16015551234 are the same person. */
export const normalizePhone = (raw: string): string => (raw || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

export const normalizeEmail = (raw: string): string => {
  const m = /<([^>]+)>/.exec(raw || "");           // "Lee <lee@x.com>" → lee@x.com
  return (m ? m[1] : raw || "").trim().toLowerCase();
};

const envFor = (kind: "SMS" | "EMAIL", who: Person): string =>
  process.env[`IDEAS_${kind}_${who.toUpperCase()}`] ?? "";

/** Who sent this, or null. Null means: reply nothing, store nothing. */
export function identifyPhone(from: string): Person | null {
  const n = normalizePhone(from);
  if (!n) return null;
  for (const who of PEOPLE) {
    const configured = envFor("SMS", who);
    if (configured && normalizePhone(configured) === n) return who;
  }
  return null;
}

export function identifyEmail(from: string): Person | null {
  const e = normalizeEmail(from);
  if (!e) return null;
  for (const who of PEOPLE) {
    const configured = envFor("EMAIL", who);
    if (configured && normalizeEmail(configured) === e) return who;
  }
  return null;
}

/** A texted category, loosely. "ui", "UI/UX", "uiux" all mean the same thing,
 *  because nobody types an enum from a car. Unrecognised text is NOT a
 *  category — it stays unsorted rather than being guessed at. */
const CATEGORY_WORDS: Record<string, string> = {
  authoring: "AUTHORING", auth: "AUTHORING", content: "AUTHORING",
  filming: "FILMING", film: "FILMING", capture: "FILMING", studio: "FILMING",
  publishing: "PUBLISHING", publish: "PUBLISHING", youtube: "PUBLISHING",
  marketing: "MARKETING", outreach: "MARKETING", reps: "MARKETING", rep: "MARKETING",
  cs: "CUSTOMER_SUCCESS", customer: "CUSTOMER_SUCCESS", students: "CUSTOMER_SUCCESS", support: "CUSTOMER_SUCCESS",
  ui: "UI_UX", ux: "UI_UX", uiux: "UI_UX", design: "UI_UX",
  infra: "INFRASTRUCTURE", infrastructure: "INFRASTRUCTURE", data: "INFRASTRUCTURE", domains: "INFRASTRUCTURE",
};

export function parseCategoryReply(text: string): string[] {
  const words = (text || "").toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const out = new Set<string>();
  for (const w of words) { const c = CATEGORY_WORDS[w]; if (c) out.add(c); }
  return [...out];
}

/** Is this text ONLY a category reply (the "ui" follow-up), rather than a new
 *  idea that happens to contain the word "design"? Short + fully recognised. */
export function looksLikeCategoryReply(text: string): boolean {
  const t = (text || "").trim();
  if (!t || t.length > 40) return false;
  const words = t.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (!words.length || words.length > 3) return false;
  return words.every((w) => CATEGORY_WORDS[w]);
}

/** The SMS replies. Deliberately terse and never chatty — this is a capture
 *  path, not a conversation, and Lee is usually driving. */
export const savedReply = (): string => "Saved. Reply with a category or ignore.";
export const taggedReply = (cats: string[], openCount: number): string => {
  const names = cats.map((c) => (c === "UI_UX" ? "UI/UX" : c.replace("_", " ").toLowerCase())).join(", ");
  return `Tagged ${names}. ${openCount} idea${openCount === 1 ? "" : "s"} open.`;
};

/** Twilio expects TwiML. An empty <Response/> is a silent, valid ack — what an
 *  unknown sender gets, so the endpoint reveals nothing. */
export const twiml = (message?: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><Response>${message ? `<Message>${message.replace(/[<&>]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!))}</Message>` : ""}</Response>`;
