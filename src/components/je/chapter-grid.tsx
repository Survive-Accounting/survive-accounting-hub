// Chapter grid — a one-screen matrix of a chapter: lifecycle stages (rows) × conditions
// (columns), each cell a resolved MiniEntry. The "chapter cheat sheet." Derives entirely
// from ScenarioDoc data + the optional doc.grid field; falls back to one row per doc.
import { useEffect } from "react";
import { ArrowLeft, Printer } from "lucide-react";

import { cn } from "@/lib/utils";
import { buildExplore } from "@/lib/je/explore";
import { MiniEntry } from "@/components/je/explore";
import { resolveVariant, type ScenarioDoc } from "@/lib/je-engine";

const NAVY = "#14213D";

const GRID_CSS = `
@media print {
  @page { size: landscape; margin: 0.35in; }
  .je-grid-noprint { display: none !important; }
  .je-grid-print-footer { display: block !important; }
}
.je-grid-print-footer { display: none; }
`;

interface GridScenario {
  slug: string;
  title: string;
  doc: ScenarioDoc;
}

const defaultConditions = (doc: ScenarioDoc): Record<string, string> =>
  Object.fromEntries(doc.axes.map((a) => [a.key, a.options[0]?.value ?? ""]));

export function ChapterGrid({
  courseLabel,
  chapterLabel,
  scenarios,
  onBack,
  onOpenCell,
  onCleanToggle,
  cleanScreen,
}: {
  courseLabel: string;
  chapterLabel: string;
  scenarios: GridScenario[];
  onBack: () => void;
  onOpenCell: (slug: string, variantId?: string) => void;
  onCleanToggle: () => void;
  cleanScreen: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "c" || e.key === "C") onCleanToggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCleanToggle]);

  // Columns = union of every doc's FIRST-axis option labels (first-seen order).
  const columns: { label: string }[] = [];
  for (const s of scenarios) {
    const fa = s.doc.axes[0];
    if (fa) for (const o of fa.options) if (!columns.some((c) => c.label === o.label)) columns.push({ label: o.label });
  }
  const hasCols = columns.length > 0;

  // Rows = lifecycle stages (grid.row) ordered by rowOrder; fallback = one row per doc.
  const gridded = scenarios.filter((s) => s.doc.grid?.row);
  type Stage = { label: string; order: number; docs: GridScenario[] };
  let stages: Stage[] = [];
  if (gridded.length === 0) {
    stages = scenarios.map((s, i) => ({ label: s.title, order: i, docs: [s] }));
  } else {
    for (const s of scenarios) {
      const label = s.doc.grid?.row ?? "Ungridded";
      let g = stages.find((x) => x.label === label);
      if (!g) {
        g = { label, order: s.doc.grid?.rowOrder ?? (label === "Ungridded" ? 9999 : 999), docs: [] };
        stages.push(g);
      } else if (s.doc.grid?.rowOrder != null) {
        g.order = Math.min(g.order, s.doc.grid.rowOrder);
      }
      g.docs.push(s);
    }
    stages.sort((a, b) => a.order - b.order);
    // Ungridded always last
    stages = stages.filter((s) => s.label !== "Ungridded").concat(stages.filter((s) => s.label === "Ungridded"));
  }

  const cellFor = (doc: ScenarioDoc, columnLabel: string) => {
    const fa = doc.axes[0];
    if (!fa) return undefined;
    const opt = fa.options.find((o) => o.label === columnLabel);
    if (!opt) return undefined;
    const cond = { ...defaultConditions(doc), [fa.key]: opt.value };
    const variant = resolveVariant(doc, cond);
    return variant ? { variant, cond } : undefined;
  };
  const buildFor = (doc: ScenarioDoc, cond: Record<string, string>) =>
    doc.params ? buildExplore(doc, cond, doc.params.defaultSeed ?? 1, false) : null;

  return (
    <div className="je-grid" style={{ zoom: 0.85 }}>
      <style>{GRID_CSS}</style>

      <div className="mb-3 flex items-center gap-2 je-grid-noprint">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> {chapterLabel} hub
        </button>
        <h1 className="text-lg font-bold" style={{ color: NAVY }}>Chapter grid</h1>
        <span className="text-[11px] text-muted-foreground">{chapterLabel}</span>
        <button onClick={() => window.print()} className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:border-foreground">
          <Printer className="h-3.5 w-3.5" /> Print
        </button>
        <button onClick={onCleanToggle} className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:border-foreground">
          {cleanScreen ? "Show chrome" : "Clean (c)"}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="sticky top-0 z-10 bg-background">
              <th className="border border-border p-1 text-left">Stage</th>
              <th className="border border-border p-1 text-left">Scenario</th>
              {hasCols ? (
                columns.map((c) => <th key={c.label} className="border border-border p-1 text-center">{c.label}</th>)
              ) : (
                <th className="border border-border p-1 text-center">Entry</th>
              )}
            </tr>
          </thead>
          <tbody>
            {stages.map((stage) =>
              stage.docs.map((s, i) => {
                const doc = s.doc;
                const fa = doc.axes[0];
                return (
                  <tr key={s.slug} className="align-top">
                    {i === 0 && (
                      <th rowSpan={stage.docs.length} className="border border-border p-1 text-left font-semibold" style={{ color: NAVY }}>
                        {stage.label}
                      </th>
                    )}
                    <th className="border border-border p-1 text-left font-medium">{s.title}</th>
                    {!hasCols ? (
                      <td className="cursor-pointer border border-border p-1 hover:bg-muted/40" onClick={() => onOpenCell(s.slug)}>
                        <MiniEntry variant={resolveVariant(doc, defaultConditions(doc))!} conditions={defaultConditions(doc)} explore={buildFor(doc, defaultConditions(doc))} onOpen={() => {}} />
                      </td>
                    ) : !fa ? (
                      <td colSpan={columns.length} className="cursor-pointer border border-border p-1 hover:bg-muted/40" onClick={() => onOpenCell(s.slug)}>
                        <MiniEntry variant={resolveVariant(doc, defaultConditions(doc))!} conditions={defaultConditions(doc)} explore={buildFor(doc, defaultConditions(doc))} onOpen={() => {}} />
                      </td>
                    ) : (
                      columns.map((c) => {
                        const cv = cellFor(doc, c.label);
                        return (
                          <td
                            key={c.label}
                            className={cn("border border-border p-1", cv && "cursor-pointer hover:bg-muted/40")}
                            onClick={cv ? () => onOpenCell(s.slug, cv.variant.id) : undefined}
                          >
                            {cv ? (
                              <MiniEntry variant={cv.variant} conditions={cv.cond} explore={buildFor(doc, cv.cond)} onOpen={() => {}} />
                            ) : (
                              <span className="text-muted-foreground/30">·</span>
                            )}
                          </td>
                        );
                      })
                    )}
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>

      <div className="je-grid-print-footer mt-2 text-[10px] text-muted-foreground">
        {courseLabel} · {chapterLabel} · surviveaccounting.com/study
      </div>
    </div>
  );
}
