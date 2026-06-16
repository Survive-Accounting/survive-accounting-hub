import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { archiveAllLeads } from "@/lib/faculty-triage";

export function ArchiveAllLeadsButton() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  const run = async () => {
    setBusy(true);
    try {
      const result = await archiveAllLeads();
      toast.success(
        `Archived ${result.outreach_leads_archived} leads, ${result.suggestions_archived} suggestions, removed ${result.campaign_leads_removed} campaign enrollments.`,
      );
      setOpen(false);
      setConfirm("");
      qc.invalidateQueries({ queryKey: ["outreach-leads"] });
      qc.invalidateQueries({ queryKey: ["lead-suggestions"] });
      qc.invalidateQueries({ queryKey: ["faculty-triage"] });
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="border-red-300 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        Archive all leads & start over
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!busy) { setOpen(v); if (!v) setConfirm(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-700">Archive every lead in the funnel</DialogTitle>
            <DialogDescription className="space-y-2 pt-2">
              <span className="block">This will:</span>
              <ul className="list-disc pl-5 text-sm">
                <li>Set every <strong>outreach_lead</strong> to <code>status=archived</code>.</li>
                <li>Archive every pending <strong>campus_lead_suggestion</strong>.</li>
                <li>Remove every enrollment from non-completed campaigns.</li>
              </ul>
              <span className="block pt-1">Nothing is deleted — rows are kept for history. Sent-email history is preserved.</span>
              <span className="block pt-2 font-medium">Type <code>ARCHIVE</code> to confirm.</span>
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="ARCHIVE"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={run}
              disabled={busy || confirm.trim() !== "ARCHIVE"}
            >
              {busy ? "Archiving…" : "Archive everything"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
