// New-template detection (spec §27): a page must not silently exist without
// becoming testable from /admin/site-qa. This asserts every file in src/routes
// is owned by exactly one QA template (`routes`) OR listed in IGNORED_ROUTES
// with a reason. Add a route → this test fails until you register it in
// src/lib/site-qa/manifest.ts.
import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import { IGNORED_ROUTES, TEMPLATES, templateSourceFiles } from "./manifest";

const routesDir = resolve(import.meta.dir, "../../routes");
const routeFiles = readdirSync(routesDir, { withFileTypes: true })
  .filter((d) => d.isFile())
  .map((d) => d.name);

describe("site-qa manifest coverage", () => {
  test("every route file is owned by a template or explicitly ignored", () => {
    const owned = new Set<string>();
    for (const t of TEMPLATES) for (const r of t.routes) owned.add(r);

    const unregistered = routeFiles.filter((f) => !owned.has(f) && !(f in IGNORED_ROUTES));
    expect(unregistered).toEqual([]);
  });

  test("no route file is claimed by two templates", () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const t of TEMPLATES) {
      for (const r of t.routes) {
        if (seen.has(r)) dupes.push(`${r} (in ${seen.get(r)} and ${t.id})`);
        else seen.set(r, t.id);
      }
    }
    expect(dupes).toEqual([]);
  });

  test("every owned route file actually exists", () => {
    const missing: string[] = [];
    for (const t of TEMPLATES) {
      for (const r of t.routes) if (!routeFiles.includes(r)) missing.push(`${t.id} → ${r}`);
    }
    expect(missing).toEqual([]);
  });

  test("template ids are unique", () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every template declares at least one source file to hash", () => {
    const empty = TEMPLATES.filter((t) => templateSourceFiles(t).length === 0).map((t) => t.id);
    expect(empty).toEqual([]);
  });
});
