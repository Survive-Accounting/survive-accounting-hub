// Match Survive campus universe -> IPEDS UNITID.
// Priority: (1) existing campuses.ipeds_unitid, (2) exact normalized name in same state,
// (3) IPEDS IALIAS / campus aliases exact, (4) high-confidence fuzzy. Else NEEDS_IDENTITY_REVIEW.
import fs from 'node:fs';
import path from 'node:path';
import { selectAll } from './_db.mjs';

const DATA = path.resolve('scripts/market-intel/data');
const ipeds = JSON.parse(fs.readFileSync(path.join(DATA, 'ipeds.json'), 'utf8'));
const byUnit = new Map(ipeds.map((r) => [String(r.unitid), r]));

// US state abbreviations for null-country inference
const STATES = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC','PR','GU','VI','AS','MP']);
const STATE_NAME = { alabama:'AL',alaska:'AK',arizona:'AZ',arkansas:'AR',california:'CA',colorado:'CO',connecticut:'CT',delaware:'DE',florida:'FL',georgia:'GA',hawaii:'HI',idaho:'ID',illinois:'IL',indiana:'IN',iowa:'IA',kansas:'KS',kentucky:'KY',louisiana:'LA',maine:'ME',maryland:'MD',massachusetts:'MA',michigan:'MI',minnesota:'MN',mississippi:'MS',missouri:'MO',montana:'MT',nebraska:'NE',nevada:'NV','new hampshire':'NH','new jersey':'NJ','new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND',ohio:'OH',oklahoma:'OK',oregon:'OR',pennsylvania:'PA','rhode island':'RI','south carolina':'SC','south dakota':'SD',tennessee:'TN',texas:'TX',utah:'UT',vermont:'VT',virginia:'VA',washington:'WA','west virginia':'WV',wisconsin:'WI',wyoming:'WY','district of columbia':'DC','puerto rico':'PR' };

const STATE_TOK = {};
for (const [nm, ab] of Object.entries(STATE_NAME)) STATE_TOK[ab] = new Set(nm.split(' '));

function norm(s) {
  return (s || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\buniv\b/g, 'university')
    .replace(/\s+/g, ' ').trim();
}
const tok = (s) => new Set(norm(s).split(' ').filter((w) => w && !['the','of','at','a'].includes(w)));
function jaccard(a, b) {
  let inter = 0; for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter || 1);
}
function stateAbbr(s) {
  if (!s) return null;
  const v = String(s).trim();
  if (STATES.has(v.toUpperCase())) return v.toUpperCase();
  return STATE_NAME[v.toLowerCase()] || null;
}

// Index IPEDS by state
const ipByState = new Map();
for (const r of ipeds) {
  const st = (r.state || '').toUpperCase();
  if (!ipByState.has(st)) ipByState.set(st, []);
  const aliases = (r.alias && r.alias !== '-2') ? r.alias.split(/[|;]/).map((x) => x.trim()).filter(Boolean) : [];
  ipByState.get(st).push({ ...r, normName: norm(r.name), normAliases: aliases.map(norm), tokName: tok(r.name) });
}

const campuses = await selectAll('campuses', {
  select: 'id,name,canonical_name,display_name,short_name,aliases,institution_name,scorecard_school_name,state,city,country,ipeds_unitid,is_active,is_research_only,undergrad_enrollment,total_enrollment,status,approval_status',
});

// Target universe: US (or US-state) & not research-only & active!=false
function inUniverse(c) {
  if (c.is_active === false) return false;
  if (c.is_research_only === true) return false;
  const st = stateAbbr(c.state);
  const usCountry = !c.country || /united states|usa|u\.s\./i.test(c.country);
  return usCountry && !!st; // must resolve to a US state
}

const results = [];
let mExisting = 0, review = 0, notUniv = 0;
const byMethod = {};

