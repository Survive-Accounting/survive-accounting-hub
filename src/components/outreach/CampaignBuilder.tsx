// Campaign Builder — Phase 2: preview + create draft only.
// No emails are scheduled or sent from here.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Users, ListChecks, Plus, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  LeadFilterBar,
  useLeadFilters,
} from "@/components/outreach/filters/LeadFilterBar";
import {
  previewCampaignAudience,
  createCampaignFromPreview,
  listAudiences,
  touchAudienceUsed,
  type CampaignAudiencePreview,
  type Audience,
} from "@/lib/outreach-api";
import { applyAudienceFilters, normalizeAudienceFilters } from "@/lib/audience-filters";
import { fetchDistinctLeadTitleTags } from "@/lib/faculty-triage";
import { AudienceEditorModal } from "@/components/outreach/AudienceEditorModal";
import type { Campus } from "@/lib/outreach-mock";

export function CampaignBuilder({ campuses }: { campuses: Campus[] }) {
  const qc = useQueryClient();
  const { filters, setFilters, reset } = useLeadFilters();
  const [name, setName] = useState("");
  const [dailyLimit, setDailyLimit] = useState(50);
  const [selectedCampusIds, setSelectedCampusIds] = useState<string[]>([]);
  const [campusSearch, setCampusSearch] = useState("");
  const [preview, setPreview] = useState<CampaignAudiencePreview | null>(null);
  const [audienceId, setAudienceId] = useState<string>("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingAudience, setEditingAudience] = useState<Audience | null>(null);
  const [titleTags, setTitleTags] = useState<string[]>([]);

  const audiencesQ = useQuery({ queryKey: ["audiences"], queryFn: listAudiences });
  const audiences = audiencesQ.data ?? [];
  const currentAudience = audiences.find((a) => a.id === audienceId) ?? null;

  const titleTagsQ = useQuery({
    queryKey: ["outreach-lead-title-tags"],
    queryFn: fetchDistinctLeadTitleTags,
  });
  const availableTitleTags = titleTagsQ.data ?? [];

  const filteredCampuses = useMemo(() => {
    const q = campusSearch.trim().toLowerCase();
    return q ? campuses.filter((c) => c.school_name.toLowerCase().includes(q)) : campuses;
  }, [campuses, campusSearch]);

  function applyAudience(a: Audience) {
    const f = normalizeAudienceFilters(a.filters_json);
    const ids = a.pinned_campus_ids && a.pinned_campus_ids.length
      ? a.pinned_campus_ids
      : applyAudienceFilters(campuses, f).map((c) => c.id);
    setSelectedCampusIds(ids);
    setPreview(null);
    touchAudienceUsed(a.id).catch(() => { /* non-blocking */ });
    toast.success(`Loaded "${a.name}" — ${ids.length} campuses`);
  }

  const previewMut = useMutation({
    mutationFn: async () => previewCampaignAudience(
      { ...filters, selectedCampusIds, titleTags: titleTags.length ? titleTags : undefined },
      campuses,
    ),
    onSuccess: (data) => {
      setPreview(data);
      toast.success(`Preview: ${data.totalLeads.toLocaleString()} leads across ${data.totalCampuses} campuses`);
    },
    onError: (e: Error) => toast.error(`Preview failed: ${e.message}`),
  });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("Run preview first");
      if (!name.trim()) throw new Error("Campaign name is required");
      return createCampaignFromPreview({
        name: name.trim(),
        dailyLimit,
        filters: { ...filters, selectedCampusIds },
        selectedLeadIds: preview.eligibleLeadIds,
      });
    },
    onSuccess: (res) => {
      toast.success(`Draft campaign created (${res.total_leads} leads). No emails scheduled.`);
      setName("");
      setPreview(null);
      qc.invalidateQueries({ queryKey: ["outreach-campaigns"] });
    },
    onError: (e: Error) => toast.error(`Create failed: ${e.message}`),
  });

  const toggleCampus = (id: string, on: boolean) => {
    setSelectedCampusIds((prev) =>
      on ? [...new Set([...prev, id])] : prev.filter((x) => x !== id));
    setPreview(null);
  };

  return (
    <Card className="p-5 border-2 border-primary/20 bg-primary/[0.02]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Users className="h-4 w-4" /> Campaign Builder
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Snapshot a draft campaign from current outreach leads. No emails are scheduled or sent.
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">Draft only</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="md:col-span-2">
          <Label htmlFor="campaign-name" className="text-xs">Campaign name</Label>
          <Input
            id="campaign-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Fall 2026 Intro 1 — Cold Outreach"
            className="h-9 mt-1"
          />
        </div>
        <div>
          <Label htmlFor="daily-limit" className="text-xs">Daily limit</Label>
          <Input
            id="daily-limit"
            type="number"
            min={1}
            value={dailyLimit}
            onChange={(e) => setDailyLimit(Math.max(1, Number(e.target.value) || 50))}
            className="h-9 mt-1"
          />
        </div>
      </div>

      <div className="mb-4 rounded-md border bg-card p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col flex-1 min-w-[220px]">
            <Label className="text-xs">Audience</Label>
            <Select
              value={audienceId || "_none"}
              onValueChange={(v) => {
                if (v === "_none") { setAudienceId(""); return; }
                setAudienceId(v);
                const a = audiences.find((x) => x.id === v);
                if (a) applyAudience(a);
              }}
            >
              <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="None — use filters below" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">None — use filters below</SelectItem>
                {audiences.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}{a.pinned_campus_ids?.length ? ` · ${a.pinned_campus_ids.length} pinned` : " · dynamic"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" size="sm" variant="outline" className="h-9"
            onClick={() => { setEditingAudience(null); setEditorOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> New
          </Button>
          {currentAudience && (
            <Button type="button" size="sm" variant="outline" className="h-9"
              onClick={() => { setEditingAudience(currentAudience); setEditorOpen(true); }}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          )}
          {currentAudience && (
            <Badge variant="outline" className="text-[10px]">
              {selectedCampusIds.length} campuses loaded
            </Badge>
          )}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Pick a saved audience to prefill the campus list below, or build one from scratch and save it for next time.
        </p>
      </div>

      <div className="mb-4">
        <Label className="text-xs mb-2 block">Filters</Label>
        <LeadFilterBar
          value={filters}
          onChange={(v) => { setFilters(v); setPreview(null); }}
          campuses={campuses}
          onReset={() => { reset(); setPreview(null); }}
        />
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs">Specific campuses ({selectedCampusIds.length} selected)</Label>
          <div className="flex gap-3 text-[11px]">
            <button type="button" className="text-primary hover:underline"
              onClick={() => { setSelectedCampusIds(filteredCampuses.map((c) => c.id)); setPreview(null); }}>
              Select shown
            </button>
            <button type="button" className="text-muted-foreground hover:underline"
              onClick={() => { setSelectedCampusIds([]); setPreview(null); }}>
              Clear
            </button>
          </div>
        </div>
        <Input
          placeholder="Search campuses…"
          value={campusSearch}
          onChange={(e) => setCampusSearch(e.target.value)}
          className="h-8 mb-2"
        />
        <div className="max-h-40 overflow-y-auto rounded-md border bg-card divide-y">
          {filteredCampuses.slice(0, 100).map((c) => {
            const on = selectedCampusIds.includes(c.id);
            return (
              <label key={c.id}
                className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent/40 cursor-pointer">
                <Checkbox checked={on} onCheckedChange={(v) => toggleCampus(c.id, !!v)} />
                <span className="truncate">{c.school_name}</span>
              </label>
            );
          })}
          {filteredCampuses.length > 100 && (
            <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
              + {filteredCampuses.length - 100} more — refine search
            </div>
          )}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Leave empty to include all campuses matching the filters above.
        </p>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <Button onClick={() => previewMut.mutate()} disabled={previewMut.isPending}>
          {previewMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
          Preview Audience
        </Button>
        <Button
          variant="default"
          onClick={() => createMut.mutate()}
          disabled={!preview || !name.trim() || createMut.isPending || preview.totalLeads === 0}
        >
          {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Create Draft Campaign
        </Button>
      </div>

      {preview && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Stat label="Leads" value={preview.totalLeads.toLocaleString()} />
              <Stat label="Campuses" value={preview.totalCampuses.toLocaleString()} />
              <Stat label={`Days @ ${dailyLimit}/day`} value={Math.ceil(preview.totalLeads / dailyLimit).toLocaleString()} />
              <Stat
                label="Excluded (already in active campaign)"
                value={preview.excludedAlreadyInCampaignCount.toLocaleString()}
                muted
              />
            </div>
            {preview.totalLeads === 0 && (
              <p className="mt-3 text-xs text-amber-600">
                No leads match. Adjust filters or import leads first.
              </p>
            )}
          </div>

          {preview.first25Leads.length > 0 && (
            <div className="rounded-lg border bg-card overflow-hidden">
              <div className="px-3 py-2 bg-muted/40 text-xs font-medium text-muted-foreground">
                First {preview.first25Leads.length} leads (preview)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr className="border-b">
                      <th className="text-left px-3 py-2 font-medium">Email</th>
                      <th className="text-left px-3 py-2 font-medium">First</th>
                      <th className="text-left px-3 py-2 font-medium">Last</th>
                      <th className="text-left px-3 py-2 font-medium">Campus</th>
                      <th className="text-left px-3 py-2 font-medium">Type</th>
                      <th className="text-left px-3 py-2 font-medium">Course family</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.first25Leads.map((l) => (
                      <tr key={l.outreach_lead_id} className="border-b last:border-0">
                        <td className="px-3 py-1.5 font-mono text-[12px]">{l.email}</td>
                        <td className="px-3 py-1.5">{l.first_name ?? "—"}</td>
                        <td className="px-3 py-1.5">{l.last_name ?? "—"}</td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">{l.campus_name ?? "—"}</td>
                        <td className="px-3 py-1.5 text-xs">{l.lead_type ?? "—"}</td>
                        <td className="px-3 py-1.5 text-xs">{l.course_family ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <AudienceEditorModal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        campuses={campuses}
        audience={editingAudience}
      />
    </Card>
  );
}

function Stat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-xl font-semibold tabular-nums ${muted ? "text-muted-foreground" : ""}`}>
        {value}
      </div>
    </div>
  );
}
