// "🤖 Auto scrape" — one-click test of the SerpAPI → Firecrawl → RMP flow,
// with a dropdown that exposes a "View logs" debug panel for the most
// recent run. The full structured RunLog is persisted to localStorage
// (per campus) so you can copy/paste a debug bundle back into chat.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, ChevronDown, Clipboard, FileText, Play, X } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { autoDiscoverCampusUrls } from "@/lib/auto-scrape.functions";
import { scrapeCampusFaculty } from "@/lib/faculty-scrape.functions";
import { scrapeCampusRmp } from "@/lib/rmp-scrape.functions";
import { startScrapeJob } from "@/lib/scrape-jobs";
import { clearScrapeLog, pushScrapeLog } from "@/lib/scrape-console";

type StepStatus = "pending" | "running" | "ok" | "warn" | "error" | "skipped";
type Step = {
  key: string;
  label: string;
  status: StepStatus;
  startedAt: number;
  finishedAt?: number;
  summary?: string;
  error?: string;
  data?: unknown;
};
type RunLog = {
  campusId: string;
  campusName: string;
  startedAt: number;
  finishedAt?: number;
  overallStatus: StepStatus;
  steps: Step[];
  userAgent?: string;
};

const LOG_KEY = (campusId: string) => `sa-auto-scrape-log:${campusId}`;

function shortErr(e: unknown, fb = "failed"): string {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : fb;
  return raw.replace(/\s+/g, " ").trim().slice(0, 400) || fb;
}

function readLog(campusId: string): RunLog | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(LOG_KEY(campusId));
    return v ? (JSON.parse(v) as RunLog) : null;
  } catch { return null; }
}
function writeLog(log: RunLog) {
  try { window.localStorage.setItem(LOG_KEY(log.campusId), JSON.stringify(log)); }
  catch { /* ignore */ }
}

function statusDot(s: StepStatus) {
  const cls =
    s === "ok" ? "bg-emerald-500"
    : s === "warn" ? "bg-amber-500"
    : s === "error" ? "bg-red-500"
    : s === "running" ? "bg-blue-500 animate-pulse"
    : s === "skipped" ? "bg-zinc-400"
    : "bg-zinc-300";
  return <span className={`inline-block h-2 w-2 rounded-full ${cls}`} />;
}

function fmtMs(ms?: number) { return ms == null ? "—" : `${ms} ms`; }

