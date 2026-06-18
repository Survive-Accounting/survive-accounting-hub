import { useRef, useState } from "react";
import { GraduationCap, Globe, Loader2, Wand2, FileUp, X, Plus } from "lucide-react";
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
  onStep1Click,
  flameStep,
  hideAutoDiscover = false,
  hideScrapeUrls = false,
  layout = "row",
}: {
  campusId: string;
  campusName: string;
  onScraped?: () => void;
  /** Fires after the user clicks "Copy Faculty Link" (Step #1). */
  onStep1Click?: () => void;
  /** Which step is currently flame-highlighted (1 or 2). Other values = no flame. */
  flameStep?: 1 | 2 | 3 | null;
  hideAutoDiscover?: boolean;
  hideScrapeUrls?: boolean;
  /** "row" = legacy inline; "stacked" = numbered VA-friendly checklist. */
  layout?: "row" | "stacked";
}) {

  const [expanded, setExpanded] = useState(false);
  const [urlList, setUrlList] = useState<string[]>([""]);
  const [discovering, setDiscovering] = useState(false);
  const [loadingUrls, setLoadingUrls] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrape = useServerFn(scrapeCampusFaculty);
  const discover = useServerFn(autoDiscoverCampusFaculty);
  const scrapePdf = useServerFn(scrapeCampusFacultyPdf);
  const { scraping, elapsedMs } = useScrapingCampusInfo(campusId);
  const stuck = scraping && elapsedMs > 60_000;

  const togglePanel = async () => {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    setLoadingUrls(true);
    try {
      const { data } = await supabase
        .from("campuses")
        .select("faculty_page_url")
        .eq("id", campusId)
        .maybeSingle();
      const saved = (data?.faculty_page_url ?? "")
        .split(/\r?\n/)
        .map((u) => u.trim())
        .filter(Boolean);
      // Only overwrite if user hasn't typed anything yet
      setUrlList((prev) => {
        const hasUserInput = prev.some((u) => u.trim());
        if (hasUserInput) return prev;
        return saved.length > 0 ? saved : [""];
      });
    } catch { /* ignore */ } finally {
      setLoadingUrls(false);
    }
  };

  const addUrlField = () => setUrlList((prev) => [...prev, ""]);
  const removeUrlField = (idx: number) =>
    setUrlList((prev) => (prev.length <= 1 ? [""] : prev.filter((_, i) => i !== idx)));
  const updateUrl = (idx: number, value: string) =>
    setUrlList((prev) => prev.map((u, i) => (i === idx ? value : u)));

  const copyFacultyGoogleLink = async () => {
    const q = `${campusName} accounting faculty directory`;
    const url = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Search link copied — paste in a new tab.");
    } catch {
      // Fallback: select-and-prompt
      window.prompt("Copy this link:", url);
    }
    onStep1Click?.();
  };


  const run = async () => {
    const list = urlList.map((u) => u.trim()).filter(Boolean);
    if (list.length === 0) {
      toast.error("Add at least one URL.");
      return;
    }
    if (isScrapingCampus(campusId)) {
      toast.error("Already scraping this campus — wait for it to finish.");
      return;
    }
    setExpanded(false);
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
        setUrlList(chosenUrls.length > 0 ? chosenUrls : [""]);
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

  const onPdfChosen = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    for (const file of list) {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        toast.error(`Skipped ${file.name} — not a PDF.`);
        continue;
      }
      if (file.size > 12 * 1024 * 1024) {
        toast.error(`${file.name} is larger than 12 MB — try splitting it.`);
        continue;
      }
      if (isScrapingCampus(campusId)) {
        toast.error("Already scraping this campus — wait for it to finish, then upload more.");
        break;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : "");
        fr.onerror = () => reject(fr.error ?? new Error("Could not read PDF"));
        fr.readAsDataURL(file);
      });
      const base64 = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
      if (!base64) {
        toast.error(`Could not read ${file.name}.`);
        continue;
      }
      toast.info(`Scanning ${file.name} in background…`);
      const promise = (async () => {
        try {
          const result = await scrapePdf({ data: { campusId, filename: file.name, fileBase64: base64 } });
          const extras: string[] = [];
          if (result.skippedDuplicates) extras.push(`skipped ${result.skippedDuplicates} duplicate${result.skippedDuplicates === 1 ? "" : "s"}`);
          if (result.droppedNoContact) extras.push(`${result.droppedNoContact} unusable (no name or contact)`);
          toast.success(
            `${campusName}: ${result.inserted} new candidate${result.inserted === 1 ? "" : "s"} from ${file.name} (${result.found} found)${extras.length ? ` · ${extras.join(" · ")}` : ""}.`,
          );
          onScraped?.();
        } catch (e) {
          toast.error(`${file.name} scan failed`, { description: slickErr(e) });
        }
      })();
      trackCampusScrape(campusId, promise, {
        onTimeout: () => toast.error(`${campusName} PDF scan timed out`, {
          description: "No response in 3 minutes — the job slot was released. Try again or split the PDF.",
        }),
      });
      // Wait for this one to finish before starting the next so we don't trip the single-slot guard.
      await promise;
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const copyFacultyLinkBtn = (
    <Button
      size="sm"
      variant="outline"
      onClick={copyFacultyGoogleLink}
      title="Copy a Google search link for this school's accounting faculty directory. Paste it in a new tab."
      className="gap-1.5"
    >
      <GraduationCap className="h-3.5 w-3.5" /> Copy Faculty Link
    </Button>
  );

  const scrapeUrlsBtn = (
    <Button
      size="sm"
      variant="outline"
      onClick={togglePanel}
      title="Add the faculty page URL(s) and start a scrape"
      aria-expanded={expanded}
    >
      {scraping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
      {scraping ? `Scraping… ${Math.floor(elapsedMs / 1000)}s` : "Scrape URL"}
    </Button>
  );

  const urlPanel = expanded && (
    <div className="w-full max-w-md space-y-1.5 rounded-md border border-border bg-background p-2 text-left">
      {loadingUrls && (
        <div className="text-[11px] text-muted-foreground">Loading saved URLs…</div>
      )}
      {urlList.map((u, idx) => (
        <div key={idx} className="flex items-center gap-1.5">
          <input
            type="url"
            value={u}
            onChange={(e) => updateUrl(idx, e.target.value)}
            placeholder="Paste faculty page URL"
            className="h-7 flex-1 rounded-md border border-input bg-background px-2 font-mono text-[11px]"
            autoFocus={idx === urlList.length - 1 && !u}
          />
          {urlList.length > 1 && (
            <button
              type="button"
              onClick={() => removeUrlField(idx)}
              title="Remove this URL"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={addUrlField}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3 w-3" /> Add another URL
        </button>
        <Button size="sm" onClick={run} disabled={scraping} className="h-7 gap-1.5 text-[11px]">
          <Globe className="h-3 w-3" /> Start scrape
        </Button>
      </div>
    </div>
  );

  const resetBtn = stuck && (
    <Button
      size="sm"
      variant="ghost"
      className="text-amber-700 hover:text-amber-900"
      onClick={() => {
        clearCampusScrape(campusId);
        toast.info("Cleared stuck scrape slot — you can start a new one.");
      }}
      title="The previous scrape has been running over 60s — reset the slot so you can try again"
    >
      <X className="h-3.5 w-3.5" /> Reset
    </Button>
  );

  const importPdfBtn = (
    <span className="inline-flex items-center gap-1">
      <Button
        size="sm"
        variant="outline"
        onClick={onPickPdf}
        disabled={scraping}
        title="Only use if scrape fails. Upload a PDF (e.g. print-to-PDF of the faculty page) — OCR scans for leads."
        className="gap-1.5"
      >
        <FileUp className="h-3.5 w-3.5" /> Import PDF
      </Button>
      <span
        className="cursor-help text-[10px] text-muted-foreground"
        title="Only use if scrape fails"
      >
        ⓘ
      </span>
    </span>
  );

  const hiddenFileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="application/pdf,.pdf"
      multiple
      className="hidden"
      onChange={(e) => onPdfChosen(e.target.files)}
    />
  );

  return (
    <>
      {layout === "stacked" ? (
        <div className="flex flex-col items-center gap-2">
          {!hideAutoDiscover && (
            <Button size="sm" variant="default" onClick={runAutoDiscover} disabled={discovering} title="Use Firecrawl to map this campus's site, pick faculty pages automatically, and extract candidates">
              {discovering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {discovering ? "Discovering…" : "Auto-discover faculty"}
            </Button>
          )}
          {!hideScrapeUrls && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Step #1</span>
                {copyFacultyLinkBtn}
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Step #2 · Paste Scrape URL</span>
                  {scrapeUrlsBtn}
                  {resetBtn}
                </div>
                {urlPanel}
              </div>
              <button
                type="button"
                onClick={onPickPdf}
                disabled={scraping}
                title="Rarely needed. Upload one or more PDFs (e.g. print-to-PDF of the faculty page) — OCR scans for leads."
                className="mt-4 inline-flex items-center gap-1 text-[11px] italic text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground disabled:opacity-50"
              >
                Scrape failed? <span className="not-italic">Import Website PDFs</span>
              </button>
              {hiddenFileInput}
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {!hideAutoDiscover && (
              <Button size="sm" variant="default" onClick={runAutoDiscover} disabled={discovering} title="Use Firecrawl to map this campus's site, pick faculty pages automatically, and extract candidates">
                {discovering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                {discovering ? "Discovering…" : "Auto-discover faculty"}
              </Button>
            )}
            {!hideScrapeUrls && (
              <>
                {scrapeUrlsBtn}
                {resetBtn}
                {copyFacultyLinkBtn}
                {importPdfBtn}
                {hiddenFileInput}
              </>
            )}
          </div>
          {!hideScrapeUrls && urlPanel}
        </div>
      )}
    </>
  );
}
