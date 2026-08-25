// Parse bulk IPEDS files into one consolidated JSON keyed by UNITID.
// Metrics per year: total bachelor's (CIP 99), business bachelor's (CIP 52.*),
// accounting bachelor's (CIP 52.03*) — AWLEVEL=5 (bachelor's), MAJORNUM=1 (first majors).
// Enrollment: fall undergrad (DRVEF EFUG) + 12-month undergrad (EFFY lvl 2) for trend.
import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';

const DIR = 'C:/Users/lee/AppData/Local/Temp/claude/C--Users-lee-Documents-Survive-Accounting/7355e9d5-066d-4b6e-bd06-4eae3eda5c29/scratchpad/ipeds';
const OUT = path.resolve('scripts/market-intel/data');
fs.mkdirSync(OUT, { recursive: true });

const COMP_YEARS = {
  2015: 'c2015_a_rv.csv', 2016: 'c2016_a_rv.csv', 2017: 'c2017_a_rv.csv',
  2018: 'c2018_a_rv.csv', 2019: 'c2019_a_rv.csv', 2020: 'c2020_a_rv.csv',
  2021: 'c2021_a_rv.csv', 2022: 'c2022_a_rv.csv', 2023: 'C2023_a_RV.csv',
};

const inst = new Map(); // unitid -> record
function rec(u) {
  if (!inst.has(u)) inst.set(u, { unitid: u, comp: {} });
  return inst.get(u);
}
const unq = (s) => (s || '').replace(/^\uFEFF/, '').replace(/^"|"$/g, '');
const num = (s) => { const n = parseInt(unq(s), 10); return Number.isFinite(n) ? n : 0; };

async function eachLine(file, fn) {
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(DIR, file)), crlfDelay: Infinity });
  let first = true;
  for await (const line of rl) { if (first) { first = false; continue; } if (line) fn(line); }
}

// --- Directory ---
console.log('Parsing HD2023 (directory)...');
await eachLine('HD2023.csv', (line) => {
  // UNITID,INSTNM,IALIAS,ADDR,CITY,STABBR,... need proper CSV parse for quoted names
  const f = parseCsv(line);
  const u = unq(f[0]);
  if (!u) return;
  const r = rec(u);
  r.name = f[1]; r.alias = f[2]; r.city = f[4]; r.state = f[5];
  // CONTROL is later; find by header position (col 27 in 0-index? use fixed): we grab from a second pass if needed
});

// CONTROL & SECTOR need header index — reparse header once
{
  const header = parseCsv(fs.readFileSync(path.join(DIR, 'HD2023.csv'), 'utf8').split(/\r?\n/)[0]);
  const iControl = header.findIndex((h) => unq(h).toUpperCase() === 'CONTROL');
  const iSector = header.findIndex((h) => unq(h).toUpperCase() === 'SECTOR');
  await eachLine('HD2023.csv', (line) => {
    const f = parseCsv(line);
    const u = unq(f[0]); if (!inst.has(u)) return;
    const r = inst.get(u);
    r.control = num(f[iControl]); r.sector = num(f[iSector]);
  });
}

// --- Completions (stream; only keep AWLEVEL=5, MAJORNUM=1, CIP 99 or 52.*) ---
for (const [year, file] of Object.entries(COMP_YEARS)) {
  let rows = 0;
  await eachLine(file, (line) => {
    // first 6 fields are simple: UNITID,CIPCODE,MAJORNUM,AWLEVEL,XCTOTALT,CTOTALT
    const c = line.split(',');
    if (parseInt(c[3], 10) !== 5 || parseInt(c[2], 10) !== 1) return; // bachelor's, first major
    const cip = unq(c[1]);
    if (cip !== '99' && !cip.startsWith('52')) return;
    const u = unq(c[0]);
    const v = num(c[5]);
    const r = rec(u);
    const y = (r.comp[year] ||= { total: 0, business: 0, accounting: 0 });
    if (cip === '99') y.total = v;
    else if (cip.startsWith('52')) {
      y.business += v;
      if (cip.startsWith('52.03')) y.accounting += v;
    }
    rows++;
  });
  console.log(`  ${year}: ${rows} relevant rows`);
}

// --- Fall undergrad enrollment (DRVEF2023: EFUG) ---
{
  const header = parseCsv(fs.readFileSync(path.join(DIR, 'drvef2023.csv'), 'utf8').split(/\r?\n/)[0]);
  const iEFUG = header.findIndex((h) => unq(h).trim().toUpperCase() === 'EFUG');
  const iENR = header.findIndex((h) => unq(h).trim().toUpperCase() === 'ENRTOT');
  await eachLine('drvef2023.csv', (line) => {
    const f = line.split(',');
    const u = unq(f[0]); if (!u) return;
    const r = rec(u);
    r.ug_fall_2023 = num(f[iEFUG]);
    r.enr_total_2023 = num(f[iENR]);
  });
  console.log('DRVEF2023 undergrad enrollment parsed');
}

// --- 12-month undergrad enrollment for trend (EFFY level 2) ---
for (const [year, file] of [[2018, 'effy2018_rv.csv'], [2023, 'EFFY2023.csv']]) {
  await eachLine(file, (line) => {
    const c = line.split(',');
    // UNITID,EFFYALEV,EFFYLEV,LSTUDY,XEYTOTLT,EFYTOTLT
    if (parseInt(unq(c[2]), 10) !== 2) return; // undergraduate
    const u = unq(c[0]);
    const r = rec(u);
    r[`ug12_${year}`] = num(c[5]);
  });
  console.log(`EFFY${year} undergrad 12mo parsed`);
}

// --- Minimal RFC-ish CSV parser for quoted fields (used for HD + headers) ---
function parseCsv(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else { if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; }
  }
  out.push(cur);
  return out;
}

const arr = [...inst.values()].filter((r) => r.name); // keep only directory-known institutions
fs.writeFileSync(path.join(OUT, 'ipeds.json'), JSON.stringify(arr));
console.log(`\nWrote ${arr.length} institutions to data/ipeds.json`);

// sanity check
const test = inst.get('100654');
console.log('Sanity Alabama A&M (100654):', JSON.stringify({ name: test.name, state: test.state, control: test.control, comp2023: test.comp['2023'], comp2015: test.comp['2015'], ug_fall_2023: test.ug_fall_2023, ug12_2018: test.ug12_2018, ug12_2023: test.ug12_2023 }));
