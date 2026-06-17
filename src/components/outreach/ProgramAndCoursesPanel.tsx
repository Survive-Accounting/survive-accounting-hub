// ProgramAndCoursesPanel — narrow batch: program name + course codes/titles
// for all active campuses. Always overwrites (force).
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Loader2, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import {
  startProgramAndCoursesBatch,
  getLatestCampusBatch,
  retryCampusBatchItems,
  tickCampusBatch,
} from "@/lib/outreach-api";

const FAMS = ["intro_1", "intro_2", "intermediate_1", "intermediate_2"] as const;

async function fetchCoverage(): Promise<{ total: number; withData: number; ids: string[] }> {
  const { data, error } = await supabase
    .from("campuses")
    .select("id, archived_at, accounting_department_name, course_family_codes_json, course_family_titles_json");
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    id: string;
    archived_at: string | null;
    accounting_department_name: string | null;
    course_family_codes_json: Record<string, string> | null;
    course_family_titles_json: Record<string, string> | null;
  }>;
  const active = rows.filter((r) => !r.archived_at);
  let withData = 0;
  for (const r of active) {
    const codes = r.course_family_codes_json ?? {};
    const titles = r.course_family_titles_json ?? {};
    const hasAll =
      !!r.accounting_department_name &&
      FAMS.every((f) => (codes as any)[f] || (titles as any)[f]);
    if (hasAll) withData++;
  }
  return { total: active.length, withData, ids: active.map((r) => r.id) };
}

export function ProgramAndCoursesPanel() {
  const qc = useQueryClient();
  const [starting, setStarting] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const covQ = useQuery({
    queryKey: ["program-courses-coverage"],
    queryFn: fetchCoverage,
    refetchInterval: 15_000,
  });

  const jobQ = useQuery({
    queryKey: ["program-courses-latest-job"],
    queryFn: getLatestCampusBatch,
    refetchInterval: 5_000,
  });

  const latest = jobQ.data;
  const isThisJob = latest?.job?.research_mode === "program_and_courses";
  const jobRunning = isThisJob && (latest?.job?.status === "running" || latest?.job?.status === "paused");
  const failedItems = useMemo(
    () => (isThisJob ? (latest?.items ?? []).filter((i) => i.status === "failed") : []),
    [latest, isThisJob],
  );
  const doneItems = useMemo(
    () => (isThisJob ? (latest?.items ?? []).filter((i) => i.status === "done") : []),
    [latest, isThisJob],
  );
  const lastDone = useMemo(() => doneItems.slice(-5).reverse(), [doneItems]);

  const total = covQ.data?.total ?? 0;
  const withData = covQ.data?.withData ?? 0;
  const pct = total > 0 ? Math.round((withData / total) * 100) : 0;

  async function handleStart() {
    if (jobRunning) {
      toast.error("A program+courses batch is already running.");
      return;
    }
    const ids = covQ.data?.ids ?? [];
    if (!ids.length) {
      toast.error("No active campuses found.");
      return;
    }
    const ok = window.confirm(
      `Run program + course research on all ${ids.length} active campuses?\n\n` +
      `• Finds accounting department/program name.\n` +
      `• Finds course codes + full titles for Intro 1/2 and Intermediate I/II.\n` +
      `• Overwrites existing values (force).\n` +
      `• Runs in parallel batches.\n\n` +
      `Estimated cost: ~$${(ids.length * 0.004).toFixed(2)} in AI credits.`,
    );
    if (!ok) return;
    setStarting(true);
    try {
      await startProgramAndCoursesBatch(ids);
      await tickCampusBatch().catch(() => {});
      toast.success(`Started program + courses on ${ids.length} campuses.`);
      await qc.invalidateQueries({ queryKey: ["program-courses-latest-job"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start batch");
    } finally {
      setStarting(false);
    }
  }

  async function handleRetryFailures() {
    if (!latest?.job?.id || !failedItems.length) return;
    setRetrying(true);
    try {
      await retryCampusBatchItems(latest.job.id);
      toast.success(`Retrying ${failedItems.length} failed.`);
      await qc.invalidateQueries({ queryKey: ["program-courses-latest-job"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Retry failed");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <Card className="p-4 border-violet-200 bg-violet-50/40 dark:bg-violet-950/10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-[280px]">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <GraduationCap className="h-4 w-4 text-violet-600" />
            Program + Course Codes/Titles
            <span className="rounded-full bg-violet-100 text-violet-800 text-[10px] font-semibold px-2 py-0.5 border border-violet-300">
              Narrow batch · force-overwrite
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground max-w-xl">
            One-click batch over all 170 active campuses. Pulls the accounting
            program/department name and the course code + full title for
            Intro 1/2 and Intermediate I/II. Skips leads, terms, textbooks.
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <Button
            onClick={handleStart}
            disabled={starting || covQ.isLoading || jobRunning || total === 0}
            size="sm"
            className="h-8 gap-1.5 bg-violet-600 hover:bg-violet-700"
          >
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {jobRunning ? "Running…" : `Run on ${total} campuses`}
          </Button>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">
            {withData} / {total} campuses have program + all 4 course codes/titles
          </span>
          <span className="text-muted-foreground">{pct}%</span>
        </div>
        <Progress value={pct} className="mt-1 h-2" />
      </div>

      {isThisJob && (
        <div className="mt-4 pt-3 border-t border-violet-200/60 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <div className="font-semibold text-violet-900">
              Latest job: {latest!.job.status}
              {" · "}
              {doneItems.length}/{latest!.items.length} done
              {failedItems.length > 0 && (
                <span className="ml-1 text-red-700">· {failedItems.length} failed</span>
              )}
            </div>
            {failedItems.length > 0 && (
              <Button
                onClick={handleRetryFailures}
                disabled={retrying}
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-[11px]"
              >
                {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Retry failures
              </Button>
            )}
          </div>
          {lastDone.length > 0 && (
            <div className="text-[11px] text-muted-foreground">
              <div className="font-medium mb-1 text-violet-900/80">Recently completed:</div>
              <ul className="space-y-0.5">
                {lastDone.map((it) => (
                  <li key={it.id} className="truncate">
                    ✓ {it.campus_name ?? it.campus_id.slice(0, 8)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
