import { useState } from "react";
import { Globe, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { scrapeCampusFaculty } from "@/lib/faculty-scrape.functions";

export function ScrapeFacultyButton({
  campusId,
  campusName,
  onScraped,
}: {
  campusId: string;
  campusName: string;
  onScraped?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [urls, setUrls] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingUrls, setLoadingUrls] = useState(false);
  const scrape = useServerFn(scrapeCampusFaculty);

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

  const run = async () => {
    const list = urls
      .split(/\r?\n/)
      .map((u) => u.trim())
      .filter(Boolean);
    if (list.length === 0) {
      toast.error("Paste at least one URL.");
      return;
    }
    setBusy(true);
    try {
      const result = await scrape({ data: { campusId, urls: list } });
      const errors = result.perPage.filter((p) => p.error);
      if (errors.length > 0) {
        toast.warning(
          `Scraped ${result.perPage.length - errors.length}/${result.perPage.length} pages. ${result.inserted} new candidates added. ${errors.length} URL(s) failed.`,
        );
      } else {
        toast.success(
          `Found ${result.inserted} new candidates from ${result.perPage.length} page(s). ${result.skippedDuplicates ? `Skipped ${result.skippedDuplicates} duplicates.` : ""}`,
        );
      }
      setOpen(false);
      onScraped?.();
    } catch (e) {
      toast.error(`Scrape failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={openModal} className="justify-center" title="Fetch this campus's faculty/instructor pages and extract candidates">
        <Globe className="h-3.5 w-3.5" />
        Scrape faculty
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Scrape faculty pages — {campusName}</DialogTitle>
            <DialogDescription className="pt-1">
              Paste one URL per line. Include each filter/tab as its own line
              (e.g. <code>?role=instructor</code>, <code>?role=staff</code>) so
              non-tenure-track folks aren't missed.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            rows={6}
            placeholder={loadingUrls ? "Loading saved URLs…" : "https://accountancy.example.edu/faculty\nhttps://accountancy.example.edu/faculty?role=instructor"}
            className="font-mono text-xs"
            disabled={busy}
          />
          <div className="text-[11px] text-muted-foreground">
            Names without an email or profile URL are dropped (no pattern-guessing). Results land in the triage table below — nothing is added to the email queue until you import.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={run} disabled={busy}>
              {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Scraping…</> : "Scrape pages"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
