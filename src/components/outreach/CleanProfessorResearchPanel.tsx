// CleanProfessorResearchPanel — kicks off the Phase 3 "Clean Professor Run".
// Reuses the campus_research_jobs infrastructure but tags the job with
// research_mode='clean_professor_only' so run-campus-batch only invokes the
// research-campus-leads-clean edge function (no profile/sections rerun).
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles, ShieldCheck, FlaskConical } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  startCleanProfessorBatch,
  getTextbookMatchedCampusIds,
  runCleanProfessorTest,
  type CleanProfessorTestResult,
} from "@/lib/outreach-api";
import type { Campus } from "@/lib/outreach-mock";
import { CleanRunTestResultModal } from "./CleanRunTestResultModal";

type Scope = "textbook_matched" | "selected" | "all";

export function CleanProfessorResearchPanel({
  campuses,
  selectedCampusIds = [],
}: {
  campuses: Campus[];
  selectedCampusIds?: string[];
}) {
  const qc = useQueryClient();
  const [scope, setScope] = useState<Scope>("all");
  const [starting, setStarting] = useState(false);
  const [testCampusId, setTestCampusId] = useState<string>("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<CleanProfessorTestResult | null>(null);
  const [testCampusName, setTestCampusName] = useState("");
  const [testOpen, setTestOpen] = useState(false);

  const tbQ = useQuery({
    queryKey: ["clean-professor-textbook-matched"],
    queryFn: getTextbookMatchedCampusIds,
    staleTime: 60_000,
  });

  const activeCampuses = useMemo(
    () => campuses.filter((c) => !(c as any).archived_at && !(c as any).archived),
    [campuses],
  );

  const sortedCampuses = useMemo(
    () => [...activeCampuses].sort((a, b) => a.school_name.localeCompare(b.school_name)),
    [activeCampuses],
  );

  const targetIds = useMemo<string[]>(() => {
    if (scope === "selected") return selectedCampusIds.filter(Boolean);
    if (scope === "all") return activeCampuses.map((c) => c.id);
    const matched = new Set(tbQ.data ?? []);
    return activeCampuses.filter((c) => matched.has(c.id)).map((c) => c.id);
  }, [scope, selectedCampusIds, activeCampuses, tbQ.data]);

  async function handleRun() {
    if (!targetIds.length) {
      toast.error(
        scope === "selected"
          ? "No campuses selected. Pick some on the campuses list first."
          : "No campuses match this scope.",
      );
      return;
    }
    const estCost = (targetIds.length * 0.03).toFixed(2);
    const estMins = Math.max(1, Math.ceil(targetIds.length / 10));
    const label =
      scope === "textbook_matched" ? "textbook-matched campuses"
      : scope === "selected" ? "selected campuses"
      : "all active campuses";
    const ok = window.confirm(
      `Run CLEAN Professor research on ${targetIds.length} ${label}?\n\n` +
      `• Strict AI prompt — only accounting professors from official department/business-school faculty pages.\n` +
      `• NO class-schedule-only instructors, NO LinkedIn, NO Rate My Professors.\n` +
      `• Saved as pending suggestions (no auto-import, no auto-approve).\n` +
      `• Tagged research_mode='clean_professor_only', research_label='Clean Professor Run 1'.\n\n` +
      `Estimated cost: ~$${estCost} in AI credits.\n` +
      `Estimated time: ~${estMins} minute(s) (3 campuses at a time).`,
    );
    if (!ok) return;
    setStarting(true);
    try {
      await startCleanProfessorBatch(
        targetIds,
        `Clean Professor Run · ${label} (${targetIds.length})`,
      );
      toast.success(`Started clean professor research on ${targetIds.length} campus(es).`);
      await qc.invalidateQueries({ queryKey: ["campus-research-batch"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start clean run");
    } finally {
      setStarting(false);
    }
  }

  async function handleTest() {
    if (!testCampusId) {
      toast.error("Pick a campus to test first.");
      return;
    }
    const campus = activeCampuses.find((c) => c.id === testCampusId);
    if (!campus) return;
    setTesting(true);
    setTestCampusName(campus.school_name);
    try {
      const res = await runCleanProfessorTest(testCampusId);
      setTestResult(res);
      setTestOpen(true);
      toast.success(
        `Test complete · ${res.debug.parsed_lead_count} accepted, ${res.debug.rejected_count} rejected.`,
      );
      await qc.invalidateQueries({ queryKey: ["lead-suggestions"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Test failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <>
      <Card className="p-4 border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/10">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Run Clean Professor Research
              <span className="rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-semibold px-2 py-0.5 border border-emerald-300">
                Recommended for first cold campaign
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground max-w-xl">
              Strict professor-only AI run. Only accounting professors / lecturers /
              instructors / clinical / professors of practice / accounting dept chair /
              BAP advisor — sourced from official accounting department, school of
              accountancy, or business-school faculty pages. Class-schedule names without
              an official email or profile are <strong>not</strong> created as leads.
            </p>
          </div>
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Scope</label>
              <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
                <SelectTrigger className="h-8 w-[260px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    All active campuses ({activeCampuses.length})
                  </SelectItem>
                  <SelectItem value="textbook_matched">
                    Textbook-matched Intro 1 / 2 ({tbQ.data?.length ?? "…"})
                  </SelectItem>
                  <SelectItem value="selected">
                    Selected campuses ({selectedCampusIds.length})
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleRun}
              disabled={starting || tbQ.isLoading || targetIds.length === 0}
              size="sm"
              className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            >
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Run on {targetIds.length} campus{targetIds.length === 1 ? "" : "es"}
            </Button>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-emerald-200/60">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900">
            <FlaskConical className="h-3.5 w-3.5" />
            Test on one campus first
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Runs the exact same clean prompt on a single campus and shows you the
            accepted leads, rejected candidates, prompt, and raw AI output so you
            can review quality before kicking off the full batch.
          </p>
          <div className="mt-2 flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[260px]">
              <label className="block text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Campus</label>
              <Select value={testCampusId} onValueChange={setTestCampusId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Pick a campus to test…" />
                </SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  {sortedCampuses.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.school_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleTest}
              disabled={testing || !testCampusId}
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
              Run test
            </Button>
          </div>
        </div>
      </Card>

      <CleanRunTestResultModal
        open={testOpen}
        onOpenChange={setTestOpen}
        result={testResult}
        campusName={testCampusName}
      />
    </>
  );
}
