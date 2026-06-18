import { useState } from "react";
import { GraduationCap, Globe, Loader2, Wand2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { scrapeCampusFaculty, autoDiscoverCampusFaculty } from "@/lib/faculty-scrape.functions";
import {
  isScrapingCampus,
  trackCampusScrape,
  useIsScrapingCampus,
} from "@/lib/faculty-scrape-queue";

export function ScrapeFacultyButton({
  campusId,
  campusName,
  onScraped,
  hideAutoDiscover = false,
  hideScrapeUrls = false,
}: {
  campusId: string;
  campusName: string;
  onScraped?: () => void;
  hideAutoDiscover?: boolean;
  hideScrapeUrls?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [urls, setUrls] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [loadingUrls, setLoadingUrls] = useState(false);
  const scrape = useServerFn(scrapeCampusFaculty);
  const discover = useServerFn(autoDiscoverCampusFaculty);
  const scraping = useIsScrapingCampus(campusId);

  const openModal = async () => {
    setOpen(true);
    setLoadingUrls(true);
    try {
      const { data } = await supabase
        .from("campuses")
        .select("faculty_page_url")
        .eq("id", campusId)
        .maybeSingle();
      if (data?.faculty_page_url) setUrls(data.faculty_page_url);
    } catch { /* ignore */ } finally {
      setLoadingUrls(false);
    }
  };

  const openFacultyGoogle = () => {
    const q = `${campusName} accounting faculty directory`;
    window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, "_blank", "noopener,noreferrer");
  };

  const run = async () => {
    const list = urls
      .split(/\r?\n/)
      .map((u) => u.trim())
      .filter(Boolean);
    if (list.length === 0) {
      toast.error("Paste at least one URL.");
      return;
    }
    if (isScrapingCampus(campusId)) {
      toast.error("Already scraping this campus — wait for it to finish.");
      return;
    }
    setOpen(false);
    toast.info(`Scraping ${campusName} in background…`);
    const promise = (async () => {
      try {
        const result = await scrape({ data: { campusId, urls: list } });
        const errors = result.perPage.filter((p) => p.error);
        if (errors.length > 0) {
          toast.warning(
            `${campusName}: ${result.perPage.length - errors.length}/${result.perPage.length} pages scraped. ${result.inserted} new candidates. ${errors.length} URL(s) failed.`,
          );
        } else {
          toast.success(
            `${campusName}: ${result.inserted} new candidates from ${result.perPage.length} page(s).${result.skippedDuplicates ? ` Skipped ${result.skippedDuplicates} duplicates.` : ""}`,
          );
        }
        onScraped?.();
      } catch (e) {
        toast.error(`${campusName} scrape failed: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    })();
    trackCampusScrape(campusId, promise);
  };

  const runAutoDiscover = async () => {
    setDiscovering(true);
    try {
      const result = await discover({ data: { campusId, maxPages: 5 } });
      const chosenUrls = result?.chosenUrls ?? [];
      const perPage = result?.perPage ?? [];
      if (chosenUrls.length > 0) {
        setUrls(chosenUrls.join("\n"));
      }
      const errs = perPage.filter((p) => p.error);
      const summary = `Firecrawl mapped ${result?.discovered ?? 0} links → scraped ${result?.scraped ?? 0} faculty pages → added ${result?.inserted ?? 0} candidates${result?.skippedDuplicates ? ` (skipped ${result.skippedDuplicates} dupes)` : ""}${errs.length ? `, ${errs.length} page error(s)` : ""}.`;
      if ((result?.inserted ?? 0) === 0) {
        toast.warning(summary, {
          description: chosenUrls.length > 0
            ? `Pages tried:\n${chosenUrls.join("\n")}`
            : "No usable faculty pages found. Try 'Scrape URLs' with a hand-picked URL.",
          duration: 15000,
        });
      } else {
        toast.success(summary, {
          description: `Pages: ${chosenUrls.slice(0, 3).join(", ")}${chosenUrls.length > 3 ? "…" : ""}`,
          duration: 10000,
        });
      }
      onScraped?.();
    } catch (e) {
      toast.error(`Auto-discover failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setDiscovering(false);
    }
  };

  return (
    <>
      <div className="flex gap-2">
        {!hideAutoDiscover && (
          <Button size="sm" variant="default" onClick={runAutoDiscover} disabled={discovering} title="Use Firecrawl to map this campus's site, pick faculty pages automatically, and extract candidates">
            {discovering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            {discovering ? "Discovering…" : "Auto-discover faculty"}
          </Button>
        )}
        {!hideScrapeUrls && (
          <>
            <Button size="sm" variant="outline" onClick={openModal} title="Paste specific URLs to scrape">
              {scraping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
              {scraping ? "Scraping…" : "Scrape URLs"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={openFacultyGoogle}
              title="Open Google search for this school's accounting faculty directory"
              aria-label="Open Google faculty search"
            >
              <GraduationCap className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>

      <Dialog open={open} onOpenChange={(v) => setOpen(v)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Scrape faculty pages — {campusName}</DialogTitle>
            <DialogDescription className="pt-1">
              Paste one URL per line. Include each filter/tab as its own line
              (e.g. <code>?role=instructor</code>, <code>?role=staff</code>) so
              non-tenure-track folks aren't missed. Pages are fetched via Firecrawl in the background.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            rows={6}
            placeholder={loadingUrls ? "Loading saved URLs…" : "https://accountancy.example.edu/faculty\nhttps://accountancy.example.edu/faculty?role=instructor"}
            className="font-mono text-xs"
          />
          <div className="text-[11px] text-muted-foreground">
            Names without an email or profile URL are dropped (no pattern-guessing). Results land in the triage table below — nothing is added to the email queue until you import. Scrape runs in the background so you can move to the next campus immediately.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={run}>
              <Globe className="h-3.5 w-3.5" /> Start scrape in background
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
