import { useEffect, useState } from "react";
import { Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Campus } from "@/lib/outreach-mock";

interface Props {
  campus: Campus | null;
  onClose: () => void;
  onApprove: (id: string, notes: string) => void;
}

export default function ApproveCampusModal({ campus, onClose, onApprove }: Props) {
  const [colorsOk, setColorsOk] = useState(false);
  const [codesOk, setCodesOk] = useState(false);
  const [landingOk, setLandingOk] = useState(false);
  const [textbookOk, setTextbookOk] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!campus) return;
    const approved = campus.approval_status === "approved";
    setColorsOk(approved);
    setCodesOk(approved && campus.course_codes.length > 0);
    setLandingOk(approved);
    setTextbookOk(approved);
    setNotes("");
  }, [campus]);

  const allChecked = colorsOk && codesOk && landingOk && textbookOk;
  const open = !!campus;

  const handleApprove = () => {
    if (!campus) return;
    onApprove(campus.id, notes);
    toast.success(`Approved ${campus.school_name}`);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Review campus</DialogTitle>
          <DialogDescription>
            {campus?.school_name} · {campus?.state}
          </DialogDescription>
        </DialogHeader>

        {campus && (
          <div className="space-y-4">
            <a
              href={`/outreach/school/${campus.slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-[#CE1126] hover:underline"
            >
              Preview landing page <ExternalLink className="h-3 w-3" />
            </a>

            <div className="space-y-3 rounded-md border border-border p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Review checklist
              </div>

              <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                <Checkbox
                  checked={colorsOk}
                  onCheckedChange={(v) => setColorsOk(!!v)}
                  className="mt-0.5"
                />
                <div>
                  <div>School colors look right</div>
                  <div className="text-xs text-muted-foreground">
                    Primary / secondary / tertiary match the school's brand.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                <Checkbox
                  checked={codesOk}
                  onCheckedChange={(v) => setCodesOk(!!v)}
                  className="mt-0.5"
                />
                <div>
                  <div>
                    Course codes confirmed
                    {campus.course_codes.length > 0 && (
                      <span className="ml-1 text-muted-foreground text-xs">
                        ({campus.course_codes.join(", ")})
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Verified against this school's catalog.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                <Checkbox
                  checked={textbookOk}
                  onCheckedChange={(v) => setTextbookOk(!!v)}
                  className="mt-0.5"
                />
                <div>
                  <div>Textbook match confirmed</div>
                  <div className="text-xs text-muted-foreground">
                    At least one course uses a textbook we cover.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                <Checkbox
                  checked={landingOk}
                  onCheckedChange={(v) => setLandingOk(!!v)}
                  className="mt-0.5"
                />
                <div>
                  <div>Landing page ready for outreach</div>
                  <div className="text-xs text-muted-foreground">
                    Copy reads cleanly, no broken links, mascot/colors look right.
                  </div>
                </div>
              </label>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything Lee should know before sending…"
                rows={3}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!allChecked}
            onClick={handleApprove}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Check className="h-3.5 w-3.5" /> Approve for outreach
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
