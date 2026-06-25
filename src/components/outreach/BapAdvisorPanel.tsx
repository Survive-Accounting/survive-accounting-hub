// BapAdvisorPanel — kicks off a Beta Alpha Psi (BAP) faculty-advisor enrichment
// batch. Reuses campus_research_jobs with research_mode='bap_advisor', so
// run-campus-batch invokes research-campus-bap-advisor per campus. Campuses are
// queued highest-priority-first. Matches an existing lead before adding a new one.
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, GraduationCap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { startBapAdvisorBatch } from "@/lib/outreach-api";
import type { Campus } from "@/lib/outreach-mock";

type Scope = "all" | "selected";

export function BapAdvisorPanel({
  campuses,
  selectedCampusIds = [],
}: {
  campuses: Campus[];
  selectedCampusIds?: string[];
}) {
  const qc = useQueryClient();
  const [scope, setScope] = useState<Scope>("all");
  const [starting, setStarting] = useState(false);

  const activeCampuses = useMemo(
    () => campuses.filter((c) => !(c as any).archived_at && !(c as any).archived),
    [campuses],
  );

  // Highest campaign_priority_score first (falls back to name order).
  const targetIds = useMemo<string[]>(() => {
    const pool = scope === "selected"
      ? activeCampuses.filter((c) => selectedCampusIds.includes(c.id))
      : activeCampuses;
    return [...pool]
      .sort((a, b) =>
        (((b as any).campaign_priority_score ?? 0) - ((a as any).campaign_priority_score ?? 0))
        || a.school_name.localeCompare(b.school_name))
      .map((c) => c.id);
  }, [scope, activeCampuses, selectedCampusIds]);

  async function handleRun() {
    if (!targetIds.length) {
      toast.error(scope === "selected"
        ? "No campuses selected. Pick some on the campuses list first."
        : "No active campuses found.");
      return;
    }
    const estCost = (targetIds.length * 0.02).toFixed(2);
    const estMins = Math.max(1, Math.ceil(targetIds.length / 3));
    const label = scope === "selected" ? "selected campuses" : "all active campuses";
    const ok = window.confirm(
      `Run BAP advisor enrichment on ${targetIds.length} ${label}?\n\n` +
      `• Finds each campus's Beta Alpha Psi chapter + faculty advisor.\n` +
      `• Matches an EXISTING lead first; only adds a new one if not already there.\n` +
      `• Never invents an email; flags generic chapter inboxes.\n` +
      `• Highest-priority campuses processed first; runs ~3 at a time via the worker.\n\n` +
      `Estimated cost: ~$${estCost} in AI/scrape credits.\n` +
      `Estimated time: ~${estMins} minute(s).`,
    );
    if (!ok) return;
    setStarting(true);
    try {
      await startBapAdvisorBatch(targetIds, `BAP advisor enrichment · ${label} (${targetIds.length})`);
      toast.success(`Started BAP advisor enrichment on ${targetIds.length} campus(es).`);
      await qc.invalidateQueries({ queryKey: ["campus-research-batch"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start BAP enrichment");
    } finally {
      setStarting(false);
    }
  }

  return (
    <Card className="p-4 border-indigo-200 bg-indigo-50/40 dark:bg-indigo-950/10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <GraduationCap className="h-4 w-4 text-indigo-600" />
            Run BAP Advisor Enrichment
          </div>
          <p className="mt-1 text-xs text-muted-foreground max-w-xl">
            Finds each campus&apos;s Beta Alpha Psi faculty advisor (accounting faculty), tags
            an existing lead as the advisor when one already exists, and only adds a new lead
            otherwise. Tagged <code>source=&apos;bap_enrichment&apos;</code> so it stays a
            measurable segment. Not every school has a chapter — partial coverage is expected.
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Scope</label>
            <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
              <SelectTrigger className="h-8 w-[240px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All active campuses ({activeCampuses.length})</SelectItem>
                <SelectItem value="selected">Selected campuses ({selectedCampusIds.length})</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleRun}
            disabled={starting || targetIds.length === 0}
            size="sm"
            className="h-8 gap-1.5 bg-indigo-600 hover:bg-indigo-700"
          >
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" />}
            Run on {targetIds.length} campus{targetIds.length === 1 ? "" : "es"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
