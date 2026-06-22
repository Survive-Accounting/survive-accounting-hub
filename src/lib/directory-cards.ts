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
  const nameLc = rawName.toLowerCase();
  // Walk lines, skipping headings/links/images/list-bullets/etc.
  for (const line of lines) {
    if (line === rawName) continue;
    if (line.startsWith("#")) continue;
    if (line.startsWith("![")) continue;
    if (line.startsWith(">")) continue;
    if (/^[-*_]{3,}$/.test(line)) continue;
    // Pure link line — skip.
    if (/^\[[^\]]+\]\([^)]+\)$/.test(line)) continue;
    // Markdown link FRAGMENT line (image-link card's trailing tail like
    // "Mandi Cooper](https://walton.uark.edu/.../uid/mandic/...)") — these
    // contain a URL inside a closing link paren and must never be treated
    // as a title.
    if (/\]\(https?:\/\//i.test(line)) continue;
    if (/^https?:\/\//i.test(line)) continue;
    // Markdown escape continuation lines (e.g. "\\" inside image-link cards).
    if (/^\\+$/.test(line)) continue;
    // Lines that are literally the name with a stray bracket/paren tail.
    if (line.toLowerCase().startsWith(nameLc) && /[\])]/.test(line.slice(rawName.length, rawName.length + 2))) continue;
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
  type Anchor = { index: number; rawName: string; profileUrl: string | null };
  const anchors: Anchor[] = [];
  for (const m of pageText.matchAll(HEADING_LINK_RE)) {
    anchors.push({
      index: m.index ?? 0,
      rawName: (m[1] ?? "").trim(),
      profileUrl: (m[2] ?? "").trim() || null,
    });
  }
  for (const m of pageText.matchAll(IMAGE_LINK_CARD_RE)) {
    anchors.push({
      index: m.index ?? 0,
      rawName: (m[1] ?? "").trim(),
      profileUrl: (m[2] ?? "").trim() || null,
    });
  }
  if (anchors.length === 0) return [];
  // Sort by position and dedupe overlapping anchors (heading + image at same
  // spot) — keep the first.
  anchors.sort((a, b) => a.index - b.index);
  const deduped: Anchor[] = [];
  for (const a of anchors) {
    const last = deduped[deduped.length - 1];
    if (last && Math.abs(a.index - last.index) < 80) continue;
    deduped.push(a);
  }
  const cards: DirectoryCard[] = [];
  for (let i = 0; i < deduped.length; i++) {
    const a = deduped[i];
    const parsed = splitNameLocal(a.rawName);
    if (!parsed) continue;
    const blockStart = a.index;
    const blockEnd = deduped[i + 1]?.index ?? Math.min(pageText.length, blockStart + 2000);
    const block = pageText.slice(blockStart, blockEnd);
    const email = pickEmailFromBlock(block);
    const title = pickTitleFromBlock(block, a.rawName);
    cards.push({
      first_name: parsed.first_name,
      last_name: parsed.last_name,
      title,
      email,
      profile_url: a.profileUrl,
      block_start: blockStart,
      block_end: blockEnd,
    });
  }
  return cards;
}

// ---------------------------------------------------------------------------
// HTML directory-card parser (operates on rawHtml, not markdown).
//
// Markdown loses two things that break the markdown parser above on common
// WordPress/Drupal faculty directories (e.g. uwosh.edu, many others):
//   1. CSS-hidden contact blocks (class="...hidden"): the mailto email is
//      stripped from the rendered markdown entirely → "no email found".
//   2. Class-tagged cards that don't render as markdown headings, and whose
//      <img> alt is "profile photo" instead of the person's name → the
//      markdown/AI extractors find no people at all.
// Firecrawl returns the rawHtml regardless, so we parse the structured cards
// straight from HTML: anchor on each non-generic mailto: link, then read the
// name/title/profile-url out of the card that immediately precedes it.
// Generalizes to any directory that pairs a class="...name..." /
// "...title..." element with a mailto link.
// ---------------------------------------------------------------------------

const HTML_MAILTO_GLOBAL_RE = /mailto:([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})/gi;

function decodeEntitiesLite(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&#0*39;|&apos;|&rsquo;|&#8217;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikePersonName(raw: string): boolean {
  const cleaned = raw.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length < 3 || cleaned.length > 60) return false;
  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return false;
  if (!parts.every((p) => /^[A-Za-z][A-Za-z.'’-]*$/.test(p))) return false;
  if (/\b(profile|photo|image|portrait|headshot|faculty|staff|directory|department|news|email|phone|read more|view|click|learn)\b/i.test(cleaned)) {
    return false;
  }
  return true;
}

// Text of the LAST element in `html` whose class matches `classRe`. Matches
// only elements whose content is DIRECT text (no nested tags) — this is what
// targets the innermost name/title element (e.g. <span class="person-name">)
// rather than a wrapper like <span class="person-meta"> that contains it.
function lastClassElementText(html: string, classRe: RegExp): string | null {
  const re = /class="([^"]*)"[^>]*>\s*([^<>]{1,90}?)\s*</gi;
  let best: string | null = null;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(html)) !== null) {
    if (!classRe.test(mm[1])) continue;
    const text = decodeEntitiesLite(mm[2]);
    if (text) best = text;
  }
  return best;
}

// Last real (non-asset) http href in `html` — the person's profile page.
function lastProfileHref(html: string): string | null {
  const re = /href="(https?:\/\/[^"]+)"/gi;
  let best: string | null = null;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(html)) !== null) {
    const u = mm[1];
    if (/\.(?:jpg|jpeg|png|gif|svg|webp|css|js|ico)(?:[?#]|$)/i.test(u)) continue;
    best = u;
  }
  return best;
}

/**
 * Parse faculty cards directly from rendered rawHtml. One card per non-generic
 * mailto: link, with name/title/profile-url read from the same card. Returns
 * the same DirectoryCard shape as parseDirectoryCards so callers can merge the
 * two sources. Offsets are approximate (window-based), which is fine — they're
 * only used as search hints.
 */
export function parseDirectoryCardsFromHtml(html: string): DirectoryCard[] {
  if (!html || !html.includes("mailto:")) return [];
  const cards: DirectoryCard[] = [];
  const seen = new Set<string>();
  HTML_MAILTO_GLOBAL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HTML_MAILTO_GLOBAL_RE.exec(html)) !== null) {
    const email = m[1].toLowerCase();
    if (isGenericLocal(email.split("@")[0])) continue;
    if (seen.has(email)) continue;
    // The card's name/title sit just BEFORE the (often CSS-hidden) email block.
    const winStart = Math.max(0, m.index - 1600);
    const before = html.slice(winStart, m.index);
    const rawName = lastClassElementText(before, /name/i);
    if (!rawName || !looksLikePersonName(rawName)) continue;
    const parsed = splitNameLocal(rawName.replace(/\([^)]*\)/g, " "));
    if (!parsed) continue;
    seen.add(email);
    const title = lastClassElementText(before, /title|position|rank|role/i);
    cards.push({
      first_name: parsed.first_name,
      last_name: parsed.last_name,
      title: title && title.length <= 90 ? title : null,
      email,
      profile_url: lastProfileHref(before),
      block_start: winStart,
      block_end: m.index,
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
