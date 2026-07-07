// Reddit "paste whole page" parser — pure, dependency-free, unit-tested. Lee opens
// a Reddit post, Ctrl+A / Ctrl+C, and pastes the page text; this heuristically
// pulls out the fields to prefill quick-add. Best-effort: any field it can't find
// stays null (never blocks manual entry). Handles new- and old-reddit shapes.

export interface ParsedRedditPaste {
  subreddit: string | null;
  author: string | null;
  posted_at: string | null; // ISO
  title: string | null;
  snippet: string | null;
  url: string | null;
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const REL_SECONDS: Record<string, number> = {
  min: 60,
  minute: 60,
  hour: 3600,
  hr: 3600,
  day: 86400,
  d: 86400,
  week: 604800,
  wk: 604800,
  month: 2592000,
  mo: 2592000,
  year: 31536000,
  yr: 31536000,
};

// Chrome/lines that are Reddit UI, not post content.
const UI_TOKEN =
  /^(join(ed)?|search|log\s?in|sign\s?up|share|save|report|reply|award|give award|follow|hide|crosspost|posted by|submitted|sort by:?|best|top|new|hot|controversial|add a comment|comments?|members|online|upvote|downvote|vote|points?|skip to)/i;
const COMMENT_MARKER =
  /^(add a comment|sort by|comments?|share|\d+\s*comments?|single comment thread|be the first|view all comments|top comments|view discussions)/i;

function isUiTokenLine(line: string): boolean {
  const l = line.trim();
  if (!l) return true;
  if (UI_TOKEN.test(l)) return true;
  if (/^r\/[A-Za-z0-9_]/i.test(l)) return true; // subreddit header line
  if (/^u\/[A-Za-z0-9_-]/i.test(l)) return true; // user header line
  if (/^[•·|●∙]+$/.test(l)) return true; // separators
  // counts: "1.2k", "42 comments", "3.4k members", "12 points"
  if (/^\d[\d.,]*\s*(k|m)?\s*(comments?|members|online|upvotes?|points?|votes?)?$/i.test(l))
    return true;
  // a bare relative time: "5 hr. ago"
  if (/^\d+\s*(min(ute)?|hour|hr|day|d|week|wk|month|mo|year|yr)s?\.?\s*ago$/i.test(l)) return true;
  return false;
}

function parsePostedAt(text: string, now: number): string | null {
  const rel = text.match(
    /(\d+)\s*(minutes?|min|hours?|hr|days?|d|weeks?|wk|months?|mo|years?|yr)s?\.?\s*ago/i,
  );
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2].toLowerCase().replace(/s$/, "");
    const secs = REL_SECONDS[unit] ?? REL_SECONDS[unit.slice(0, 2)] ?? 0;
    if (secs) return new Date(now - n * secs * 1000).toISOString();
  }
  // absolute "Jul 2, 2026" / "July 2, 2026" — build in UTC for determinism.
  const abs = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (abs) {
    const mon = MONTHS[abs[1].slice(0, 3).toLowerCase()];
    if (mon !== undefined) {
      const d = new Date(Date.UTC(Number(abs[3]), mon, Number(abs[2])));
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  }
  return null;
}

export function parseRedditPaste(text: string, now: number = Date.now()): ParsedRedditPaste {
  const raw = text ?? "";
  const lines = raw.split(/\r?\n/).map((l) => l.trim());

  const urlMatch = raw.match(
    /https?:\/\/(?:www\.|old\.|new\.|np\.)?reddit\.com\/r\/[^/\s]+\/comments\/[a-z0-9]+(?:\/[^\s)]*)?/i,
  );
  const url = urlMatch ? urlMatch[0] : null;

  const subMatch = raw.match(/\br\/([A-Za-z0-9_]{2,30})\b/);
  const subreddit = subMatch ? subMatch[1] : null;

  // First u/{name}, ignoring a leading "Posted by".
  const authMatch = raw.match(/\bu\/([A-Za-z0-9_-]{2,30})\b/);
  const author = authMatch ? authMatch[1] : null;

  const posted_at = parsePostedAt(raw, now);

  // Title: first substantial (≥15 char) content line that isn't a UI token/header.
  let title: string | null = null;
  let titleIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (isUiTokenLine(l) || /^https?:\/\//i.test(l)) continue;
    if (l.length >= 15) {
      title = l;
      titleIdx = i;
      break;
    }
  }

  // Snippet: content between the title and the first comments-section marker.
  let snippet: string | null = null;
  if (titleIdx >= 0) {
    const body: string[] = [];
    for (let i = titleIdx + 1; i < lines.length; i++) {
      const l = lines[i];
      if (COMMENT_MARKER.test(l)) break;
      if (isUiTokenLine(l) || /^https?:\/\//i.test(l)) continue;
      body.push(l);
      if (body.join(" ").length >= 300) break;
    }
    const joined = body.join(" ").trim();
    snippet = joined ? joined.slice(0, 300) : null;
  }

  return { subreddit, author, posted_at, title, snippet, url };
}
