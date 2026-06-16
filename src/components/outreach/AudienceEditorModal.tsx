// Create / edit an Audience: name, share toggle, campus filters,
// textbook-family / authors / publisher filters, and an optional
// pinned campus selection.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import CampusFilterBar from "@/components/outreach/CampusFilterBar";

import { createAudience, updateAudience, type Audience } from "@/lib/outreach-api";
import {
  DEFAULT_AUDIENCE_FILTERS,
  applyAudienceFilters,
  normalizeAudienceFilters,
  type AudienceFilters,
  type CourseFamilyKey,
} from "@/lib/audience-filters";
import type { Campus } from "@/lib/outreach-mock";

const FAMILY_LABEL: Record<CourseFamilyKey, string> = {
  intro_1: "Intro 1",
  intro_2: "Intro 2",
  intermediate_1: "IA1",
  intermediate_2: "IA2",
};
const ALL_FAMILIES: CourseFamilyKey[] = ["intro_1", "intro_2", "intermediate_1", "intermediate_2"];

export function AudienceEditorModal({
  open,
  onOpenChange,
  campuses,
  audience,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  campuses: Campus[];
  audience?: Audience | null;
}) {
  const qc = useQueryClient();
  const isEdit = !!audience;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isShared, setIsShared] = useState(true);
  const [filters, setFilters] = useState<AudienceFilters>(DEFAULT_AUDIENCE_FILTERS);
  const [pinMode, setPinMode] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  // Reset when opening for a new audience or switching audiences.
  useEffect(() => {
    if (!open) return;
    if (audience) {
      setName(audience.name);
      setDescription(audience.description ?? "");
      setIsShared(audience.is_shared);
      setFilters(normalizeAudienceFilters(audience.filters_json));
      const pins = audience.pinned_campus_ids ?? [];
      setPinMode(pins.length > 0);
      setPinnedIds(pins);
    } else {
      setName("");
      setDescription("");
      setIsShared(true);
      setFilters(DEFAULT_AUDIENCE_FILTERS);
      setPinMode(false);
      setPinnedIds([]);
    }
    setSearch("");
  }, [open, audience]);

  const states = useMemo(
    () => Array.from(new Set(campuses.map((c) => (c.state ?? "").trim()).filter(Boolean))).sort(),
    [campuses],
  );
  const batches = useMemo(
    () => Array.from(new Set(campuses.map((c) => (c.assignment_batch ?? "").trim()).filter(Boolean))).sort(),
    [campuses],
  );
  const archivedCount = useMemo(() => campuses.filter((c) => c.archived).length, [campuses]);

  const matched = useMemo(() => applyAudienceFilters(campuses, filters), [campuses, filters]);
  const matchedFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? matched.filter((c) => c.school_name.toLowerCase().includes(q)) : matched;
  }, [matched, search]);

  const togglePin = (id: string, on: boolean) => {
    setPinnedIds((prev) => on ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id));
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name is required");
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        filters_json: filters as unknown as Record<string, unknown>,
        pinned_campus_ids: pinMode ? pinnedIds : null,
        is_shared: isShared,
      };
      return isEdit && audience
        ? updateAudience(audience.id, payload)
        : createAudience(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? "Audience updated" : "Audience saved");
      qc.invalidateQueries({ queryKey: ["audiences"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleFamily = (f: CourseFamilyKey, on: boolean) => {
    setFilters((prev) => ({
      ...prev,
      families: on
        ? Array.from(new Set([...prev.families, f]))
        : prev.families.filter((x) => x !== f),
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit audience" : "New audience"}</DialogTitle>
          <DialogDescription>
            Save a reusable group of campuses you can target from any campaign.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. SEC schools, McGraw-Hill Intro 1" className="h-9 mt-1" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={isShared} onCheckedChange={(v) => setIsShared(!!v)} />
              Shared with the team
            </label>
          </div>
        </div>
        <div>
          <Label className="text-xs">Description (optional)</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Short note about who this audience is for" className="h-9 mt-1" />
        </div>

        <div className="rounded-md border bg-card">
          <CampusFilterBar
            filters={filters}
            onChange={(v) => setFilters((prev) => ({ ...prev, ...v }))}
            states={states}
            batches={batches}
            totalCount={campuses.length}
            filteredCount={matched.length}
            archivedCount={archivedCount}
          />
          <div className="flex flex-wrap items-end gap-3 p-3 border-t text-xs">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted-foreground">Course families (any of)</span>
              <div className="flex flex-wrap items-center gap-3">
                {ALL_FAMILIES.map((f) => (
                  <label key={f} className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox
                      checked={filters.families.includes(f)}
                      onCheckedChange={(v) => toggleFamily(f, !!v)}
                    />
                    <span>{FAMILY_LABEL[f]}</span>
                  </label>
                ))}
                {filters.families.length > 0 && (
                  <button type="button" className="text-[11px] text-muted-foreground underline"
                    onClick={() => setFilters((prev) => ({ ...prev, families: [] }))}>
                    clear
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted-foreground">Authors contain</span>
              <Input
                value={filters.authorsContains}
                onChange={(e) => setFilters((prev) => ({ ...prev, authorsContains: e.target.value }))}
                placeholder="e.g. Wild" className="h-8 w-44 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted-foreground">Publisher contains</span>
              <Input
                value={filters.publisherContains}
                onChange={(e) => setFilters((prev) => ({ ...prev, publisherContains: e.target.value }))}
                placeholder="e.g. McGraw" className="h-8 w-44 text-xs"
              />
            </div>
          </div>
        </div>

        <div className="rounded-md border bg-card flex-1 min-h-0 flex flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b p-2 text-xs">
            <Badge variant="outline">{matched.length} match{matched.length === 1 ? "" : "es"}</Badge>
            <label className="flex items-center gap-2 ml-2">
              <Checkbox checked={pinMode} onCheckedChange={(v) => {
                const on = !!v;
                setPinMode(on);
                if (on && pinnedIds.length === 0) setPinnedIds(matched.map((c) => c.id));
              }} />
              Pin a specific selection ({pinMode ? `${pinnedIds.length} pinned` : "off → dynamic"})
            </label>
            {pinMode && (
              <>
                <button type="button" className="text-[11px] text-primary hover:underline ml-auto"
                  onClick={() => setPinnedIds(matchedFiltered.map((c) => c.id))}>
                  Pin shown
                </button>
                <button type="button" className="text-[11px] text-muted-foreground hover:underline"
                  onClick={() => setPinnedIds([])}>
                  Clear pins
                </button>
              </>
            )}
          </div>
          <div className="p-2 border-b">
            <Input placeholder="Search matching campuses…" value={search}
              onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="overflow-auto divide-y" style={{ maxHeight: 260 }}>
            {matchedFiltered.slice(0, 250).map((c) => {
              const pinned = pinnedIds.includes(c.id);
              return (
                <label key={c.id}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent/40 cursor-pointer">
                  {pinMode ? (
                    <Checkbox checked={pinned} onCheckedChange={(v) => togglePin(c.id, !!v)} />
                  ) : (
                    <span className="inline-block w-4" />
                  )}
                  <span className="truncate flex-1">{c.school_name}</span>
                  <span className="text-[11px] text-muted-foreground">{c.state}</span>
                </label>
              );
            })}
            {matchedFiltered.length > 250 && (
              <div className="px-3 py-2 text-[11px] text-muted-foreground">
                + {matchedFiltered.length - 250} more — refine filters or search.
              </div>
            )}
            {matchedFiltered.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                No campuses match these filters.
              </div>
            )}
          </div>
          <p className="border-t p-2 text-[11px] text-muted-foreground">
            {pinMode
              ? "Pinned audience: campaigns target exactly the pinned campuses, regardless of future filter changes."
              : "Dynamic audience: campaigns use whichever campuses match these filters at launch time."}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !name.trim()}>
            {saveMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            {isEdit ? "Save changes" : "Create audience"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
