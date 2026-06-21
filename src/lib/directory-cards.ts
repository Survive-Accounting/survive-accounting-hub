// Deterministic "card block" parser for directory pages (faculty, attorneys,
// physicians, consultants, government officials, etc.). The same markdown
// shape appears across verticals once Firecrawl renders the page:
//
//   ![Robert Knisley](photo.jpg)
//   ### **[Robert Knisley](https://.../profile?id=RKNISLE)**
//   Clinical Associate Professor
//   [rknisle@iu.edu](mailto:rknisle@iu.edu)
//
// A "card block" is the contiguous slice of markdown between two heading-link
// anchors (or between a heading-link and the next photo / hr). Within one
// block we pair the NAME with the EMAIL that sits in the same block — never
// reach into a neighboring card. This eliminates the AI-extractor's
// row-pairing mistakes (Robert Knisley accidentally gets neighbor John
// Kniola's email, etc.) without any vertical-specific regex.
//
// This module is pure string/regex code with NO server-only imports, so it
// can be safely imported by any .functions.ts module on either bundle side.

export type DirectoryCard = {
  first_name: string;
  last_name: string;
  title: string | null;
  email: string | null;
  profile_url: string | null;
  /** Character offset of the card's start in the source markdown — useful for
   *  downstream lookups that want to constrain their search window. */
  block_start: number;
  block_end: number;
};

const GENERIC_LOCALS = new Set([
  "info", "contact", "admissions", "support", "webmaster", "noreply",
  "no-reply", "help", "hello", "office", "admin", "media", "press",
  "communications", "marketing", "alumni", "giving", "events", "careers",
  "jobs", "hr", "recruiting", "intake", "appointments",
]);

// Conservative title hint — covers academia, hospitals, law, finance,
// consulting, government. Used only to PREFER a line as title when multiple
// candidates exist inside a block; not used to reject blocks.
const TITLE_HINT_RE =
  /\b(professor|instructor|lecturer|adjunct|clinical|teaching|faculty|dean|chair|practice|visiting|emeritus|distinguished|fellow|director|chief|officer|president|partner|principal|associate|counsel|attorney|physician|surgeon|md|rn|np|pa|nurse|consultant|analyst|manager|advisor|specialist|coordinator|commissioner|secretary|representative|senator|administrator|engineer|scientist|researcher|economist)\b/i;

const HEADING_LINK_RE =
  /^[ \t]{0,3}#{1,6}[ \t]+(?:\*\*|__)?\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)(?:\*\*|__)?[ \t]*$/gim;

// Image-link card (Walton/Uark-style): a markdown link whose link-text is an
// inline image followed by the person's name, with no heading marker. Example:
//   [![Mandi Cooper](photo.jpg)\\
//   \\
//   Mandi Cooper](https://walton.uark.edu/directory/all-faculty/uid/mandic/name/Mandi+Cooper/)
// We use the image alt text as the canonical name (it's always just the name)
// and the outer link as the profile URL.
const IMAGE_LINK_CARD_RE =
  /\[!\[([^\]\n]+)\]\([^)]+\)[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;

const MAILTO_RE = /mailto:([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})/i;
const BARE_EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;

const CREDENTIAL_TAIL_RE =
  /[,\s]+(?:Ph\.?\s?D\.?|D\.?B\.?A\.?|Ed\.?D\.?|D\.?Phil\.?|J\.?S\.?D\.?|C\.?\s?P\.?\s?A\.?|M\.?B\.?A\.?|M\.?S\.?|M\.?Acc\.?|J\.?D\.?|Esq\.?|MD|RN|NP|PA|CFA|CMA|CIA|CFP|CFE|EA)\.?\s*$/i;

function stripCredentialsLocal(raw: string): string {
  let s = raw.trim();
  for (let i = 0; i < 6; i++) {
    const next = s.replace(CREDENTIAL_TAIL_RE, "").trim();
    if (next === s) break;
    s = next;
  }
  return s.replace(/[,\s]+$/, "").trim();
}

function splitNameLocal(fullName: string): { first_name: string; last_name: string } | null {
  const cleaned = stripCredentialsLocal(fullName.replace(/\s+/g, " ").trim());
  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length < 2) return null;
  return { first_name: parts.slice(0, -1).join(" "), last_name: parts.at(-1) ?? "" };
}

function isGenericLocal(local: string): boolean {
  return GENERIC_LOCALS.has(local.toLowerCase());
}

