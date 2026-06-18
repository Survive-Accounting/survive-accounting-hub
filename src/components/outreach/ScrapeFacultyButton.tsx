import { useRef, useState } from "react";
import { GraduationCap, Globe, Loader2, Wand2, FileUp, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  scrapeCampusFaculty,
  autoDiscoverCampusFaculty,
  scrapeCampusFacultyPdf,
} from "@/lib/faculty-scrape.functions";
import {
  isScrapingCampus,
  trackCampusScrape,
  useScrapingCampusInfo,
  clearCampusScrape,
} from "@/lib/faculty-scrape-queue";

// Slim a raw error message into something short and human for a toast.
function slickErr(e: unknown, fallback = "unknown error"): string {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : fallback;
  // Strip noisy prefixes / huge JSON dumps; cap length.
  return raw.replace(/\s+/g, " ").trim().slice(0, 180) || fallback;
}

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrape = useServerFn(scrapeCampusFaculty);
  const discover = useServerFn(autoDiscoverCampusFaculty);
  const scrapePdf = useServerFn(scrapeCampusFacultyPdf);
  const { scraping, elapsedMs } = useScrapingCampusInfo(campusId);
  const stuck = scraping && elapsedMs > 60_000;

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
        toast.error(`${campusName} scrape failed`, { description: slickErr(e) });
      }
    })();
    trackCampusScrape(campusId, promise, {
      onTimeout: () => toast.error(`${campusName} scrape timed out`, {
        description: "No response in 3 minutes — the job slot was released. Try again or use PDF upload.",
      }),
    });
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
      toast.error("Auto-discover failed", { description: slickErr(e) });
    } finally {
      setDiscovering(false);
    }
  };

  const onPickPdf = () => fileInputRef.current?.click();

  const onPdfChosen = async (file: File | null) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Please choose a .pdf file.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast.error("PDF is larger than 12 MB — try splitting it.");
      return;
    }
    if (isScrapingCampus(campusId)) {
      toast.error("Already scraping this campus — wait for it to finish.");
      return;
    }
    // Read as base64 (strip data:...;base64, prefix)
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : "");
      fr.onerror = () => reject(fr.error ?? new Error("Could not read PDF"));
      fr.readAsDataURL(file);
    });
    const base64 = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
    if (!base64) {
      toast.error("Could not read PDF.");
      return;
    }
    toast.info(`Scanning ${file.name} in background…`);
    const promise = (async () => {
      try {
        const result = await scrapePdf({ data: { campusId, filename: file.name, fileBase64: base64 } });
        toast.success(
          `${campusName}: ${result.inserted} new candidate${result.inserted === 1 ? "" : "s"} from ${file.name} (${result.found} found).${result.skippedDuplicates ? ` Skipped ${result.skippedDuplicates} duplicates.` : ""}`,
        );
        onScraped?.();
      } catch (e) {
        toast.error(`PDF scan failed: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    })();
    trackCampusScrape(campusId, promise);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
            <Button
              size="sm"
              variant="outline"
              onClick={onPickPdf}
              disabled={scraping}
              title="Upload a PDF (e.g. print-to-PDF of a faculty page) — OCR scans for leads"
              aria-label="Upload faculty PDF"
            >
              <FileUp className="h-3.5 w-3.5" />
              PDF
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => onPdfChosen(e.target.files?.[0] ?? null)}
            />
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
