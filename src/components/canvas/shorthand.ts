// SHORTHAND BACKFILL (film-prep tool 3) — generate a player-nav shorthand from a
// stem, same convention as the master-sheet import: strip leading question words,
// keep the first ~5 meaningful words, cap at ~38 chars (never mid-word).
// Pure; the File ▾ action previews these in a table (inline-editable) before Apply,
// and NEVER overwrites an existing shorthand (only empty ones are listed at all).

const LEADING_STOP = new Set([
  "what", "which", "how", "when", "why", "where", "who", "whose",
  "is", "are", "was", "were", "does", "do", "did", "can", "could", "will", "would", "should",
  "a", "an", "the", "if", "in", "on", "of", "for", "to", "we", "you", "your", "it", "its", "there",
]);

const clean = (w: string): string => w.toLowerCase().replace(/[^a-z0-9'-]/gi, "");

export function generateShorthand(stem: string, cap = 38): string {
  // bracket placeholders ("[          ]") read as noise — drop them whole
  const words = stem.replace(/\[[^\]]*\]/g, " ").replace(/["“”]/g, " ").split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < words.length && LEADING_STOP.has(clean(words[i]))) i++;
  const meaningful = words.slice(i).filter((w) => /[a-z0-9]/i.test(w));
  let out = meaningful.slice(0, 5).join(" ").replace(/[?.!,;:]+$/g, "").trim();
  if (out.length > cap) out = out.slice(0, cap).replace(/\s+\S*$/, "").trim();
  return out;
}
