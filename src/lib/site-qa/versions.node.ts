// Change detection — BUILD-TIME ONLY. Computes a stable content hash per QA
// template from its source files, so /admin/site-qa can tell "verified against
// the current code" from "changed since it was verified".
//
// This module uses node:fs and MUST NOT be imported by client or server request
// code. It is imported only by the Vite plugin (scripts/vite-site-qa.ts), which
// runs it once at build/dev start and bakes the result into the virtual module
// `virtual:site-qa-versions`. At request time the server reads that baked map —
// never the filesystem (production is a serverless bundle with no source tree,
// and file mtimes there are meaningless; a content hash is deterministic).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { TEMPLATES, templateSourceFiles } from "./manifest";

const HASHABLE = /\.(tsx?|css|json)$/;

/** Recursively collect hashable files under a repo-relative path (file or dir).
 *  Missing paths are skipped silently — a template may reference a file that was
 *  renamed; the hash simply reflects what exists. */
function collect(root: string, rel: string): string[] {
  const abs = resolve(root, rel);
  let st;
  try {
    st = statSync(abs);
  } catch {
    return [];
  }
  if (st.isFile()) return HASHABLE.test(abs) ? [abs] : [];
  if (!st.isDirectory()) return [];
  const out: string[] = [];
  for (const name of readdirSync(abs)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    out.push(...collect(root, join(rel, name)));
  }
  return out;
}

/** Hash one template's source into a short hex digest. Sorted paths → order
 *  independent; each file's repo-relative path is mixed in so a rename changes
 *  the hash even if content is identical. */
function hashTemplate(root: string, files: string[]): string {
  const paths = new Set<string>();
  for (const f of files) for (const p of collect(root, f)) paths.add(p);
  const sorted = [...paths].sort();
  const h = createHash("sha256");
  for (const abs of sorted) {
    const relForHash = abs.slice(resolve(root).length).replace(/\\/g, "/");
    h.update(relForHash);
    h.update("\0");
    try {
      // Normalize CRLF↔LF so a line-ending flip (autocrlf) is not a "change".
      h.update(readFileSync(abs, "utf8").replace(/\r\n/g, "\n"));
    } catch {
      /* unreadable → contributes only its path */
    }
    h.update("\0");
  }
  return h.digest("hex").slice(0, 16);
}

/** Best-effort "when did this template's source last change" via git — the
 *  commit time of the most recent commit touching any of its files. Returns null
 *  when git isn't available or history is too shallow (e.g. a depth-1 CI clone),
 *  in which case the cockpit falls back to the build time. Never throws. */
function lastChangedAt(root: string, files: string[]): string | null {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cI", "--", ...files], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

export interface TemplateVersion {
  /** Content hash of the template's source (the change-detection key). */
  hash: string;
  /** ISO time the source last changed, or null if unknown. */
  changedAt: string | null;
}

/** Build the { templateId: {hash, changedAt} } map for every template. `root` is
 *  the repo root (process.cwd() during a Vite build). */
export function computeTemplateVersions(root: string): Record<string, TemplateVersion> {
  const map: Record<string, TemplateVersion> = {};
  for (const t of TEMPLATES) {
    const files = templateSourceFiles(t);
    map[t.id] = { hash: hashTemplate(root, files), changedAt: lastChangedAt(root, files) };
  }
  return map;
}
