import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onClose: () => void;
  campuses: { id: string; name: string }[];
  assignee: "self" | "king";
  onAssigned: (ids: string[], batch: string, dueDate: string | null) => void;
}

export default function AssignToKingModal({
  open,
  onClose,
  campuses,
  assignee,
  onAssigned,
}: Props) {
  const [batch, setBatch] = useState("wave-1");
  const [dueDate, setDueDate] = useState("");

  const handleAssign = () => {
    onAssigned(
      campuses.map((c) => c.id),
      batch.trim() || "wave-1",
      dueDate || null,
    );
    toast.success(
      `Assigned ${campuses.length} campus${campuses.length === 1 ? "" : "es"} to ${
        assignee === "self" ? "me" : "King"
      }`,
    );
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Assign {campuses.length} campus{campuses.length === 1 ? "" : "es"} to{" "}
            {assignee === "self" ? "me" : "King"}
          </DialogTitle>
          <DialogDescription>
            They'll go into the assignee's queue with the batch label and due date below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="max-h-40 overflow-auto rounded border border-border p-2 text-xs text-muted-foreground space-y-0.5">
            {campuses.map((c) => (
              <div key={c.id}>{c.name}</div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Batch label</Label>
            <Input
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              placeholder="wave-1"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Due date (optional)</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={campuses.length === 0}>
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
