// Ported from the original app (components/outreach/CampusFilterBar.tsx).
// Saved views are in-memory until Supabase is wired.
import { useMemo, useState } from "react";
import { Bookmark, BookmarkPlus, ChevronDown, Filter, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
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

type SavedView = { id: string; name: string; filters: Partial<CampusFilters>; is_shared: boolean; is_builtin: boolean };

const BUILTIN_VIEWS: SavedView[] = [
  { id: "v1", name: "Ready for Outreach", filters: { campusStatus: "ready_for_outreach" }, is_shared: true, is_builtin: true },
  { id: "v2", name: "King's queue", filters: { assignment: "king" }, is_shared: true, is_builtin: true },
];

type Props = {
  filters: CampusFilters;
  onChange: (next: CampusFilters) => void;
  states: string[];
  batches: string[];
  totalCount: number;
  filteredCount: number;
  archivedCount: number;
  rightSlot?: React.ReactNode;
};

export default function CampusFilterBar({
  filters, onChange, states, batches, totalCount, filteredCount, archivedCount, rightSlot,
}: Props) {
  const [views, setViews] = useState<SavedView[]>(BUILTIN_VIEWS);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveShared, setSaveShared] = useState(false);

  const applyView = (v: SavedView) => {
    onChange({ ...DEFAULT_CAMPUS_FILTERS, ...v.filters });
    toast.success(`Applied "${v.name}"`);
  };

  const isDirty = useMemo(
    () => JSON.stringify(filters) !== JSON.stringify(DEFAULT_CAMPUS_FILTERS),
    [filters],
  );

  const num = (v: number | null) => (v == null ? "" : String(v));
  const setNum = (key: "minTuition" | "maxTuition") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    onChange({ ...filters, [key]: raw === "" ? null : Number(raw) });
  };

  return (
    <div className="space-y-2 border-b border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-col">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold">Campuses</h2>
            <span className="text-xs text-muted-foreground">
              {filteredCount === totalCount ? totalCount : `${filteredCount} of ${totalCount}`}
            </span>
          </div>
        </div>

        <Input
          placeholder="Search…"
          className="h-9 max-w-[200px]"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />

        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-9">
              <Filter className="h-3.5 w-3.5" /> Filters
              {isDirty && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-[#CE1126]" />}
              <ChevronDown className="h-3 w-3 ml-0.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[420px] p-4 space-y-4" align="start">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tuition / yr</Label>
              <div className="mt-1 flex items-center gap-2">
                <Input type="number" placeholder="Min" value={num(filters.minTuition)} onChange={setNum("minTuition")} className="h-8" />
                <span className="text-xs text-muted-foreground">to</span>
                <Input type="number" placeholder="Max" value={num(filters.maxTuition)} onChange={setNum("maxTuition")} className="h-8" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Campus Status</Label>
                <Select
                  value={filters.campusStatus}
                  onValueChange={(v) => onChange({ ...filters, campusStatus: v as CampusStatusFilter })}
                >
                  <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CAMPUS_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Assignment</Label>
                <Select
                  value={filters.assignment}
                  onValueChange={(v) => onChange({ ...filters, assignment: v as AssignmentFilter })}
                >
                  <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSIGNMENT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">State</Label>
                <Select
                  value={filters.state || "_all"}
                  onValueChange={(v) => onChange({ ...filters, state: v === "_all" ? "" : v })}
                >
                  <SelectTrigger className="mt-1 h-8"><SelectValue placeholder="All states" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All states</SelectItem>
                    {states.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Batch</Label>
                <Select
                  value={filters.assignmentBatch || "_all"}
                  onValueChange={(v) => onChange({ ...filters, assignmentBatch: v === "_all" ? "" : v })}
                >
                  <SelectTrigger className="mt-1 h-8"><SelectValue placeholder="All batches" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All batches</SelectItem>
                    {batches.map((b) => (<SelectItem key={b} value={b}>{b}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
              <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={filters.secOnly} onCheckedChange={(v) => onChange({ ...filters, secOnly: !!v })} />
                SEC only 🏈
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={filters.highTuitionOnly} onCheckedChange={(v) => onChange({ ...filters, highTuitionOnly: !!v })} />
                High tuition ($40k+)
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={filters.includeArchived} onCheckedChange={(v) => onChange({ ...filters, includeArchived: !!v })} />
                Include archived ({archivedCount})
              </label>
            </div>
            {isDirty && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onChange(DEFAULT_CAMPUS_FILTERS)}>
                <X className="h-3 w-3" /> Reset all
              </Button>
            )}
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-9">
              <Bookmark className="h-3.5 w-3.5" /> Views <ChevronDown className="h-3 w-3 ml-0.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="text-xs">Saved views</DropdownMenuLabel>
            {views.map((v) => (
              <DropdownMenuItem key={v.id} onClick={() => applyView(v)} className="text-xs">
                {v.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs" onClick={() => setSaveOpen(true)}>
              <BookmarkPlus className="h-3.5 w-3.5" /> Save current as view…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-2">{rightSlot}</div>
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Save view</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="View name" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={saveShared} onCheckedChange={(v) => setSaveShared(!!v)} />
              Shared with the team
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button
              disabled={!saveName.trim()}
              onClick={() => {
                setViews((prev) => [
                  ...prev,
                  { id: `local-${Date.now()}`, name: saveName.trim(), filters, is_shared: saveShared, is_builtin: false },
                ]);
                toast.success("View saved");
                setSaveOpen(false);
                setSaveName("");
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
