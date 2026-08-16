#!/usr/bin/env node
// VERIFY A DEPLOY BY ITS CONTENTS, NOT ITS HASH.
//
// The repo law is "verify deploys by grepping the live bundle CONTENTS" — but
// there was no tooling behind it, so every check was a hand-rolled curl and a
// guess at which chunk to look in. That cost a real round-trip on 08-16: a hard
// refresh showed stale UI, and answering "is it actually live?" took six manual
// steps. This is those six steps.
//
// Two kinds of assertion, and the second is the one that earns its keep:
//   --has  "<string>"   the NEW code must be present
//   --gone "<string>"   the OLD code must be ABSENT
// Presence alone is weak when old and new share strings (a class list, a label).
// Absence of the thing you replaced is decisive.
//
// It scans EVERY js asset the page references, so a moved or renamed chunk can't
// produce a false negative — the mistake that wasted the first attempt.
//
//   node scripts/verify-deploy.mjs --gone 'min-w-0 flex-1 truncate text-[9.5px]'
//   node scripts/verify-deploy.mjs --route /study/canvas --has 'Preview stitch' --wait 600
//
// Exit 0 when every assertion holds, 1 otherwise — so it can gate a script.

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const all = (name) => args.flatMap((a, i) => (a === `--${name}` && args[i + 1] ? [args[i + 1]] : []));

const origin = opt("url", "https://surviveaccounting.com").replace(/\/$/, "");
const route = opt("route", "/study/canvas");
const has = all("has");
const gone = all("gone");
const waitS = Number(opt("wait", "0"));
const everyS = Number(opt("every", "20"));

if (!has.length && !gone.length) {
  console.error("nothing to check. Pass --has '<new string>' and/or --gone '<old string>'.");
  console.error("  --gone is the strong one: the string you REPLACED must be absent.");
  process.exit(2);
}

const get = async (url) => {
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
};

/** Every same-origin .js the page pulls in. Scanning all of them is the point:
 *  chunk names move between builds, and guessing one is how you get a confident
 *  wrong answer. */
async function assetsOf(pageUrl) {
  const html = await get(pageUrl);
  const paths = new Set();
  for (const m of html.matchAll(/["'`](\/[a-zA-Z0-9_./-]*assets\/[a-zA-Z0-9_.-]+\.js)["'`]/g)) paths.add(m[1]);
  return [...paths];
}

async function check() {
  const paths = await assetsOf(origin + route);
  if (!paths.length) return { ok: false, why: `no js assets found at ${origin}${route} — is the route right?`, scanned: 0 };

  const bodies = await Promise.all(paths.map((p) => get(origin + p).catch(() => "")));
  const blob = bodies.join("\n");
  const bytes = blob.length;

  const results = [
    ...has.map((s) => ({ kind: "has", s, ok: blob.includes(s) })),
    ...gone.map((s) => ({ kind: "gone", s, ok: !blob.includes(s) })),
  ];
  return { ok: results.every((r) => r.ok), results, scanned: paths.length, bytes };
}

const report = (r) => {
  if (r.why) { console.log(`  ${r.why}`); return; }
  console.log(`  scanned ${r.scanned} chunks · ${(r.bytes / 1e6).toFixed(1)} MB`);
  for (const x of r.results) {
    const verb = x.kind === "has" ? "present" : "absent";
    console.log(`  ${x.ok ? "✓" : "✗"} must be ${verb}: ${JSON.stringify(x.s.slice(0, 70))}`);
  }
};

const started = Date.now();
for (;;) {
  let r;
  try { r = await check(); }
  catch (e) { r = { ok: false, why: String(e.message ?? e) }; }

  const elapsed = Math.round((Date.now() - started) / 1000);
  console.log(`${origin}${route}  (+${elapsed}s)`);
  report(r);

  if (r.ok) { console.log("\nLIVE — every assertion holds."); process.exit(0); }
  if (!waitS || elapsed >= waitS) {
    console.log(waitS ? `\nNOT LIVE after ${waitS}s.` : "\nNOT LIVE yet (pass --wait <seconds> to poll).");
    process.exit(1);
  }
  console.log(`  …not yet, re-checking in ${everyS}s\n`);
  await new Promise((res) => setTimeout(res, everyS * 1000));
}
