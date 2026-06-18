// Sidebar panel showing AI-suggested generalizable improvements derived from
// every scrape's debug bundle. Patterns are rolled up by tag so recurring
// failures (e.g. "wp_directory_mdlen_zero × 12") float to the top. Each row
// shows which other verticals (accounting firms, law firms, etc.) the fix
// would also help, and a "Mark shipped" button to log a fix milestone.
import { useEffect, useState } from "react";
import { ChevronDown, Lightbulb, Copy, RefreshCw, CheckCircle2, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { listImprovementSuggestions } from "@/lib/scrape-debug.functions";
import { createFixMilestone } from "@/lib/scraper-trends.functions";

type Grouped = {
  pattern_tag: string;
  count: number;
  severity: string;
  title: string | null;
  suggestion: string;
  latest_at: string;
  latest_suggestion_id: string;
  campus_count: number;
  latest_campus: string | null;
  applies_to_verticals: string[];
  any_shipped: boolean;
};

const SEV_COLOR: Record<string, string> = {
  high: "text-rose-600",
  med: "text-amber-600",
  low: "text-sidebar-foreground/60",
};

const VERTICAL_LABEL: Record<string, string> = {
  accounting_firms: "Accounting",
  law_firms: "Law",
  investment_banks: "IB",
  consultancies: "Consulting",
  hospitals: "Hospitals",
  government: "Gov",
  nonprofits: "Nonprofits",
  other: "Other",
};

export function AiSuggestionsPanel() {
  const [open, setOpen] = useState(false);
  const [grouped, setGrouped] = useState<Grouped[]>([]);
  const [loading, setLoading] = useState(false);
  const [shippingId, setShippingId] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await listImprovementSuggestions({ data: { limit: 100 } });
      setGrouped(res.grouped as Grouped[]);
    } catch (e) {
      console.warn("[AiSuggestions]", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => { void refresh(); }, 60_000);
    return () => clearInterval(t);
  }, [open]);

  const copyTop = async (g: Grouped) => {
    const verticals = g.applies_to_verticals.length
      ? `\nAlso applies to: ${g.applies_to_verticals.map((v) => VERTICAL_LABEL[v] ?? v).join(", ")}`
      : "";
    const text = `Pattern: ${g.pattern_tag} (seen ${g.count}× across ${g.campus_count} campus${g.campus_count === 1 ? "" : "es"})
Severity: ${g.severity}${verticals}
${g.title ?? ""}

${g.suggestion}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied suggestion — paste into chat to build it");
    } catch {
      toast.error("Copy failed");
    }
  };

  const markShipped = async (g: Grouped) => {
    setShippingId(g.latest_suggestion_id);
    try {
      await createFixMilestone({
        data: {
          name: (g.title || g.pattern_tag).slice(0, 200),
          description: g.suggestion.slice(0, 2000),
          suggestionId: g.latest_suggestion_id,
          tags: [g.pattern_tag, ...g.applies_to_verticals],
        },
      });
      toast.success("Logged fix milestone — will show on Scraper Trends");
      void refresh();
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setShippingId(null);
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="px-1 pb-1.5">
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-[10.5px] font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent">
        <Lightbulb className="h-3 w-3 text-sidebar-foreground/60" />
        <span className="uppercase tracking-wide">AI Suggestions</span>
        <span className="ml-1 font-mono tabular-nums text-sidebar-foreground/55">{grouped.length}</span>
        <ChevronDown className={`ml-auto h-3 w-3 text-sidebar-foreground/50 transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 rounded border border-sidebar-border/60 bg-sidebar-accent/30 px-1.5 py-1.5 text-[10.5px]">
          <div className="flex items-center justify-between pb-1">
            <Link
              to="/outreach/scraper-trends"
              className="inline-flex items-center gap-1 text-[9.5px] text-sidebar-foreground/55 hover:text-sidebar-foreground hover:underline"
            >
              <BarChart3 className="h-2.5 w-2.5" /> View trends & AI verdict
            </Link>
            <button
              type="button"
              onClick={() => { void refresh(); }}
              disabled={loading}
              className="rounded p-0.5 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`h-2.5 w-2.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
          {grouped.length === 0 ? (
            <div className="px-1 py-2 text-[10px] italic text-sidebar-foreground/50">
              No suggestions yet. They appear automatically after each scrape.
            </div>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {grouped.slice(0, 15).map((g) => (
                <li key={g.pattern_tag} className="group rounded border border-sidebar-border/40 bg-sidebar-background/50 px-1.5 py-1">
                  <div className="flex items-start gap-1">
                    <span className={`font-mono text-[9.5px] ${SEV_COLOR[g.severity] ?? "text-sidebar-foreground/60"}`}>
                      ×{g.count}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="truncate text-[10.5px] font-medium text-sidebar-foreground">
                          {g.title || g.pattern_tag}
                        </span>
                        {g.any_shipped && (
                          <CheckCircle2 className="h-2.5 w-2.5 shrink-0 text-emerald-600" />
                        )}
                      </div>
                      <div className="line-clamp-2 text-[10px] text-sidebar-foreground/70">
                        {g.suggestion}
                      </div>
                      {g.applies_to_verticals.length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-0.5">
                          {g.applies_to_verticals.map((v) => (
                            <span
                              key={v}
                              className="rounded bg-sidebar-accent px-1 py-0 text-[8.5px] text-sidebar-foreground/70"
                              title={`Also applies to ${v.replace(/_/g, " ")}`}
                            >
                              {VERTICAL_LABEL[v] ?? v}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-sidebar-foreground/45">
                        <span className="font-mono">{g.pattern_tag}</span>
                        <span>· {g.campus_count} campus{g.campus_count === 1 ? "" : "es"}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-0.5 opacity-0 transition group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => { void copyTop(g); }}
                        className="rounded p-0.5 text-sidebar-foreground/40 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        title="Copy suggestion to clipboard"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                      {!g.any_shipped && (
                        <button
                          type="button"
                          onClick={() => { void markShipped(g); }}
                          disabled={shippingId === g.latest_suggestion_id}
                          className="rounded p-0.5 text-sidebar-foreground/40 hover:bg-sidebar-accent hover:text-emerald-600 disabled:opacity-50"
                          title="Mark this fix as shipped (logs a milestone on Scraper Trends)"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default AiSuggestionsPanel;
