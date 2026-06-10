import { useMemo } from "react";
import { ChevronDown, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DEFAULT_CAMPUS_FILTERS,
  type AssignmentFilter,
  type CampusFilters,
  type CampusStatusFilter,
} from "@/lib/outreach-mock";

const CAMPUS_STATUS_OPTIONS: { value: CampusStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "ready_for_outreach", label: "Ready for Outreach" },
  { value: "emails_sent", label: "Emails Sent" },
];

const ASSIGNMENT_OPTIONS: { value: AssignmentFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "assigned", label: "Assigned only" },
  { value: "unassigned", label: "Unassigned only" },
  { value: "king", label: "Assigned to King" },
];

interface Props {
  filters: CampusFilters;
  onChange: (next: CampusFilters) => void;
  states: string[];
  batches: string[];
  filteredCount: number;
  totalCount: number;
  rightSlot?: React.ReactNode;
}

export default function CampusFilterBar({
  filters,
  onChange,
  states,
  batches,
  filteredCount,
  totalCount,
  rightSlot,
}: Props) {
  const isDirty = useMemo(
    () => JSON.stringify(filters) !== JSON.stringify(DEFAULT_CAMPUS_FILTERS),
    [filters],
  );
  const num = (v: number | null) => (v == null ? "" : String(v));
  const setNum =
    (key: keyof CampusFilters) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.trim();
      onChange({ ...filters, [key]: raw === "" ? null : Number(raw) });
    };

  return (
    <div className="space-y-2 border-b border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">Campuses</h2>
          <span className="text-xs text-muted-foreground">
            {filteredCount} of {totalCount}
          </span>
        </div>

        <Input
          placeholder="Search…"
          className="h-9 max-w-[220px]"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />

        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-9">
              <Filter className="h-3.5 w-3.5" /> Filters
              {isDirty && (
                <span className="ml-1 h-1.5 w-1.5 rounded-full bg-[#CE1126]" />
              )}
              <ChevronDown className="h-3 w-3 ml-0.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[420px] p-4 space-y-4" align="start">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Tuition / yr
              </Label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="Min"
                  value={num(filters.minTuition)}
                  onChange={setNum("minTuition")}
                  className="h-8"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="number"
                  placeholder="Max"
                  value={num(filters.maxTuition)}
                  onChange={setNum("maxTuition")}
                  className="h-8"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Campus Status
                </Label>
                <Select
                  value={filters.campusStatus}
                  onValueChange={(v) =>
                    onChange({ ...filters, campusStatus: v as CampusStatusFilter })
                  }
                >
                  <SelectTrigger className="h-8 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CAMPUS_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Assignment
                </Label>
                <Select
                  value={filters.assignment}
                  onValueChange={(v) =>
                    onChange({ ...filters, assignment: v as AssignmentFilter })
                  }
                >
                  <SelectTrigger className="h-8 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSIGNMENT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  State
                </Label>
                <Select
                  value={filters.state || "__all"}
                  onValueChange={(v) =>
                    onChange({ ...filters, state: v === "__all" ? "" : v })
                  }
                >
                  <SelectTrigger className="h-8 mt-1">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">Any</SelectItem>
                    {states.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Batch
                </Label>
                <Select
                  value={filters.assignmentBatch || "__all"}
                  onValueChange={(v) =>
                    onChange({
                      ...filters,
                      assignmentBatch: v === "__all" ? "" : v,
                    })
                  }
                >
                  <SelectTrigger className="h-8 mt-1">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">Any</SelectItem>
                    {batches.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox
                  checked={filters.secOnly}
                  onCheckedChange={(v) => onChange({ ...filters, secOnly: !!v })}
                />
                🏈 SEC only
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox
                  checked={filters.highTuitionOnly}
                  onCheckedChange={(v) =>
                    onChange({ ...filters, highTuitionOnly: !!v })
                  }
                />
                🎓 High Tuition ($40k+)
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox
                  checked={filters.includeArchived}
                  onCheckedChange={(v) =>
                    onChange({ ...filters, includeArchived: !!v })
                  }
                />
                Include archived
              </label>
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onChange(DEFAULT_CAMPUS_FILTERS)}
                disabled={!isDirty}
              >
                <X className="h-3.5 w-3.5" /> Clear all
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {isDirty && (
          <Button
            size="sm"
            variant="ghost"
            className="h-9"
            onClick={() => onChange(DEFAULT_CAMPUS_FILTERS)}
          >
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">{rightSlot}</div>
      </div>
    </div>
  );
}
