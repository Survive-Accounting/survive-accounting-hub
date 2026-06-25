// /outreach/research — Run Research. Two strict, source-grounded actions:
//   1. Clean Professor Research — professor-only faculty extraction.
//   2. Program & Course-Code backfill — fills program name + course codes/titles
//      from real catalog pages.
// The legacy "broad" AI run that hallucinated names is intentionally NOT offered
// here; it remains only as a historical filter on already-collected leads.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { CleanProfessorResearchPanel } from "@/components/outreach/CleanProfessorResearchPanel";
import { ProgramAndCoursesPanel } from "@/components/outreach/ProgramAndCoursesPanel";
import { BapAdvisorPanel } from "@/components/outreach/BapAdvisorPanel";
import { MOCK_CAMPUSES, type Campus } from "@/lib/outreach-mock";
import { fetchCampuses } from "@/lib/outreach-api";

export const Route = createFileRoute("/outreach/research")({
  head: () => ({ meta: [{ title: "Run Research — Survive Accounting" }] }),
  component: ResearchPage,
});

function ResearchPage() {
  const campusQuery = useQuery({ queryKey: ["campuses"], queryFn: fetchCampuses, retry: 1 });
  const campuses: Campus[] = campusQuery.data ?? (campusQuery.isError ? MOCK_CAMPUSES : []);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-6 py-6">
      <div>
        <h1 className="text-lg font-semibold">Run Research</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Source-grounded research only. Each run extracts from real faculty and catalog
          pages — never guessed names or codes.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Clean Professor Research</h2>
        <CleanProfessorResearchPanel campuses={campuses} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Program &amp; Course-Code Backfill</h2>
        <ProgramAndCoursesPanel />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">BAP Advisor Enrichment</h2>
        <BapAdvisorPanel campuses={campuses} />
      </section>
    </div>
  );
}
