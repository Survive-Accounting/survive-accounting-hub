// Org normalization + council classification + social-vs-exclude.
//
// PRINCIPLE (per the task): council comes from canonical national-org metadata, never from which
// GreekRank page an org appeared on. Source of truth, in order:
//   1. the live greek_orgs catalog (council column: NIC/NPC/NPHC/MGC/Professional)
//   2. a built-in reference of standard national social orgs (NPC 26, Divine Nine 9, common NIC, MGC)
//   3. an EXCLUDE list of professional/honor/service orgs that are not social Greek
// Anything unresolved keeps the chapter but leaves council blank ("needs review"), which the task
// explicitly prefers over a false council.
import fs from "node:fs";

export const orgMatchKey = (name) => (name ?? "")
  .toLowerCase().normalize("NFKD")
  .replace(/\b(fraternity|sorority|fraternidad|sororidad|international|nacional|national|latin|latina|latino|inc|incorporated|co-?ed)\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ").trim();

// ── standard national social Greek, by council ───────────────────────────────────────────────
const NPC = ["Alpha Chi Omega","Alpha Delta Pi","Alpha Epsilon Phi","Alpha Gamma Delta","Alpha Omicron Pi","Alpha Phi","Alpha Sigma Alpha","Alpha Sigma Tau","Alpha Xi Delta","Chi Omega","Delta Delta Delta","Delta Gamma","Delta Phi Epsilon","Delta Zeta","Gamma Phi Beta","Kappa Alpha Theta","Kappa Delta","Kappa Kappa Gamma","Phi Mu","Phi Sigma Sigma","Pi Beta Phi","Sigma Delta Tau","Sigma Kappa","Sigma Sigma Sigma","Theta Phi Alpha","Zeta Tau Alpha"];
const DIVINE9 = ["Alpha Phi Alpha","Alpha Kappa Alpha","Kappa Alpha Psi","Omega Psi Phi","Delta Sigma Theta","Phi Beta Sigma","Zeta Phi Beta","Sigma Gamma Rho","Iota Phi Theta"];
// A broad NIC / traditional men's social fraternity list (not exhaustive; catalog fills the rest).
const NIC = ["Acacia","Alpha Delta Phi","Alpha Delta Gamma","Alpha Epsilon Pi","Alpha Gamma Rho","Alpha Gamma Sigma","Alpha Kappa Lambda","Alpha Phi Delta","Alpha Sigma Phi","Alpha Tau Omega","Beta Chi Theta","Beta Sigma Psi","Beta Theta Pi","Chi Phi","Chi Psi","Delta Chi","Delta Kappa Epsilon","Delta Lambda Phi","Delta Phi","Delta Sigma Phi","Delta Tau Delta","Delta Upsilon","FarmHouse","Kappa Alpha Order","Kappa Alpha Society","Kappa Delta Rho","Kappa Sigma","Lambda Chi Alpha","Phi Delta Theta","Phi Gamma Delta","Phi Kappa Psi","Phi Kappa Sigma","Phi Kappa Tau","Phi Kappa Theta","Phi Mu Delta","Phi Sigma Kappa","Phi Sigma Phi","Pi Kappa Alpha","Pi Kappa Phi","Pi Lambda Phi","Psi Upsilon","Sigma Alpha Epsilon","Sigma Alpha Mu","Sigma Chi","Sigma Nu","Sigma Phi","Sigma Phi Delta","Sigma Phi Epsilon","Sigma Pi","Sigma Tau Gamma","Tau Delta Phi","Tau Epsilon Phi","Tau Kappa Epsilon","Theta Chi","Theta Delta Chi","Theta Xi","Triangle","Zeta Beta Tau","Zeta Psi","Delta Phi Alpha","Alpha Chi Rho","Beta Upsilon Chi","Kappa Delta Phi"];
// Multicultural / culturally based SOCIAL councils (MGC / NALFO / NAPA / NMGC / NPHC-adjacent social).
const MGC = ["Lambda Theta Phi","Lambda Theta Alpha","Sigma Lambda Beta","Sigma Lambda Gamma","Lambda Upsilon Lambda","Phi Iota Alpha","Gamma Zeta Alpha","Omega Delta Phi","Sigma Lambda Upsilon","Lambda Pi Chi","Lambda Pi Upsilon","Chi Upsilon Sigma","Kappa Delta Chi","Sigma Iota Alpha","Delta Tau Lambda","Alpha Pi Sigma","Lambda Theta Nu","Gamma Alpha Omega","Lambda Sigma Gamma","Sigma Omega Nu","Kappa Delta Phi Nas","Delta Xi Nu","Delta Sigma Chi","Lambda Alpha Upsilon","Delta Phi Lambda","Delta Phi Omega","Kappa Phi Gamma","Sigma Sigma Rho","Sigma Psi Zeta","Alpha Kappa Delta Phi","Kappa Phi Lambda","Chi Sigma Tau","Pi Delta Psi","Lambda Phi Epsilon","Beta Chi Theta","Sigma Beta Rho","Delta Epsilon Psi","Iota Nu Delta","Sigma Phi Omega","Nu Alpha Kappa","Phi Rho Eta","Alpha Psi Rho","Gamma Eta","Theta Nu Xi","Mu Sigma Upsilon","La Unidad Latina","Lambda Alpha Sigma"];
// EXCLUDE — professional/honor/service/academic, never social-Greek inventory. Phi Sigma Rho is a
// professional sorority for women in engineering; Gamma Sigma Sigma is a national service sorority.
const EXCLUDE = ["Alpha Kappa Psi","Delta Sigma Pi","Beta Alpha Psi","Phi Beta Kappa","Phi Beta Lambda","Alpha Phi Omega","Phi Mu Alpha Sinfonia","Sigma Alpha Iota","Kappa Kappa Psi","Tau Beta Sigma","Phi Chi Theta","Delta Epsilon Mu","Phi Delta Epsilon","Alpha Epsilon Delta","Phi Alpha Delta","Delta Theta Phi","Gamma Sigma Sigma","Alpha Phi Sigma","Pi Sigma Epsilon","Sigma Alpha Lambda","Alpha Kappa Delta","Phi Alpha Theta","Kappa Psi","Phi Delta Chi","Alpha Zeta","Gamma Iota Sigma","Delta Sigma Rho","Mu Phi Epsilon","Phi Mu Alpha","Alpha Chi Sigma","Theta Tau","Alpha Rho Chi","Phi Sigma Pi","Alpha Phi Gamma","Beta Gamma Sigma","Order of Omega","Rho Lambda","Gamma Beta Phi","Alpha Lambda Delta","Phi Eta Sigma","Mortar Board","National Society of Leadership","Phi Sigma Rho","Phi Chi","Alpha Omega Epsilon","Sigma Phi Delta","Kappa Kappa Psi"];

const build = () => {
  const ref = new Map(); // matchKey → { council, social, canonical }
  const add = (names, council, social) => { for (const n of names) { const k = orgMatchKey(n); if (!ref.has(k)) ref.set(k, { council, social, canonical: n }); } };
  add(EXCLUDE, "", false);          // exclude wins first so a name in both lists is dropped
  add(NPC, "Panhellenic", true);
  add(DIVINE9, "NPHC", true);
  add(NIC, "IFC", true);
  add(MGC, "MGC", true);
  // overlay the live catalog LAST for names already in the system (authoritative canonical + council)
  try {
    const catalog = JSON.parse(fs.readFileSync(new URL("./catalog.json", import.meta.url), "utf8"));
    const councilOf = { NIC: "IFC", NPC: "Panhellenic", NPHC: "NPHC", MGC: "MGC", Panhellenic: "Panhellenic", Professional: "" };
    for (const o of catalog) {
      const k = orgMatchKey(o.name); if (!k) continue;
      const social = o.org_type !== "professional" && o.council !== "Professional";
      const council = councilOf[o.council] ?? (ref.get(k)?.council ?? "");
      // Don't let a thin catalog row overwrite a confident reference classification with blank.
      const prev = ref.get(k);
      ref.set(k, { council: council || prev?.council || "", social: prev ? (prev.social && social) : social, canonical: o.name });
    }
  } catch {}
  return ref;
};
export const REF = build();

/** classify(name) → { canonical, council, social, resolved } */
export function classify(name) {
  const k = orgMatchKey(name);
  const hit = REF.get(k);
  if (hit) return { canonical: hit.canonical, council: hit.council, social: hit.social, resolved: true };
  return { canonical: name.trim(), council: "", social: null, resolved: false }; // unknown → keep, review
}

if (process.argv[2] === "--self-test") {
  for (const n of ["Sigma Chi","Kappa Kappa Gamma Fraternity Inc","Lambda Theta Alpha Latin Sorority, Inc.","Beta Alpha Psi","Alpha Kappa Psi","Zeta Phi Beta","Sigma Beta Rho","Gamma Sigma Sigma","Some Local Thing"])
    console.log(n.padEnd(38), JSON.stringify(classify(n)));
  console.log("\nREF size:", REF.size);
}
