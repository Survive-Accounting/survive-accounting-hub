// Cold Emails campaign builder — priority queue + schedule math.
// Saves draft into existing outreach_campaigns (campaign_type='cold_sequence').
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Star } from "lucide-react";

import type { Campus } from "@/lib/outreach-mock";
import { supabase } from "@/integrations/supabase/client";
import { createCampaignFromPreview, fetchTemplates } from "@/lib/outreach-api";
import {
  rankCampuses,
  buildSchedule,
  formatShortDate,
  type ColdCriteria,
  type RankedCampus,
  type RmpAggregate,
} from "@/lib/cold-campaign";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ALL_TAGS = ["adjunct", "instructor", "lecturer"] as const;
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

type LeadRmpRow = {
  campus_id: string | null;
  rmp_rating: number | null;
  rmp_difficulty: number | null;
  rmp_would_take_again: number | null;
};

async function fetchLeadCountsAndRmp(): Promise<{
  counts: Record<string, number>;
  rmpByCampus: Record<string, RmpAggregate>;
}> {
  const { data, error } = await supabase
    .from("outreach_leads")
    .select("campus_id,rmp_rating,rmp_difficulty,rmp_would_take_again");
  if (error) throw error;
  const counts: Record<string, number> = {};
  const buckets: Record<string, { ratings: number[]; diffs: number[]; takes: number[] }> = {};
  for (const r of (data ?? []) as LeadRmpRow[]) {
    if (!r.campus_id) continue;
    counts[r.campus_id] = (counts[r.campus_id] ?? 0) + 1;
    if (r.rmp_rating == null && r.rmp_difficulty == null && r.rmp_would_take_again == null) continue;
    const b = buckets[r.campus_id] ?? (buckets[r.campus_id] = { ratings: [], diffs: [], takes: [] });
    if (r.rmp_rating != null) b.ratings.push(Number(r.rmp_rating));
    if (r.rmp_difficulty != null) b.diffs.push(Number(r.rmp_difficulty));
    if (r.rmp_would_take_again != null) b.takes.push(Number(r.rmp_would_take_again));
  }
  const rmpByCampus: Record<string, RmpAggregate> = {};
  const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  for (const [campusId, b] of Object.entries(buckets)) {
    rmpByCampus[campusId] = {
      ratedCount: Math.max(b.ratings.length, b.diffs.length, b.takes.length),
      avgRating: avg(b.ratings),
      avgDifficulty: avg(b.diffs),
      avgTakeAgain: avg(b.takes),
    };
  }
  return { counts, rmpByCampus };
}

function nextWeekday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

