// Reusable filter bar for lead/section analytics. Used by the
// "Analyze Campus Leads" panel and (future) campaign builder.
import { useMemo, useState, useCallback } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import type { Campus } from "@/lib/outreach-mock";

export type CourseFamilyKey =
  | "intro_1" | "intro_2" | "intermediate_1" | "intermediate_2";

export const COURSE_FAMILY_LABELS: Record<CourseFamilyKey, string> = {
  intro_1: "Intro 1",
  intro_2: "Intro 2",
  intermediate_1: "IA1",
  intermediate_2: "IA2",
};

export const ALL_FAMILIES: CourseFamilyKey[] = [
  "intro_1", "intro_2", "intermediate_1", "intermediate_2",
];

export type SeasonKey = "fall" | "spring" | "summer" | "winter";
export const ALL_SEASONS: SeasonKey[] = ["fall", "spring", "summer", "winter"];
export const SEASON_LABELS: Record<SeasonKey, string> = {
  fall: "Fall", spring: "Spring", summer: "Summer", winter: "Winter",
};

export interface LeadFilters {
  courseFamilies: CourseFamilyKey[]; // empty = none; full list = all
  seasons: SeasonKey[];
  campusIds: string[];               // empty = all (no filter)
  teachingOnly: boolean;
  minConfidence: number;             // 0..1
  textbookMatchOnly: boolean;
}

export const DEFAULT_LEAD_FILTERS: LeadFilters = {
  courseFamilies: [...ALL_FAMILIES],
  seasons: [...ALL_SEASONS],
  campusIds: [],
  teachingOnly: false,
  minConfidence: 0,
  textbookMatchOnly: false,
};

/** Reusable controlled-state hook. */
export function useLeadFilters(initial: Partial<LeadFilters> = {}) {
  const [filters, setFilters] = useState<LeadFilters>({ ...DEFAULT_LEAD_FILTERS, ...initial });
  const reset = useCallback(() => setFilters({ ...DEFAULT_LEAD_FILTERS, ...initial }), [initial]);
  const patch = useCallback(
    (p: Partial<LeadFilters>) => setFilters((prev) => ({ ...prev, ...p })),
    [],
  );
  return { filters, setFilters, patch, reset };
}

export function termToSeason(term: string | null | undefined): SeasonKey | null {
  if (!term) return null;
  const t = term.toLowerCase();
  if (t.includes("fall") || t.includes("autumn")) return "fall";
  if (t.includes("spring")) return "spring";
  if (t.includes("summer")) return "summer";
  if (t.includes("winter")) return "winter";
  return null;
}

