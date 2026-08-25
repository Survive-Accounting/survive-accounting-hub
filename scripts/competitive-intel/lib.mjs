// Competitive Market Intelligence — core library (framework-free, public data only).
//
// Provides: SerpAPI search WITH sponsored-ad capture + on-disk caching (never pay
// twice for the same query), Firecrawl scrape (cached), Gemini extraction, competitor
// domain classification, campus signal matching, and pricing extraction.
//
// LAWS:
//   * Public web/search results ONLY. No auth, no paywall bypass, no purchases.
//   * NEVER fabricate pricing / user counts. Extracted values must be present in the
//     fetched public page text (verbatim guard on pricing).
//   * Cache every SERP + scrape. Dedupe queries. Stop when SERP credits die.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ENV } from './_db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA = path.join(__dirname, 'data');
fs.mkdirSync(DATA, { recursive: true });

export const KEYS = {
  serp: ENV.SERPAPI_API_KEY,
  firecrawl: ENV.FIRECRAWL_API_KEY,
  ai: ENV.AI_GATEWAY_API_KEY,
};

export const now = () => new Date().toISOString();
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);

// ── Counters + cost ──────────────────────────────────────────────────────────
export const newCounters = () => ({ serp: 0, serpCached: 0, firecrawl: 0, fcCached: 0, ai: 0 });
const UNIT = { serp: 0.008, firecrawl: 0.005, ai: 0.002 };
export const estCost = (c) => +(c.serp * UNIT.serp + c.firecrawl * UNIT.firecrawl + c.ai * UNIT.ai).toFixed(4);

// ── SERP credit health (stop a long unattended run when searches run out) ─────
export const SERP_STATE = { dead: false, lastError: '', rateLimited: 0, cacheOnly: false };

// ── On-disk caches (JSON maps; loaded once, flushed periodically) ─────────────
function loadMap(file) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8')); } catch { return {}; }
}
function saveMap(file, obj) {
  fs.writeFileSync(path.join(DATA, file) + '.tmp', JSON.stringify(obj));
  fs.renameSync(path.join(DATA, file) + '.tmp', path.join(DATA, file));
}
export const serpCache = loadMap('serp-cache.json');
export const scrapeCache = loadMap('scrape-cache.json');
let dirtySerp = 0, dirtyScrape = 0;
export function flushCaches(force = false) {
  if (dirtySerp && (force || dirtySerp >= 5)) { saveMap('serp-cache.json', serpCache); dirtySerp = 0; }
  if (dirtyScrape && (force || dirtyScrape >= 5)) { saveMap('scrape-cache.json', scrapeCache); dirtyScrape = 0; }
}

// ── SerpAPI search (organic + sponsored ads) with caching ─────────────────────
const SERP_BASE = 'https://serpapi.com/search.json';
export function serpKey(q) { return hash('g|' + q.toLowerCase().trim()); }

