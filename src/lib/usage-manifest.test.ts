// USAGE MANIFEST GUARDS — the manifest is what makes "seen but never touched" and
// "never rendered" answerable, so a typo'd id is a silently missing row in the
// report rather than a crash. These pin the invariants that keep DOM and manifest
// describing the same surface.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { elementsFor, PROTECTED_ELEMENTS, addMenuElementId, operatorUuid } from "@/lib/usage-elements";

/** Every `data-sa-el="literal"` written in the source tree. Template-literal ids
 *  (`node-${kind}`, `add-${slug}`) are dynamic and covered by their own tests. */
function literalIdsInSource(): { id: string; file: string }[] {
  const out: { id: string; file: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== "node_modules") walk(p); continue; }
      if (!/\.tsx?$/.test(name) || name.endsWith(".test.ts") || name.endsWith(".test.tsx")) continue;
      const src = readFileSync(p, "utf8");
      // `data-sa-el="<id>"` appears in doc comments as a placeholder, not an id.
      for (const m of src.matchAll(/data-sa-el="([^"<>]+)"/g)) out.push({ id: m[1], file: p });
    }
  };
  walk("src");
  return out;
}

describe("usage manifest", () => {
  test("every hardcoded data-sa-el id is declared in the manifest", () => {
    const known = new Set(elementsFor("study-canvas").map((e) => e.id));
    const missing = literalIdsInSource().filter((x) => !known.has(x.id));
    expect(missing.map((x) => `${x.id} (${x.file})`)).toEqual([]);
  });

  test("ids are unique", () => {
    const ids = elementsFor("study-canvas").map((e) => e.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });
  test("protected ids all exist in the manifest", () => {
    const ids = new Set(elementsFor("study-canvas").map((e) => e.id));
    expect(PROTECTED_ELEMENTS["study-canvas"].filter((p) => !ids.has(p))).toEqual([]);
  });
  test("add-menu slugs are stable and legal", () => {
    expect(addMenuElementId("A = L + E")).toBe("add-a-l-e");
    expect(addMenuElementId("Who's It For?")).toBe("add-who-s-it-for");
    expect(addMenuElementId("FIFO/LIFO layers")).toBe("add-fifo-lifo-layers");
  });
  test("operator uuids are distinct, valid, and null-safe", () => {
    expect(operatorUuid(null)).toBeNull();
    const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(operatorUuid("lee")).toMatch(re);
    expect(operatorUuid("king")).toMatch(re);
    expect(operatorUuid("lee")).not.toBe(operatorUuid("king"));
  });
});