function MultiSelect<T extends string>({
  label, options, selected, onChange, renderLabel,
}: {
  label: string;
  options: T[];
  selected: T[];
  onChange: (next: T[]) => void;
  renderLabel: (v: T) => string;
}) {
  const allSelected = selected.length === options.length;
  const summary = allSelected
    ? "All"
    : selected.length === 0 ? "None" : `${selected.length} of ${options.length}`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2 font-normal">
          <span className="text-muted-foreground">{label}:</span>
          <span className="font-medium">{summary}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="flex items-center justify-between gap-2 pb-2 border-b mb-2">
          <button type="button" className="text-xs text-primary hover:underline"
            onClick={() => onChange([...options])}>Select all</button>
          <button type="button" className="text-xs text-muted-foreground hover:underline"
            onClick={() => onChange([])}>Clear</button>
        </div>
        <div className="space-y-1">
          {options.map((opt) => {
            const isOn = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onChange(isOn ? selected.filter(s => s !== opt) : [...selected, opt])}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-accent"
              >
                <span>{renderLabel(opt)}</span>
                {isOn && <Check className="h-4 w-4 text-primary" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CampusPicker({
  campuses, selected, onChange,
}: { campuses: Campus[]; selected: string[]; onChange: (next: string[]) => void }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? campuses.filter(c => c.school_name.toLowerCase().includes(q)) : campuses;
    return list.slice(0, 200);
  }, [campuses, search]);
  const summary = selected.length === 0
    ? "All campuses"
    : selected.length === 1
      ? campuses.find(c => c.id === selected[0])?.school_name ?? "1 campus"
      : `${selected.length} campuses`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2 font-normal">
          <span className="text-muted-foreground">Campus:</span>
          <span className="font-medium truncate max-w-[180px]">{summary}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b">
          <button type="button" className="text-xs text-primary hover:underline"
            onClick={() => onChange(campuses.map(c => c.id))}>Select all</button>
          <button type="button" className="text-xs text-muted-foreground hover:underline"
            onClick={() => onChange([])}>Clear (all)</button>
        </div>
        <Input placeholder="Search campuses…" value={search}
          onChange={(e) => setSearch(e.target.value)} className="h-8 mb-2" />
        <div className="max-h-72 overflow-y-auto space-y-0.5">
          {filtered.map((c) => {
            const isOn = selected.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onChange(isOn ? selected.filter(s => s !== c.id) : [...selected, c.id])}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <span className="truncate">{c.school_name}</span>
                {isOn && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">No matches</div>
          )}
        </div>
        {selected.length > 0 && (
          <div className="mt-2 pt-2 border-t flex flex-wrap gap-1">
            {selected.slice(0, 6).map((id) => {
              const c = campuses.find((x) => x.id === id);
              if (!c) return null;
              return (
                <Badge key={id} variant="secondary" className="gap-1 text-[10px]">
                  {c.school_name}
                  <button onClick={() => onChange(selected.filter(s => s !== id))}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
            {selected.length > 6 && (
              <Badge variant="outline" className="text-[10px]">+{selected.length - 6}</Badge>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function LeadFilterBar({
  value, onChange, campuses, onReset,
}: {
  value: LeadFilters;
  onChange: (next: LeadFilters) => void;
  campuses: Campus[];
  onReset?: () => void;
}) {
  const patch = (p: Partial<LeadFilters>) => onChange({ ...value, ...p });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelect label="Course family" options={ALL_FAMILIES}
        selected={value.courseFamilies}
        onChange={(v) => patch({ courseFamilies: v })}
        renderLabel={(v) => COURSE_FAMILY_LABELS[v]} />
      <MultiSelect label="Season" options={ALL_SEASONS}
        selected={value.seasons}
        onChange={(v) => patch({ seasons: v })}
        renderLabel={(v) => SEASON_LABELS[v]} />
      <CampusPicker campuses={campuses} selected={value.campusIds}
        onChange={(v) => patch({ campusIds: v })} />

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-2 font-normal">
            <span className="text-muted-foreground">Min confidence:</span>
            <span className="font-medium">{value.minConfidence.toFixed(2)}</span>
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="start">
          <div className="text-xs text-muted-foreground mb-2">
            Only show leads with confidence ≥ {value.minConfidence.toFixed(2)}
          </div>
          <Slider min={0} max={1} step={0.05} value={[value.minConfidence]}
            onValueChange={(v) => patch({ minConfidence: v[0] ?? 0 })} />
        </PopoverContent>
      </Popover>

      <label className="flex items-center gap-2 text-xs text-muted-foreground rounded-md border px-3 h-8">
        <Switch checked={value.teachingOnly}
          onCheckedChange={(v) => patch({ teachingOnly: !!v })} />
        Teaching evidence only
      </label>

      <label
        className="flex items-center gap-2 text-xs text-muted-foreground rounded-md border px-3 h-8 cursor-help"
        title="Restricts to campuses where the AI-detected Intro 1 or Intro 2 textbook matches a row in supported_textbook_families (publisher/title/author keywords, edition-insensitive). Campuses with no textbook research are excluded as 'unknown', not unmatched."
      >
        <Switch checked={value.textbookMatchOnly}
          onCheckedChange={(v) => patch({ textbookMatchOnly: !!v })} />
        Textbook match only
      </label>

      {onReset && (
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onReset}>
          Reset
        </Button>
      )}
    </div>
  );
}