function buildBundle(log: RunLog): string {
  const lines: string[] = [];
  lines.push("=== AUTO-SCRAPE DEBUG BUNDLE ===");
  lines.push(`Campus:   ${log.campusName} (${log.campusId})`);
  lines.push(`Started:  ${new Date(log.startedAt).toISOString()}`);
  lines.push(`Finished: ${log.finishedAt ? new Date(log.finishedAt).toISOString() : "(in progress)"}`);
  lines.push(`Status:   ${log.overallStatus.toUpperCase()}`);
  if (log.userAgent) lines.push(`UA:       ${log.userAgent}`);
  lines.push("");
  for (const s of log.steps) {
    const dur = s.finishedAt ? `${s.finishedAt - s.startedAt}ms` : "(unfinished)";
    lines.push(`-- ${s.label}  [${s.status.toUpperCase()}] (${dur})`);
    if (s.summary) lines.push(`   ${s.summary}`);
    if (s.error) lines.push(`   ERROR: ${s.error}`);
    if (s.data !== undefined) {
      try {
        const pretty = JSON.stringify(s.data, null, 2).split("\n").map((l) => `   ${l}`).join("\n");
        lines.push(pretty);
      } catch { /* ignore */ }
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function AutoScrapeButton({
  campusId,
  campusName,
  onScraped,
  exposeApi,
}: {
  campusId: string;
  campusName: string;
  onScraped?: () => void;
  /** Lets the parent grab a stable trigger + busy state to render its own start button elsewhere. */
  exposeApi?: (api: { start: () => void; busy: boolean }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<RunLog | null>(null);
  const [open, setOpen] = useState(false);
  const discover = useServerFn(autoDiscoverCampusUrls);
  const facultyFn = useServerFn(scrapeCampusFaculty);
  const rmpFn = useServerFn(scrapeCampusRmp);

  useEffect(() => { setLog(readLog(campusId)); }, [campusId]);

  const persist = (next: RunLog) => {
    setLog({ ...next, steps: [...next.steps] });
    writeLog(next);
  };

  const handleRun = async () => {
    if (busy) return;
    setBusy(true);
    clearScrapeLog(campusId);
    pushScrapeLog(campusId, "info", `// boot · campus="${campusName}"`);
    pushScrapeLog(campusId, "cmd", `$ scrape.run --campus ${campusId}`);
    const run: RunLog = {
      campusId,
      campusName,
      startedAt: Date.now(),
      overallStatus: "running",
      steps: [],
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    };
    const pushStep = (s: Step) => { run.steps.push(s); persist(run); return s; };
    const finishStep = (s: Step, patch: Partial<Step>) => {
      Object.assign(s, patch, { finishedAt: Date.now() });
      persist(run);
    };

    try {
      toast.message("🤖 Auto-discovering URLs…", { description: campusName });
      pushScrapeLog(campusId, "code", `import { discover } from "serpapi"`);
      pushScrapeLog(campusId, "cmd", `→ discover.urls({ campus: "${campusName}" })`);

      // Step 1: discover
      const s1 = pushStep({ key: "discover", label: "1. SerpAPI URL discovery", status: "running", startedAt: Date.now() });
      let found: Awaited<ReturnType<typeof discover>>;
      try {
        found = await discover({ data: { campusId } });
      } catch (e) {
        finishStep(s1, { status: "error", error: shortErr(e) });
        pushScrapeLog(campusId, "error", `✗ discovery failed: ${shortErr(e)}`);
        run.overallStatus = "error";
        run.finishedAt = Date.now();
        persist(run);
        toast.error("Discovery failed: " + shortErr(e));
        return;
      }
      const noUrls = found.facultyUrls.length === 0 && !found.rmpUrl;
      finishStep(s1, {
        status: noUrls ? "error" : (found.notes.length ? "warn" : "ok"),
        summary: `${found.facultyUrls.length} faculty url(s), rmp=${found.rmpUrl ? "yes" : "no"}`,
        data: {
          domains: found.domains,
          facultyQuery: found.facultyQuery,
          rmpQuery: found.rmpQuery,
          facultyUrls: found.facultyUrls,
          rmpUrl: found.rmpUrl,
          facultyMs: found.facultyMs,
          rmpMs: found.rmpMs,
          notes: found.notes,
          topFacultyResults: found.facultyResults,
          topRmpResults: found.rmpResults,
        },
      });
      pushScrapeLog(campusId, "info", `  q: ${found.facultyQuery}`);
      for (const u of found.facultyUrls.slice(0, 6)) {
        pushScrapeLog(campusId, "net", `  ✓ GET ${u}`);
      }
      if (found.rmpUrl) pushScrapeLog(campusId, "net", `  ✓ rmp: ${found.rmpUrl}`);
      pushScrapeLog(campusId, "ok", `← ${found.facultyUrls.length} faculty url(s) · rmp=${found.rmpUrl ? "yes" : "no"} (${found.facultyMs}ms)`);

      if (noUrls) {
        pushScrapeLog(campusId, "error", `✗ no usable URLs — aborting`);
        run.overallStatus = "error";
        run.finishedAt = Date.now();
        persist(run);
        toast.error("SerpAPI returned no usable URLs. " + (found.notes[0] ?? ""));
        return;
      }

      toast.success(
        `Found ${found.facultyUrls.length} faculty URL${found.facultyUrls.length === 1 ? "" : "s"}` +
          (found.rmpUrl ? " + RMP school page" : " (no RMP)"),
      );

      // Step 2: faculty scrape — MUST complete before RMP so the directory
      // markdown is cached in `faculty_scrape_cache`. RMP's reverse-lookup
      // step reads that cache to recover names that didn't match a
      // forward-extracted lead.
      if (found.facultyUrls.length > 0) {
        const s2 = pushStep({ key: "faculty", label: "2. Firecrawl + parse faculty", status: "running", startedAt: Date.now() });
        const job = startScrapeJob({ campusId, campusName, kind: "faculty" });
        try {
          const r = await facultyFn({ data: { campusId, urls: found.facultyUrls, allowNoContact: true } });
          const obj = (r ?? {}) as Record<string, unknown>;
          const ins = typeof obj.inserted === "number" ? obj.inserted : 0;
          const dup = typeof obj.skippedDuplicates === "number" ? obj.skippedDuplicates : 0;
          const dropped = typeof obj.droppedNoContact === "number" ? obj.droppedNoContact : 0;
          const perPage = Array.isArray(obj.perPage) ? obj.perPage as Array<Record<string, unknown>> : [];
          const extracted = perPage.reduce((a, p) => a + (typeof p.extracted === "number" ? p.extracted : 0), 0);
          const slugMatched = perPage.reduce((a, p) => a + (typeof p.slugMatched === "number" ? p.slugMatched : 0), 0);
          const enriched = perPage.reduce((a, p) => a + (typeof p.enriched === "number" ? p.enriched : 0), 0);
          const status: StepStatus = ins > 0 ? "ok" : "warn";
          const summary =
            `+${ins} new (${dup} dup, ${dropped} no-contact) · ` +
            `AI extracted ${extracted}, slug-matched ${slugMatched} profile url(s), enriched ${enriched} email(s)`;
          finishStep(s2, { status, summary, data: r });
          job.succeed(`+${ins} new (${dup} dup, ${dropped} dropped)`);
        } catch (e) {
          finishStep(s2, { status: "error", error: shortErr(e) });
          job.fail(shortErr(e));
        }
      } else {
        pushStep({ key: "faculty", label: "2. Firecrawl + parse faculty", status: "skipped", startedAt: Date.now(), finishedAt: Date.now(), summary: "No faculty URLs to scrape" });
      }

      // Step 3: RMP scrape (runs AFTER faculty so reverse-lookup has cache)
      if (found.rmpUrl) {
        const s3 = pushStep({ key: "rmp", label: "3. RMP school scrape + match", status: "running", startedAt: Date.now() });
        const job = startScrapeJob({ campusId, campusName, kind: "rmp" });
        const rmpUrl = found.rmpUrl;
        try {
          const r = await rmpFn({ data: { campusId, urls: [rmpUrl] } });
          const obj = (r ?? {}) as Record<string, unknown>;
          const matched = typeof obj.totalMatched === "number" ? obj.totalMatched : 0;
          const found2 = typeof obj.totalFound === "number" ? obj.totalFound : 0;
          const reverseInserted = typeof obj.reverseInserted === "number" ? obj.reverseInserted : 0;
          const reverseAttempted = typeof obj.reverseAttempted === "number" ? obj.reverseAttempted : 0;
          const cachedPages = typeof obj.cachedPages === "number" ? obj.cachedPages : 0;
          const status: StepStatus = matched > 0 ? "ok" : "warn";
          const summary =
            `matched ${matched}/${found2} profs from RMP` +
            (reverseAttempted > 0
              ? ` · reverse-lookup: +${reverseInserted}/${reverseAttempted} new from ${cachedPages} cached page(s)`
              : ` · no reverse lookup (cachedPages=${cachedPages})`);
          finishStep(s3, { status, summary, data: r });
          job.succeed(summary);
        } catch (e) {
          finishStep(s3, { status: "error", error: shortErr(e) });
          job.fail(shortErr(e));
        }
      } else {
        pushStep({ key: "rmp", label: "3. RMP school scrape + match", status: "skipped", startedAt: Date.now(), finishedAt: Date.now(), summary: "No RMP URL discovered" });
      }


      const anyError = run.steps.some((s) => s.status === "error");
      const anyWarn = run.steps.some((s) => s.status === "warn");
      run.overallStatus = anyError ? "error" : anyWarn ? "warn" : "ok";
      run.finishedAt = Date.now();
      persist(run);

      onScraped?.();
      if (anyError) toast.error("Auto-scrape finished with errors — open View logs.");
      else if (anyWarn) toast.warning("Auto-scrape finished with warnings — open View logs.");
      else toast.success("Auto-scrape complete");
    } catch (e) {
      run.overallStatus = "error";
      run.finishedAt = Date.now();
      run.steps.push({ key: "fatal", label: "Fatal", status: "error", startedAt: Date.now(), finishedAt: Date.now(), error: shortErr(e) });
      persist(run);
      toast.error(shortErr(e, "Auto-scrape failed"));
    } finally {
      setBusy(false);
    }
  };

  // Surface a stable trigger so parents (e.g. the empty-state "Start Scrape"
  // button in FacultyTriagePanel) can kick off the same flow.
  useEffect(() => {
    exposeApi?.({ start: () => { void handleRun(); }, busy });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, campusId, exposeApi]);



  const copyBundle = async () => {
    if (!log) return;
    const text = buildBundle(log);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Debug bundle copied to clipboard");
    } catch {
      window.prompt("Copy the debug bundle:", text);
    }
  };

  const hasLog = !!log;
  const overallColor =
    log?.overallStatus === "ok" ? "text-emerald-600"
    : log?.overallStatus === "warn" ? "text-amber-600"
    : log?.overallStatus === "error" ? "text-red-600"
    : "text-muted-foreground";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={busy}
            className="inline-flex items-center gap-1 text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            title="Test: SerpAPI finds faculty + RMP URLs, then Firecrawl + RMP run automatically"
          >
            <Bot className="h-3.5 w-3.5" />
            {busy ? "Auto-scraping…" : "Auto scrape (test)"}
            <ChevronDown className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); void handleRun(); }} disabled={busy}>
            <Play className="h-3.5 w-3.5" /> Initiate
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => { e.preventDefault(); if (hasLog) setOpen(true); }}
            disabled={!hasLog}
            className={!hasLog ? "opacity-50" : ""}
          >
            <FileText className="h-3.5 w-3.5" /> View logs
            {log && <span className={`ml-auto text-[10px] uppercase ${overallColor}`}>{log.overallStatus}</span>}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-4 w-4" /> Auto-scrape logs — {log?.campusName ?? campusName}
            </DialogTitle>
          </DialogHeader>

          {log ? (
            <div className="space-y-3 text-xs">
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-1.5">
                  {statusDot(log.overallStatus)}
                  <span className={`font-semibold uppercase tracking-wide ${overallColor}`}>{log.overallStatus}</span>
                </div>
                <div className="text-muted-foreground">
                  Started {new Date(log.startedAt).toLocaleTimeString()}
                  {log.finishedAt && ` · took ${log.finishedAt - log.startedAt} ms`}
                </div>
                <div className="ml-auto">
                  <Button size="sm" variant="outline" onClick={copyBundle} className="h-7 gap-1.5 text-[11px]">
                    <Clipboard className="h-3 w-3" /> Copy debug bundle
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                {log.steps.map((s, idx) => (
                  <Collapsible key={`${s.key}-${idx}`} defaultOpen={s.status === "error" || s.status === "warn"}>
                    <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-left hover:bg-accent/40">
                      {statusDot(s.status)}
                      <span className="font-medium">{s.label}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">
                        {s.finishedAt ? `${s.finishedAt - s.startedAt} ms` : fmtMs()}
                      </span>
                      {s.summary && (
                        <span className="ml-2 truncate text-muted-foreground">{s.summary}</span>
                      )}
                      <ChevronDown className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="space-y-1.5 rounded-b-md border border-t-0 border-border bg-muted/20 px-3 py-2">
                        {s.error && (
                          <div className="rounded border border-red-300 bg-red-50 px-2 py-1.5 font-mono text-[11px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
                            {s.error}
                          </div>
                        )}
                        {s.data !== undefined && (
                          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded border border-border bg-background px-2 py-1.5 font-mono text-[10.5px] leading-snug">
{JSON.stringify(s.data, null, 2)}
                          </pre>
                        )}
                        {!s.error && s.data === undefined && (
                          <div className="italic text-muted-foreground">No additional details.</div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <X className="h-3.5 w-3.5" /> No auto-scrape has been run yet for this campus.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AutoScrapeButton;
