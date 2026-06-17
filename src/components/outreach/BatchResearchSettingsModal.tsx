import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BatchResearchPanel } from "./BatchResearchPanel";
import { CleanProfessorResearchPanel } from "./CleanProfessorResearchPanel";
import { TextbookCoveragePanel } from "./TextbookCoveragePanel";
import { ProgramAndCoursesPanel } from "./ProgramAndCoursesPanel";
import type { Campus } from "@/lib/outreach-mock";

export function BatchResearchSettingsModal({
  open, onOpenChange, campuses, selectedCampusIds = [],
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  campuses: Campus[];
  selectedCampusIds?: string[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Batch AI Research</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-900">
            <strong>⚠️ Legacy — known to hallucinate names.</strong> Prefer the
            per-campus <em>Scrape faculty</em> button on each row (deterministic
            fetch + narrow extraction, with a triage step before any lead
            enters the email queue). The panels below remain for ad-hoc work.
          </div>
          <TextbookCoveragePanel />
          <CleanProfessorResearchPanel campuses={campuses} selectedCampusIds={selectedCampusIds} />
          <div className="rounded-md border border-amber-200 bg-amber-50/40 p-3 text-xs text-amber-900">
            <strong>Legacy broad research</strong> below runs the original wide AI flow (profile → broad leads → sections).
            Use it for campus profile/section refreshes — not for clean campaign lead lists.
          </div>
          <BatchResearchPanel campuses={campuses} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