function pickEmailFromBlock(block: string): string | null {
  const mailto = block.match(MAILTO_RE);
  if (mailto) {
    const e = mailto[1].toLowerCase();
    const local = e.split("@")[0];
    if (!isGenericLocal(local)) return e;
  }
  const bares = block.match(BARE_EMAIL_RE) ?? [];
  for (const raw of bares) {
    const e = raw.toLowerCase();
    const local = e.split("@")[0];
    if (isGenericLocal(local)) continue;
    return e;
  }
  return null;
}

function pickTitleFromBlock(block: string, rawName: string): string | null {
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  // Walk lines, skipping headings/links/images/list-bullets/etc.
  for (const line of lines) {
    if (line === rawName) continue;
    if (line.startsWith("#")) continue;
    if (line.startsWith("![")) continue;
    if (line.startsWith(">")) continue;
    if (/^[-*_]{3,}$/.test(line)) continue;
    // Pure link line — skip.
    if (/^\[[^\]]+\]\([^)]+\)$/.test(line)) continue;
    // Mailto / phone-like line — skip.
    if (MAILTO_RE.test(line)) continue;
    if (/^\(?\+?\d[\d\s().\-]{6,}$/.test(line)) continue;
    // Markdown list bullets often hold real titles in academia
    //   "- Professor"  → keep the part after the bullet.
    const bulletMatch = line.match(/^-\s+(.+)$/);
    const candidate = (bulletMatch ? bulletMatch[1] : line).trim();
    if (candidate.length < 2 || candidate.length > 180) continue;
    if (TITLE_HINT_RE.test(candidate)) {
      return candidate.replace(/\s+/g, " ").trim();
    }
  }
  return null;
}

/**
 * Segment `pageText` into card blocks and return one row per block. Cards
 * without a parseable two-token name are skipped. Email/title may be null.
 */
export function parseDirectoryCards(pageText: string): DirectoryCard[] {
  if (!pageText) return [];
  const matches = Array.from(pageText.matchAll(HEADING_LINK_RE));
  if (matches.length === 0) return [];
  const cards: DirectoryCard[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const rawName = (m[1] ?? "").trim();
    const profileUrl = (m[2] ?? "").trim() || null;
    const parsed = splitNameLocal(rawName);
    if (!parsed) continue;
    const blockStart = m.index ?? 0;
    const blockEnd = matches[i + 1]?.index ?? Math.min(pageText.length, blockStart + 2000);
    const block = pageText.slice(blockStart, blockEnd);
    const email = pickEmailFromBlock(block);
    const title = pickTitleFromBlock(block, rawName);
    cards.push({
      first_name: parsed.first_name,
      last_name: parsed.last_name,
      title,
      email,
      profile_url: profileUrl,
      block_start: blockStart,
      block_end: blockEnd,
    });
  }
  return cards;
}

function normKey(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");
}

/** Match key used to align card rows with AI-extracted rows or RMP rows.
 *  Last name + first initial is robust to "Bree" vs "Bree A." vs "B. Josefy".
 */
export function cardMatchKey(firstName: string, lastName: string): string {
  const f = normKey(firstName).slice(0, 1);
  const l = normKey(lastName);
  return `${l}|${f}`;
}

/**
 * Search every cached directory markdown for a card matching this person's
 * name and return the FIRST card whose key matches. Used by RMP reverse-lookup
 * to recover an email/title that lives in a faculty directory card we already
 * scraped — without the risk of grabbing a neighbor's email.
 */
export function findCardForName(
  pages: Iterable<{ url: string; markdown: string }>,
  firstName: string,
  lastName: string,
): { card: DirectoryCard; pageUrl: string } | null {
  const wantKey = cardMatchKey(firstName, lastName);
  const wantLast = normKey(lastName);
  if (!wantLast) return null;
  for (const page of pages) {
    if (!page.markdown) continue;
    // Fast reject — if the last name doesn't appear at all, skip the parse.
    if (!page.markdown.toLowerCase().includes(lastName.toLowerCase())) continue;
    const cards = parseDirectoryCards(page.markdown);
    for (const c of cards) {
      if (cardMatchKey(c.first_name, c.last_name) === wantKey) {
        return { card: c, pageUrl: page.url };
      }
    }
    // Last-name-only fallback (RMP gives "B" + "Josefy", we still want it).
    for (const c of cards) {
      if (normKey(c.last_name) === wantLast) {
        return { card: c, pageUrl: page.url };
      }
    }
  }
  return null;
}
