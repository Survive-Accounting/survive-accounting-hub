// Resolve the identity-review queue: accept verified fuzzy suggestions, or resolve to a named
// IPEDS institution within the campus's state (verifying it exists + is unique — no blind UNITID
// entry). Writes resolutions back into data/matches.json. Systems/districts/closed stay in review.
import fs from 'node:fs';
import path from 'node:path';

const DATA = path.resolve('scripts/market-intel/data');
const ipeds = JSON.parse(fs.readFileSync(path.join(DATA, 'ipeds.json'), 'utf8'));
const matches = JSON.parse(fs.readFileSync(path.join(DATA, 'matches.json'), 'utf8'));
const byUnit = new Map(ipeds.map((r) => [String(r.unitid), r]));

const norm = (s) => (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const ipByState = new Map();
for (const r of ipeds) {
  const st = (r.state || '').toUpperCase();
  if (!ipByState.has(st)) ipByState.set(st, []);
  ipByState.get(st).push({ ...r, norm: norm(r.name) });
}

// Campuses whose fuzzy review_suggestion is VERIFIED CORRECT -> accept the suggestion's UNITID.
// Keyed by a distinctive lowercase substring of the campus name.
const ACCEPT_SUGGESTION = [
  'central michigan university mt', 'long island u.-liu post', 'penn state univ-harrisburg',
  'southern university & a&m baton', "saint mary's college of ca", 'uof arkansas at fort smith',
  'univ so carolina at aiken', 'fairleigh dickinson univ', 'new jersey in of technology',
  'university at albany-suny', 'penn state u great valley', 'st. john fisher college',
  'texas a&m - corpus christi', 'univ no carolina greensboro', 'grand valley state university allendal',
  'penn state new kensington', 'penn state abington', 'penn state shenango',
  'northland community and technical coll', 'miami dade college virtual', 'penn state dubois',
  'penn state berks', 'penn state brandywine', 'cuny-baruch college new', 'sunyat buffalo',
  'sunyat new paltz', 'sunyat binghamton', 'u.s. coast guard academy new', 'columbia university new',
  'sunyat plattsburgh', 'the citadel', 'iusb indiana uat south bend', 'penn state univ-behrend',
  'rollins college liberal arts winter', 'so illinois, edwardsville', 'ivy technical community college kokomo',
  'embry-riddle aeronautical u daytona',
];

// Campuses whose fuzzy suggestion is WRONG -> resolve to the named IPEDS institution in-state.
// {eq} = normalized name must equal exactly (disambiguates e.g. Manhattan vs Marymount Manhattan);
// {has} = all tokens present; {hasNot} = none of these tokens present.
const OVERRIDE = [
  { key: 'pepperdine un-los angeles', has: ['pepperdine', 'university'] },
  { key: 'manhattan college', eqAny: ['manhattan college', 'manhattan university'] },
  { key: 'texas a&m university-commerce', eqAny: ['east texas a and m university'] }, // renamed 2024
  { key: 'augsburg college', eqAny: ['augsburg university', 'augsburg college'] },
  { key: 'calvin college grand', eqAny: ['calvin university', 'calvin college'] },
  { key: 'simmons college', eqAny: ['simmons university', 'simmons college'] },
  { key: 'indiana u-purdue u indy', has: ['indiana', 'university', 'indianapolis'], hasNot: ['columbus', 'purdue'] },
  { key: 'suny college at oswego', has: ['oswego'], hasNot: ['geneseo'] },
  { key: 'tulane university new', has: ['tulane'] },
  { key: 'purdue university w', has: ['purdue', 'university', 'main'], hasNot: ['global', 'northwest', 'fort'] },
  { key: 'state un college at geneseo', has: ['geneseo'] },
  { key: 'university of new mexico albuquerque', has: ['university', 'new', 'mexico', 'main'], hasNot: ['eastern', 'state'] },
  { key: 'canisius college', eqAny: ['canisius university', 'canisius college'] },
  { key: 'lemoyne college', has: ['le', 'moyne'] },
  { key: 'commonweath univ - bloomsb', eqAny: ['commonwealth university of pennsylvania'] }, // Bloomsburg merged 2022
  { key: 'metro community college ft omaha', has: ['metropolitan', 'community', 'college'], hasNot: ['central'] },
  { key: 'university of illinois', has: ['illinois', 'urbana', 'champaign'] }, // bare "University of Illinois" [Champaign] = UIUC
  { key: 'calvary bible college', eqAny: ['calvary university'] },
];

const review = matches.filter((m) => m.status === 'NEEDS_IDENTITY_REVIEW');
let accepted = 0, overridden = 0, failed = [];

for (const m of review) {
  const nm = (m.campus || '').toLowerCase();
  // 1. accept verified suggestion
  if (ACCEPT_SUGGESTION.some((k) => nm.includes(k))) {
    const mUnit = (m.review_suggestion || '').match(/\((\d{6})\)/);
    if (mUnit && byUnit.has(mUnit[1])) {
      m.unitid = mUnit[1]; m.ipeds_name = byUnit.get(mUnit[1]).name;
      m.match_method = 'review_resolved_suggestion'; m.match_confidence = 0.9; m.status = 'MATCHED';
      m.review_reason = null; accepted++; continue;
    }
    failed.push(`${m.campus}: accept-suggestion had no valid unitid (${m.review_suggestion})`);
    continue;
  }
  // 2. override -> resolve named institution in-state (unique)
  const ov = OVERRIDE.find((o) => nm.includes(o.key));
  if (ov) {
    const pool = ipByState.get((m.state_abbr || '').toUpperCase()) || [];
    let cands;
    if (ov.eqAny) cands = pool.filter((p) => ov.eqAny.includes(p.norm));
    else cands = pool.filter((p) => {
      const toks = new Set(p.norm.split(' '));
      if (ov.has && !ov.has.every((t) => toks.has(t))) return false;
      if (ov.hasNot && ov.hasNot.some((t) => toks.has(t))) return false;
      return true;
    });
    // de-dupe by unitid
    const uniq = [...new Map(cands.map((c) => [String(c.unitid), c])).values()];
    if (uniq.length === 1) {
      m.unitid = String(uniq[0].unitid); m.ipeds_name = uniq[0].name;
      m.match_method = 'review_resolved_override'; m.match_confidence = 0.88; m.status = 'MATCHED';
      m.review_reason = null; overridden++;
    } else {
      failed.push(`${m.campus} [${m.state_abbr}]: override '${ov.key}' -> ${uniq.length} candidates (${uniq.map((c) => c.name).slice(0, 4).join(' | ')})`);
    }
  }
}

fs.writeFileSync(path.join(DATA, 'matches.json'), JSON.stringify(matches));
const stillReview = matches.filter((m) => m.status === 'NEEDS_IDENTITY_REVIEW');
console.log(`Resolved: ${accepted} accepted-suggestion + ${overridden} override = ${accepted + overridden}`);
console.log(`Still in review: ${stillReview.length}`);
console.log(`  reasons: ${JSON.stringify(stillReview.reduce((a, m) => { a[m.review_reason] = (a[m.review_reason] || 0) + 1; return a; }, {}))}`);
if (failed.length) { console.log('\nFAILED to resolve (left in review):'); for (const f of failed) console.log('  ' + f); }
console.log('\nResolved detail:');
for (const m of matches.filter((m) => String(m.match_method || '').startsWith('review_resolved')))
  console.log(`  ${m.campus} [${m.state_abbr}] -> ${m.ipeds_name} (${m.unitid}) [${m.match_method}]`);