for (const c of campuses) {
  const univ = inUniverse(c);
  const st = stateAbbr(c.state);
  const names = [c.name, c.canonical_name, c.display_name, c.institution_name, c.scorecard_school_name].filter(Boolean);
  let aliasArr = [];
  try { aliasArr = Array.isArray(c.aliases) ? c.aliases : (c.aliases ? JSON.parse(c.aliases) : []); } catch {}
  const allNames = [...new Set([...names, ...aliasArr].filter(Boolean))];

  let match = null, method = null, conf = null, cand = null;

  // 1. existing unitid
  if (c.ipeds_unitid && byUnit.has(String(c.ipeds_unitid))) {
    match = String(c.ipeds_unitid); method = 'existing_unitid'; conf = 1.0; mExisting++;
  }

  if (!match && univ && st && ipByState.has(st)) {
    const pool = ipByState.get(st);
    const normSet = new Set(allNames.map(norm));
    // 2. exact normalized name
    for (const p of pool) {
      if (normSet.has(p.normName)) { match = String(p.unitid); method = 'exact_name'; conf = 0.98; break; }
    }
    // 3. alias exact (either direction)
    if (!match) {
      for (const p of pool) {
        if (p.normAliases.some((a) => normSet.has(a)) || allNames.map(norm).some((n) => p.normName === n)) {
          match = String(p.unitid); method = 'alias_exact'; conf = 0.95; break;
        }
      }
    }
    const cityToks = tok(c.city);
    const stToks = STATE_TOK[st] || new Set();
    const FILLER = new Set(['college', 'campus', 'main', 'the', 'of', 'in', 'at', 'university', 'and', 'a']);
    // Confirm the token difference between a campus name and an IPEDS name is benign:
    // a city fragment (campus city OR the IPEDS institution's complete city — the import
    // truncated campus city), the state name, generic filler, or a 1-char truncation artifact.
    const stLower = st ? st.toLowerCase() : null;
    const confirmed = (extra, ipCityToks) => {
      for (const t of extra) if (t.length > 1 && t !== stLower && !cityToks.has(t) && !ipCityToks.has(t) && !stToks.has(t) && !FILLER.has(t)) return false;
      return true;
    };
    // Build campus token-set variants: base norm + abbreviation expansions. "st" is ambiguous
    // (state vs saint) so we emit BOTH; a wrong expansion simply fails the subset+confirm guard.
    const expandBase = (s) => s
      .replace(/\buof\b/g, 'university of').replace(/\bun\b/g, 'university').replace(/\bu\b/g, 'university')
      .replace(/\binst\b/g, 'institute').replace(/\btech\b/g, 'technology').replace(/\bsci\b/g, 'science')
      .replace(/\bpoly\b/g, 'polytechnic').replace(/\bconn\b/g, 'connecticut').replace(/\bpenn\b/g, 'pennsylvania')
      .replace(/\bcoll\b/g, 'college').replace(/\bcalif\b/g, 'california');
    const toSet = (s) => new Set(s.split(' ').filter((w) => w && !['the', 'of', 'at', 'a', 'in'].includes(w)));
    const variants = [];
    for (const n of allNames) {
      const b = expandBase(norm(n));
      variants.push(toSet(b));
      if (/\bst\b/.test(b)) { variants.push(toSet(b.replace(/\bst\b/g, 'state'))); variants.push(toSet(b.replace(/\bst\b/g, 'saint'))); }
    }

    // Unified scan: for each IPEDS candidate, accept if it is a subset of a campus variant
    // (IPEDS clean name + city suffix) OR the campus variant is a subset of it (X University ->
    // X University-Main Campus / The University of X-City), with the difference confirmed benign.
    if (!match) {
      let best = null, bestScore = -1, bestMethod = null;
      for (const p of pool) {
        if (p.tokName.size < 2) continue;
        const ipCity = tok(p.city);
        for (const v of variants) {
          if (v.size < 2) continue;
          const j = jaccard(v, p.tokName);
          // prefix: ipeds ⊆ campus
          let ipSub = true; for (const t of p.tokName) if (!v.has(t)) { ipSub = false; break; }
          if (ipSub) {
            const extra = new Set([...v].filter((t) => !p.tokName.has(t)));
            if (confirmed(extra, ipCity) && j > bestScore) { bestScore = j; best = p; bestMethod = 'name_prefix'; }
            continue;
          }
          // reverse: campus ⊆ ipeds. The extra tokens belong to the IPEDS name, so confirm them
          // against the CAMPUS's own city/state/filler (NOT the IPEDS candidate's city, which would
          // circularly confirm any branch — e.g. "Indiana University" [Bloomington] must not match
          // "Indiana University-Indianapolis" just because that branch sits in Indianapolis).
          let cSub = true; for (const t of v) if (!p.tokName.has(t)) { cSub = false; break; }
          if (cSub) {
            const extra = new Set([...p.tokName].filter((t) => !v.has(t)));
            if (confirmed(extra, new Set()) && j > bestScore) { bestScore = j; best = p; bestMethod = 'name_reverse'; }
          }
        }
      }
      if (best && bestScore >= 0.34) { match = String(best.unitid); method = bestMethod; conf = +(0.8 * bestScore + 0.15).toFixed(3); }
    }
    // fuzzy fallback (suggestion only unless very high)
    if (!match) {
      let best = null, bestScore = 0;
      for (const v of variants) for (const p of pool) { const j = jaccard(v, p.tokName); if (j > bestScore) { bestScore = j; best = p; } }
      cand = best ? { unitid: String(best.unitid), name: best.name, score: +bestScore.toFixed(3) } : null;
      if (best && bestScore >= 0.92) { match = String(best.unitid); method = 'fuzzy_high'; conf = bestScore; }
    }
  }

  if (match) { byMethod[method] = (byMethod[method] || 0) + 1; }

  const status = match ? 'MATCHED' : (univ ? 'NEEDS_IDENTITY_REVIEW' : 'OUT_OF_UNIVERSE');
  let reviewReason = null;
  if (status === 'NEEDS_IDENTITY_REVIEW') {
    const nm = (c.name || '');
    if (/\b(system|district)\b/i.test(nm)) reviewReason = 'aggregate_system_or_district';
    else if (!cand) reviewReason = 'no_candidate';
    else if (cand.score >= 0.6) reviewReason = 'high_conf_suggestion_verify';
    else reviewReason = 'low_conf_or_renamed';
  }
  if (!univ) notUniv++;
  else if (!match) review++;

  results.push({
    campus_id: c.id, campus: c.name, state: c.state, state_abbr: st, city: c.city, country: c.country,
    in_universe: univ, unitid: match, match_method: method, match_confidence: conf,
    ipeds_name: match ? byUnit.get(match)?.name : null,
    review_suggestion: !match && cand ? `${cand.name} (${cand.unitid}) j=${cand.score}` : null,
    review_reason: reviewReason,
    status,
  });
}

