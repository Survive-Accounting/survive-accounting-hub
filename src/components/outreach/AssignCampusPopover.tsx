import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AssignmentStatus } from "@/lib/outreach-mock";

interface Props {
  campus: {
    id: string;
    name: string;
    assigned_to: string | null;
    due_date: string | null;
    assignment_status: AssignmentStatus;
  };
  children: React.ReactNode;
  onSave: (patch: {
    assigned_to: string | null;
    due_date: string | null;
    assignment_status: AssignmentStatus;
  }) => void;
}

const ASSIGNEES = [
  { value: "lee", label: "Lee (me)" },
  { value: "king", label: "King" },
  { value: "unassigned", label: "Unassigned" },
];

const STATUSES: { value: AssignmentStatus; label: string }[] = [
  { value: "not_assigned", label: "Not Assigned" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "approved", label: "Approved" },
  { value: "blocked", label: "Blocked" },
];

export default function AssignCampusPopover({ campus, children, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [assignee, setAssignee] = useState(campus.assigned_to ?? "unassigned");
  const [dueDate, setDueDate] = useState(campus.due_date ?? "");
  const [status, setStatus] = useState<AssignmentStatus>(campus.assignment_status);

  const handleSave = () => {
    onSave({
      assigned_to: assignee === "unassigned" ? null : assignee,
      due_date: dueDate || null,
      assignment_status:
        assignee === "unassigned" ? "not_assigned" : status,
    });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-4 space-y-3">
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Assignment
          </div>
          <div className="text-sm font-medium mt-0.5 truncate">{campus.name}</div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Assignee</Label>
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSIGNEES.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as AssignmentStatus)}
            disabled={assignee === "unassigned"}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.filter((s) => s.value !== "not_assigned").map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Due date</Label>
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="h-8"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1 border-t border-border">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
