// TextbookCoveragePanel — bulk textbook research progress + one-click backfill.
// Shows how many campuses have any course_family_textbooks_json data, lets
// you kick off a textbook-only batch for all "unknown" (≈451) campuses, and
// surfaces live progress from the most recent campus_research_jobs row.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Loader2, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import {
  startTextbookOnlyBatch,
  getLatestCampusBatch,
  retryCampusBatchItems,
  tickCampusBatch,
} from "@/lib/outreach-api";

const FAMS = ["intro_1", "intro_2", "intermediate_1", "intermediate_2"] as const;

async function fetchCoverage(): Promise<{ total: number; withData: number }> {
  const { data, error } = await supabase
    .from("campuses")
    .select("id, archived_at, course_family_textbooks_json");
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    id: string;
    archived_at: string | null;
    course_family_textbooks_json: Record<string, { title?: string; authors?: string; publisher?: string; isbn13?: string }> | null;
  }>;
  const active = rows.filter((r) => !r.archived_at);
  let withData = 0;
  for (const r of active) {
    const tb = r.course_family_textbooks_json ?? {};
    if (FAMS.some((f) => {
      const e = (tb as any)[f];
      return e && (e.title || e.authors || e.publisher || e.isbn13);
    })) withData++;
  }
  return { total: active.length, withData };
}

export function TextbookCoveragePanel() {
  const qc = useQueryClient();
  const [starting, setStarting] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const covQ = useQuery({
    queryKey: ["textbook-coverage"],
    queryFn: fetchCoverage,
    refetchInterval: 15_000,
  });

  const jobQ = useQuery({
    queryKey: ["textbook-coverage-latest-job"],
    queryFn: getLatestCampusBatch,
    refetchInterval: 5_000,
  });

  const latest = jobQ.data;
  const isTextbookJob = latest?.job?.research_mode === "textbook_only";
  const jobRunning = isTextbookJob && (latest?.job?.status === "running" || latest?.job?.status === "paused");
  const failedItems = useMemo(
    () => (isTextbookJob ? (latest?.items ?? []).filter((i) => i.status === "failed") : []),
    [latest, isTextbookJob],
  );
  const doneItems = useMemo(
    () => (isTextbookJob ? (latest?.items ?? []).filter((i) => i.status === "done") : []),
    [latest, isTextbookJob],
  );
  const lastDone = useMemo(() => doneItems.slice(-5).reverse(), [doneItems]);

  const total = covQ.data?.total ?? 0;
  const withData = covQ.data?.withData ?? 0;
  const pct = total > 0 ? Math.round((withData / total) * 100) : 0;
  const missing = Math.max(0, total - withData);

  async function handleStart() {
    if (jobRunning) {
      toast.error("A textbook batch is already running.");
      return;
    }
    if (missing === 0) {
      toast.success("Every active campus already has textbook data.");
      return;
    }
    const ok = window.confirm(
      `Run textbook research on ${missing} campus${missing === 1 ? "" : "es"} ` +
      `(every active campus with no textbook data)?\n\n` +
      `• Uses Google Books (free) + Lovable AI Gateway search.\n` +
      `• Writes back to campuses.course_family_textbooks_json (idempotent).\n` +
      `• Runs 3 campuses at a time. ~${Math.max(1, Math.ceil(missing / 3))} batches total.\n\n` +
      `Estimated cost: ~$${(missing * 0.005).toFixed(2)} in AI credits.`,
    );
    if (!ok) return;
    setStarting(true);
    try {
      await startTextbookOnlyBatch("unknown");
      // Kick the worker immediately so progress shows up right away.
      await tickCampusBatch().catch(() => {});
      toast.success(`Started textbook research on ${missing} campuses.`);
      await qc.invalidateQueries({ queryKey: ["textbook-coverage-latest-job"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start textbook batch");
    } finally {
      setStarting(false);
    }
  }

  async function handleRetryFailures() {
    if (!latest?.job?.id || !failedItems.length) return;
    setRetrying(true);
    try {
      await retryCampusBatchItems(latest.job.id);
      toast.success(`Retrying ${failedItems.length} failed campus${failedItems.length === 1 ? "" : "es"}.`);
      await qc.invalidateQueries({ queryKey: ["textbook-coverage-latest-job"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Retry failed");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <Card className="p-4 border-sky-200 bg-sky-50/40 dark:bg-sky-950/10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-[280px]">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="h-4 w-4 text-sky-600" />
            Textbook Coverage
            <span className="rounded-full bg-sky-100 text-sky-800 text-[10px] font-semibold px-2 py-0.5 border border-sky-300">
              Most important data field
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground max-w-xl">
            Every campus needs a confirmed textbook match for Intro 1/2 and
            Intermediate I/II — that's what determines whether outreach converts.
            One-click bulk research for every campus that's still blank.
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <Button
            onClick={handleStart}
            disabled={starting || covQ.isLoading || missing === 0 || jobRunning}
            size="sm"
            className="h-8 gap-1.5 bg-sky-600 hover:bg-sky-700"
          >
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {jobRunning ? "Running…" : `Backfill ${missing} campuses`}
          </Button>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">
            {withData} / {total} campuses have textbook data
          </span>
          <span className="text-muted-foreground">{pct}%</span>
        </div>
        <Progress value={pct} className="mt-1 h-2" />
      </div>

      {isTextbookJob && (
        <div className="mt-4 pt-3 border-t border-sky-200/60 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <div className="font-semibold text-sky-900">
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
              <div className="font-medium mb-1 text-sky-900/80">Recently completed:</div>
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
