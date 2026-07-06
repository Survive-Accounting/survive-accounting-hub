// Filter row for the Orders admin: status · tier · campus (of campuses that
// have orders) · free-text search. Controlled; parent owns the state.
import { Input } from "@/components/ui/input";
import type { CampusFacet } from "@/lib/orders-admin.functions";

export type OrderFiltersValue = {
  status: string;   // "all" | status
  tier: string;     // "all" | tier
  campusId: string; // "" = all
  search: string;
};

const STATUS_OPTS: [string, string][] = [
  ["all", "All statuses"], ["new", "New"], ["in_progress", "In progress"],
  ["delivered", "Delivered"], ["paid", "Paid"], ["cancelled", "Cancelled"],
];
const TIER_OPTS: [string, string][] = [
  ["all", "All tiers"], ["made_to_order", "Pre-order"], ["one_on_one", "1-on-1"],
  ["something_else", "Something else"], ["free_teaser", "Free teaser"],
];

const selectCls = "h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary";

export function OrderFilters({ value, onChange, campuses }: {
  value: OrderFiltersValue;
  onChange: (v: OrderFiltersValue) => void;
  campuses: CampusFacet[];
}) {
  const set = (patch: Partial<OrderFiltersValue>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className={selectCls} value={value.status} onChange={(e) => set({ status: e.target.value })} aria-label="Status">
        {STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <select className={selectCls} value={value.tier} onChange={(e) => set({ tier: e.target.value })} aria-label="Tier">
        {TIER_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <select className={selectCls} value={value.campusId} onChange={(e) => set({ campusId: e.target.value })} aria-label="Campus">
        <option value="">All campuses</option>
        {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <Input
        value={value.search}
        onChange={(e) => set({ search: e.target.value })}
        placeholder="Search ref / name / email / phone…"
        className="h-9 max-w-xs flex-1"
      />
      {(value.status !== "all" || value.tier !== "all" || value.campusId || value.search) && (
        <button type="button" className="text-xs text-muted-foreground underline"
          onClick={() => onChange({ status: "all", tier: "all", campusId: "", search: "" })}>
          Clear
        </button>
      )}
    </div>
  );
}
