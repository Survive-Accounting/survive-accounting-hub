import fs from "node:fs";
import { all, URL_BASE, H } from "./pgwrite.mjs";

// prefix → { colors:[primary,secondary,tertiary], slug, name?, canonical?, short? }
const PLAN = {
  "49672cb7": { name:"University of Connecticut",     colors:["#000E2F","#FFFFFF","#A2AAAD"], slug:"university-of-connecticut" },
  "6cec1e83": { name:"Missouri State University",     colors:["#5E0009","#FFFFFF",null],      slug:"missouri-state-university" },
  "fdf5e2e4": { name:"Montana State University",      colors:["#00205B","#BF995B","#FFFFFF"], slug:"montana-state-university" },
  "21cad3ab": { name:"University of Nevada, Las Vegas",colors:["#E31837","#9FA1A4","#000000"], slug:"university-of-nevada-las-vegas", canonical:"University of Nevada, Las Vegas", short:"UNLV" },
  "3888d1aa": { name:"Kennesaw State University",     colors:["#FDBB30","#0B1315","#C5C6C8"], slug:"kennesaw-state-university" },
  "acae37b2": { name:"Towson University",             colors:["#000000","#FFCC00","#FFFFFF"], slug:"towson-university" },
  "d37a8470": { name:"University of North Alabama",   colors:["#46166B","#DB9F11","#5F6062"], slug:"university-of-north-alabama" },
};
const APPLY = process.argv.includes("--apply");

const rows = await all("campuses", "select=id,name,canonical_name,short_name,slug,archived_at,color_primary,color_secondary,color_tertiary");
const bySlug = new Map(rows.map(r => [r.slug, r]));
const pick = p => rows.find(r => r.id.startsWith(p));

// collision check
let collide = false;
for (const [p, plan] of Object.entries(PLAN)) {
  const target = pick(p);
  const owner = bySlug.get(plan.slug);
  if (owner && owner.id !== target.id) { console.log(`COLLISION: slug ${plan.slug} already owned by ${owner.id.slice(0,8)} "${owner.name}"`); collide = true; }
}
if (collide) { console.log("Aborting — slug collision."); process.exit(1); }

// backup
const backup = Object.keys(PLAN).map(p => { const r = pick(p); return r; });
fs.writeFileSync(new URL("./restore-backup.json", import.meta.url), JSON.stringify(backup, null, 1));

for (const [p, plan] of Object.entries(PLAN)) {
  const r = pick(p);
  const patch = {
    color_primary: plan.colors[0], color_secondary: plan.colors[1], color_tertiary: plan.colors[2],
    colors_reviewed: true, use_school_colors: true,
    slug: plan.slug, archived_at: null, archived_by: null,
  };
  if (plan.canonical) patch.canonical_name = plan.canonical;
  if (plan.short) patch.short_name = plan.short;
  if (plan.name) patch.name = plan.name;
  console.log(`${(plan.name).padEnd(34)} ${r.id.slice(0,8)}  arch ${r.archived_at?"Y":"N"}→N  slug ${r.slug||"—"}→${plan.slug}  colors ${plan.colors.filter(Boolean).join(" ")}`);
  if (APPLY) {
    const res = await fetch(`${URL_BASE}campuses?id=eq.${r.id}`, { method:"PATCH", headers:{...H,"Content-Type":"application/json",Prefer:"return=minimal"}, body: JSON.stringify(patch) });
    if (!res.ok) { console.log("  ERROR", res.status, (await res.text()).slice(0,200)); } else console.log("  ✓ applied");
  }
}
console.log(APPLY ? "\nAPPLIED. Backup at restore-backup.json" : "\nDRY RUN. Re-run with --apply to write.");
