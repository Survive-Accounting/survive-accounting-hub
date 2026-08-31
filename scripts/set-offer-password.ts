// One-shot: set OFFER_PASSWORD on the Vercel project so /offer/mckenzie's gate can open.
//
//   bun scripts/set-offer-password.ts
//
// ── WHY A SCRIPT AND NOT A PASTE INTO THE DASHBOARD ───────────────────────────────────────────
// Lee asked for it to be set. The value is read from the local .env (which is gitignored), never
// typed into a file that gets committed, and never printed — this script logs only the last two
// characters so you can confirm the right value landed without the password appearing in a
// terminal that might get screenshotted.
//
// IT UPSERTS. If OFFER_PASSWORD already exists the value is replaced rather than duplicated;
// Vercel rejects a create for a name that already exists in the same target, and a half-set
// variable is exactly the failure that leaves the gate refusing everyone.
import { readFileSync } from "node:fs";

/** Read a key from a dotenv-style file without pulling in a parser. */
function fromEnvFile(path: string, key: string): string {
  try {
    const re = new RegExp(`^${key}=(.*)$`, "m");
    return re.exec(readFileSync(path, "utf8"))?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
  } catch {
    return "";
  }
}

const SIBLINGS = [
  ".env.vercel",
  "../sa-campus-rep/.env.vercel",
  "../sa-growth-contacts/.env.vercel",
  "../sa-greek-academic/.env.vercel",
  "../sa-greek-990/.env.vercel",
  "../sa-course-intel-harvest/.env.vercel",
];

function credential(key: string): string {
  const fromProcess = (process.env[key] ?? "").trim();
  if (fromProcess) return fromProcess;
  for (const p of SIBLINGS) {
    const v = fromEnvFile(p, key);
    if (v) return v;
  }
  return "";
}

const TOKEN = credential("VERCEL_API_TOKEN");
const PROJECT = credential("VERCEL_PROJECT_ID");
const TEAM = credential("VERCEL_TEAM_ID");

// THE PASSWORD ITSELF comes from the local .env only — the one file that is gitignored.
const VALUE = fromEnvFile(".env", "OFFER_PASSWORD");

if (!TOKEN) { console.error("No VERCEL_API_TOKEN available."); process.exit(1); }
if (!PROJECT) { console.error("No VERCEL_PROJECT_ID available."); process.exit(1); }
if (!VALUE) { console.error("OFFER_PASSWORD is not in .env — nothing to set."); process.exit(1); }

const q = TEAM ? `?teamId=${encodeURIComponent(TEAM)}` : "";
const base = `https://api.vercel.com/v10/projects/${encodeURIComponent(PROJECT)}/env`;
const headers = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

const masked = `••••${VALUE.slice(-2)}`;
console.log(`Setting OFFER_PASSWORD (${VALUE.length} chars, ending ${masked}) on project ${PROJECT.slice(0, 12)}…`);

// 1. Does it already exist? Vercel refuses a create that collides, so an existing one is edited.
const listRes = await fetch(`${base}${q}`, { headers });
if (!listRes.ok) { console.error(`Could not list env vars: HTTP ${listRes.status}`); process.exit(1); }
const list = (await listRes.json()) as { envs?: Array<{ id: string; key: string; target?: string[] }> };
const existing = (list.envs ?? []).filter((e) => e.key === "OFFER_PASSWORD");
console.log(`Existing OFFER_PASSWORD entries: ${existing.length}`);

// 2. Upsert. All three targets, so a preview deployment behaves like production rather than
//    silently refusing every password.
const body = {
  key: "OFFER_PASSWORD",
  value: VALUE,
  type: "encrypted",
  target: ["production", "preview", "development"],
};

let ok = true;
if (existing.length === 0) {
  const res = await fetch(`${base}${q}`, { method: "POST", headers, body: JSON.stringify(body) });
  const t = await res.text();
  console.log(`create → HTTP ${res.status}`);
  if (!res.ok) { console.error(t.slice(0, 400)); ok = false; }
} else {
  for (const e of existing) {
    const res = await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(PROJECT)}/env/${e.id}${q}`, {
      method: "PATCH", headers,
      body: JSON.stringify({ value: VALUE, target: body.target, type: body.type }),
    });
    const t = await res.text();
    console.log(`update ${e.id.slice(0, 10)}… → HTTP ${res.status}`);
    if (!res.ok) { console.error(t.slice(0, 400)); ok = false; }
  }
}

// 3. PROVE IT. Re-read the list and report what is there now — never assume the write landed.
const after = await fetch(`${base}${q}`, { headers });
const afterJson = (await after.json()) as { envs?: Array<{ key: string; target?: string[]; type?: string }> };
const now = (afterJson.envs ?? []).filter((e) => e.key === "OFFER_PASSWORD");
console.log("\n════ PROOF ════");
console.log(now.length
  ? now.map((e) => `OFFER_PASSWORD  type=${e.type}  targets=${(e.target ?? []).join(",")}`).join("\n")
  : "NOT PRESENT — the gate will refuse everyone.");

// The value is encrypted at rest and cannot be read back, so this cannot verify the VALUE — only
// that the variable exists and on which targets. Said plainly rather than implied.
console.log("\nVercel encrypts the value, so it cannot be read back to confirm; only presence and targets are verifiable here.");
console.log("A REDEPLOY IS REQUIRED for a running deployment to see it.");

process.exit(ok && now.length > 0 ? 0 : 1);
