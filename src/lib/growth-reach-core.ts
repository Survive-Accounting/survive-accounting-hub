// REACH EXTRACTION (pure) — pull contacts out of a page's markup.
// Split from growth-reach.functions.ts so it is unit-testable without the server runtime.

export interface ExtractedContact {
  kind: "email" | "instagram";
  value: string;
  context: string | null; // nearby text, so you can tell whose address it is
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const IG_RE = /instagram\.com\/([A-Za-z0-9_.]{3,30})/g;

const JUNK_EMAIL = /(sentry|example\.|\.png|\.jpg|\.gif|\.svg|@2x|wixpress|godaddy|squarespace)/i;
const JUNK_IG =
  /^(instagram|explore|accounts|p|reel|reels|stories|about|developer|privacy|legal|tv)$/i;

/** Pull contacts out of raw page text/markup. Exported for tests — no network here. */
export function extractContactsFromText(text: string): ExtractedContact[] {
  const out = new Map<string, ExtractedContact>();
  const flat = text.replace(/\s+/g, " ");
  const near = (needle: string): string | null => {
    const at = flat.indexOf(needle);
    // 100 chars of lead-in: enough to catch the heading or label above an address
    // ("Contact Information", "Academic Chair") rather than landing mid-street-address.
    return at >= 0 ? flat.slice(Math.max(0, at - 100), at + needle.length + 30).trim() : null;
  };

  for (const m of text.matchAll(EMAIL_RE)) {
    const value = m[0].toLowerCase();
    if (JUNK_EMAIL.test(value)) continue;
    const key = `email:${value}`;
    if (out.has(key)) continue;
    out.set(key, { kind: "email", value, context: near(m[0]) });
  }
  for (const m of text.matchAll(IG_RE)) {
    const handle = m[1].toLowerCase().replace(/\.$/, "");
    if (JUNK_IG.test(handle)) continue;
    const key = `instagram:${handle}`;
    if (out.has(key)) continue;
    out.set(key, {
      kind: "instagram",
      value: `https://instagram.com/${handle}`,
      context: near(m[0]),
    });
  }
  return [...out.values()].slice(0, 40);
}
