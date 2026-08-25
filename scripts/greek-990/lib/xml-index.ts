// Targeted officer extraction from cached IRS 990 XML zips.
//
// The IRS ships e-filed 990 XML only as big per-year ZIPs (no per-filing URL and no
// object_id→zip map). So we cache whatever zips we download, extract each ONCE, build
// a per-zip EIN→file index (cached JSON), then read ONLY the target EINs' filings.
// This keeps retrieval targeted (brief §12) — we never parse the whole universe.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseFinancials, parseOfficers, type XmlOfficer } from "./xml990";

const ROOT = join(import.meta.dir, "..", "..", "..", "data", "greek-990", "cache", "990");
const EXTRACT_ROOT = join(ROOT, "extracted");

function listZips(): string[] {
  if (!existsSync(ROOT)) return [];
  return readdirSync(ROOT).filter((f) => f.toLowerCase().endsWith(".zip")).map((f) => join(ROOT, f));
}

/** Extract a zip once into extracted/<name>/ (uses the system unzip). */
function ensureExtracted(zipPath: string): string | null {
  const name = basename(zipPath).replace(/\.zip$/i, "");
  const dir = join(EXTRACT_ROOT, name);
  const done = join(dir, ".extracted");
  if (existsSync(done)) return dir;
  mkdirSync(dir, { recursive: true });
  const p = Bun.spawnSync(["unzip", "-o", "-q", zipPath, "-d", dir]);
  if (p.exitCode !== 0) {
    console.error(`  ! unzip failed for ${name}: ${new TextDecoder().decode(p.stderr).slice(0, 200)}`);
    return null;
  }
  writeFileSync(done, new Date().toISOString());
  return dir;
}

/** Build (and cache) an EIN→[relative file paths] index for one extracted zip dir. */
function buildIndex(dir: string): Record<string, string[]> {
  const idxPath = join(dir, "_ein_index.json");
  if (existsSync(idxPath)) return JSON.parse(readFileSync(idxPath, "utf8"));
  const index: Record<string, string[]> = {};
  // filings may live in a nested subdir; walk one level.
  const walk = (d: string): string[] => {
    const out: string[] = [];
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) out.push(...walk(join(d, e.name)));
      else if (e.name.endsWith(".xml")) out.push(join(d, e.name));
    }
    return out;
  };
  const files = walk(dir);
  for (const f of files) {
    let head = "";
    try { head = readFileSync(f, "utf8").slice(0, 6000); } catch { continue; }
    const m = head.match(/<EIN>(\d{9})<\/EIN>/);
    if (!m) continue;
    (index[m[1]] ||= []).push(f);
  }
  writeFileSync(idxPath, JSON.stringify(index));
  return index;
}

export interface ExtractedFiling {
  taxYear: number;
  formType: string;
  officers: XmlOfficer[];
}

/**
 * For a set of target EINs, return EIN → list of {taxYear, officers} pulled from
 * whatever cached zips contain them. EINs not present in any cached zip are simply absent.
 */
export async function extractOfficersForEins(eins: Set<string>): Promise<Map<string, ExtractedFiling[]>> {
  const result = new Map<string, ExtractedFiling[]>();
  const zips = listZips();
  if (!zips.length) { console.log("  (no cached 990 XML zips — skipping officer extraction)"); return result; }
  for (const zip of zips) {
    const dir = ensureExtracted(zip);
    if (!dir) continue;
    const index = buildIndex(dir);
    let hits = 0;
    for (const ein of eins) {
      const files = index[ein];
      if (!files) continue;
      for (const f of files) {
        let xml = "";
        try { xml = readFileSync(f, "utf8"); } catch { continue; }
        const fin = parseFinancials(xml);
        const officers = parseOfficers(xml);
        if (!officers.length) continue;
        const list = result.get(ein) || [];
        list.push({ taxYear: fin.taxYear || 0, formType: fin.formType, officers });
        result.set(ein, list);
        hits++;
      }
    }
    console.log(`  ${basename(zip)}: ${Object.keys(index).length} EINs indexed, ${hits} target filings found`);
  }
  return result;
}