export function ColdEmailsPanel({ campuses }: { campuses: Campus[] }) {
  const [name, setName] = useState("Cold sequence — " + new Date().toLocaleDateString());
  const [dailyCap, setDailyCap] = useState(50);
  const [perCampusCap, setPerCampusCap] = useState(5);
  const [startDate, setStartDate] = useState(() => nextWeekday().toISOString().slice(0, 10));
  const [sendDays, setSendDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [templateId, setTemplateId] = useState<string>("");

  const [crit, setCrit] = useState<ColdCriteria>({
    secEnabled: true,
    secWeight: 6,
    tuitionEnrollEnabled: true,
    tuitionEnrollWeight: 5,
    leadTagEnabled: false,
    leadTagWeight: 3,
    leadTags: ["adjunct", "instructor", "lecturer"],
    rmpEnabled: true,
    rmpWeight: 7,
  });

  const [ordered, setOrdered] = useState<RankedCampus[]>([]);
  const [generated, setGenerated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [forceOleMiss, setForceOleMiss] = useState(false);

  const leadsQ = useQuery({
    queryKey: ["cold-imported-lead-counts-rmp"],
    queryFn: fetchLeadCountsAndRmp,
  });
  const importedByCampus = leadsQ.data?.counts ?? {};
  const rmpByCampus = leadsQ.data?.rmpByCampus ?? {};

  const templatesQ = useQuery({
    queryKey: ["outreach-email-templates"],
    queryFn: fetchTemplates,
  });
  const initialTemplates = useMemo(
    () => (templatesQ.data ?? []).filter((t) => t.kind === "initial"),
    [templatesQ.data],
  );

  // Auto-select the active initial template once loaded if none selected yet.
  useEffect(() => {
    if (templateId) return;
    const active = initialTemplates.find((t) => t.is_active);
    if (active) setTemplateId(active.id);
    else if (initialTemplates[0]) setTemplateId(initialTemplates[0].id);
  }, [initialTemplates, templateId]);

  const isOleMiss = (c: Campus) => {
    const n = (c.school_name ?? "").toLowerCase();
    return n.includes("ole miss") || n.includes("university of mississippi");
  };

  const ranked = useMemo(() => {
    const base = rankCampuses(campuses, importedByCampus, rmpByCampus, crit);
    if (!forceOleMiss) return base;
    const idx = base.findIndex((r) => isOleMiss(r.campus));
    if (idx <= 0) return base;
    const next = [...base];
    const [om] = next.splice(idx, 1);
    next.unshift(om);
    return next;
  }, [campuses, importedByCampus, rmpByCampus, crit, forceOleMiss]);

  // Keep ordered in sync with the latest ranking until the user reorders.
  useEffect(() => {
    if (!generated) setOrdered(ranked);
  }, [ranked, generated]);

  // When Ole Miss is forced, send ALL its imported leads instead of perCampusCap.
  const countsByCampus = useMemo<Record<string, number>>(() => {
    if (!forceOleMiss) return {};
    const om = ordered.find((r) => isOleMiss(r.campus));
    if (!om) return {};
    const n = importedByCampus[om.campus.id] ?? 0;
    return n > 0 ? { [om.campus.id]: n } : {};
  }, [forceOleMiss, ordered, importedByCampus]);

  const schedule = useMemo(
    () =>
      buildSchedule(ordered, {
        dailyCap,
        perCampusCap,
        sendDays,
        startDate: new Date(startDate + "T00:00:00"),
        countsByCampus,
      }),
    [ordered, dailyCap, perCampusCap, sendDays, startDate, countsByCampus],
  );


  const toggleDay = (d: number) =>
    setSendDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  const move = (idx: number, dir: -1 | 1) => {
    setOrdered((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const generate = () => {
    setOrdered(ranked);
    setGenerated(true);
  };

  const saveCampaign = async (launch: boolean) => {
    if (!ordered.length) {
      toast.error("Generate the queue first.");
      return;
    }
    if (launch && !templateId) {
      toast.error("Pick an email template before launching.");
      return;
    }
    setSaving(true);
    try {
      // For launch, fetch lead IDs for selected campuses in priority order.
      // When the RMP criterion is on, pick the "toughest/least liked" profs
      // first within each campus (low rating + high difficulty + low take-again).
      let selectedLeadIds: string[] = [];
      if (launch) {
        const campusIds = ordered.map((r) => r.campus.id);
        const { data, error } = await supabase
          .from("outreach_leads")
          .select("id,campus_id,rmp_rating,rmp_difficulty,rmp_would_take_again");
        if (error) throw error;
        const campusSet = new Set(campusIds);
        const byCampus = new Map<string, Array<{ id: string; badness: number; hasRmp: boolean }>>();
        for (const r of (data ?? []) as Array<{
          id: string; campus_id: string | null;
          rmp_rating: number | null; rmp_difficulty: number | null; rmp_would_take_again: number | null;
        }>) {
          if (!r.campus_id || !campusSet.has(r.campus_id)) continue;
          const parts: number[] = [];
          if (r.rmp_rating != null) parts.push((5 - Number(r.rmp_rating)) / 5);
          if (r.rmp_difficulty != null) parts.push(Number(r.rmp_difficulty) / 5);
          if (r.rmp_would_take_again != null) parts.push((100 - Number(r.rmp_would_take_again)) / 100);
          const hasRmp = parts.length > 0;
          const badness = hasRmp ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
          const arr = byCampus.get(r.campus_id) ?? [];
          arr.push({ id: r.id, badness, hasRmp });
          byCampus.set(r.campus_id, arr);
        }
        for (const cid of campusIds) {
          const arr = byCampus.get(cid) ?? [];
          if (crit.rmpEnabled) {
            // Rated profs first (worst first), then unrated.
            arr.sort((a, b) => {
              if (a.hasRmp !== b.hasRmp) return a.hasRmp ? -1 : 1;
              return b.badness - a.badness;
            });
          }
          const cap = countsByCampus[cid] ?? perCampusCap;
          for (const row of arr.slice(0, cap)) selectedLeadIds.push(row.id);
        }

      }

      const result = await createCampaignFromPreview({
        name: name.trim() || "Cold sequence",
        dailyLimit: dailyCap,
        filters: {
          selectedCampusIds: ordered.map((r) => r.campus.id),
          titleTags: crit.leadTagEnabled ? crit.leadTags : undefined,
        },
        selectedLeadIds,
        templateId: templateId || null,
      });

      toast.success(
        launch
          ? `Launched: ${result.total_leads} leads queued across ${result.total_campuses} campuses`
          : `Draft saved (${ordered.length} campuses prioritized)`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Save failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cold Emails — Priority Queue Builder</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Goals */}
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cold-name">Campaign name</Label>
            <Input id="cold-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cold-start">Start date</Label>
            <Input id="cold-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cold-daily">Daily send cap</Label>
            <Input id="cold-daily" type="number" min={1} value={dailyCap}
              onChange={(e) => setDailyCap(Math.max(1, Number(e.target.value) || 50))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cold-per">Max emails per campus</Label>
            <Input id="cold-per" type="number" min={1} value={perCampusCap}
              onChange={(e) => setPerCampusCap(Math.max(1, Number(e.target.value) || 5))} />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Email template (initial send)</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder={templatesQ.isLoading ? "Loading templates…" : "Pick an initial template"} />
              </SelectTrigger>
              <SelectContent>
                {initialTemplates.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-muted-foreground">
                    No initial templates found. Create one in Standard Campaigns → Email template.
                  </div>
                ) : (
                  initialTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} {t.is_active ? "· active" : ""}{t.variant !== "default" ? ` · ${t.variant}` : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Send days</Label>
            <div className="flex gap-1.5">
              {DAY_LABELS.map((lbl, i) => {
                const on = sendDays.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={cn(
                      "h-9 w-9 rounded-md border text-xs font-medium",
                      on
                        ? "border-[#14213D] bg-[#14213D] text-white"
                        : "border-border bg-background text-muted-foreground",
                    )}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Priority criteria */}
        <section className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
          <div className="text-sm font-semibold">Priority criteria</div>

          <CriterionRow
            label="SEC / Power conference boost"
            enabled={crit.secEnabled}
            weight={crit.secWeight}
            onEnabled={(v) => setCrit({ ...crit, secEnabled: v })}
            onWeight={(w) => setCrit({ ...crit, secWeight: w })}
          />
          <CriterionRow
            label="Tuition × enrollment combo"
            enabled={crit.tuitionEnrollEnabled}
            weight={crit.tuitionEnrollWeight}
            onEnabled={(v) => setCrit({ ...crit, tuitionEnrollEnabled: v })}
            onWeight={(w) => setCrit({ ...crit, tuitionEnrollWeight: w })}
          />
          <CriterionRow
            label="RMP — tough/unpopular profs (low rating + high difficulty + low % take-again)"
            enabled={crit.rmpEnabled}
            weight={crit.rmpWeight}
            onEnabled={(v) => setCrit({ ...crit, rmpEnabled: v })}
            onWeight={(w) => setCrit({ ...crit, rmpWeight: w })}
          />
          <div className="space-y-2">
            <CriterionRow
              label="Lead-tag priority"
              enabled={crit.leadTagEnabled}
              weight={crit.leadTagWeight}
              onEnabled={(v) => setCrit({ ...crit, leadTagEnabled: v })}
              onWeight={(w) => setCrit({ ...crit, leadTagWeight: w })}
            />
            {crit.leadTagEnabled && (
              <div className="flex gap-2 pl-7">
                {ALL_TAGS.map((tag) => {
                  const on = crit.leadTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() =>
                        setCrit({
                          ...crit,
                          leadTags: on
                            ? crit.leadTags.filter((t) => t !== tag)
                            : [...crit.leadTags, tag],
                        })
                      }
                      className={cn(
                        "rounded-full border px-3 py-0.5 text-xs",
                        on ? "border-[#14213D] bg-[#14213D] text-white" : "border-border bg-background",
                      )}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={generate} className="bg-[#14213D] text-white hover:bg-[#14213D]/90">
            Generate Queue
          </Button>
          <Button
            type="button"
            variant={forceOleMiss ? "default" : "outline"}
            onClick={() => setForceOleMiss((v) => !v)}
            className={forceOleMiss ? "bg-[#CE1126] text-white hover:bg-[#CE1126]/90" : ""}
            title="Pin Ole Miss to #1 and send ALL its imported leads first"
          >
            {forceOleMiss ? "✓ Forcing Ole Miss #1" : "Force Ole Miss"}
          </Button>
          {forceOleMiss && (
            <span className="text-xs text-muted-foreground">
              Ole Miss pinned to #1 — all its imported leads send first, then schedule continues under the daily cap.
            </span>
          )}
        </div>


        {/* Queue table */}
        {ordered.length > 0 && (
          <section className="space-y-2">
            <div className="text-sm font-semibold">
              Priority queue ({ordered.length} campuses)
            </div>
            <div className="max-h-[480px] overflow-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/50 text-left">
                  <tr>
                    <th className="px-2 py-1.5 w-10">#</th>
                    <th className="px-2 py-1.5">Campus</th>
                    <th className="px-2 py-1.5 w-12">SEC</th>
                    <th className="px-2 py-1.5">Tuition×Enroll</th>
                    <th className="px-2 py-1.5">Imported Leads</th>
                    <th className="px-2 py-1.5">RMP (★ / diff)</th>
                    <th className="px-2 py-1.5">Est. Send Day</th>
                    <th className="px-2 py-1.5 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {ordered.map((r, idx) => {
                    const sendDate = schedule.firstSendByCampus[r.campus.id];
                    const imported = r.importedLeads;
                    const rated = r.rmp.ratedCount;
                    return (
                      <tr key={r.campus.id} className="border-t border-border">
                        <td className="px-2 py-1.5 text-muted-foreground">{idx + 1}</td>
                        <td className="px-2 py-1.5 font-medium">{r.campus.school_name}</td>
                        <td className="px-2 py-1.5">{r.campus.is_sec ? <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">SEC</Badge> : ""}</td>
                        <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                          {r.tuitionEnroll > 0 ? `$${(r.tuitionEnroll / 1_000_000).toFixed(1)}M` : "—"}
                        </td>
                        <td className="px-2 py-1.5">
                          {imported > 0 ? <span className="font-medium">{imported}</span> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                          {rated > 0 ? (
                            <span title={`${rated} rated leads`}>
                              <Star className="mr-0.5 inline h-3 w-3 text-amber-500" />
                              {r.rmp.avgRating != null ? r.rmp.avgRating.toFixed(1) : "—"}
                              {" / "}
                              {r.rmp.avgDifficulty != null ? r.rmp.avgDifficulty.toFixed(1) : "—"}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground">{sendDate ? formatShortDate(sendDate) : ""}</td>
                        <td className="px-2 py-1.5">
                          <div className="flex gap-0.5">
                            <button onClick={() => move(idx, -1)} className="rounded p-1 hover:bg-muted" aria-label="Move up">
                              <ArrowUp className="h-3 w-3" />
                            </button>
                            <button onClick={() => move(idx, 1)} className="rounded p-1 hover:bg-muted" aria-label="Move down">
                              <ArrowDown className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Summary */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card p-3 text-sm">
              <div className="text-muted-foreground">
                <span className="font-semibold text-foreground">{ordered.length}</span> campuses ·{" "}
                <span className="font-semibold text-foreground">{schedule.totalEmails}</span> emails ·{" "}
                <span className="font-semibold text-foreground">{schedule.totalDays}</span> send days
                {schedule.finishDate && (
                  <> · finishes <span className="font-semibold text-foreground">{formatShortDate(schedule.finishDate)}</span></>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" disabled={saving} onClick={() => saveCampaign(false)}>
                  {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Save Draft
                </Button>
                <Button
                  disabled={saving}
                  onClick={() => saveCampaign(true)}
                  className="bg-[#CE1126] text-white hover:bg-[#CE1126]/90"
                >
                  {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Approve & Launch
                </Button>
              </div>
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function CriterionRow({
  label, enabled, weight, onEnabled, onWeight,
}: {
  label: string;
  enabled: boolean;
  weight: number;
  onEnabled: (v: boolean) => void;
  onWeight: (w: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Checkbox checked={enabled} onCheckedChange={(v) => onEnabled(!!v)} />
      <div className="flex-1 text-sm">{label}</div>
      <div className="flex w-48 items-center gap-2">
        <Slider
          value={[weight]}
          min={0}
          max={10}
          step={1}
          disabled={!enabled}
          onValueChange={([v]) => onWeight(v)}
        />
        <span className="w-6 text-right text-xs text-muted-foreground tabular-nums">{weight}</span>
      </div>
    </div>
  );
}

export default ColdEmailsPanel;
