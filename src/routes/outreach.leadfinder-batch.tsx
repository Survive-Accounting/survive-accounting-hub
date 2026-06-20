// /outreach/leadfinder-batch — batch scraping (V2): pick campuses, quote with
// margin, run a batch, preview results.
import { createFileRoute } from "@tanstack/react-router";
import { BatchScrapePanel } from "@/components/outreach/BatchScrapePanel";

export const Route = createFileRoute("/outreach/leadfinder-batch")({
  head: () => ({
    meta: [
      { title: "Batch Scrape — Survive Accounting" },
      { name: "description", content: "Pick a batch of campuses, quote, and scrape." },
    ],
  }),
  component: BatchScrapePanel,
});
