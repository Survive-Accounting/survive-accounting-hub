// GreekRank harvester — deterministic HTML parse, one public page per request, polite delay.
// Never bypasses protection: a 403/429 is recorded blocked and the campus skipped. Caches pages.
import fs from "node:fs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const CACHE = new URL("./cache/", import.meta.url);
try { fs.mkdirSync(CACHE, { recursive: true }); } catch {}
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function fetchPage(uniId, kind) {
  const cacheFile = new URL(`${uniId}-${kind}.html`, CACHE);
  if (fs.existsSync(cacheFile)) return { html: fs.readFileSync(cacheFile, "utf8"), cached: true, status: 200 };
  const url = `https://www.greekrank.net/uni/${uniId}/${kind}/`;
  let res;
  try { res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html" } }); }
  catch (e) { return { html: "", status: 0, error: e.message }; }
  if (res.status === 429 || res.status === 403) { await sleep(5000); return { html: "", status: res.status, blocked: true }; }
  const html = res.status === 200 ? await res.text() : "";
  if (html && html.length > 2000) fs.writeFileSync(cacheFile, html);
  await sleep(1500 + Math.floor(Math.random() * 1200));
  return { html, status: res.status, cached: false };
}

const decode = s => s
  .replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/&[A-Za-z]+;/g, "").replace(/\s+/g, " ").trim();

// Org NAME anchor only: the /rating/ page link, whose text is "<Name> - <Greek letters>". The
// "/rate/" button links share the same org id but carry inner markup ("Rate<...>This Fraternity"),
// so restricting to /rating/ keeps the button text from ever overwriting the real name.
const ANCHOR = /href="\/uni\/\d+\/(?:fraternity|sorority)\/[A-Za-z0-9._-]+\/(\d+)\/rating\/"[\s\S]*?>([^<]+)</g;

export function parseRoster(html) {
  const hits = [];
  for (const m of html.matchAll(ANCHOR)) hits.push({ id: m[1], raw: m[2], idx: m.index });
  const byId = new Map();
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const name = decode(h.raw).replace(/\s*[-–]\s*[^-–]*$/, "").trim(); // drop trailing " - letters"
    if (!name || /^rate\b/i.test(name) || name.length < 2) continue;
    const next = hits[i + 1];
    const segment = html.slice(h.idx, next ? next.idx : Math.min(h.idx + 900, html.length));
    const inactive = /INACTIVE/i.test(segment);
    const cur = byId.get(h.id);
    // Keep the FIRST real name (the name anchor precedes any duplicate); OR the inactive flag.
    byId.set(h.id, { name: cur?.name ?? name, inactive: (cur?.inactive || inactive) });
  }
  return [...byId.values()];
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`.replace("file:////", "file:///");
if (isMain && process.argv[2]) {
  const uniId = process.argv[2];
  for (const kind of ["fraternities", "sororities"]) {
    const { html, status, blocked, cached, error } = await fetchPage(uniId, kind);
    if (!html) { console.log(`${kind}: status ${status}${blocked ? " BLOCKED" : ""}${error ? " ERR " + error : ""}`); continue; }
    const roster = parseRoster(html);
    console.log(`\n${kind} (${cached ? "cached" : "live"}): ${roster.length} orgs, ${roster.filter(r => r.inactive).length} inactive`);
    for (const r of roster) console.log(`  ${r.inactive ? "[X] " : "    "}${r.name}`);
  }
}