fs.writeFileSync(path.join(DATA, 'matches.json'), JSON.stringify(results));
const uni = results.filter((r) => r.in_universe);
console.log('Total campuses:', campuses.length);
console.log('In target universe:', uni.length, '| out of universe:', notUniv);
console.log('MATCHED:', uni.filter((r) => r.unitid).length, 'by method:', JSON.stringify(byMethod));
console.log('NEEDS_IDENTITY_REVIEW:', review);
console.log('\nAUDIT — abbrev_expand & fuzzy_high matches:');
for (const r of results.filter((r) => ['abbrev_expand', 'fuzzy_high'].includes(r.match_method)))
  console.log(`  [${r.match_method} ${r.match_confidence}] ${r.campus} [${r.state_abbr}] => ${r.ipeds_name} (${r.unitid})`);
console.log('\nREMAINING review queue (all):');
for (const r of results.filter((r) => r.status === 'NEEDS_IDENTITY_REVIEW'))
  console.log(`  ${r.campus} [${r.state_abbr}] city="${r.city}" -> ${r.review_suggestion || '(none)'}`);
console.log('\nSample review queue (top 15 with suggestions):');
for (const r of results.filter((r) => r.status === 'NEEDS_IDENTITY_REVIEW' && r.review_suggestion).slice(0, 15))
  console.log(`  ${r.campus} [${r.state_abbr}] -> ${r.review_suggestion}`);
console.log('\nSample review queue (no suggestion):');
for (const r of results.filter((r) => r.status === 'NEEDS_IDENTITY_REVIEW' && !r.review_suggestion).slice(0, 10))
  console.log(`  ${r.campus} [${r.state_abbr}]`);
