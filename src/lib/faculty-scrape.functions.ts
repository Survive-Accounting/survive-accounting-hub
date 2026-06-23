// Per-campus faculty page scraper, powered by Firecrawl.
// Two entry points:
//   - scrapeCampusFaculty: given explicit URLs, Firecrawl-scrape each, then
//     ask the AI to extract real faculty entries (no email pattern-guessing).
//   - autoDiscoverCampusFaculty: use Firecrawl Map against the campus website
//     to discover faculty/directory pages, then run the same scrape+extract.
// Results land in campus_lead_suggestions with research_mode='faculty_scrape'
// and status='pending' for human review.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  detectProgramLevels,
  mergeDetections,
  EMPTY_DETECTION,
  type ProgramLevelDetection,
} from "@/lib/program-levels";
import { parseDirectoryCards, parseDirectoryCardsFromHtml, cardMatchKey } from "@/lib/directory-cards";

// ---- Network hardening -----------------------------------------------------
// Every outbound fetch (Firecrawl + AI gateway) has a hard timeout so a single
// hung upstream call can't pin a background scrape forever. Timeouts are tuned
// per call type: scrapes/AI are slowest, search/map are fastest.
const FIRECRAWL_SCRAPE_TIMEOUT_MS = 60_000;
const FIRECRAWL_MAP_TIMEOUT_MS = 45_000;
const FIRECRAWL_SEARCH_TIMEOUT_MS = 45_000;
const AI_TIMEOUT_MS = 90_000;
const AI_PDF_TIMEOUT_MS = 180_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if ((e as { name?: string } | null)?.name === "AbortError") {
      throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw new Error(`${label} failed: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
  }
}

// Turn upstream HTTP/AI errors into short human-readable strings.
function slickHttpError(label: string, status: number, body: string): string {
  const snippet = body.replace(/\s+/g, " ").trim().slice(0, 160);
  if (status === 401 || status === 403) return `${label} auth error (${status}). Check API key.`;
  if (status === 402) return `${label} out of credits (402).`;
  if (status === 404) return `${label}: page not found (404).`;
  if (status === 408 || status === 504) return `${label} upstream timeout (${status}).`;
  if (status === 429) return `${label} rate-limited (429). Try again shortly.`;
  if (status >= 500) return `${label} server error (${status}).`;
  return `${label} ${status}${snippet ? `: ${snippet}` : ""}`;
}

// Direct (non-Firecrawl) fetch of a directory page's TRUE source HTML.
// Firecrawl renders pages and prunes CSS-hidden nodes (display:none) from BOTH
// markdown and rawHtml — which on many WordPress/Drupal faculty directories
// hides the mailto: emails (they sit in a class="...hidden" block). A plain
// server-side fetch returns the unprocessed source where those mailto links are
// intact, so the HTML card parser can recover name+title+email. Best-effort:
// returns "" on any failure (blocked/timeout/non-HTML) and the caller falls
// back to Firecrawl's rawHtml.
async function fetchRawPageHtml(url: string, timeoutMs = 5_000): Promise<string> {
  try {
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      },
      timeoutMs,
      "Raw page fetch",
    );
    if (!res.ok) return "";
    const ct = res.headers.get("content-type") ?? "";
    if (ct && !/html|xml|text/i.test(ct)) return "";
    const html = await res.text();
    return html.length > 200 ? html : "";
  } catch {
    return "";
  }
}

const ScrapeInputSchema = z.object({
  campusId: z.string().uuid(),
  urls: z.array(z.string().url()).min(1).max(10),
  /** When true, save name-only rows (no email/profile URL) anchored to the
   *  directory URL. Used by the auto-scrape pipeline so RMP enrichment can
   *  still match by name on card-only directories. */
  allowNoContact: z.boolean().optional().default(false),
});

const DiscoverInputSchema = z.object({
  campusId: z.string().uuid(),
  maxPages: z.number().int().min(1).max(10).default(5),
  /** If true, only discover & rank URLs (save to faculty_page_url); skip the
   *  heavy AI scrape. Keeps the Worker request under 30s. */
  discoverOnly: z.boolean().default(false),
});

const PdfInputSchema = z.object({
  campusId: z.string().uuid(),
  filename: z.string().min(1).max(200),
  // base64-encoded PDF bytes (without data: prefix). Cap ~12MB encoded.
  fileBase64: z.string().min(100).max(16_000_000),
});

type Extracted = {
  first_name: string;
  last_name: string;
  title: string | null;
  email: string | null;
  profile_url: string | null;
  is_phd: boolean;
  is_cpa: boolean;
  /** How the email was sourced. Absent/'verified' = scraped directly from
   *  the page. 'directory' = found near the name on the directory page.
   *  'inferred' = synthesized from the dept's dominant email pattern; the
   *  UI shows these as "guessed" so a human can spot-check before send.
   *  'news' = name pulled from a news/blog/spotlight page; almost never a
   *  tenure-track contact — flagged so reviewers can deprioritize. */
  email_confidence?: "verified" | "directory" | "inferred" | "news";
  /** Ancillary links harvested from the person's profile page (best-effort).
   *  Stored in raw_payload for later enrichment + marketing; not required. */
  links?: { linkedin?: string; cv?: string; personal?: string };
};


// Path segments (between slashes) that strongly indicate a faculty roster page.
const STRONG_PATH_TOKENS = ["faculty", "faculty-and-staff", "faculty-staff", "directory", "people", "our-people", "our-team", "team", "staff", "instructors"];
// Soft signals — used to break ties between otherwise-equal pages.
const SOFT_TOKENS = ["accountancy", "accounting", "school-of-accountancy", "soa"];
// Always-skip patterns. egrove = Ole Miss publication archive that polluted
// our earlier picks; news/blog/event/etc. are never staff rosters.
const HARD_EXCLUDE = [
  ".pdf", "/news", "/event", "/blog", "/calendar", "/alumni",
  "/donate", "/giving", "/give", "/apply", "/admission",
  "/syllabus", "egrove.olemiss.edu", "/cgi/", "viewcontent",
  "/research", "/publication", "/cite",
];
// 4-digit year in path (e.g. /2024/, /2007-2008) = archived directory PDFs.
const YEAR_RE = /\/(?:19|20)\d{2}(?:[-_/]|$)/;
const TEACHING_TITLE_RE = /\b(professor|instructor|lecturer|adjunct|clinical|teaching|faculty|dean|chair|practice|visiting)\b/i;
// Max profile pages we'll open per run to backfill missing email/title. This is
// the main coverage↔cost dial: higher = better coverage, more Firecrawl spend.
// At ~$0.0012/profile a full 120-person sweep is ~$0.14 — watch the cost meter.
const PROFILE_ENRICH_LIMIT = 120;
const PROFILE_ENRICH_CONCURRENCY = 4;
const PROFILE_SCRAPE_TIMEOUT_MS = 20_000;
const URL_PROCESS_CONCURRENCY = 3;
const DIRECTORY_WAIT_MS = 3500;
const BATCH_SCRAPE_TIMEOUT_MS = 90_000;
// After this many empty/error fetches from the same host inside one enrichment
// pass, skip the rest. Anti-bot blocks usually fail every URL on that host —
// no point burning credits + 20s of timeout per profile. (Raised from 2 → 4 so
// a couple of slow/missing pages don't abandon an otherwise-good host.)
const PER_HOST_FAIL_LIMIT = 4;
// If the primary scrape returns fewer than this many emails AND we have a
// usable root domain, run one Firecrawl `map` fallback to discover the real
// faculty roster page and re-scrape.
const MAP_FALLBACK_EMAIL_THRESHOLD = 5;

// ---- JS-pagination handling -----------------------------------------------
// Many .edu directories (Drupal Views, WordPress AJAX, custom XHR tables,
// "Load more" buttons, infinite scroll) render only page 1 server-side and
// fetch pages 2+ via JS that doesn't change the URL. A vanilla Firecrawl
// scrape only sees page 1. We detect this pattern and re-scrape with
// Firecrawl `actions` that click Next/Load more N times and capture HTML
// from each step. Generalizable across schools.
const MAX_PAGINATION_PAGES = 8;
const MIN_EXTRACTED_BEFORE_PAGINATION = 15;
const PAGINATION_STEP_WAIT_MS = 1500;
const PAGINATION_ACTIONS_TIMEOUT_MS = 180_000;
const PAGINATION_NEXT_SELECTOR =
  'a[rel="next"], a.next, button.next, [aria-label*="Next" i], [aria-label*="next page" i], .pagination a:not(.disabled):not(.current), .pager__item--next a, .page-item:not(.disabled) a.page-link[aria-label*="next" i], button:has-text("Load more"), button:has-text("Show more"), a:has-text("Next"), a:has-text("›"), a:has-text("»")';
// Markdown- or HTML-visible signals that the directory is paginated.
const PAGINATION_SIGNALS: Array<{ name: string; re: RegExp }> = [
  { name: "next-link", re: /(?:^|[\s>"'(])(next\s*(?:page|»|›)?|load\s+more|show\s+more|»|›)(?:[\s<"')]|$)/im },
  { name: "showing-of", re: /\bshowing\s+\d+\s*[–\-to]+\s*\d+\s+of\s+\d+/i },
  { name: "page-of", re: /\bpage\s+\d+\s+of\s+\d+\b/i },
  { name: "rel-next", re: /<a[^>]+rel=["']next["']/i },
  { name: "pagination-class", re: /class=["'][^"']*\bpagination\b/i },
  { name: "aria-page", re: /aria-label=["'][^"']*\bpage\s*\d/i },
  { name: "ajax-endpoint", re: /(\?page=\d+|&p=\d+|admin-ajax\.php|chunk\.php|wp-json|\/api\/[a-z-]+\/page)/i },
  { name: "numeric-pager", re: /\n\s*\[?\s*1\s*\]?\s+\[?\s*2\s*\]?\s+\[?\s*3\s*\]?\s+\[?\s*4\s*\]?/m },
];

function detectPagination(markdown: string, rawHtml: string, extractedCount: number):
  { paginated: boolean; signal?: string } {
  if (extractedCount >= MIN_EXTRACTED_BEFORE_PAGINATION) return { paginated: false };
  const hay = `${markdown}\n${rawHtml}`;
  if (!hay.trim()) return { paginated: false };
  for (const s of PAGINATION_SIGNALS) {
    if (s.re.test(hay)) return { paginated: true, signal: s.name };
  }
  return { paginated: false };
}

/** Cheap HTML→text strip that keeps mailto: hrefs visible so the existing
 *  email regex still matches. Used to feed the AI extractor a concatenated
 *  multi-page payload from a Firecrawl actions walk. */
function htmlToFlatText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<a[^>]+href=["']mailto:([^"']+)["'][^>]*>([^<]*)<\/a>/gi, " $2 <$1> ")
    .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi, " $2 [$1] ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// URL shape hints: news/blog/spotlight pages produce names that are almost
// always students, alumni, or one-off featured profiles — not tenure-track
// faculty. We still extract them, but tag email_confidence='news' and skip
// per-profile enrichment so we don't burn credits chasing dated blog posts.
const NEWS_PATH_RE = /(\/spotlight|\/news|\/blog|\/stor(y|ies)|\/press|\/article|\/alumni-profile|\/feature|\/podcast)\b/i;
const BLOG_DATE_PATH_RE = /\/(?:19|20)\d{2}\/\d{1,2}\/\d{1,2}\//;


function looksLikeNewsPage(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    const path = u.pathname.toLowerCase();
    if (NEWS_PATH_RE.test(path)) return true;
    if (BLOG_DATE_PATH_RE.test(path)) return true;
    const host = u.hostname.toLowerCase();
    if (/^blog\.|\.blog\./.test(host)) return true;
    if (/^news\.|\.news\./.test(host)) return true;
    return false;
  } catch { return false; }
}


// Credential detection — used both to flag the row and to strip trailing
// credentials from displayed names ("Jane Doe, PhD, CPA" → "Jane Doe").
const PHD_RE = /\b(Ph\.?\s?D\.?|D\.?B\.?A\.?|Ed\.?D\.?|D\.?Phil\.?|Doctorate|J\.?S\.?D\.?)\b/i;
const CPA_RE = /\bC\.?\s?P\.?\s?A\.?\b/i;
const CREDENTIAL_TAIL_RE = /[,\s]+(?:Ph\.?\s?D\.?|D\.?B\.?A\.?|Ed\.?D\.?|D\.?Phil\.?|J\.?S\.?D\.?|C\.?\s?P\.?\s?A\.?|M\.?B\.?A\.?|M\.?S\.?|M\.?Acc\.?|J\.?D\.?|Esq\.?|CFA|CMA|CIA|CFP|CFE|EA)\.?\s*$/i;

function stripCredentials(raw: string): string {
  let s = raw.trim();
  // Repeatedly strip trailing credentials separated by comma/space.
  for (let i = 0; i < 6; i++) {
    const next = s.replace(CREDENTIAL_TAIL_RE, "").trim();
    if (next === s) break;
    s = next;
  }
  return s.replace(/[,\s]+$/, "").trim();
}

function detectCredentials(...sources: Array<string | null | undefined>): { is_phd: boolean; is_cpa: boolean } {
  const haystack = sources.filter(Boolean).join(" | ");
  return { is_phd: PHD_RE.test(haystack), is_cpa: CPA_RE.test(haystack) };
}

function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    url.pathname = url.pathname.replace(/\/index\.php$/i, "").replace(/\/+$/, "");
    return url.toString();
  } catch {
    return raw.trim();
  }
}

function splitName(fullName: string): { first_name: string; last_name: string } | null {
  const cleaned = stripCredentials(fullName.replace(/\s+/g, " ").trim());
  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length < 2) return null;
  return { first_name: parts.slice(0, -1).join(" "), last_name: parts.at(-1) ?? "" };
}

function extractDirectoryMarkdownPeople(pageText: string): Extracted[] {
  const headingLink = /^#{2,4}\s+\[([^\]]+)]\((https?:\/\/[^)]+)\)\s*$/gim;
  const matches = Array.from(pageText.matchAll(headingLink));
  const people: Extracted[] = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const rawName = (match[1] ?? "").trim();
    const profileUrl = normalizeUrl(match[2] ?? "");
    const parsedName = splitName(rawName);
    if (!parsedName || !profileUrl) continue;

    const start = (match.index ?? 0) + match[0].length;
    const end = matches[i + 1]?.index ?? Math.min(pageText.length, start + 800);
    const block = pageText.slice(start, end);
    const title = block.match(/^\s*-\s+(.+?)\s*$/m)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
    if (title && !TEACHING_TITLE_RE.test(title)) continue;

    const creds = detectCredentials(rawName, title);
    people.push({ ...parsedName, title, email: null, profile_url: profileUrl, ...creds });
  }

  return people;
}

function extractBestEmail(pageText: string): string | null {
  const emails = Array.from(new Set(pageText.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []))
    .map((e) => e.toLowerCase())
    .filter((e) => !/^(info|contact|admissions|support|webmaster|umaccy)@/i.test(e));
  return emails[0] ?? null;
}

/**
 * Recover emails that are obfuscated to defeat naive scrapers, e.g.
 *   "jane.doe [at] anderson.ucla.edu"
 *   "jane (dot) doe (at) ucla (dot) edu"
 *   "jane DOT doe AT ucla DOT edu"
 * Returns the first plausible email it can reconstruct, or null.
 */
function extractObfuscatedEmail(pageText: string): string | null {
  if (!pageText) return null;
  // Normalize " (dot) ", " [dot] ", " DOT ", etc. → "."  and same for "at" → "@"
  // Only inside short windows around an obvious "at" marker so we don't
  // mangle real text.
  const re = /([A-Za-z0-9._+\-]+)\s*[\[\(]?\s*(?:at|@)\s*[\]\)]?\s*([A-Za-z0-9.\-]+(?:\s*[\[\(]?\s*(?:dot|\.)\s*[\]\)]?\s*[A-Za-z0-9.\-]+)+)/gi;
  const dotRe = /\s*[\[\(]?\s*(?:dot|\.)\s*[\]\)]?\s*/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pageText)) !== null) {
    const local = m[1].trim();
    const domain = m[2].replace(dotRe, ".").replace(/\s+/g, "").toLowerCase();
    if (!/^[a-z0-9.\-]+\.[a-z]{2,}$/.test(domain)) continue;
    const email = `${local.toLowerCase()}@${domain}`;
    if (/^(info|contact|admissions|support|webmaster)@/i.test(email)) continue;
    return email;
  }
  return null;
}

/** Pull the first non-generic mailto: href out of a raw HTML blob. */
function extractMailtoFromHtml(rawHtml: string): string | null {
  if (!rawHtml) return null;
  const matches = Array.from(rawHtml.matchAll(/mailto:([^"'?<>\s]+)/gi)).map((m) => m[1].trim().toLowerCase());
  for (const e of matches) {
    if (!e.includes("@")) continue;
    if (/^(info|contact|admissions|support|webmaster|noreply|no-reply)@/i.test(e)) continue;
    return e;
  }
  return null;
}

function safeFromCodePoint(code: number): string {
  try { return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ""; } catch { return ""; }
}

/**
 * Decode the two most common email-obfuscation encodings seen on professional-
 * services directories (the `obfuscated_mailto_hex_decoding` pattern):
 *   - percent/hex encoding   — mailto:%6a%6f%68%6e%40site.edu  → mailto:john@site.edu
 *   - HTML numeric entities  — j&#111;hn&#64;site&#46;edu       → john@site.edu
 *                              (both decimal &#64; and hex &#x40; forms)
 *   - a few named entities   — &commat; &period; &amp;
 * Best-effort and never throws — a malformed token is left as-is so we don't
 * corrupt the surrounding text. Returns a decoded COPY for the extractors to
 * re-scan; the original markdown/HTML is untouched.
 */
function decodeObfuscatedEntities(s: string): string {
  if (!s) return "";
  let out = s;
  // Hex numeric entities (&#x6a; / &#X6A) — trailing ';' optional in the wild.
  out = out.replace(/&#x([0-9a-f]+);?/gi, (m, h: string) => safeFromCodePoint(parseInt(h, 16)) || m);
  // Decimal numeric entities (&#106;).
  out = out.replace(/&#(\d+);?/g, (m, d: string) => safeFromCodePoint(parseInt(d, 10)) || m);
  // Percent-encoding (%6a%40…). Decode each run as one token so a UTF-8
  // multi-byte sequence decodes correctly and a stray '%' can't throw.
  out = out.replace(/(?:%[0-9a-f]{2})+/gi, (seq) => {
    try { return decodeURIComponent(seq); } catch { return seq; }
  });
  // Common named entities used to hide '@' and '.'.
  out = out.replace(/&commat;/gi, "@").replace(/&period;/gi, ".").replace(/&amp;/gi, "&");
  return out;
}

/**
 * Recover an email hidden behind a hex/percent- or HTML-entity-encoded
 * `mailto:` href — the actual `obfuscated_mailto_hex_decoding` pattern.
 *
 * Deliberately mailto-ONLY: we decode the raw HTML and pull a mailto: href out
 * of the decoded copy, but we do NOT run the loose plain/(at)(dot) extractors
 * over decoded blobs. On large pages those scavenge an unrelated email from the
 * footer/scripts and mis-attribute it, or fabricate junk from prose
 * (e.g. "integr@ed-macc.php"). A mailto: anchor is a strong signal that the
 * decoded string really is this person's address.
 */
function extractEncodedEmail(rawHtml: string): string | null {
  const decodedHtml = decodeObfuscatedEntities(rawHtml);
  // Only worth re-scanning if decoding actually changed something.
  if (decodedHtml === rawHtml) return null;
  return extractMailtoFromHtml(decodedHtml);
}

const GENERIC_LOCALS_RE = /^(info|contact|admissions|support|webmaster|noreply|no-reply|help|hello|office|admin)$/i;

/**
 * Look for an email that appears near a person's name inside a larger blob
 * of markdown (typically the directory page). Many .edu directories list
 * "Jane Doe ... jane.doe@uni.edu" in a single card even though the
 * individual profile page hides the email.
 */
// Lines that mark a card boundary on a directory page. We never let the
// "email near this name" search cross one of these — that's how Robert
// Knisley used to inherit John Kniola's email.
const CARD_DELIM_RE = /(?:^|\n)\s*(?:#{1,6}\s+|!\[|---+\s*$|\*\*\*+\s*$|<h[1-6][^>]*>)/g;

function blockBoundsFor(pageText: string, hitIndex: number): { start: number; end: number } {
  let start = 0;
  let end = pageText.length;
  CARD_DELIM_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CARD_DELIM_RE.exec(pageText)) !== null) {
    if (m.index <= hitIndex) start = m.index;
    else { end = m.index; break; }
  }
  return { start, end };
}

function findEmailNearName(
  pageText: string,
  firstName: string,
  lastName: string,
): string | null {
  if (!pageText || !lastName) return null;
  const ln = lastName.toLowerCase().replace(/[^a-z]/g, "");
  const fn = (firstName ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (ln.length < 3) return null;
  const haystack = pageText.toLowerCase();
  const nameRe = new RegExp(`\\b${fn ? `${fn}[\\s,.'\\-]+` : ""}${ln}\\b`, "gi");
  let m: RegExpExecArray | null;
  while ((m = nameRe.exec(haystack)) !== null) {
    // Constrain to the card block this name sits in — never cross a heading,
    // image marker, or horizontal rule. Generalizes across verticals.
    const { start, end } = blockBoundsFor(pageText, m.index);
    const window = pageText.slice(start, end);
    const emails = window.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [];
    for (const raw of emails) {
      const e = raw.toLowerCase();
      const local = e.split("@")[0];
      if (GENERIC_LOCALS_RE.test(local)) continue;
      // Prefer an email whose local part actually contains the last name.
      if (local.replace(/[^a-z]/g, "").includes(ln)) return e;
    }
    // Block-bounded fallback: only return a non-generic email if it shares
    // ANY letters with the last name (filters out the cross-card grabs).
    for (const raw of emails) {
      const e = raw.toLowerCase();
      const local = e.split("@")[0];
      if (GENERIC_LOCALS_RE.test(local)) continue;
      const localClean = local.replace(/[^a-z]/g, "");
      if (!localClean) continue;
      // Accept only if the local part starts with the first initial of the
      // last name, OR the last name starts with the first letter of the
      // local part. Rejects neighbor emails whose local has nothing to do
      // with this person.
      if (localClean[0] === ln[0] || ln[0] === localClean[0]) return e;
    }
  }
  return null;
}

/**
 * Detect the dominant email pattern for a department from the emails we DID
 * capture. Returns a function that, given (firstName, lastName), produces an
 * inferred email — but only when ≥3 captured emails agree on one pattern
 * with the same domain. Otherwise returns null (don't guess).
 *
 * Supported patterns (the ones .edu IT departments actually use):
 *   first.last, first_last, firstlast, flast, lastf, first, last,
 *   firstinitial.last
 */
type EmailPattern =
  | "first.last" | "first_last" | "firstlast" | "flast" | "lastf"
  | "first" | "last" | "f.last" | "first.l";

function clean(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

function patternFor(local: string, fn: string, ln: string): EmailPattern | null {
  const f = clean(fn);
  const l = clean(ln);
  if (!f || !l) return null;
  const lo = local.toLowerCase();
  if (lo === `${f}.${l}`) return "first.last";
  if (lo === `${f}_${l}`) return "first_last";
  if (lo === `${f}${l}`) return "firstlast";
  if (lo === `${f[0]}${l}`) return "flast";
  if (lo === `${l}${f[0]}`) return "lastf";
  if (lo === `${f[0]}.${l}`) return "f.last";
  if (lo === `${f}.${l[0]}`) return "first.l";
  if (lo === f) return "first";
  if (lo === l) return "last";
  return null;
}

function applyPattern(pattern: EmailPattern, fn: string, ln: string): string | null {
  const f = clean(fn);
  const l = clean(ln);
  if (!f || !l) return null;
  switch (pattern) {
    case "first.last": return `${f}.${l}`;
    case "first_last": return `${f}_${l}`;
    case "firstlast":  return `${f}${l}`;
    case "flast":      return `${f[0]}${l}`;
    case "lastf":      return `${l}${f[0]}`;
    case "f.last":     return `${f[0]}.${l}`;
    case "first.l":    return `${f}.${l[0]}`;
    case "first":      return f;
    case "last":       return l;
  }
}

// Kill-switch for Recovery pass B (email pattern inference). When false we
// NEVER synthesize a "guessed" email from the department's dominant pattern —
// only emails actually scraped from the page are kept. Guessed emails created
// false-positive "GUESSED" leads that bounced; turn this back on only if you
// re-introduce a confidence gate the outreach side respects.
const ENABLE_EMAIL_INFERENCE = false;

function inferDepartmentPattern(
  people: Extracted[],
): { domain: string; pattern: EmailPattern; sampleSize: number } | null {
  // Bucket: domain -> pattern -> count
  const tally = new Map<string, Map<EmailPattern, number>>();
  for (const p of people) {
    if (!p.email || !p.first_name || !p.last_name) continue;
    const [local, domain] = p.email.split("@");
    if (!local || !domain) continue;
    const pat = patternFor(local, p.first_name, p.last_name);
    if (!pat) continue;
    const inner = tally.get(domain) ?? new Map<EmailPattern, number>();
    inner.set(pat, (inner.get(pat) ?? 0) + 1);
    tally.set(domain, inner);
  }
  let best: { domain: string; pattern: EmailPattern; sampleSize: number } | null = null;
  for (const [domain, patterns] of tally) {
    for (const [pattern, count] of patterns) {
      if (count < 3) continue; // safety threshold — never infer from sparse data
      if (!best || count > best.sampleSize) {
        best = { domain, pattern, sampleSize: count };
      }
    }
  }
  return best;
}



function mergePeople(...groups: Extracted[][]): Extracted[] {
  const byKey = new Map<string, Extracted>();
  for (const person of groups.flat()) {
    const key = person.email ?? person.profile_url ?? `${person.first_name}|${person.last_name}`.toLowerCase();
    const existing = byKey.get(key);
    byKey.set(key, {
      first_name: existing?.first_name || person.first_name,
      last_name: existing?.last_name || person.last_name,
      title: person.title || existing?.title || null,
      email: person.email || existing?.email || null,
      profile_url: person.profile_url || existing?.profile_url || null,
      is_phd: !!(existing?.is_phd || person.is_phd),
      is_cpa: !!(existing?.is_cpa || person.is_cpa),
    });
  }
  return Array.from(byKey.values());
}

/**
 * Merge AI-extracted people INTO deterministic card-parsed people so the card
 * email always wins. Tracks how often the AI email was overridden so the
 * debug bundle can surface the metric to Scraper Trends. AI rows whose
 * last-name+first-initial don't appear in the card set are appended (covers
 * table/freeform layouts the card parser can't see).
 */
function mergeWithCardOverride(
  cardPeople: Extracted[],
  aiPeople: Extracted[],
): { merged: Extracted[]; aiEmailOverridden: number } {
  const idx = new Map<string, Extracted>();
  for (const c of cardPeople) {
    const key = cardMatchKey(c.first_name, c.last_name);
    if (!key.startsWith("|") && !idx.has(key)) idx.set(key, c);
  }
  let aiEmailOverridden = 0;
  for (const a of aiPeople) {
    const key = cardMatchKey(a.first_name, a.last_name);
    const c = idx.get(key);
    if (c) {
      // Backfill missing card fields from the AI row.
      if (!c.title && a.title) c.title = a.title;
      if (!c.is_phd && a.is_phd) c.is_phd = true;
      if (!c.is_cpa && a.is_cpa) c.is_cpa = true;
      if (!c.profile_url && a.profile_url) c.profile_url = a.profile_url;
      // If the card already has an email, it wins. If AI disagreed, count it.
      if (c.email && a.email && c.email !== a.email) aiEmailOverridden++;
      if (!c.email && a.email) c.email = a.email;
      continue;
    }
    cardPeople.push(a);
    idx.set(key, a);
  }
  return { merged: cardPeople, aiEmailOverridden };
}

/** Convert a DirectoryCard into the Extracted shape used by the pipeline. */
function cardsToExtracted(cards: ReturnType<typeof parseDirectoryCards>): Extracted[] {
  return cards
    .map((c) => {
      if (!c.first_name || !c.last_name) return null;
      const creds = detectCredentials(c.first_name, c.last_name, c.title);
      return {
        first_name: c.first_name,
        last_name: c.last_name,
        title: c.title,
        email: c.email,
        profile_url: c.profile_url ? normalizeUrl(c.profile_url) : null,
        is_phd: creds.is_phd,
        is_cpa: creds.is_cpa,
      } as Extracted;
    })
    .filter((p): p is Extracted => !!p);
}

/**
 * Merge two deterministic card sources (markdown + rawHTML) into one list,
 * deduped by last-name+first-initial. `primary` wins on conflicts; missing
 * fields (notably email) are backfilled from `secondary`. Used so the rawHtml
 * parser can supply emails/titles the markdown parser lost to CSS-hiding,
 * without double-listing anyone.
 */
function combineCardSources(primary: Extracted[], secondary: Extracted[]): Extracted[] {
  const byKey = new Map<string, Extracted>();
  const add = (p: Extracted) => {
    if (!p.first_name || !p.last_name) return;
    const key = cardMatchKey(p.first_name, p.last_name);
    const ex = byKey.get(key);
    if (!ex) { byKey.set(key, { ...p }); return; }
    ex.title = ex.title ?? p.title;
    ex.email = ex.email ?? p.email;
    ex.profile_url = ex.profile_url ?? p.profile_url;
    ex.is_phd = ex.is_phd || p.is_phd;
    ex.is_cpa = ex.is_cpa || p.is_cpa;
  };
  for (const p of primary) add(p);
  for (const p of secondary) add(p);
  return Array.from(byKey.values());
}

/**
 * Try to attach a profile_url to people the AI returned with no link, using
 * the full set of links Firecrawl pulled off the directory page. A profile
 * URL counts as a match when (a) it's on the same host as the directory and
 * (b) its last path segment looks like the person's last name (allowing
 * "lastname", "firstname-lastname", or "lastname-firstname").
 */
function attachProfileUrlsFromLinks(
  people: Extracted[],
  directoryUrl: string,
  links: string[],
): { people: Extracted[]; matched: number } {
  let dirHost = "";
  try { dirHost = new URL(directoryUrl).hostname.replace(/^www\./, "").toLowerCase(); } catch { /* ignore */ }
  if (!dirHost) return { people, matched: 0 };

  // Index candidate links by their last path segment, on the same host only.
  const slugIndex = new Map<string, string>();
  for (const link of links) {
    try {
      const u = new URL(link);
      const host = u.hostname.replace(/^www\./, "").toLowerCase();
      if (host !== dirHost && !host.endsWith(`.${dirHost}`)) continue;
      const segs = u.pathname.split("/").filter(Boolean);
      const last = (segs.at(-1) ?? "").toLowerCase();
      if (!last || last.length < 3 || /\.(pdf|jpg|png|gif|svg)$/i.test(last)) continue;
      if (!slugIndex.has(last)) slugIndex.set(last, normalizeUrl(link));
    } catch { /* ignore */ }
  }

  // Pre-list slug entries once for the "contains both names" fallback below.
  const slugEntries = Array.from(slugIndex.entries());

  let matched = 0;
  const out = people.map((p) => {
    if (p.profile_url) return p;
    const ln = (p.last_name ?? "").toLowerCase().replace(/[^a-z]/g, "");
    const fn = (p.first_name ?? "").toLowerCase().replace(/[^a-z]/g, "");
    if (!ln) return p;
    const fi = fn.slice(0, 1);
    const candidates = [
      ln,
      `${fn}-${ln}`, `${ln}-${fn}`, `${fn}.${ln}`, `${fn}_${ln}`,
      `${fn}${ln}`, `${ln}${fn}`,
      `${fi}${ln}`, `${fi}-${ln}`, `${fi}.${ln}`, `${ln}${fi}`, `${ln}-${fi}`,
    ].filter((s) => s.length >= 3);
    for (const slug of candidates) {
      const hit = slugIndex.get(slug);
      if (hit) { matched++; return { ...p, profile_url: hit }; }
    }
    // Fallback: a slug that CONTAINS both first AND last name as substrings —
    // handles /people/john-quincy-smith, /faculty/smith-john-a, /profile/12-jsmith.
    // Require both names ≥3 chars so short names don't cause false matches.
    if (fn.length >= 3 && ln.length >= 3) {
      for (const [slug, href] of slugEntries) {
        if (slug.includes(fn) && slug.includes(ln)) {
          matched++;
          return { ...p, profile_url: href };
        }
      }
    }
    return p;
  });
  return { people: out, matched };
}

// Pull an academic title from an individual profile page's markdown. The page
// already gets fetched during email enrichment, so reading the title off it is
// free. Strategy: scan the first ~60 non-empty lines, skip the person's own
// name, nav chrome, images, links and emails, and return the first line that
// looks like a title. Conservative on purpose — better to miss a title than to
// grab a nav label or a neighbour's title.
function extractProfileTitle(
  markdown: string,
  firstName: string,
  lastName: string,
): string | null {
  if (!markdown) return null;
  const fn = (firstName ?? "").toLowerCase();
  const ln = (lastName ?? "").toLowerCase();
  const lines = markdown
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 60);
  for (const raw of lines) {
    if (/^!\[/.test(raw) || /^\[/.test(raw)) continue; // image / pure-link line
    const line = raw
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[-*]\s+/, "")
      .replace(/\*\*/g, "")
      .trim();
    if (!line || line.length > 120) continue; // skip long nav/blurb lines
    if (/@|https?:\/\//i.test(line)) continue; // email / url line
    if (/\b(skip to|menu|search|home|directory|toggle|navigation|copyright|breadcrumb)\b/i.test(line)) continue;
    const low = line.toLowerCase();
    // The name line itself isn't a title (unless it also literally contains a
    // title word, which TEACHING_TITLE_RE will still catch below).
    if (fn && ln && low.includes(fn) && low.includes(ln) && !TEACHING_TITLE_RE.test(line)) continue;
    if (TEACHING_TITLE_RE.test(line)) {
      const cleaned = stripCredentials(line).replace(/\s+/g, " ").trim();
      return cleaned || null;
    }
  }
  return null;
}

// Best-effort capture of a person's LinkedIn / CV link from their profile page.
// Stored in raw_payload for later enrichment + marketing. Never throws.
function extractProfileLinks(
  markdown: string,
  rawHtml: string,
): { linkedin?: string; cv?: string; personal?: string } | undefined {
  const out: { linkedin?: string; cv?: string; personal?: string } = {};
  const hay = `${markdown}\n${rawHtml}`;
  const li = hay.match(/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+/i);
  if (li) out.linkedin = li[0];
  const cvPdf = hay.match(/https?:\/\/[^\s"')]+(?:cv|vita|vitae|resume)[^\s"')]*\.pdf/i);
  if (cvPdf) {
    out.cv = cvPdf[0];
  } else {
    const cvMd = hay.match(/\[[^\]]*\b(?:cv|curriculum vitae|vitae|resume)\b[^\]]*\]\((https?:\/\/[^)\s]+)\)/i);
    if (cvMd) out.cv = cvMd[1];
  }
  return Object.keys(out).length ? out : undefined;
}

async function enrichProfileEmails(
  fcKey: string,
  people: Extracted[],
  sourceUrl: string,
): Promise<{
  people: Extracted[];
  enriched: number;
  outcomes: Array<{ url: string; name: string; result: "ok" | "obfuscated" | "mailto" | "empty" | "no_email" | "error" | "skipped_host"; mdLen: number; htmlLen: number }>;
}> {
  const sourceKey = normalizeUrl(sourceUrl);
  const passThrough: Extracted[] = [];
  const toEnrich: Extracted[] = [];
  for (const p of people) {
    // Enrich anyone still missing an email OR a title, as long as we have a
    // profile page to visit that isn't the directory page we already scraped.
    // (Previously only missing-email triggered enrichment, which left ~58% of
    // people with no title even though it sits on the same profile page.)
    const needsData = !p.email || !p.title;
    if (!needsData || !p.profile_url || normalizeUrl(p.profile_url) === sourceKey) {
      passThrough.push(p);
    } else if (toEnrich.length < PROFILE_ENRICH_LIMIT) {
      toEnrich.push(p);
    } else {
      passThrough.push(p);
    }
  }
  const outcomes: Array<{ url: string; name: string; result: "ok" | "obfuscated" | "mailto" | "empty" | "no_email" | "error" | "skipped_host"; mdLen: number; htmlLen: number }> = [];
  // Track per-host fail counts so anti-bot blocks on one host don't burn the
  // whole enrichment budget. Both batch and fallback paths update this map.
  const hostFailures = new Map<string, number>();
  const hostOf = (u: string): string => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
  const isHostBlocked = (u: string): boolean => (hostFailures.get(hostOf(u)) ?? 0) >= PER_HOST_FAIL_LIMIT;
  const bumpHost = (u: string, fail: boolean) => {
    const h = hostOf(u); if (!h) return;
    if (fail) hostFailures.set(h, (hostFailures.get(h) ?? 0) + 1);
  };
  if (toEnrich.length === 0) return { people: passThrough, enriched: 0, outcomes };

  // Prefer Firecrawl batchScrape: one upstream call, server-side concurrency,
  // far faster + more reliable than N parallel scrape calls from the worker.
  const urls = toEnrich.map((p) => p.profile_url!).filter(Boolean);
  let scraped: Map<string, { markdown: string; rawHtml: string }> | null = null;
  try {
    scraped = await firecrawlBatchScrape(fcKey, urls);
  } catch {
    scraped = null; // fall back to per-URL scrape below
  }

  let enriched = 0;
  const enrichedRows: Extracted[] = new Array(toEnrich.length);

  const pickEmail = (md: string, html: string): { email: string | null; how: "ok" | "obfuscated" | "mailto" | "empty" | "no_email" } => {
    if (!md && !html) return { email: null, how: "empty" };
    const plain = extractBestEmail(md);
    if (plain) return { email: plain, how: "ok" };
    const obf = extractObfuscatedEmail(md) ?? extractObfuscatedEmail(html);
    if (obf) return { email: obf, how: "obfuscated" };
    const mail = extractMailtoFromHtml(html);
    if (mail) return { email: mail, how: "mailto" };
    // Last resort: a hex/percent- or HTML-entity-encoded `mailto:` href (the
    // `obfuscated_mailto_hex_decoding` pattern). Counted as "obfuscated" so the
    // debug bundle still surfaces how the email was recovered.
    const encoded = extractEncodedEmail(html);
    if (encoded) return { email: encoded, how: "obfuscated" };
    return { email: null, how: "no_email" };
  };

  if (scraped && scraped.size > 0) {
    for (let i = 0; i < toEnrich.length; i++) {
      const person = toEnrich[i];
      const payload = scraped.get(normalizeUrl(person.profile_url!)) ?? { markdown: "", rawHtml: "" };
      const { email, how } = pickEmail(payload.markdown, payload.rawHtml);
      const profileCreds = payload.markdown ? detectCredentials(payload.markdown.slice(0, 4000)) : { is_phd: false, is_cpa: false };
      const profileTitle = person.title ?? extractProfileTitle(payload.markdown, person.first_name, person.last_name);
      const profileLinks = extractProfileLinks(payload.markdown, payload.rawHtml);
      if (email) enriched++;
      const result = email ? how : (payload.markdown || payload.rawHtml ? "no_email" : "empty");
      // Empty payload from batch = treat as host failure for the fallback pass.
      bumpHost(person.profile_url!, result === "empty");
      outcomes.push({
        url: person.profile_url!,
        name: `${person.first_name} ${person.last_name}`.trim(),
        result,
        mdLen: payload.markdown.length,
        htmlLen: payload.rawHtml.length,
      });
      enrichedRows[i] = {
        ...person,
        email: email ?? person.email,
        title: person.title ?? profileTitle,
        is_phd: person.is_phd || profileCreds.is_phd,
        is_cpa: person.is_cpa || profileCreds.is_cpa,
        links: profileLinks ?? person.links,
      };
    }
  } else {
    // Fallback: per-URL parallel scrape with bounded concurrency. Uses the
    // FULL scrape (markdown + rawHtml) so the mailto: fallback can fire
    // when batch scrape silently returns nothing for rawHtml.
    let cursor = 0;
    const workers = Array.from({ length: Math.min(PROFILE_ENRICH_CONCURRENCY, toEnrich.length) }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= toEnrich.length) return;
        const person = toEnrich[i];
        // Anti-bot blocks usually fail every URL on the host. After 2 misses,
        // skip the rest from that host — saves time + Firecrawl credits.
        if (isHostBlocked(person.profile_url!)) {
          outcomes.push({
            url: person.profile_url!,
            name: `${person.first_name} ${person.last_name}`.trim(),
            result: "skipped_host",
            mdLen: 0,
            htmlLen: 0,
          });
          enrichedRows[i] = person;
          continue;
        }
        try {
          const { markdown, rawHtml } = await firecrawlScrapeFull(fcKey, person.profile_url!);
          const { email, how } = pickEmail(markdown, rawHtml);
          const profileCreds = detectCredentials(markdown.slice(0, 4000));
          const profileTitle = person.title ?? extractProfileTitle(markdown, person.first_name, person.last_name);
          const profileLinks = extractProfileLinks(markdown, rawHtml);
          if (email) enriched++;
          const result = email ? how : (markdown || rawHtml ? "no_email" : "empty");
          bumpHost(person.profile_url!, result === "empty");
          outcomes.push({
            url: person.profile_url!,
            name: `${person.first_name} ${person.last_name}`.trim(),
            result,
            mdLen: markdown.length,
            htmlLen: rawHtml.length,
          });
          enrichedRows[i] = {
            ...person,
            email: email ?? person.email,
            title: person.title ?? profileTitle,
            is_phd: person.is_phd || profileCreds.is_phd,
            is_cpa: person.is_cpa || profileCreds.is_cpa,
            links: profileLinks ?? person.links,
          };
        } catch {
          bumpHost(person.profile_url!, true);
          outcomes.push({
            url: person.profile_url!,
            name: `${person.first_name} ${person.last_name}`.trim(),
            result: "error",
            mdLen: 0,
            htmlLen: 0,
          });
          enrichedRows[i] = person;
        }
      }
    });
    await Promise.all(workers);
  }

  return { people: [...passThrough, ...enrichedRows], enriched, outcomes };
}



function rankFacultyUrls(links: string[]): string[] {
  const scored = links
    .map((u) => {
      const normalized = normalizeUrl(u);
      const lo = normalized.toLowerCase();
      if (HARD_EXCLUDE.some((x) => lo.includes(x))) return { u, score: -999 };
      if (YEAR_RE.test(lo)) return { u, score: -999 };

      let path = "";
      try { path = new URL(normalized).pathname.toLowerCase(); } catch { return { u, score: -999 }; }
      const segments = path.split("/").filter(Boolean);

      let score = 0;
      // Big boost for an exact path segment match (e.g. /faculty/, /people/)
      for (const seg of segments) {
        if (STRONG_PATH_TOKENS.includes(seg)) score += 10;
      }
      // Soft signal for accounting/accountancy anywhere in URL
      for (const t of SOFT_TOKENS) if (lo.includes(t)) score += 2;
      if (/faculty[-/]and[-/]staff/.test(lo)) score += 8;
      // Penalize URLs that are *just* a homepage with no useful path
      if (segments.length === 0) score -= 3;
      // Penalize very deep individual profile URLs — we want roster pages
      if (segments.length > 4) score -= 2;
      return { u: normalized, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const { u } of scored) {
    try {
      const key = new URL(u).pathname.replace(/\/+$/, "");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(u);
    } catch { /* skip bad URL */ }
  }
  return out;
}

async function firecrawlSearch(apiKey: string, query: string): Promise<string[]> {
  const res = await fetchWithTimeout(
    "https://api.firecrawl.dev/v2/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, limit: 10 }),
    },
    FIRECRAWL_SEARCH_TIMEOUT_MS,
    "Firecrawl search",
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(slickHttpError("Firecrawl search", res.status, body));
  }
  const json = await res.json() as {
    data?: { web?: Array<{ url: string }> } | Array<{ url: string }>;
    web?: Array<{ url: string }>;
  };
  const web = Array.isArray(json.data) ? json.data : (json.data?.web ?? json.web ?? []);
  return web.map((r) => r.url).filter(Boolean);
}

// (firecrawlScrape removed: profile enrichment fallback now uses
//  firecrawlScrapeFull below so rawHtml — and the mailto: fallback — work.)


/** Per-URL scrape that returns both markdown AND rawHtml. Used in the profile
 *  enrichment fallback so mailto: hrefs (the main JS-mounted email vector
 *  across .edu sites) can be recovered when markdown stripping hides them. */
async function firecrawlScrapeFull(
  apiKey: string,
  url: string,
  timeoutMs: number = PROFILE_SCRAPE_TIMEOUT_MS,
): Promise<{ markdown: string; rawHtml: string }> {
  const res = await fetchWithTimeout(
    "https://api.firecrawl.dev/v2/scrape",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        url,
        formats: ["markdown", "rawHtml"],
        onlyMainContent: false,
        waitFor: 2500,
      }),
    },
    timeoutMs,
    "Firecrawl scrape",
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(slickHttpError("Firecrawl scrape", res.status, body));
  }
  const json = await res.json() as {
    data?: { markdown?: string; rawHtml?: string; html?: string };
    markdown?: string;
    rawHtml?: string;
    html?: string;
  };
  return {
    markdown: json.data?.markdown ?? json.markdown ?? "",
    rawHtml: json.data?.rawHtml ?? json.data?.html ?? json.rawHtml ?? json.html ?? "",
  };
}

/**
 * Variant that also returns every hyperlink found on the page. We use this on
 * directory pages so we can (a) feed the AI a clean URL list to populate
 * profile_url, and (b) deterministically slug-match leftover names back to
 * profile pages on the same host.
 */
async function firecrawlScrapeWithLinks(
  apiKey: string,
  url: string,
  timeoutMs: number = FIRECRAWL_SCRAPE_TIMEOUT_MS,
): Promise<{ markdown: string; links: string[]; rawHtml: string }> {
  const res = await fetchWithTimeout(
    "https://api.firecrawl.dev/v2/scrape",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        url,
        // Directory pages: take EVERYTHING. onlyMainContent often strips
        // card-grid nav containing the profile links we need to enrich.
        formats: ["markdown", "links", "rawHtml"],
        onlyMainContent: false,
        waitFor: DIRECTORY_WAIT_MS,
      }),
    },
    timeoutMs,
    "Firecrawl scrape",
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(slickHttpError("Firecrawl scrape", res.status, body));
  }
  const json = await res.json() as {
    data?: { markdown?: string; links?: Array<string | { url?: string }>; rawHtml?: string; html?: string };
    markdown?: string;
    links?: Array<string | { url?: string }>;
    rawHtml?: string;
    html?: string;
  };
  const markdown = json.data?.markdown ?? json.markdown ?? "";
  const rawLinks = json.data?.links ?? json.links ?? [];
  const fromLinksField = rawLinks
    .map((l) => (typeof l === "string" ? l : l?.url ?? ""))
    .filter((l): l is string => !!l && /^https?:\/\//i.test(l));

  // Fallback: pull <a href> from rawHtml. The links[] format can miss
  // JS-rendered card hrefs even with waitFor; rawHtml is post-render.
  const rawHtml = json.data?.rawHtml ?? json.data?.html ?? json.rawHtml ?? json.html ?? "";
  const fromHtml: string[] = [];
  if (rawHtml) {
    const reAbs = /<a[^>]+href=["'](https?:\/\/[^"']+)["']/gi;
    const reRel = /<a[^>]+href=["'](\/[^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = reAbs.exec(rawHtml)) !== null) fromHtml.push(m[1]);
    try {
      const base = new URL(url);
      while ((m = reRel.exec(rawHtml)) !== null) {
        try { fromHtml.push(new URL(m[1], base).toString()); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }

  const all = Array.from(new Set([...fromLinksField, ...fromHtml]));
  return { markdown, links: all, rawHtml };
}

/**
 * Firecrawl `actions` page-walker. For JS-paginated directories where the URL
 * doesn't change (IU Kelley, Drupal Views, "Load more" buttons, etc.), this
 * issues one Firecrawl scrape with up to MAX_PAGINATION_PAGES interleaved
 *   [click Next → wait → scrape]
 * actions, then returns the concatenated HTML across all step scrapes plus
 * the final-state markdown.
 *
 * Generalizable: the click selector is a union of every common Next/Load more
 * pattern we've seen. If it never matches, Firecrawl returns the same
 * single-page HTML each time and our caller falls back to the map heuristic.
 */
async function scrapeWithPaginationActions(
  apiKey: string,
  url: string,
  maxPages: number,
): Promise<{ combinedText: string; combinedHtml: string; finalMarkdown: string; pagesWalked: number; clickMissed: boolean }> {
  const actions: Array<Record<string, unknown>> = [
    { type: "wait", milliseconds: 2000 },
    { type: "scrape" },
  ];
  for (let i = 1; i < maxPages; i++) {
    actions.push(
      { type: "click", selector: PAGINATION_NEXT_SELECTOR },
      { type: "wait", milliseconds: PAGINATION_STEP_WAIT_MS },
      { type: "scrape" },
    );
  }
  const res = await fetchWithTimeout(
    "https://api.firecrawl.dev/v2/scrape",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        url,
        formats: ["markdown", "rawHtml"],
        onlyMainContent: false,
        actions,
      }),
    },
    PAGINATION_ACTIONS_TIMEOUT_MS,
    "Firecrawl actions scrape",
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(slickHttpError("Firecrawl actions scrape", res.status, body));
  }
  const json = await res.json() as {
    data?: {
      markdown?: string;
      rawHtml?: string;
      html?: string;
      actions?: {
        scrapes?: Array<{ html?: string; rawHtml?: string; url?: string }>;
      };
    };
  };
  const stepScrapes = json.data?.actions?.scrapes ?? [];
  const htmls: string[] = [];
  for (const s of stepScrapes) {
    const h = s.html ?? s.rawHtml ?? "";
    if (h) htmls.push(h);
  }
  // Always include the final-state HTML in case the last "scrape" action's
  // payload landed only at the top-level (Firecrawl behavior varies).
  const finalHtml = json.data?.rawHtml ?? json.data?.html ?? "";
  if (finalHtml && !htmls.includes(finalHtml)) htmls.push(finalHtml);

  const combinedHtml = htmls.join("\n\n<!-- ## next page ## -->\n\n");
  const combinedText = htmls.map(htmlToFlatText).join("\n\n---\n\n");
  const finalMarkdown = json.data?.markdown ?? "";
  // If two consecutive step HTMLs are identical, the click selector likely
  // didn't match anything → no real pagination happened.
  let identicalCount = 0;
  for (let i = 1; i < htmls.length; i++) {
    if (htmls[i] === htmls[i - 1]) identicalCount++;
  }
  const clickMissed = htmls.length <= 1 || identicalCount >= htmls.length - 1;
  return { combinedText, combinedHtml, finalMarkdown, pagesWalked: htmls.length, clickMissed };
}

/**
 * Click-miss recovery #1 — SCROLL walker. For directories with infinite
 * scroll, shadow-DOM "Load more" buttons, or non-standard pagers that our
 * click-selector union can't reach. Uses Firecrawl `scroll` actions
 * (vendor-agnostic: most renderers honor wheel/scroll-to-bottom events even
 * when click handlers are buried inside web components). After N scrolls we
 * capture the fully-expanded DOM.
 *
 * Generalizable to any vertical (accounting firms, IB, hospitals, gov)
 * because we never assume a specific button label or framework.
 */
async function scrapeWithScrollActions(
  apiKey: string,
  url: string,
  scrolls: number,
): Promise<{ markdown: string; rawHtml: string; scrolled: number; gained: boolean }> {
  const actions: Array<Record<string, unknown>> = [
    { type: "wait", milliseconds: 1500 },
  ];
  for (let i = 0; i < scrolls; i++) {
    actions.push(
      { type: "scroll", direction: "down" },
      { type: "wait", milliseconds: 1200 },
    );
  }
  actions.push({ type: "scrape" });
  const res = await fetchWithTimeout(
    "https://api.firecrawl.dev/v2/scrape",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        url,
        formats: ["markdown", "rawHtml"],
        onlyMainContent: false,
        actions,
      }),
    },
    PAGINATION_ACTIONS_TIMEOUT_MS,
    "Firecrawl scroll scrape",
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(slickHttpError("Firecrawl scroll scrape", res.status, body));
  }
  const json = await res.json() as {
    data?: { markdown?: string; rawHtml?: string; html?: string };
  };
  const markdown = json.data?.markdown ?? "";
  const rawHtml = json.data?.rawHtml ?? json.data?.html ?? "";
  return { markdown, rawHtml, scrolled: scrolls, gained: markdown.length > 0 || rawHtml.length > 0 };
}

/**
 * Click-miss recovery #2 — URL-parameter pagination probe.
 *
 * Mines the rendered HTML + discovered link list for anchor URLs that look
 * like paginated variants of the current directory (`?page=2`, `&p=3`,
 * `?start=20`, `/page/4/`, etc.). Returns up to `max` deduped same-host
 * candidate URLs in numeric order. Works across WordPress, Drupal Views,
 * ASP.NET, custom XHR tables — anywhere the JS pager is broken but the
 * server still honors a `?page=N` query string.
 */
function discoverUrlPaginationCandidates(
  baseUrl: string,
  rawHtml: string,
  linkList: string[],
  max: number,
): string[] {
  let baseHost: string;
  let basePath: string;
  try {
    const u = new URL(baseUrl);
    baseHost = u.host;
    basePath = u.pathname.replace(/\/+$/, "");
  } catch { return []; }

  const seen = new Set<string>([baseUrl.replace(/#.*$/, "")]);
  const hits: Array<{ url: string; pageNum: number }> = [];

  const PAGE_PARAM_RE = /[?&](?:page|p|pg|start|offset|from)=(\d+)/i;
  const PAGE_PATH_RE = /\/page\/(\d+)\/?(?:[?#]|$)/i;

  const consider = (href: string) => {
    let abs: string;
    try { abs = new URL(href, baseUrl).toString().replace(/#.*$/, ""); }
    catch { return; }
    let host: string, path: string;
    try {
      const u = new URL(abs);
      host = u.host;
      path = u.pathname.replace(/\/+$/, "");
    } catch { return; }
    if (host !== baseHost) return;
    // Same-base-path or a /page/N/ child of it.
    const samePath = path === basePath || path.startsWith(basePath + "/");
    const qMatch = abs.match(PAGE_PARAM_RE);
    const pathMatch = abs.match(PAGE_PATH_RE);
    if (!qMatch && !pathMatch) return;
    const pageNum = parseInt((qMatch?.[1] ?? pathMatch?.[1]) || "0", 10);
    if (!pageNum || pageNum < 2 || pageNum > 50) return;
    if (!samePath && !pathMatch) return;
    if (seen.has(abs)) return;
    seen.add(abs);
    hits.push({ url: abs, pageNum });
  };

  const reAbs = /<a[^>]+href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = reAbs.exec(rawHtml)) !== null) consider(m[1]);
  for (const l of linkList) consider(l);

  hits.sort((a, b) => a.pageNum - b.pageNum);
  return hits.slice(0, max).map((h) => h.url);
}

/**
 * Click-miss recovery #3 — PROFILE-LINK HARVEST.
 *
 * When click + scroll + URL-param probes all fail, the rendered HTML
 * usually still contains every individual profile link (server-rendered
 * even when the visible roster is JS-virtualized). Mine same-host URLs
 * whose path matches typical faculty-profile shapes — `?id=*`,
 * `/profile`, `/people/`, `/faculty/<name>`, `/staff/<name>` — and return
 * up to `max` deduped candidates. Generalizable to any vertical whose
 * directory cards link out to per-person pages (academia, hospitals, law,
 * IB, consulting, gov leadership rosters).
 */
function discoverProfileLinkCandidates(
  baseUrl: string,
  rawHtml: string,
  linkList: string[],
  max: number,
): string[] {
  let baseHost: string;
  let basePath: string;
  try {
    const u = new URL(baseUrl);
    baseHost = u.host;
    basePath = u.pathname.replace(/\/+$/, "");
  } catch { return []; }

  const seen = new Set<string>([baseUrl.replace(/#.*$/, "")]);
  const hits: string[] = [];

  // path hints (cheap, no per-URL fetch)
  const PROFILE_HINTS = [
    /[?&]id=[A-Za-z0-9._-]+/,
    /\/profile(?:s)?(?:\.|\/|$)/i,
    /\/people\//i,
    /\/faculty\/[A-Za-z][A-Za-z0-9._-]+/i,
    /\/staff\/[A-Za-z][A-Za-z0-9._-]+/i,
    /\/directory\/[^/]+\/[A-Za-z][A-Za-z0-9._-]+/i,
    /\/bio(?:s)?\/[A-Za-z][A-Za-z0-9._-]+/i,
  ];
  // negative hints — skip nav/section/list pages
  const SKIP = /\/(?:search|all|index|home|news|events|contact|apply|admissions|programs|courses|research|departments?)\b/i;

  const consider = (href: string) => {
    let abs: string;
    try { abs = new URL(href, baseUrl).toString().replace(/#.*$/, ""); }
    catch { return; }
    let host: string, path: string;
    try {
      const u = new URL(abs);
      host = u.host;
      path = u.pathname.replace(/\/+$/, "");
    } catch { return; }
    if (host !== baseHost) return;
    if (path === basePath) return;
    if (SKIP.test(path)) return;
    if (!PROFILE_HINTS.some((re) => re.test(abs))) return;
    if (seen.has(abs)) return;
    seen.add(abs);
    hits.push(abs);
  };

  const reAbs = /<a[^>]+href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = reAbs.exec(rawHtml)) !== null) consider(m[1]);
  for (const l of linkList) consider(l);

  return hits.slice(0, max);
}




/**
 * Batch-scrape multiple profile pages in a single Firecrawl call. Firecrawl
 * handles concurrency server-side, which is dramatically faster + more
 * reliable than N parallel /scrape calls from our worker.
 */
async function firecrawlBatchScrape(
  apiKey: string,
  urls: string[],
): Promise<Map<string, { markdown: string; rawHtml: string }>> {
  if (urls.length === 0) return new Map();
  const res = await fetchWithTimeout(
    "https://api.firecrawl.dev/v2/batch/scrape",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        urls,
        // rawHtml: gives us mailto: hrefs even when markdown is stripped /
        //   the page is fully JS-rendered.
        // waitFor: many .edu profile pages (Anderson UCLA, etc.) need ~2s
        //   for the email link to mount.
        formats: ["markdown", "rawHtml"],
        onlyMainContent: false,
        waitFor: 2500,
        ignoreInvalidURLs: true,
      }),
    },
    BATCH_SCRAPE_TIMEOUT_MS,
    "Firecrawl batchScrape",
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(slickHttpError("Firecrawl batchScrape", res.status, body));
  }
  const json = await res.json() as {
    data?: Array<{ markdown?: string; rawHtml?: string; html?: string; metadata?: { sourceURL?: string; url?: string } }>;
  };
  const out = new Map<string, { markdown: string; rawHtml: string }>();
  for (const row of json.data ?? []) {
    const src = row.metadata?.sourceURL ?? row.metadata?.url;
    if (!src) continue;
    out.set(normalizeUrl(src), {
      markdown: row.markdown ?? "",
      rawHtml: row.rawHtml ?? row.html ?? "",
    });
  }
  return out;
}



async function firecrawlMap(apiKey: string, url: string, search: string): Promise<string[]> {
  const res = await fetchWithTimeout(
    "https://api.firecrawl.dev/v2/map",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url, search, limit: 200, includeSubdomains: true }),
    },
    FIRECRAWL_MAP_TIMEOUT_MS,
    "Firecrawl map",
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(slickHttpError("Firecrawl map", res.status, body));
  }
  const json = await res.json() as { links?: Array<string | { url: string }>; data?: { links?: Array<string | { url: string }> } };
  const raw = json.links ?? json.data?.links ?? [];
  return raw.map((l) => (typeof l === "string" ? l : l.url)).filter(Boolean);
}

// Vercel AI Gateway rejects response_format:json_object, so we ask for JSON in
// the prompt and parse tolerantly: strip markdown fences, slice to the outer
// braces, then repair common bad escapes / control chars before giving up.
function extractJsonObject(text: string): unknown {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`AI returned non-JSON: ${text.slice(0, 200)}`);
  }
  const slice = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    // Repair the two failure modes models hit: invalid backslash escapes, then
    // raw control chars inside strings (RegExp built from escaped unicode so no
    // literal control chars live in this source file).
    const fixed = slice.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
    try {
      return JSON.parse(fixed);
    } catch {
      const ctrl = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]", "g");
      return JSON.parse(fixed.replace(ctrl, ""));
    }
  }
}

async function callAiGateway(apiKey: string, sourceUrl: string, pageText: string): Promise<Extracted[]> {
  const truncated = pageText.length > 60000 ? pageText.slice(0, 60000) : pageText;
  const system =
    "You extract faculty/instructor/lecturer/adjunct directory entries from accounting department web pages. " +
    "RULES: " +
    "1. ONLY emit a person if their full name appears verbatim in the provided text. " +
    "2. NEVER invent or pattern-guess an email. If no email appears in the text for that person, set email to null. " +
    "3. Capture every teaching role: Professor, Associate/Assistant Professor, Instructor, Lecturer, Adjunct, Clinical, Teaching Professor, Professor of Practice, Visiting. " +
    "4. ACCOUNTING ONLY. If the page is a dedicated accounting / accountancy / school-of-accountancy roster, include every teaching person on it. If the page is a BROAD business or college directory spanning multiple departments (finance, economics, marketing, management, information systems, supply chain, real estate, business law, etc.), include a person ONLY when that person's OWN title or listed department indicates accounting (accounting, accountancy, tax, taxation, audit, assurance, or AIS) — exclude everyone else. When in doubt about a person on a mixed-department page, exclude them. " +
    "5. Exclude purely administrative staff with no teaching title (e.g. Department Coordinator, Office Manager) unless their title contains an instructional keyword. " +
    "6. Return strict JSON with shape { people: [{ first_name, last_name, title, email, profile_url, is_phd, is_cpa }] }. " +
    "7. profile_url should be an absolute URL when the source links to a personal profile page; otherwise null. " +
    "8. is_phd = true if the person's name, title, or bio shows a doctorate credential (PhD, Ph.D., DBA, EdD, DPhil, JSD, or 'Doctorate'). Otherwise false. " +
    "9. is_cpa = true if their name, title, or bio shows the CPA credential (CPA or C.P.A.). Otherwise false. " +
    "10. Do NOT include credentials (PhD, CPA, MBA, JD, Esq., etc.) inside first_name or last_name — return the clean human name only.";

  const user = `Source URL: ${sourceUrl}\n\nPage content (markdown):\n${truncated}`;

  const res = await fetchWithTimeout(
    "https://ai-gateway.vercel.sh/v1/chat/completions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    },
    AI_TIMEOUT_MS,
    "AI gateway",
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(slickHttpError("AI gateway", res.status, body));
  }

  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? "{}";
  const parsed: unknown = extractJsonObject(content);
  const people = (parsed as { people?: unknown }).people;
  if (!Array.isArray(people)) return [];

  const out: Extracted[] = [];
  for (const p of people) {
    if (!p || typeof p !== "object") continue;
    const r = p as Record<string, unknown>;
    const fnRaw = typeof r.first_name === "string" ? r.first_name.trim() : "";
    const lnRaw = typeof r.last_name === "string" ? r.last_name.trim() : "";
    if (!fnRaw && !lnRaw) continue;
    const title = typeof r.title === "string" ? r.title.trim() || null : null;
    // OR the AI signal with our regex against name + title (belt and suspenders).
    const regexCreds = detectCredentials(fnRaw, lnRaw, title);
    const aiPhd = r.is_phd === true;
    const aiCpa = r.is_cpa === true;
    out.push({
      first_name: stripCredentials(fnRaw),
      last_name: stripCredentials(lnRaw),
      title,
      email: typeof r.email === "string" && r.email.includes("@") ? r.email.trim().toLowerCase() : null,
      profile_url: typeof r.profile_url === "string" && /^https?:\/\//i.test(r.profile_url) ? r.profile_url.trim() : null,
      is_phd: aiPhd || regexCreds.is_phd,
      is_cpa: aiCpa || regexCreds.is_cpa,
    });
  }
  return out;
}

/**
 * Send a PDF directly to the Lovable AI Gateway (Gemini supports PDFs natively
 * via the OpenAI-compatible `file` content block) and ask for the same
 * { people: [...] } JSON shape that callAiGateway produces from markdown.
 */
async function callAiGatewayWithPdf(
  apiKey: string,
  filename: string,
  pdfBase64: string,
): Promise<Extracted[]> {
  const system =
    "You extract faculty/instructor/lecturer/adjunct directory entries from an accounting department PDF " +
    "(typically a printout of a faculty webpage). " +
    "RULES: " +
    "1. ONLY emit a person if their full name appears verbatim in the PDF. " +
    "2. NEVER invent or pattern-guess an email. If no email appears for that person, set email to null. " +
    "3. Capture every teaching role: Professor, Associate/Assistant Professor, Instructor, Lecturer, Adjunct, Clinical, Teaching Professor, Professor of Practice, Visiting. " +
    "4. ACCOUNTING ONLY. If the page is a dedicated accounting / accountancy / school-of-accountancy roster, include every teaching person on it. If the page is a BROAD business or college directory spanning multiple departments (finance, economics, marketing, management, information systems, supply chain, real estate, business law, etc.), include a person ONLY when that person's OWN title or listed department indicates accounting (accounting, accountancy, tax, taxation, audit, assurance, or AIS) — exclude everyone else. When in doubt about a person on a mixed-department page, exclude them. " +
    "5. Exclude purely administrative staff with no teaching title unless their title contains an instructional keyword. " +
    "6. Return strict JSON with shape { people: [{ first_name, last_name, title, email, profile_url, is_phd, is_cpa }] }. " +
    "7. profile_url should be an absolute URL when the PDF clearly links to a personal profile page; otherwise null. " +
    "8. is_phd = true if the person's name, title, or bio shows a doctorate credential (PhD, Ph.D., DBA, EdD, DPhil, JSD, or 'Doctorate'). Otherwise false. " +
    "9. is_cpa = true if their name, title, or bio shows the CPA credential (CPA or C.P.A.). Otherwise false. " +
    "10. Do NOT include credentials (PhD, CPA, MBA, JD, Esq., etc.) inside first_name or last_name — return the clean human name only.";

  const res = await fetchWithTimeout(
    "https://ai-gateway.vercel.sh/v1/chat/completions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: `Extract every accounting faculty member from this PDF (source filename: ${filename}). Return JSON only.` },
              { type: "file", file: { filename, file_data: `data:application/pdf;base64,${pdfBase64}` } },
            ],
          },
        ],
      }),
    },
    AI_PDF_TIMEOUT_MS,
    "AI gateway (PDF)",
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(slickHttpError("AI gateway (PDF)", res.status, body));
  }
  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? "{}";
  const parsed: unknown = extractJsonObject(content);
  const people = (parsed as { people?: unknown }).people;
  if (!Array.isArray(people)) return [];
  const out: Extracted[] = [];
  for (const p of people) {
    if (!p || typeof p !== "object") continue;
    const r = p as Record<string, unknown>;
    const fnRaw = typeof r.first_name === "string" ? r.first_name.trim() : "";
    const lnRaw = typeof r.last_name === "string" ? r.last_name.trim() : "";
    if (!fnRaw && !lnRaw) continue;
    const title = typeof r.title === "string" ? r.title.trim() || null : null;
    const regexCreds = detectCredentials(fnRaw, lnRaw, title);
    const aiPhd = r.is_phd === true;
    const aiCpa = r.is_cpa === true;
    out.push({
      first_name: stripCredentials(fnRaw),
      last_name: stripCredentials(lnRaw),
      title,
      email: typeof r.email === "string" && r.email.includes("@") ? r.email.trim().toLowerCase() : null,
      profile_url: typeof r.profile_url === "string" && /^https?:\/\//i.test(r.profile_url) ? r.profile_url.trim() : null,
      is_phd: aiPhd || regexCreds.is_phd,
      is_cpa: aiCpa || regexCreds.is_cpa,
    });
  }
  return out;
}

// ─── Person-row gate ────────────────────────────────────────────────────────
// Faculty directory pages often contain news headlines, donation CTAs, and
// section labels that look enough like a "name + email" pair to slip through
// the AI extractor. These rows can never match an RMP teacher (no real
// person name) and pollute the triage panel. Reject them here.
const NON_PERSON_NAME_RE =
  /\b(college|school|department|news|noteworthy|invest|support|application|scholar|assistantship|award|tips|game plan|click here|learn more|read more|donate|view all|story|stories|spotlight|event|press release|headshot|photo|portrait|image|directory|faculty|staff|international students|information technology|technology|university|universities|lettermark|logo|wordmark|map|sitemap|alumni|giving|athletics|libraries|admissions|administration|calendar|calendars|menu|navigation|footer|header|programs?|\bbba\b|\bmba\b|undergraduate|curriculum|overview)\b/i;
const HEADLINE_VERB_RE =
  /^(show|invest|learn|read|view|click|apply|submit|get|discover|explore|join|meet|find|sign|subscribe|follow|share|donate|give)\b/i;
const NAME_TOKEN_RE = /^[A-Za-z][A-Za-z'`\-.]{1,}$/;
const GENERIC_EMAIL_LOCALS = new Set([
  "news", "info", "contact", "support", "donate", "give", "hello",
  "admin", "webmaster", "undergrad", "grad", "gradu", "alumni",
  "dean", "options", "integr", "sbusiness", "office", "marketing",
  "communications", "events", "media", "press", "help", "noreply",
  "no-reply", "mail", "inquiry", "inquiries", "general", "main",
  // Placeholder / system mailbox locals that slipped through as "leads".
  // Note: the gate trims the local at the first . + - so "mailer-daemon"
  // collapses to "mailer" — both are listed so the token actually fires.
  "r2d2", "test", "example", "sample", "donotreply",
  "mailer-daemon", "mailer", "postmaster", "special",
]);

// Blank a title that is obviously scraped junk — a markdown link/image, a raw
// URL, or a "+"-joined nav blob — instead of letting it drop the whole person.
// A real academic title never contains these. Returns null so the row is kept
// with no title rather than being rejected by the person gate downstream.
function sanitizeTitle(title: string | null | undefined): string | null {
  const t = (title ?? "").trim();
  if (!t) return null;
  if (/\]\(|!\[|https?:\/\/|www\.|\+/.test(t)) return null;
  // Strip trailing markdown-escape backslashes / commas (e.g. "Accounting\\").
  const cleaned = t.replace(/[\\,\s]+$/, "").trim();
  return cleaned || null;
}

export type PersonRejectReason =
  | "missing_name"
  | "non_alpha_name"
  | "too_many_tokens"
  | "too_long"
  | "headline_phrase"
  | "headline_verb"
  | "title_is_url"
  | "title_is_section_label"
  | "generic_email_local"
  | "wrong_discipline";

// A title that names a NON-accounting business discipline. Used as a
// deterministic backstop to the AI extractor's discipline filter: a person
// whose title is e.g. "Professor of Finance" is rejected unless the title ALSO
// signals accounting (joint appointments like "Accounting & Finance" survive).
const WRONG_DISCIPLINE_RE =
  /\b(marketing|finance|economics|econometrics|management(?!\s+accounting)|supply\s*chain|business\s+law|legal\s+studies|information\s+systems|\bMIS\b|real\s+estate|entrepreneurship|operations\s+management|human\s+resources|\bHR\b|statistics|hospitality)\b/i;
const ACCOUNTING_TITLE_RE = /\b(account|accountanc|taxation|\btax\b|audit|assurance|\bAIS\b)\b/i;

export function isLikelyPersonRow(p: {
  first_name: string | null | undefined;
  last_name: string | null | undefined;
  title?: string | null | undefined;
  email?: string | null | undefined;
}): { ok: true } | { ok: false; reason: PersonRejectReason } {
  const fn = (p.first_name ?? "").trim();
  const ln = (p.last_name ?? "").trim();
  if (fn.length < 2 || ln.length < 2) return { ok: false, reason: "missing_name" };
  if (!NAME_TOKEN_RE.test(fn.split(/\s+/)[0]) || !NAME_TOKEN_RE.test(ln.split(/\s+/).at(-1) ?? "")) {
    return { ok: false, reason: "non_alpha_name" };
  }
  const full = `${fn} ${ln}`.trim();
  if (full.length > 60) return { ok: false, reason: "too_long" };
  const tokenCount = full.split(/\s+/).filter(Boolean).length;
  if (tokenCount > 4) return { ok: false, reason: "too_many_tokens" };
  if (NON_PERSON_NAME_RE.test(full)) return { ok: false, reason: "headline_phrase" };
  if (HEADLINE_VERB_RE.test(full)) return { ok: false, reason: "headline_verb" };

  const title = (p.title ?? "").trim();
  if (title) {
    if (/^https?:\/\//i.test(title) || /\.(php|html?|aspx?)\b/i.test(title)) {
      return { ok: false, reason: "title_is_url" };
    }
    if (/^\[[^\]]+\]/.test(title) && /\b(news|press|dean|office|story|stories|spotlight)\b/i.test(title)) {
      return { ok: false, reason: "title_is_section_label" };
    }
    // Deterministic discipline backstop: reject a non-accounting business
    // discipline UNLESS the title also signals accounting (joint appointments).
    if (WRONG_DISCIPLINE_RE.test(title) && !ACCOUNTING_TITLE_RE.test(title)) {
      return { ok: false, reason: "wrong_discipline" };
    }
  }

  const email = (p.email ?? "").trim().toLowerCase();
  if (email.includes("@")) {
    const local = email.split("@")[0]?.replace(/[.+-].*/, "") ?? "";
    if (GENERIC_EMAIL_LOCALS.has(local)) return { ok: false, reason: "generic_email_local" };
  }
  return { ok: true };
}


/**
 * Insert extracted people into campus_lead_suggestions with the standard
 * dedupe-against-active-rows rules. Shared by URL and PDF scrape paths.
 */
async function insertExtractedPeople(
  campusId: string,
  people: Extracted[],
  sourceLabel: string,
  researchLabel: string,
  options: { allowNoContact?: boolean } = {},
): Promise<{ inserted: number; skippedDuplicates: number; droppedNoContact: number }> {
  if (people.length === 0) return { inserted: 0, skippedDuplicates: 0, droppedNoContact: 0 };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rowsToInsert: Array<Record<string, unknown>> = [];
  let droppedNoContact = 0;
  
  for (const p of people) {
    const hasContact = !!p.email || !!p.profile_url;
    if (!hasContact && !options.allowNoContact) { droppedNoContact++; continue; }
    // Require at least a name when we have no contact info, otherwise the row is useless.
    if (!hasContact && !(p.first_name || p.last_name)) { droppedNoContact++; continue; }
    // Blank a junk title (markdown/URL/nav) so it can't drop a real person.
    p.title = sanitizeTitle(p.title);
    const gate = isLikelyPersonRow({ first_name: p.first_name, last_name: p.last_name, title: p.title, email: p.email });
    if (!gate.ok) { droppedNoContact++; continue; }
    rowsToInsert.push({
      campus_id: campusId,
      first_name: p.first_name,
      last_name: p.last_name,
      title: p.title,
      email: p.email,
      source_url: p.profile_url ?? (options.allowNoContact ? sourceLabel : null),
      research_mode: "faculty_scrape",
      research_label: researchLabel,
      status: "pending",
      lead_type: "professor",
      is_phd: p.is_phd,
      is_cpa: p.is_cpa,
      notes: `Scraped from ${sourceLabel}`,
      raw_payload: { source: sourceLabel, title: p.title, profile_url: p.profile_url, is_phd: p.is_phd, is_cpa: p.is_cpa },
    });
  }
  if (rowsToInsert.length === 0) return { inserted: 0, skippedDuplicates: 0, droppedNoContact };
  const seen = new Set<string>();
  const unique = rowsToInsert.filter((r) => {
    const key = (r.email as string | null) ?? `${r.first_name}|${r.last_name}|${r.source_url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const emails = unique.map((r) => r.email).filter((e): e is string => !!e);
  let existingEmails = new Set<string>();
  if (emails.length > 0) {
    const { data: existing } = await supabaseAdmin
      .from("campus_lead_suggestions")
      .select("email")
      .eq("campus_id", campusId)
      .is("archived_at", null)
      .in("email", emails);
    existingEmails = new Set((existing ?? []).map((r: { email: string | null }) => r.email).filter((e): e is string => !!e));
  }
  let skipped = 0;
  const toInsert = unique.filter((r) => {
    const e = r.email as string | null;
    if (e && existingEmails.has(e)) { skipped++; return false; }
    return true;
  });
  if (toInsert.length === 0) return { inserted: 0, skippedDuplicates: skipped, droppedNoContact };
  const { error } = await supabaseAdmin.from("campus_lead_suggestions").insert(toInsert as never);
  if (error) throw new Error(`insert failed: ${error.message}`);
  return { inserted: toInsert.length, skippedDuplicates: skipped, droppedNoContact };
}

async function processUrls(
  fcKey: string,
  aiKey: string,
  campusId: string,
  urls: string[],
  options: { allowNoContact?: boolean } = {},
): Promise<{
  perPage: Array<{
    url: string;
    found: number;
    extracted: number;
    withEmail: number;
    withProfileUrl: number;
    slugMatched: number;
    enriched: number;
    droppedNoContact: number;
    links: number;
    error: string | null;
    enrichOutcomes?: Array<{ url: string; name: string; result: string; mdLen: number; htmlLen: number }>;
    pagination?: { paginated: boolean; signal?: string; pagesWalked: number; clickMissed: boolean; gained: number };
    cardBlocks?: number;
    cardEmailsPaired?: number;
    aiEmailOverridden?: number;
    diag?: string;
    rejectedNonPerson?: number;
    rejectedNonPersonSamples?: Array<{ name: string; reason: string }>;
  }>;

  inserted: number;
  skippedDuplicates: number;
  droppedNoContact: number;
  programLevels: ProgramLevelDetection;
  programLevelSources: string[];
  cache: Record<string, { markdown: string; links: string[]; scraped_at: string }>;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const perPage: Array<{
    url: string;
    found: number;
    extracted: number;
    withEmail: number;
    withProfileUrl: number;
    slugMatched: number;
    enriched: number;
    droppedNoContact: number;
    links: number;
    error: string | null;
    enrichOutcomes?: Array<{ url: string; name: string; result: string; mdLen: number; htmlLen: number }>;
    pagination?: { paginated: boolean; signal?: string; pagesWalked: number; clickMissed: boolean; gained: number };
    cardBlocks?: number;
    cardEmailsPaired?: number;
    aiEmailOverridden?: number;
    diag?: string;
    rejectedNonPerson?: number;
    rejectedNonPersonSamples?: Array<{ name: string; reason: string }>;
  }> = [];


  const rowsToInsert: Array<Record<string, unknown>> = [];
  const cache: Record<string, { markdown: string; links: string[]; scraped_at: string }> = {};
  let programLevels: ProgramLevelDetection = EMPTY_DETECTION;
  const programLevelSources: string[] = [];
  let totalDroppedNoContact = 0;

  let urlCursor = 0;
  const urlWorkers = Array.from({ length: Math.min(URL_PROCESS_CONCURRENCY, urls.length) }, async () => {
    while (true) {
      const i = urlCursor++;
      if (i >= urls.length) return;
      const url = urls[i];
      try {
        const initial = await firecrawlScrapeWithLinks(fcKey, url);
        let md = initial.markdown;
        const links = initial.links;
        const initialRawHtml = initial.rawHtml;
        // Cache the rendered directory page so RMP reverse-lookup (and future
        // enrichment passes) can name-match without re-scraping. Cap markdown
        // at 200KB per URL to keep the JSONB column reasonable.
        cache[url] = {
          markdown: md ? md.slice(0, 200_000) : "",
          links: links.slice(0, 2000),
          scraped_at: new Date().toISOString(),
        };
        if (!md) {
          perPage.push({ url, found: 0, extracted: 0, withEmail: 0, withProfileUrl: 0, slugMatched: 0, enriched: 0, droppedNoContact: 0, links: links.length, error: "empty content" });
          continue;
        }
        const pageDetection = detectProgramLevels(md);
        if (pageDetection.bachelors || pageDetection.masters || pageDetection.phd) {
          programLevels = mergeDetections(programLevels, pageDetection);
          if (!programLevelSources.includes(url)) programLevelSources.push(url);
        }
        // Deterministic card-block parser runs FIRST. It pairs name+email
        // strictly within one card block, so we never assign a neighbor's
        // email (the bug that produced Robert Knisley → jmkniola@iu.edu).
        // Two deterministic card sources, merged by name:
        //  - markdown cards (heading/image-link layouts; the Arkansas path), and
        //  - rawHtml cards (class-tagged name/title + mailto), which recover
        //    name+title+EMAIL on WordPress/Drupal directories whose emails are
        //    CSS-hidden and therefore stripped from markdown (e.g. uwosh.edu).
        const mdCards = cardsToExtracted(parseDirectoryCards(md));
        // Prefer the page's TRUE source HTML (direct fetch) over Firecrawl's
        // rawHtml — Firecrawl prunes CSS-hidden mailto blocks, which is exactly
        // where these directories keep the emails (e.g. uwosh.edu). Fall back to
        // Firecrawl's rawHtml when the direct fetch is blocked/empty.
        const rawPageHtml = await fetchRawPageHtml(url);
        const htmlForCards = rawPageHtml || initialRawHtml;
        const htmlCards = htmlForCards
          ? cardsToExtracted(parseDirectoryCardsFromHtml(htmlForCards))
          : [];
        const cardPeople = combineCardSources(mdCards, htmlCards);
        // Diagnostic breadcrumb (surfaces per-URL in the debug bundle) so we can
        // see WHERE extraction breaks without guessing: raw-fetch size + mailto
        // count, Firecrawl-html size + mailto count, and per-source card counts.
        const countMailto = (s: string) => (s.match(/mailto:/gi) ?? []).length;
        const diag =
          `rawFetch=${rawPageHtml.length}B/${countMailto(rawPageHtml)}mt · ` +
          `fcHtml=${initialRawHtml.length}B/${countMailto(initialRawHtml)}mt · ` +
          `md=${md.length}B · mdCards=${mdCards.length} htmlCards=${htmlCards.length}`;
        let parsedPeople = cardPeople.length > 0 ? cardPeople : extractDirectoryMarkdownPeople(md);
        let aiPeople = await callAiGateway(aiKey, url, md);
        let aiEmailOverridden = 0;
        let merged: Extracted[];
        if (cardPeople.length > 0) {
          const r = mergeWithCardOverride([...cardPeople], aiPeople);
          merged = r.merged;
          aiEmailOverridden = r.aiEmailOverridden;
        } else {
          merged = mergePeople(parsedPeople, aiPeople);
        }
        const cardBlocksCount = cardPeople.length;
        const cardEmailsPaired = cardPeople.filter((p) => !!p.email).length;

        // ---- JS-pagination walker -----------------------------------------
        // If page-1 yielded few people AND we see pagination signals in the
        // markdown/rawHtml, re-scrape with Firecrawl `actions` that click
        // Next/Load more up to MAX_PAGINATION_PAGES times. Re-run the
        // extractor over the concatenated multi-page payload. Generalizable:
        // works for any school whose directory paginates without a URL
        // change (IU Kelley, many Drupal/WordPress sites, etc.).
        const isNewsForPagination = looksLikeNewsPage(url);
        let pagination: { paginated: boolean; signal?: string; pagesWalked: number; clickMissed: boolean; gained: number } | null = null;
        if (!isNewsForPagination) {
          const pdetect = detectPagination(md, initialRawHtml, merged.length);
          if (pdetect.paginated) {
            try {
              const walk = await scrapeWithPaginationActions(fcKey, url, MAX_PAGINATION_PAGES);
              if (!walk.clickMissed && walk.combinedText.length > md.length) {
                const combinedExtract = extractDirectoryMarkdownPeople(walk.combinedText);
                const combinedAi = await callAiGateway(aiKey, url, walk.combinedText.slice(0, 80_000));
                const reMerged = mergePeople(
                  mergePeople(parsedPeople, combinedExtract),
                  mergePeople(aiPeople, combinedAi),
                );
                pagination = {
                  paginated: true,
                  signal: pdetect.signal,
                  pagesWalked: walk.pagesWalked,
                  clickMissed: false,
                  gained: Math.max(0, reMerged.length - merged.length),
                };
                if (reMerged.length > merged.length) {
                  parsedPeople = mergePeople(parsedPeople, combinedExtract);
                  aiPeople = mergePeople(aiPeople, combinedAi);
                  merged = reMerged;
                  // Replace cache markdown with the richer multi-page text so
                  // downstream RMP reverse-lookup can match every prof.
                  md = walk.combinedText.slice(0, 200_000);
                  cache[url] = { markdown: md, links: links.slice(0, 2000), scraped_at: new Date().toISOString() };
                }
              } else {
                pagination = {
                  paginated: true,
                  signal: pdetect.signal,
                  pagesWalked: walk.pagesWalked,
                  clickMissed: true,
                  gained: 0,
                };
              }
            } catch (e) {
              // Pagination is best-effort. Log to perPage error suffix; keep page-1 results.
              pagination = {
                paginated: true,
                signal: pdetect.signal,
                pagesWalked: 0,
                clickMissed: true,
                gained: 0,
              };
              console.warn(`[pagination] ${url}: ${e instanceof Error ? e.message : String(e)}`);
            }

            // ---- Click-miss recovery -----------------------------------
            // If the Next/Load-more click selector union never fired (the
            // pager is behind a shadow-DOM web component, an obfuscated
            // <div> handler, a custom focus-only button, etc.) try two
            // generalizable fallbacks before giving up:
            //   (a) SCROLL — many "Load more" pagers actually trigger on
            //       intersection-observer scroll, not click.
            //   (b) URL-PARAM PROBE — many frameworks (WordPress, Drupal,
            //       ASP.NET) accept ?page=N even when the visible pager is
            //       AJAX-only. Mine candidate URLs from the rendered DOM
            //       and scrape them in parallel.
            if (pagination?.clickMissed && (pagination.gained ?? 0) === 0) {
              // (a) scroll fallback
              try {
                const scrollWalk = await scrapeWithScrollActions(fcKey, url, MAX_PAGINATION_PAGES);
                if (scrollWalk.gained && scrollWalk.markdown.length > md.length * 1.15) {
                  const scrollExtract = extractDirectoryMarkdownPeople(scrollWalk.markdown);
                  const scrollAi = await callAiGateway(aiKey, url, scrollWalk.markdown.slice(0, 80_000));
                  const reMerged = mergePeople(
                    mergePeople(parsedPeople, scrollExtract),
                    mergePeople(aiPeople, scrollAi),
                  );
                  if (reMerged.length > merged.length) {
                    parsedPeople = mergePeople(parsedPeople, scrollExtract);
                    aiPeople = mergePeople(aiPeople, scrollAi);
                    pagination = {
                      paginated: true,
                      signal: `${pagination.signal ?? "?"}+scroll-fallback`,
                      pagesWalked: pagination.pagesWalked,
                      clickMissed: false,
                      gained: reMerged.length - merged.length,
                    };
                    merged = reMerged;
                    md = scrollWalk.markdown.slice(0, 200_000);
                    cache[url] = { markdown: md, links: links.slice(0, 2000), scraped_at: new Date().toISOString() };
                  }
                }
              } catch (e) {
                console.warn(`[pagination scroll-fallback] ${url}: ${e instanceof Error ? e.message : String(e)}`);
              }

              // (b) URL-param probe — only if still empty-handed
              if (pagination?.clickMissed && (pagination.gained ?? 0) === 0) {
                const candidates = discoverUrlPaginationCandidates(url, initialRawHtml, links, 5);
                if (candidates.length > 0) {
                  try {
                    const probed = await Promise.all(
                      candidates.map((c) => firecrawlScrapeWithLinks(fcKey, c).catch(() => null)),
                    );
                    const extraMd = probed
                      .filter((p): p is NonNullable<typeof p> => !!p && !!p.markdown)
                      .map((p) => p.markdown)
                      .join("\n\n---\n\n");
                    if (extraMd.length > 0) {
                      const probeExtract = extractDirectoryMarkdownPeople(extraMd);
                      const probeAi = await callAiGateway(aiKey, url, extraMd.slice(0, 80_000));
                      const reMerged = mergePeople(
                        mergePeople(parsedPeople, probeExtract),
                        mergePeople(aiPeople, probeAi),
                      );
                      if (reMerged.length > merged.length) {
                        parsedPeople = mergePeople(parsedPeople, probeExtract);
                        aiPeople = mergePeople(aiPeople, probeAi);
                        pagination = {
                          paginated: true,
                          signal: `${pagination.signal ?? "?"}+url-probe(${candidates.length})`,
                          pagesWalked: candidates.length + 1,
                          clickMissed: false,
                          gained: reMerged.length - merged.length,
                        };
                        merged = reMerged;
                        md = (md + "\n\n---\n\n" + extraMd).slice(0, 200_000);
                        cache[url] = { markdown: md, links: links.slice(0, 2000), scraped_at: new Date().toISOString() };
                      }
                    }
                  } catch (e) {
                    console.warn(`[pagination url-probe] ${url}: ${e instanceof Error ? e.message : String(e)}`);
                  }
                }
              }

              // (c) Profile-link harvest — final fallback. Mine same-host
              //     profile URLs from the rendered HTML and scrape a sample
              //     in parallel. Works when the directory is fully JS-state
              //     paginated but the underlying anchors are server-rendered.
              if (pagination?.clickMissed && (pagination.gained ?? 0) === 0) {
                const profileLinks = discoverProfileLinkCandidates(url, initialRawHtml, links, 12);
                if (profileLinks.length >= 3) {
                  try {
                    const probed = await Promise.all(
                      profileLinks.map((c) => firecrawlScrapeWithLinks(fcKey, c).catch(() => null)),
                    );
                    const extraMd = probed
                      .filter((p): p is NonNullable<typeof p> => !!p && !!p.markdown)
                      .map((p) => p.markdown)
                      .join("\n\n---\n\n");
                    if (extraMd.length > 0) {
                      const harvestExtract = extractDirectoryMarkdownPeople(extraMd);
                      const harvestAi = await callAiGateway(aiKey, url, extraMd.slice(0, 80_000));
                      const reMerged = mergePeople(
                        mergePeople(parsedPeople, harvestExtract),
                        mergePeople(aiPeople, harvestAi),
                      );
                      if (reMerged.length > merged.length) {
                        parsedPeople = mergePeople(parsedPeople, harvestExtract);
                        aiPeople = mergePeople(aiPeople, harvestAi);
                        pagination = {
                          paginated: true,
                          signal: `${pagination.signal ?? "?"}+profile-harvest(${profileLinks.length})`,
                          pagesWalked: profileLinks.length,
                          clickMissed: false,
                          gained: reMerged.length - merged.length,
                        };
                        merged = reMerged;
                        md = (md + "\n\n---\n\n" + extraMd).slice(0, 200_000);
                        cache[url] = { markdown: md, links: links.slice(0, 2000), scraped_at: new Date().toISOString() };
                      }
                    }
                  } catch (e) {
                    console.warn(`[pagination profile-harvest] ${url}: ${e instanceof Error ? e.message : String(e)}`);
                  }
                }
              }
            }

          }
        }


        const extracted = merged.length;

        // News/blog/spotlight page → names here are almost never tenure-track
        // faculty (student spotlights, alumni profiles, press features). Skip
        // expensive per-profile enrichment, skip directory sweep + inference,
        // and tag every row 'news' so reviewers can deprioritize them.
        const isNewsPage = looksLikeNewsPage(url);
        // Deterministic fallback: pair people without a profile_url to a
        // slug-matched link from the directory page (e.g. /faculty/friedman).
        const { people: withSlugs, matched: slugMatched } = isNewsPage
          ? { people: merged, matched: 0 }
          : attachProfileUrlsFromLinks(merged, url, links);
        const { people: enrichedPeople, enriched, outcomes: enrichOutcomes } = isNewsPage
          ? { people: withSlugs, enriched: 0, outcomes: [] as Array<{ url: string; name: string; result: "ok" | "obfuscated" | "mailto" | "empty" | "no_email" | "error" | "skipped_host"; mdLen: number; htmlLen: number }> }
          : await enrichProfileEmails(fcKey, withSlugs, url);

        // Recovery pass A — directory markdown sweep. Many .edu directories
        // list "Name ... email" in a card on the listing page even though the
        // individual profile page hides it. Free (uses the markdown we
        // already fetched). Tag as 'directory' so the UI shows it as a
        // medium-confidence find.
        let directoryFilled = 0;
        const afterDirectorySweep = isNewsPage
          ? enrichedPeople.map((p) => ({ ...p, email_confidence: "news" as const }))
          : enrichedPeople.map((p) => {
              if (p.email) return { ...p, email_confidence: p.email_confidence ?? "verified" as const };
              const hit = findEmailNearName(md, p.first_name, p.last_name);
              if (!hit) return p;
              directoryFilled++;
              return { ...p, email: hit, email_confidence: "directory" as const };
            });

        // Recovery pass B — pattern inference. If ≥3 captured emails in this
        // department agree on one local-part pattern + domain, synthesize
        // emails for the leftover misses. Flagged as 'inferred' so a human
        // can spot-check before any send. Skipped automatically when the
        // sample is too sparse to be confident. Also skipped on news pages —
        // synthesizing a "faculty" email for a student spotlight is wrong.
        const pat = (isNewsPage || !ENABLE_EMAIL_INFERENCE) ? null : inferDepartmentPattern(afterDirectorySweep);
        let inferredFilled = 0;
        const afterInference = afterDirectorySweep.map((p) => {
          if (p.email) return p;
          if (!pat) return p;
          const local = applyPattern(pat.pattern, p.first_name, p.last_name);
          if (!local) return p;
          inferredFilled++;
          return { ...p, email: `${local}@${pat.domain}`, email_confidence: "inferred" as const };
        });

        const people = afterInference;
        const withEmail = people.filter((p) => !!p.email).length;
        const withProfileUrl = people.filter((p) => !!p.profile_url).length;
        let pageDropped = 0;
        let pageInserted = 0;
        let pageRejectedNonPerson = 0;
        const rejectedSamples: Array<{ name: string; reason: string }> = [];
        for (const p of people) {
          const hasContact = !!p.email || !!p.profile_url;
          if (!hasContact && !options.allowNoContact) { pageDropped++; continue; }
          // Blank a junk title (markdown/URL/nav) so it can't drop a real person.
          p.title = sanitizeTitle(p.title);
          const gate = isLikelyPersonRow({ first_name: p.first_name, last_name: p.last_name, title: p.title, email: p.email });
          if (!gate.ok) {
            pageRejectedNonPerson++;
            pageDropped++;
            if (rejectedSamples.length < 8) {
              rejectedSamples.push({ name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "(no name)", reason: gate.reason });
            }
            continue;
          }
          pageInserted++;
          rowsToInsert.push({
            campus_id: campusId,
            first_name: p.first_name,
            last_name: p.last_name,
            title: p.title,
            email: p.email,
            source_url: p.profile_url ?? url,
            research_mode: "faculty_scrape",
            research_label: "faculty_scrape_v2_firecrawl",
            status: "pending",
            lead_type: "professor",
            is_phd: p.is_phd,
            is_cpa: p.is_cpa,
            notes: hasContact ? `Scraped from ${url}` : `Scraped (name only) from ${url}`,
            raw_payload: {
              source_page: url,
              title: p.title,
              profile_url: p.profile_url,
              is_phd: p.is_phd,
              is_cpa: p.is_cpa,
              links: p.links ?? null,
              name_only: !hasContact,
              email_confidence: p.email_confidence ?? (p.email ? "verified" : null),
              ...(p.email_confidence === "inferred" && pat
                ? { inferred_pattern: pat.pattern, inferred_domain: pat.domain, inferred_sample_size: pat.sampleSize }
                : {}),
              ...(pagination && pagination.pagesWalked > 1
                ? { pagination: { pagesWalked: pagination.pagesWalked, signal: pagination.signal, gained: pagination.gained } }
                : {}),
            },
          });
        }
        totalDroppedNoContact += pageDropped;
        perPage.push({
          url,
          found: pageInserted,
          extracted,
          withEmail,
          withProfileUrl,
          slugMatched,
          enriched: enriched + directoryFilled + inferredFilled,
          droppedNoContact: pageDropped,
          links: links.length,
          error: null,
          enrichOutcomes,
          pagination: pagination ?? undefined,
          cardBlocks: cardBlocksCount,
          cardEmailsPaired,
          aiEmailOverridden,
          diag,
          rejectedNonPerson: pageRejectedNonPerson,
          rejectedNonPersonSamples: rejectedSamples,
        });



      } catch (e) {
        perPage.push({ url, found: 0, extracted: 0, withEmail: 0, withProfileUrl: 0, slugMatched: 0, enriched: 0, droppedNoContact: 0, links: 0, error: e instanceof Error ? e.message : String(e) });
      }
    }
  });

  await Promise.all(urlWorkers);

  let inserted = 0;
  let skippedDuplicates = 0;
  if (rowsToInsert.length > 0) {
    const seen = new Set<string>();
    const unique = rowsToInsert.filter((r) => {
      const key = (r.email as string | null) ?? `${r.first_name}|${r.last_name}|${r.source_url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const emails = unique.map((r) => r.email).filter((e): e is string => !!e);
    let existingEmails = new Set<string>();
    if (emails.length > 0) {
      // Only treat ACTIVE (non-archived) rows as duplicates. Previously-
      // archived rows (e.g. from a "Reset all leads" sweep) should NOT block
      // a fresh scrape — otherwise the new run inserts nothing and the
      // triage panel stays empty.
      const { data: existing } = await supabaseAdmin
        .from("campus_lead_suggestions")
        .select("email")
        .eq("campus_id", campusId)
        .is("archived_at", null)
        .in("email", emails);
      existingEmails = new Set((existing ?? []).map((r: { email: string | null }) => r.email).filter((e): e is string => !!e));
    }
    const toInsert = unique.filter((r) => {
      const e = r.email as string | null;
      if (e && existingEmails.has(e)) { skippedDuplicates++; return false; }
      return true;
    });
    if (toInsert.length > 0) {
      const { error } = await supabaseAdmin.from("campus_lead_suggestions").insert(toInsert as never);
      if (error) throw new Error(`insert failed: ${error.message}`);
      inserted = toInsert.length;
    }
  }

  return { perPage, inserted, skippedDuplicates, droppedNoContact: totalDroppedNoContact, programLevels, programLevelSources, cache };
}

function requireKeys() {
  const aiKey = process.env.AI_GATEWAY_API_KEY;
  if (!aiKey) throw new Error("AI_GATEWAY_API_KEY is not configured on the server");
  const fcKey = process.env.FIRECRAWL_API_KEY;
  if (!fcKey) throw new Error("FIRECRAWL_API_KEY is not configured on the server");
  return { aiKey, fcKey };
}

// OR-merge detected program levels into the campus row. Never clears an
// existing `true` — different pages cover different programs, and a single
// empty page shouldn't erase what an earlier run found.
async function persistProgramLevels(
  campusId: string,
  detection: ProgramLevelDetection,
  sourceUrls: string[],
): Promise<void> {
  if (!detection.bachelors && !detection.masters && !detection.phd) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: existing } = await supabaseAdmin
    .from("campuses")
    .select("has_bachelors_accounting,has_masters_accounting,has_phd_accounting")
    .eq("id", campusId)
    .maybeSingle();
  const next = {
    has_bachelors_accounting: Boolean((existing as { has_bachelors_accounting?: boolean } | null)?.has_bachelors_accounting) || detection.bachelors,
    has_masters_accounting: Boolean((existing as { has_masters_accounting?: boolean } | null)?.has_masters_accounting) || detection.masters,
    has_phd_accounting: Boolean((existing as { has_phd_accounting?: boolean } | null)?.has_phd_accounting) || detection.phd,
    program_levels_evidence: {
      bachelors: detection.evidence.bachelors,
      masters: detection.evidence.masters,
      phd: detection.evidence.phd,
      source_urls: sourceUrls,
      detected_at: new Date().toISOString(),
    },
  };
  await supabaseAdmin.from("campuses").update(next).eq("id", campusId);
}

export const scrapeCampusFaculty = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ScrapeInputSchema.parse(input))
  .handler(async ({ data }) => {
    const { aiKey, fcKey } = requireKeys();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const startedAt = Date.now();
    const result = await processUrls(fcKey, aiKey, data.campusId, data.urls, { allowNoContact: data.allowNoContact });

    // ---- Map fallback ---------------------------------------------------
    // If the primary scrape yielded <5 emails AND we have a root domain to
    // map against, ask Firecrawl to find faculty-roster URLs we haven't
    // tried yet. One map call (~$0.001) beats missing a whole department.
    const totalEmails = result.perPage.reduce((s, p) => s + p.withEmail, 0);
    const inputHosts = Array.from(new Set(data.urls.map((u) => {
      try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
    }).filter(Boolean)));
    let mapFallbackUsed = false;
    if (totalEmails < MAP_FALLBACK_EMAIL_THRESHOLD && inputHosts.length > 0) {
      try {
        const mapped = await firecrawlMap(fcKey, `https://${inputHosts[0]}`, "faculty accounting");
        const already = new Set(data.urls.map(normalizeUrl));
        const fallbackUrls = rankFacultyUrls(mapped)
          .filter((u) => !already.has(normalizeUrl(u)))
          .slice(0, 3);
        if (fallbackUrls.length > 0) {
          mapFallbackUsed = true;
          const fb = await processUrls(fcKey, aiKey, data.campusId, fallbackUrls, { allowNoContact: data.allowNoContact });
          result.perPage.push(...fb.perPage);
          result.inserted += fb.inserted;
          result.skippedDuplicates += fb.skippedDuplicates;
          result.droppedNoContact += fb.droppedNoContact;
          Object.assign(result.cache, fb.cache);
          if (fb.programLevels.bachelors || fb.programLevels.masters || fb.programLevels.phd) {
            result.programLevels = mergeDetections(result.programLevels, fb.programLevels);
            for (const s of fb.programLevelSources) {
              if (!result.programLevelSources.includes(s)) result.programLevelSources.push(s);
            }
          }
        }
      } catch { /* map fallback is best-effort */ }
    }

    await supabaseAdmin
      .from("campuses")
      .update({
        faculty_page_url: data.urls.join("\n"),
        faculty_scrape_cache: result.cache,
      } as never)
      .eq("id", data.campusId);
    await persistProgramLevels(data.campusId, result.programLevels, result.programLevelSources);

    // Auto debug bundle + AI suggestion (Tier 1 + Tier 2). Best-effort.
    try {
      const { data: campusRow } = await supabaseAdmin
        .from("campuses")
        .select("name")
        .eq("id", data.campusId)
        .maybeSingle();
      const { recordAndAnalyzeBundle } = await import("@/lib/scrape-debug.server");
      const { estimateRunCostUsd } = await import("@/lib/scrape-cost");
      await recordAndAnalyzeBundle({
        campusId: data.campusId,
        campusName: (campusRow as { name?: string } | null)?.name ?? null,
        kind: "faculty",
        scrapeJobId: null,
        durationMs: Date.now() - startedAt,
        inputUrls: data.urls,
        perPage: result.perPage,
        inserted: result.inserted,
        skippedDuplicates: result.skippedDuplicates,
        droppedNoContact: result.droppedNoContact,
        mapFallbackUsed,
        // Operation-counted estimate (directory + profile scrapes + pagination
        // + map + AI calls) using the rates in scrape-cost.ts. Far more accurate
        // than the old flat per-campus guess — drives the cost meter + margins.
        costEstimateUsd: estimateRunCostUsd(result.perPage, { mapFallbackUsed }),
      });
    } catch (e) {
      console.warn("[scrapeCampusFaculty] debug bundle failed:", e instanceof Error ? e.message : String(e));
    }

    return { ok: true, ...result };
  });

export const autoDiscoverCampusFaculty = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DiscoverInputSchema.parse(input))
  .handler(async ({ data }) => {
    const { aiKey, fcKey } = requireKeys();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: campus, error: campusErr } = await supabaseAdmin
      .from("campuses")
      .select("website_url,accounting_department_url,faculty_page_url,domains,name")
      .eq("id", data.campusId)
      .maybeSingle();
    if (campusErr) throw new Error(campusErr.message);
    if (!campus) throw new Error("Campus not found");

    const seeds: string[] = [];
    const accDept = campus.accounting_department_url as string | null;
    const facultyPageUrl = campus.faculty_page_url as string | null;
    const website = campus.website_url as string | null;
    const domains = (campus.domains as string[] | null) ?? [];
    const explicitFacultyUrls = (facultyPageUrl ?? "")
      .split(/\r?\n/)
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//i.test(u))
      .map(normalizeUrl);
    if (accDept) seeds.push(accDept);
    if (website) seeds.push(website);
    for (const d of domains) {
      if (typeof d !== "string") continue;
      const u = d.startsWith("http") ? d : `https://${d}`;
      if (!seeds.includes(u)) seeds.push(u);
    }
    const derivedAccountancySeeds = seeds.flatMap((seed) => {
      try {
        const parsed = new URL(seed);
        const host = parsed.hostname.replace(/^www\./, "");
        if (host.includes("accountancy.")) return [];
        return [`${parsed.protocol}//accountancy.${host}/`];
      } catch { return []; }
    });
    for (const seed of derivedAccountancySeeds) if (!seeds.includes(seed)) seeds.unshift(seed);
    if (seeds.length === 0) {
      throw new Error("No website_url, accounting_department_url, or domains on this campus. Add one or use 'Scrape faculty' with explicit URLs.");
    }

    // Discovery strategy: combine Firecrawl `search` (Google-quality, finds
    // pages even if not in the site map) with Firecrawl `map` over each
    // seed. Search runs against each seed domain individually so we get
    // results scoped to that school, not the entire web.
    const allLinks: string[] = [];
    const discoveryErrors: string[] = [];
    allLinks.push(...explicitFacultyUrls);

    for (const seed of seeds.slice(0, 3)) {
      let host = "";
      try { host = new URL(seed).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
      // 1) Site-scoped search — usually the highest-signal result.
      if (host) {
        try {
          const found = await firecrawlSearch(fcKey, `site:${host} accountancy faculty staff`);
          allLinks.push(...found);
        } catch (e) {
          discoveryErrors.push(`search ${host}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      // 2) Map the seed — picks up internal links the search engine missed.
      try {
        const links = await firecrawlMap(fcKey, seed, "faculty staff");
        allLinks.push(...links);
      } catch (e) {
        discoveryErrors.push(`map ${seed}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (allLinks.length === 0) {
      throw new Error(`Firecrawl discovery found no links. ${discoveryErrors.join("; ")}`);
    }
    const mapErrors = discoveryErrors;

    const ranked = Array.from(new Set([...explicitFacultyUrls, ...rankFacultyUrls(allLinks)])).slice(0, data.maxPages);
    if (ranked.length === 0) {
      return {
        ok: true, discovered: 0, scraped: 0, inserted: 0, skippedDuplicates: 0,
        perPage: [], chosenUrls: [], mapErrors,
      };
    }

    // Save discovered URLs to campus.faculty_page_url so subsequent runs (or
    // the manual "Scrape faculty" button) can use them without re-discovering.
    await supabaseAdmin
      .from("campuses")
      .update({ faculty_page_url: ranked.join("\n") })
      .eq("id", data.campusId);

    if (data.discoverOnly) {
      return {
        ok: true,
        discovered: allLinks.length,
        scraped: 0,
        inserted: 0,
        skippedDuplicates: 0,
        perPage: [],
        chosenUrls: ranked,
        mapErrors,
      };
    }

    const result = await processUrls(fcKey, aiKey, data.campusId, ranked);
    await supabaseAdmin
      .from("campuses")
      .update({ faculty_scrape_cache: result.cache } as never)
      .eq("id", data.campusId);
    await persistProgramLevels(data.campusId, result.programLevels, result.programLevelSources);

    return {
      ok: true,
      discovered: allLinks.length,
      scraped: ranked.length,
      chosenUrls: ranked,
      mapErrors,
      ...result,
    };
  });

export const scrapeCampusFacultyPdf = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => PdfInputSchema.parse(input))
  .handler(async ({ data }) => {
    const aiKey = process.env.AI_GATEWAY_API_KEY;
    if (!aiKey) throw new Error("AI_GATEWAY_API_KEY is not configured on the server");
    const people = await callAiGatewayWithPdf(aiKey, data.filename, data.fileBase64);
    const { inserted, skippedDuplicates, droppedNoContact } = await insertExtractedPeople(
      data.campusId,
      people,
      `PDF: ${data.filename}`,
      "faculty_scrape_pdf_v1",
      { allowNoContact: true },
    );
    return { ok: true, found: people.length, inserted, skippedDuplicates, droppedNoContact };
  });
