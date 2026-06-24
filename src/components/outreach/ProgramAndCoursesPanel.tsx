// ProgramAndCoursesPanel — narrow batch: program name + course codes/titles
// for all active campuses (Intro 1/2, Intermediate I/II).
//
// Orchestrated CLIENT-SIDE here (small concurrency pool), reusing the same
// approach as BatchScrapePanel. Calls the Vercel server fn
// `researchProgramCourses` per campus — SerpAPI → Firecrawl → AI Gateway,
// fully off Lovable. Keep this tab open while it runs.
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GraduationCap, Loader2, Play, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { researchProgramCourses } from "@/lib/program-courses.functions";

const FAMS = ["intro_1", "intro_2", "intermediate_1", "intermediate_2"] as const;
const CONCURRENCY = 4;

type CampusRow = { id: string; name: string };
type ItemStatus = "pending" | "running" | "done" | "failed";
type RunItem = { id: string; name: string; status: ItemStatus; added?: number; reason?: string };

async function fetchCoverage(): Promise<{ total: number; withData: number; campuses: CampusRow[] }> {
  const { data, error } = await supabase
    .from("campuses")
    .select("id, name, archived_at, approval_status, accounting_department_name, course_family_codes_json, course_family_titles_json");
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    id: string;
    name: string;
    archived_at: string | null;
    approval_status: string | null;
    accounting_department_name: string | null;
    course_family_codes_json: Record<string, string> | null;
    course_family_titles_json: Record<string, string> | null;
  }>;
  // Active = not archived and not a needs_review candidate (those are net-new,
  // not part of the live campaign set yet).
  const active = rows.filter((r) => !r.archived_at && r.approval_status !== "needs_review");
  let withData = 0;
  for (const r of active) {
    const codes = r.course_family_codes_json ?? {};
    const titles = r.course_family_titles_json ?? {};
    const hasAll =
      !!r.accounting_department_name &&
      FAMS.every((f) => (codes as Record<string, unknown>)[f] || (titles as Record<string, unknown>)[f]);
    if (hasAll) withData++;
  }
  return { total: active.length, withData, campuses: active.map((r) => ({ id: r.id, name: r.name })) };
}

export function ProgramAndCoursesPanel() {
  const [running, setRunning] = useState(false);
  const [items, setItems] = useState<RunItem[]>([]);
  const cancelRef = useRef(false);

  const research = useServerFn(researchProgramCourses);

  const covQ = useQuery({
    queryKey: ["program-courses-coverage"],
    queryFn: fetchCoverage,
    refetchInterval: running ? false : 15_000,
  });

  const total = covQ.data?.total ?? 0;
  const withData = covQ.data?.withData ?? 0;
  const pct = total > 0 ? Math.round((withData / total) * 100) : 0;

  const doneCount = useMemo(() => items.filter((i) => i.status === "done").length, [items]);
  const failedItems = useMemo(() => items.filter((i) => i.status === "failed"), [items]);
  const lastDone = useMemo(
    () => items.filter((i) => i.status === "done").slice(-6).reverse(),
    [items],
  );

  function setItem(id: string, patch: Partial<RunItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function runOver(targets: CampusRow[]) {
    setRunning(true);
    cancelRef.current = false;
    setItems(targets.map((c) => ({ id: c.id, name: c.name, status: "pending" as ItemStatus })));

    let cursor = 0;
    async function worker() {
      while (cursor < targets.length && !cancelRef.current) {
        const c = targets[cursor++];
        setItem(c.id, { status: "running" });
        try {
          const res = (await research({ data: { campusId: c.id, force: true } })) as {
            success?: boolean; families_added?: string[]; reason?: string;
          };
          if (res?.success) {
            setItem(c.id, { status: "done", added: res.families_added?.length ?? 0 });
          } else {
            setItem(c.id, { status: "failed", reason: res?.reason ?? "no data found" });
          }
        } catch (e) {
          setItem(c.id, { status: "failed", reason: (e as Error)?.message ?? "error" });
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
    setRunning(false);
    await covQ.refetch();
    if (!cancelRef.current) toast.success("Program + courses run complete.");
  }

  async function handleStart() {
    if (running) return;
    const campuses = covQ.data?.campuses ?? [];
    if (!campuses.length) { toast.error("No active campuses found."); return; }
    const ok = window.confirm(
      `Run program + course research on all ${campuses.length} active campuses?\n\n` +
      `• Finds accounting department/program name.\n` +
      `• Finds course codes + full titles for Intro 1/2 and Intermediate I/II.\n` +
      `• Overwrites existing values (force).\n` +
      `• SerpAPI → Firecrawl → AI Gateway (no Lovable).\n\n` +
      `Estimated cost: ~$${(campuses.length * 0.01).toFixed(2)} in AI + scrape credits.`,
    );
    if (!ok) return;
    await runOver(campuses);
  }

  async function handleRetryFailures() {
    if (running || failedItems.length === 0) return;
    const byId = new Map((covQ.data?.campuses ?? []).map((c) => [c.id, c]));
    const targets = failedItems.map((f) => byId.get(f.id) ?? { id: f.id, name: f.name });
    await runOver(targets);
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
            One-click batch over all active campuses. Pulls the accounting
            program/department name and the course code + full title for
            Intro 1/2 and Intermediate I/II from the live catalog. Skips leads,
            terms, textbooks.
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <Button
            onClick={handleStart}
            disabled={running || covQ.isLoading || total === 0}
            size="sm"
            className="h-8 gap-1.5 bg-violet-600 hover:bg-violet-700"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? "Running…" : `Run on ${total} campuses`}
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

      {items.length > 0 && (
        <div className="mt-4 pt-3 border-t border-violet-200/60 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <div className="font-semibold text-violet-900">
              {running ? "Running" : "Last run"}: {doneCount}/{items.length} done
              {failedItems.length > 0 && (
                <span className="ml-1 text-red-700">· {failedItems.length} failed</span>
              )}
            </div>
            {!running && failedItems.length > 0 && (
              <Button
                onClick={handleRetryFailures}
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-[11px]"
              >
                <RotateCcw className="h-3 w-3" />
                Retry {failedItems.length} failed
              </Button>
            )}
          </div>
          {lastDone.length > 0 && (
            <div className="text-[11px] text-muted-foreground">
              <div className="font-medium mb-1 text-violet-900/80">Recently completed:</div>
              <ul className="space-y-0.5">
                {lastDone.map((it) => (
                  <li key={it.id} className="truncate">
                    ✓ {it.name} {it.added ? <span className="text-violet-700">(+{it.added})</span> : <span className="text-muted-foreground">(no change)</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!running && failedItems.length > 0 && (
            <div className="text-[11px] text-red-700/80">
              <div className="font-medium mb-1">Failed:</div>
              <ul className="space-y-0.5">
                {failedItems.slice(0, 8).map((it) => (
                  <li key={it.id} className="truncate">✗ {it.name} — {it.reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
