// "🤖 Auto scrape" — one-click test of the SerpAPI → Firecrawl → RMP flow.
// Discovers faculty + RMP URLs via SerpAPI on the server, then kicks off
// the existing scrapeCampusFaculty + scrapeCampusRmp server fns in
// parallel and wires each into the HUD via startScrapeJob.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { autoDiscoverCampusUrls } from "@/lib/auto-scrape.functions";
import { scrapeCampusFaculty } from "@/lib/faculty-scrape.functions";
import { scrapeCampusRmp } from "@/lib/rmp-scrape.functions";
import { startScrapeJob } from "@/lib/scrape-jobs";

function shortErr(e: unknown, fb = "failed"): string {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : fb;
  return raw.replace(/\s+/g, " ").trim().slice(0, 180) || fb;
}

export function AutoScrapeButton({
  campusId,
  campusName,
  onScraped,
}: {
  campusId: string;
  campusName: string;
  onScraped?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const discover = useServerFn(autoDiscoverCampusUrls);
  const facultyFn = useServerFn(scrapeCampusFaculty);
  const rmpFn = useServerFn(scrapeCampusRmp);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      toast.message("🤖 Auto-discovering URLs…", { description: campusName });
      const found = await discover({ data: { campusId } });
      if (found.notes.length) console.log("[auto-scrape notes]", found.notes);
      if (found.facultyUrls.length === 0 && !found.rmpUrl) {
        toast.error("SerpAPI returned no usable URLs. " + (found.notes[0] ?? ""));
        return;
      }
      toast.success(
        `Found ${found.facultyUrls.length} faculty URL${found.facultyUrls.length === 1 ? "" : "s"}` +
          (found.rmpUrl ? " + RMP school page" : " (no RMP)"),
      );

      const tasks: Promise<unknown>[] = [];

      if (found.facultyUrls.length > 0) {
        const job = startScrapeJob({ campusId, campusName, kind: "faculty" });
        tasks.push(
          facultyFn({ data: { campusId, urls: found.facultyUrls } })
            .then((r) => {
              const ins = (r as { inserted?: number } | null)?.inserted ?? 0;
              const dup = (r as { skippedDuplicates?: number } | null)?.skippedDuplicates ?? 0;
              job.succeed(`+${ins} new (${dup} dup) from ${found.facultyUrls.length} url${found.facultyUrls.length === 1 ? "" : "s"}`);
            })
            .catch((e) => job.fail(shortErr(e))),
        );
      }

      if (found.rmpUrl) {
        const job = startScrapeJob({ campusId, campusName, kind: "rmp" });
        const rmpUrl = found.rmpUrl;
        tasks.push(
          rmpFn({ data: { campusId, urls: [rmpUrl] } })
            .then((r) => {
              const matched = (r as { matched?: number } | null)?.matched ?? 0;
              const found2 = (r as { found?: number } | null)?.found ?? 0;
              job.succeed(`matched ${matched}/${found2} accounting profs`);
            })
            .catch((e) => job.fail(shortErr(e))),
        );
      }

      await Promise.all(tasks);
      onScraped?.();
      toast.success("Auto-scrape complete");
    } catch (e) {
      toast.error(shortErr(e, "Auto-scrape failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
      title="Test: SerpAPI finds faculty + RMP URLs, then Firecrawl + RMP run automatically"
    >
      {busy ? "🤖 Auto-scraping…" : "🤖 Auto scrape (test)"}
    </button>
  );
}

export default AutoScrapeButton;
