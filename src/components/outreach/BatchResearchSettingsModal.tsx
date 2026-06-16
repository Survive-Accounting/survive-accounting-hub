import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BatchResearchPanel } from "./BatchResearchPanel";
import type { Campus } from "@/lib/outreach-mock";

export function BatchResearchSettingsModal({
  open, onOpenChange, campuses,
}: { open: boolean; onOpenChange: (v: boolean) => void; campuses: Campus[] }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Batch AI Research</DialogTitle>
        </DialogHeader>
        <BatchResearchPanel campuses={campuses} />
      </DialogContent>
    </Dialog>
  );
}
