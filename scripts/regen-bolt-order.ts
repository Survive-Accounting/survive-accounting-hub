// Regenerates the Power Four block of CURATED_CAMPUS_ORDER (bolt-config.ts) — run this and
// paste the output back in whenever the leads or the seed change. See the comment above that
// array for why the order is baked in rather than shuffled at render time.
//
//   bun scripts/regen-bolt-order.ts
import { GENERATED_SCHOOLS } from "../src/lib/schools.generated";
import { POWER_FOUR, seededShuffle } from "../src/components/brand-cards/bolt-zoom";

const LEADS = ["ole-miss", "lsu", "tennessee", "mississippi-state"];
const SEED = 7; // the same seed campusMix (bolt-zoom.ts) defaults to — one system, one number.

const missing = LEADS.filter((id) => !GENERATED_SCHOOLS.some((s) => s.id === id));
if (missing.length) throw new Error(`lead id(s) not found in schools.generated.ts: ${missing.join(", ")}`);

const pools = POWER_FOUR.map((conf, k) => seededShuffle(GENERATED_SCHOOLS.filter((s) => s.conference === conf && !LEADS.includes(s.id)), SEED + k * 101));
const longest = Math.max(...pools.map((p) => p.length));
const tail: (typeof GENERATED_SCHOOLS)[number][] = [];
for (let i = 0; i < longest; i++) for (const p of pools) if (p[i]) tail.push(p[i]);

const line = (id: string, tag: string, c1: string | null, c2: string | null) => `  "${id}", // ${tag} — ${c1 ?? "?"} + ${c2 ?? "?"}`;
const leadLines = LEADS.map((id) => { const s = GENERATED_SCHOOLS.find((x) => x.id === id)!; return line(id, s.conference, s.c1, s.c2); });
const tailLines = tail.map((s) => line(s.id, s.conference, s.c1, s.c2));

console.log([
  "  // ── the four leads, in the order Lee wants them seen ────────────────────────────────────────",
  ...leadLines,
  "  // ── the rest of the Power Four, mixed across conferences (seed " + SEED + " — see the note above) ──────",
  ...tailLines,
].join("\n"));
console.log(`\n${LEADS.length + tail.length} ids total (4 leads + ${tail.length} others).`);
