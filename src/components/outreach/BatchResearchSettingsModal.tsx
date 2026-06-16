import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BatchResearchPanel } from "./BatchResearchPanel";
import { CleanProfessorResearchPanel } from "./CleanProfessorResearchPanel";
import { TextbookCoveragePanel } from "./TextbookCoveragePanel";
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