export async function serp(q, c, { num = 8 } = {}) {
  const k = serpKey(q);
  if (serpCache[k]) { c.serpCached++; return serpCache[k]; }
  if (SERP_STATE.cacheOnly) return { organic: [], ads: [], retrieved_at: now(), query: q, cacheMiss: true };
  if (SERP_STATE.dead) return { organic: [], ads: [], retrieved_at: now(), query: q, dead: true };
  c.serp++;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const url = `${SERP_BASE}?engine=google&num=${num}&gl=us&hl=en&q=${encodeURIComponent(q)}&api_key=${encodeURIComponent(KEYS.serp)}`;
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) { SERP_STATE.dead = true; SERP_STATE.lastError = `HTTP ${r.status}`; }
      else if (r.status === 429) SERP_STATE.rateLimited++;
      return { organic: [], ads: [], retrieved_at: now(), query: q, error: `HTTP ${r.status}` };
    }
    const j = await r.json();
    if (j.error) {
      if (/run out|out of searches|exceeded|no searches|account limit|plan.*limit|invalid api key/i.test(j.error)) {
        SERP_STATE.dead = true; SERP_STATE.lastError = j.error;
      }
      return { organic: [], ads: [], retrieved_at: now(), query: q, error: j.error };
    }
    const organic = (j.organic_results ?? []).filter((x) => x.link).map((x) => ({
      title: x.title ?? '', link: x.link, snippet: x.snippet ?? '', displayed_link: x.displayed_link ?? '', position: x.position ?? null,
    }));
    // SerpAPI exposes sponsored results in `ads` (top/bottom blocks) and shopping.
    const ads = [...(j.ads ?? []), ...(j.shopping_results ?? []).map((s) => ({ ...s, block: 'shopping' }))]
      .filter((a) => a.link || a.tracking_link)
      .map((a) => ({
        title: a.title ?? '', link: a.link ?? a.tracking_link ?? '', displayed_link: a.displayed_link ?? a.source ?? '',
        description: a.description ?? a.snippet ?? '', position: a.position ?? a.block_position ?? null, block: a.block ?? 'top',
      }));
    const out = { organic, ads, retrieved_at: now(), query: q };
    serpCache[k] = out; dirtySerp++; flushCaches();
    return out;
  } catch (e) {
    return { organic: [], ads: [], retrieved_at: now(), query: q, error: String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

// ── Firecrawl scrape (cached) ─────────────────────────────────────────────────
export async function scrape(url, c) {
  const k = hash('fc|' + url);
  if (scrapeCache[k] !== undefined) { c.fcCached++; return scrapeCache[k]; }
  c.firecrawl++;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const r = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `Bearer ${KEYS.firecrawl}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true, waitFor: 1200 }),
    });
    if (!r.ok) { scrapeCache[k] = null; dirtyScrape++; flushCaches(); return null; }
    const j = await r.json();
    const md = j.data?.markdown ?? null;
    scrapeCache[k] = md; dirtyScrape++; flushCaches();
    return md;
  } catch { return null; } finally { clearTimeout(timer); }
}

// ── Gemini extraction (JSON object) ──────────────────────────────────────────
const AI_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const AI_MODEL = 'google/gemini-2.5-flash';
export async function aiJson(prompt, c) {
  c.ai++;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const r = await fetch(AI_URL, {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `Bearer ${KEYS.ai}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: AI_MODEL, temperature: 0, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const txt = j.choices?.[0]?.message?.content ?? '';
    const m = txt.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

// ── URL / domain helpers ─────────────────────────────────────────────────────
export function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}
export function registrable(host) {
  const p = host.split('.');
  if (p.length <= 2) return host;
  // handle .co.uk-style rarely here; US-centric so last two labels
  return p.slice(-2).join('.');
}

// Domains that are NEVER a paid competitor and NOT university context (directories,
// rankings, catalogs, scholarship info, classifieds, generic tools, job boards).
export const SKIP_DOMAINS = new Set([
  'google.com', 'bing.com', 'duckduckgo.com', 'wikipedia.org', 'youtube.com', 'youtu.be',
  'amazon.com', 'apple.com', 'play.google.com', 'apps.apple.com', 'itunes.apple.com',
  'linkedin.com', 'twitter.com', 'x.com', 'pinterest.com', 'tiktok.com', 'medium.com',
  'glassdoor.com', 'indeed.com', 'ziprecruiter.com', 'simplyhired.com', 'care.com',
  'niche.com', 'collegefactual.com', 'usnews.com', 'collegedata.com', 'petersons.com',
  'ratemyprofessors.com', 'yelp.com', 'bbb.org', 'mapquest.com', 'thumbtack.com',
  'coursicle.com', 'collegesimply.com', 'cappex.com', 'unigo.com', 'scholarships.com',
  'research.com', 'onlineu.com', 'mastersinaccounting.info', 'studentscholarships.org',
  'smartcatalogiq.com', 'simplesyllabus.com', 'registerblast.com', 'libguides.com',
  'luminafoundation.org', 'about.me', 'uloop.com', 'ed2go.com', 'wayground.com',
  'collegetransitions.com', 'appily.com', 'bestcolleges.com', 'gradschools.com',
  'accreditedschoolsonline.org', 'universities.com', 'degreequery.com', 'learn.org',
  'zippia.com', 'payscale.com', 'salary.com', 'coursereport.com', 'classcentral.com',
  'meetup.com', 'eventbrite.com', 'nextdoor.com', 'craigslist.org', 'reddit.com',
  'facebook.com', 'instagram.com', 'issuu.com', 'slideshare.net', 'academia.edu',
  'researchgate.net', 'semanticscholar.org', 'jstor.org', 'sbdc.org', 'georgiasbdc.org',
  'score.org', 'apps.uc.edu', 'catalog.com', 'acalog.com', 'kuali.co', 'anthology.com',
  'aaahq.org', 'aicpa.org', 'aicpa-cima.com', 'imanet.org', 'thiswaytocpa.com',
  'agacgfm.org', 'nasba.org', 'efollett.com', 'bkstr.com', 'chggapp.com',
  'shiksha.com', 'collegeconfidential.com', 'ratemycourses.io', 'educations.com',
  'gradreports.com', 'talent.com', 'sciencedirect.com', 'ssrn.com', 'courseleaf.com',
  'wordpress.com', 'acuityscheduling.com', 'gi.org', 'sciensano.be', 'gradcafe.com',
  'topuniversities.com', 'timeshighereducation.com', 'collegevine.com', 'quora.com',
  'givecampus.com', 'zoominfo.com', 'centralbank.net', 'dmuglobal.com', 'athabascau.ca',
  'collegeclassreviews.com', 'rocketreach.co', 'apollo.io', 'crunchbase.com', 'bloomberg.com',
  'forbes.com', 'businesswire.com', 'prnewswire.com', '6sense.com', 'leadiq.com', 'signalhire.com',
  'usatoday.com', 'nytimes.com', 'washingtonpost.com', 'youtube.com', 'vimeo.com', 'yellowpages.com',
  'mapquest.com', 'tripadvisor.com', 'wikihow.com', 'chron.com', 'patch.com', 'dnb.com',
  'greatschools.org', 'schooldigger.com', 'publicschoolreview.com', 'privateschoolreview.com',
  'transfercredit.org', 'collegedunia.com', 'bebee.com', 'lensa.com', 'uniflik.com', 'mba.com',
  'gmac.com', 'leverageedu.com', 'yocket.com', 'collegedekho.com', 'careers360.com', 'afbf.in',
  'canamgroup.com', 'bachelorsportal.com', 'mastersportal.com', 'studyportals.com', 'idp.com',
  'collegeboard.org', 'commonapp.org', 'appily.com', 'cappex.com', 'shiksha.in', 'glassdoor.co.in',
]);
// Brand base-labels matched regardless of TLD (catch .ng/.sg/.co.uk variants).
const SKIP_BASE = new Set(['glassdoor', 'indeed', 'ziprecruiter', 'shiksha', 'niche', 'wikipedia',
  'yelp', 'ratemyprofessors', 'coursicle', 'payscale', 'salary', 'zippia', 'linkedin', 'facebook']);
const BRAND_BASE = {
  superprof: ['Superprof', 'TUTOR_MARKETPLACE'], wyzant: ['Wyzant', 'TUTOR_MARKETPLACE'],
  varsitytutors: ['Varsity Tutors', 'TUTOR_MARKETPLACE'], preply: ['Preply', 'TUTOR_MARKETPLACE'],
  chegg: ['Chegg', 'NOTES_MARKETPLACE'], coursehero: ['Course Hero', 'NOTES_MARKETPLACE'],
  studocu: ['Studocu', 'NOTES_MARKETPLACE'], quizlet: ['Quizlet', 'NOTES_MARKETPLACE'],
};
// Signal-only (student demand / social proof), not competitors themselves.
export const SIGNAL_DOMAINS = new Set([
  'reddit.com', 'facebook.com', 'instagram.com', 'quora.com', 'discord.com', 'discord.gg',
  'twitter.com', 'x.com', 'tiktok.com',
]);
// Known brands → [display name, competitor_type]. Types:
//   NOTES_MARKETPLACE   user-generated notes/study-doc/Q&A marketplaces
//   TUTOR_MARKETPLACE   national tutor-matching platforms
//   EXAM_PREP_PLATFORM  national exam-prep / course-video platforms (Study-Edge-like)
//   MULTI_CAMPUS_TUTORING  companies operating campus/course-specific across many schools
//   NATIONAL_COURSEWARE alt-credit / MOOC / publisher courseware
export const BRANDS = {
  // Study-Edge-like exam-prep / course-video platforms
  'studyedge.com': ['Study Edge', 'EXAM_PREP_PLATFORM'], 'algebranation.com': ['Math Nation (Study Edge)', 'EXAM_PREP_PLATFORM'],
  'mathnation.com': ['Math Nation (Study Edge)', 'EXAM_PREP_PLATFORM'],
  'wizeprep.com': ['Wize Prep', 'MULTI_CAMPUS_TUTORING'], 'gostudyhall.com': ['StudyHall', 'MULTI_CAMPUS_TUTORING'],
  'accountingcoach.com': ['AccountingCoach', 'EXAM_PREP_PLATFORM'], 'principlesofaccounting.com': ['PrinciplesofAccounting.com', 'EXAM_PREP_PLATFORM'],
  'farhatlectures.com': ['Farhat Lectures', 'EXAM_PREP_PLATFORM'], 'edspira.com': ['Edspira', 'EXAM_PREP_PLATFORM'],
  'wallstreetprep.com': ['Wall Street Prep', 'EXAM_PREP_PLATFORM'], 'becker.com': ['Becker', 'EXAM_PREP_PLATFORM'],
  'gleim.com': ['Gleim', 'EXAM_PREP_PLATFORM'], 'uworld.com': ['UWorld', 'EXAM_PREP_PLATFORM'],
  'wileyefficientlearning.com': ['Wiley', 'EXAM_PREP_PLATFORM'], 'roger-cpa.com': ['Roger CPA', 'EXAM_PREP_PLATFORM'],
  'studystars.com': ['StudyStars', 'EXAM_PREP_PLATFORM'],
  // Notes / study-doc / Q&A marketplaces
  'chegg.com': ['Chegg', 'NOTES_MARKETPLACE'], 'coursehero.com': ['Course Hero', 'NOTES_MARKETPLACE'],
  'quizlet.com': ['Quizlet', 'NOTES_MARKETPLACE'], 'studocu.com': ['Studocu', 'NOTES_MARKETPLACE'],
  'studysoup.com': ['StudySoup', 'NOTES_MARKETPLACE'], 'stuvia.com': ['Stuvia', 'NOTES_MARKETPLACE'],
  'docsity.com': ['Docsity', 'NOTES_MARKETPLACE'], 'scribd.com': ['Scribd', 'NOTES_MARKETPLACE'],
  'oneclass.com': ['OneClass', 'NOTES_MARKETPLACE'], 'cliffsnotes.com': ['CliffsNotes', 'NOTES_MARKETPLACE'],
  'bartleby.com': ['Bartleby', 'NOTES_MARKETPLACE'], 'brainly.com': ['Brainly', 'NOTES_MARKETPLACE'],
  'numerade.com': ['Numerade', 'NOTES_MARKETPLACE'], 'sweetstudy.com': ['SweetStudy', 'NOTES_MARKETPLACE'],
  'gradebuddy.com': ['GradeBuddy', 'NOTES_MARKETPLACE'], 'transtutors.com': ['Transtutors', 'NOTES_MARKETPLACE'],
  '24houranswers.com': ['24HourAnswers', 'NOTES_MARKETPLACE'], 'studypool.com': ['Studypool', 'NOTES_MARKETPLACE'],
  'studysmarter.com': ['StudySmarter', 'NOTES_MARKETPLACE'], 'quizplus.com': ['QuizPlus', 'NOTES_MARKETPLACE'],
  'vaia.com': ['Vaia', 'NOTES_MARKETPLACE'], 'knowt.com': ['Knowt', 'NOTES_MARKETPLACE'],
  // National tutor-matching marketplaces
  'wyzant.com': ['Wyzant', 'TUTOR_MARKETPLACE'], 'varsitytutors.com': ['Varsity Tutors', 'TUTOR_MARKETPLACE'],
  'superprof.com': ['Superprof', 'TUTOR_MARKETPLACE'], 'universitytutor.com': ['UniversityTutor', 'TUTOR_MARKETPLACE'],
  'preply.com': ['Preply', 'TUTOR_MARKETPLACE'], 'tutor.com': ['Tutor.com', 'TUTOR_MARKETPLACE'],
  'tutorme.com': ['TutorMe', 'TUTOR_MARKETPLACE'], 'skooli.com': ['Skooli', 'TUTOR_MARKETPLACE'],
  'frogtutoring.com': ['FrogTutoring', 'MULTI_CAMPUS_TUTORING'], 'clubztutoring.com': ['Club Z Tutoring', 'MULTI_CAMPUS_TUTORING'],
  'knack.com': ['Knack', 'MULTI_CAMPUS_TUTORING'], 'skoolerstutoring.com': ['Skoolers Tutoring', 'MULTI_CAMPUS_TUTORING'],
  'gradepowerlearning.com': ['Grade Power', 'MULTI_CAMPUS_TUTORING'], 'studygate.com': ['StudyGate', 'TUTOR_MARKETPLACE'],
  'nerdify.com': ['Nerdify', 'TUTOR_MARKETPLACE'], 'tutapoint.com': ['TutaPoint', 'TUTOR_MARKETPLACE'],
  // Alt-credit / MOOC / publisher courseware
  'udemy.com': ['Udemy', 'NATIONAL_COURSEWARE'], 'coursera.org': ['Coursera', 'NATIONAL_COURSEWARE'],
  'edx.org': ['edX', 'NATIONAL_COURSEWARE'], 'khanacademy.org': ['Khan Academy', 'NATIONAL_COURSEWARE'],
  'straighterline.com': ['StraighterLine', 'NATIONAL_COURSEWARE'], 'outlier.org': ['Outlier', 'NATIONAL_COURSEWARE'],
  'sophia.org': ['Sophia', 'NATIONAL_COURSEWARE'], 'study.com': ['Study.com', 'NATIONAL_COURSEWARE'],
  'pearson.com': ['Pearson', 'NATIONAL_COURSEWARE'], 'mheducation.com': ['McGraw Hill', 'NATIONAL_COURSEWARE'],
  'cengage.com': ['Cengage', 'NATIONAL_COURSEWARE'], 'saylor.org': ['Saylor', 'NATIONAL_COURSEWARE'],
  'princetonreview.com': ['The Princeton Review', 'TUTOR_MARKETPLACE'],
  'coursesidekick.com': ['Course Sidekick (Course Hero)', 'NOTES_MARKETPLACE'],
  'joinknack.com': ['Knack', 'MULTI_CAMPUS_TUTORING'], 'edubirdie.com': ['EduBirdie', 'NOTES_MARKETPLACE'],
  'tutorocean.com': ['TutorOcean', 'TUTOR_MARKETPLACE'], 'tutorselect.com': ['TutorSelect', 'TUTOR_MARKETPLACE'],
  'surviveaccounting.com': ['Survive Accounting (US)', 'SELF'],
};

// Classify a result host into a bucket.
//   kind: 'university_free' | 'brand' | 'signal' | 'skip' | 'candidate' | 'self'
export function classifyHost(host, campusDomain) {
  if (!host) return { kind: 'skip' };
  const reg = registrable(host);
  if (host.endsWith('.edu') || host.endsWith('.edu.au') || reg.endsWith('.edu') || host.endsWith('.ac.uk')) {
    return { kind: 'university_free', foreign: campusDomain && reg !== campusDomain };
  }
  if (host.endsWith('.gov') || reg.endsWith('.gov') || host.endsWith('.mil')) return { kind: 'skip' };
  if (SKIP_DOMAINS.has(reg) || SKIP_DOMAINS.has(host)) return { kind: 'skip' };
  if (SIGNAL_DOMAINS.has(reg)) return { kind: 'signal' };
  const b = BRANDS[reg] || BRANDS[host];
  if (b) return b[1] === 'SELF' ? { kind: 'self', brand: b[0] } : { kind: 'brand', brand: b[0], type: b[1] };
  const base = reg.split('.')[0];
  if (SKIP_BASE.has(base)) return { kind: 'skip' };
  if (BRAND_BASE[base]) return { kind: 'brand', brand: BRAND_BASE[base][0], type: BRAND_BASE[base][1] };
  return { kind: 'candidate' };
}

// Study-Edge-like course-specific site: domain/URL embeds an intro course code
// (acct2101, ac210, acg2021, bus201…) — the strongest paid-market signal.
const CODE_IN_URL_RX = /\b(ac|acc|acct|acg|acctg|bus|busn|ba|bsad|econ|fin)\s*\d{3,4}\b/i;
export function isCourseSpecificSite(host, url, code) {
  const h = (host || '').replace(/[^a-z0-9]/gi, '');
  if (code) { const cc = code.replace(/\s+/g, '').toLowerCase(); if (cc.length >= 4 && h.includes(cc)) return true; }
  return CODE_IN_URL_RX.test(host || '') || CODE_IN_URL_RX.test((url || '').split('?')[0]);
}

// ── Campus signal tokens (for campus-specificity detection) ──────────────────
const STOP = new Set(['university', 'college', 'the', 'of', 'at', 'and', 'state', 'school', 'system', 'a', 'in']);
const clean = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
export function campusSignals(campus) {
  const toks = clean(campus.name).split(' ').filter((w) => w.length >= 4 && !STOP.has(w));
  const short = clean(campus.short_name || '').split(' ').filter((w) => w.length >= 3 && !STOP.has(w));
  const disp = clean(campus.display_name || '').split(' ').filter((w) => w.length >= 4 && !STOP.has(w));
  const aliases = Array.isArray(campus.aliases) ? campus.aliases.flatMap((a) => clean(a).split(' ')).filter((w) => w.length >= 3 && !STOP.has(w)) : [];
  // acronym from capitalized words
  const ac = (campus.name || '').split(/\s+/).filter((w) => /^[A-Z]/.test(w) && !STOP.has(w.toLowerCase())).map((w) => w[0]).join('').toLowerCase();
  return [...new Set([...toks, ...short, ...disp, ...aliases, ...(ac.length >= 2 ? [ac] : [])].filter(Boolean))];
}
export function mentionsCampus(text, signals) {
  const t = (text || '').toLowerCase();
  return signals.some((s) => s.length >= 3 && t.includes(s));
}

// ── Course-code helpers ──────────────────────────────────────────────────────
export function introCode(campus) {
  const cf = campus.course_family_codes_json || {};
  return cf.intro_1 || cf.intro1 || cf['intro-1'] || null;
}
// A search-usable label for a course code (bare numbers get school prefix).
export function courseLabel(code, campus) {
  if (!code) return null;
  const hasAlpha = /[a-zA-Z]{2,}/.test(code);
  return hasAlpha ? code : `${campus.short_name || campus.name} ${code}`;
}
export function codeVariants(code) {
  if (!code) return [];
  const c = code.trim();
  const compact = c.replace(/\s+/g, '');
  const spaced = c.replace(/([a-zA-Z]+)\s*([0-9]+)/, '$1 $2');
  return [...new Set([c, compact, spaced])];
}
export function mentionsCourse(text, code) {
  if (!code) return false;
  const t = (text || '').toLowerCase().replace(/\s+/g, '');
  return codeVariants(code).some((v) => v && t.includes(v.toLowerCase().replace(/\s+/g, '')));
}

// ── Accounting-specificity ───────────────────────────────────────────────────
const ACCT_RX = /\b(account|accounting|acct|financial accounting|managerial accounting|bookkeep|debits?|credits?|balance sheet|ledger|cpa|intro to account)/i;
export function mentionsAccounting(text) { return ACCT_RX.test(text || ''); }

// Academic-help commercial intent — an unknown candidate domain must show this
// (or be course-specific) to count as a competitor, else it's directory/portal noise.
const INTENT_RX = /\b(tutor|tutoring|exam|review|practice|study guide|study group|cram|prep|homework|solutions?|notes|quiz|flashcard|academic support|test bank|mock|walkthrough|explained|lessons?|coaching|bootcamp|q\s?&\s?a|study help|course help)\b/i;
export function hasHelpIntent(text) { return INTENT_RX.test(text || ''); }

// ── Pricing extraction (verbatim; from scraped page text) ────────────────────
const PRICE_RX = /\$\s?\d{1,4}(?:\.\d{2})?(?:\s?(?:\/|per\s)\s?(?:mo|month|monthly|semester|term|session|hour|hr|week|year|exam|course|class))?/gi;
export function extractPrices(text) {
  if (!text) return [];
  const found = (text.match(PRICE_RX) || []).map((s) => s.replace(/\s+/g, ' ').trim());
  return [...new Set(found)].slice(0, 12);
}
const FREE_TRIAL_RX = /\b(free trial|try (it )?free|free (first|1st)|first (week|month|class|session|exam) free|money[- ]back|free preview|free sample|no cost|free account|sign up free|free demo)\b/i;
export function hasFreeTrial(text) { return FREE_TRIAL_RX.test(text || ''); }
const SUB_RX = /\b(per month|\/mo\b|monthly|subscription|membership|per semester|semester pass|billed (monthly|annually)|recurring)\b/i;
export function hasSubscription(text) { return SUB_RX.test(text || ''); }

// ── Offering detection (from title/snippet/page text) ────────────────────────
export function detectOfferings(text) {
  const t = (text || '').toLowerCase();
  return {
    practice_exams: /\b(practice exam|practice test|mock exam|sample exam|exam bank|test bank|practice problems?|practice questions?)\b/.test(t),
    exam_reviews: /\b(exam review|test review|final review|midterm review|review session|cram|exam prep|test prep)\b/.test(t),
    video_content: /\b(video|watch|lecture video|recorded|on[- ]demand video|video library)\b/.test(t),
    live_reviews: /\b(live review|live session|live class|live online|zoom review|in[- ]person review)\b/.test(t),
    one_on_one: /\b(one[- ]on[- ]one|1[- ]on[- ]1|private tutor|private tutoring|individual tutoring|personal tutor)\b/.test(t),
    study_guides: /\b(study guide|study material|notes|cheat sheet|flashcard)\b/.test(t),
    subscription: hasSubscription(t),
  };
}

// ── CSV writer ───────────────────────────────────────────────────────────────
export function toCsv(rows, headers) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = Array.isArray(v) ? v.join('; ') : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const head = headers.join(',');
  const body = rows.map((r) => headers.map((h) => esc(r[h])).join(',')).join('\n');
  return head + '\n' + body + '\n';
}

// Robust CSV parser (handles quoted fields with commas/newlines).
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (ch === '\r') { /* skip */ }
      else field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}
