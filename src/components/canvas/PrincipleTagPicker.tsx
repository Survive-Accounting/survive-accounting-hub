// PRINCIPLE TAGS (0093) — a compact multi-select of the principles vocabulary,
// reused in the JE card gear and the memo editor. Lee tags manually; nothing is
// auto-assigned. Slugs (not ids) are stored on node data so tags survive a
// scene export/import without a DB round-trip. Empty vocabulary (pre-0093 or
// unseeded) → a quiet "run 0093" hint, never a crash.
import { useQuery } from "@tanstack/react-query";

import { fetchPrincipleTags } from "@/lib/je-api";
import { NEON } from "./theme";

export function PrincipleTagPicker({ value, onChange }: { value: string[]; onChange: (slugs: string[]) => void }) {
  const q = useQuery({ queryKey: ["principle-tags"], queryFn: fetchPrincipleTags, staleTime: 600_000, networkMode: "always" });
  const principles = q.data ?? [];
  const set = new Set(value);
  const toggle = (slug: string) => onChange(set.has(slug) ? value.filter((s) => s !== slug) : [...value, slug]);

  const assumptions = principles.filter((p) => p.kind === "assumption");
  const rules = principles.filter((p) => p.kind === "principle");

  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()}>
      {principles.length === 0 ? (
        <div className="text-[10px] italic" style={{ color: NEON.muted }}>
          {q.isLoading ? "Loading principles…" : "No principles yet — run migration 0093."}
        </div>
      ) : (
        <div className="space-y-1.5">
          {[["Assumptions", assumptions], ["Principles", rules]].map(([label, list]) => (
            <div key={label as string}>
              <div className="mb-0.5 text-[8.5px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>{label as string}</div>
              <div className="flex flex-wrap gap-1">
                {(list as typeof principles).map((p) => {
                  const on = set.has(p.slug);
                  return (
                    <button
                      key={p.slug}
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        color: on ? "#0B1322" : NEON.text,
                        background: on ? NEON.yellow : "transparent",
                        border: `1px solid ${on ? NEON.yellow : NEON.borderSoft}`,
                      }}
                      onClick={() => toggle(p.slug)}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
