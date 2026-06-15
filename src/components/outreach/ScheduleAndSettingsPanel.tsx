// Email Queue → batch-schedule unsent leads, plus the admin
// "auto-schedule on import" toggle.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Campus } from "@/lib/outreach-mock";
import {
  defaultBatchSendTime,
  fetchAutoScheduleSetting,
  fetchLeads,
  scheduleLeadsBatch,
  setAutoScheduleSetting,
} from "@/lib/outreach-api";
import { CourseAvailabilitySettings } from "./CourseAvailabilitySettings";

const toLocalInput = (d: Date) => {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
};

export function ScheduleAndSettingsPanel({ campuses }: { campuses: Campus[] }) {
  const qc = useQueryClient();
  const leadsQuery = useQuery({ queryKey: ["outreach-leads"], queryFn: fetchLeads, retry: 1 });
  const settingQuery = useQuery({ queryKey: ["auto-schedule-setting"], queryFn: fetchAutoScheduleSetting, retry: 1 });

  // Eligible = not sent, not stopped, not already queued.
  const eligible = useMemo(
    () => (leadsQuery.data ?? []).filter((l) => !l.sent_at && !l.sequence_stopped_at && !l.scheduled_send_at),
    [leadsQuery.data],
  );
  const campusById = useMemo(() => new Map(campuses.map((c) => [c.id, c])), [campuses]);

  // Selection state
  const [campusFilter, setCampusFilter] = useState<string>("_all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [when, setWhen] = useState<"two_biz" | "now" | "pick">("two_biz");
  const [pickLocal, setPickLocal] = useState(toLocalInput(defaultBatchSendTime()));
  const [busy, setBusy] = useState(false);

  // Eligible leads in the active campus filter
  const inScope = useMemo(
    () => (campusFilter === "_all" ? eligible : eligible.filter((l) => l.campus_id === campusFilter)),
    [eligible, campusFilter],
  );

  const allSelected = inScope.length > 0 && inScope.every((l) => selected.has(l.id));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) inScope.forEach((l) => next.delete(l.id));
      else inScope.forEach((l) => next.add(l.id));
      return next;
    });
  };

  const computeSendAt = (): Date | null => {
    if (when === "two_biz") return defaultBatchSendTime();
    if (when === "now") return new Date(Date.now() + 60 * 1000); // ~1 min so the cron picks it up
    const d = pickLocal ? new Date(pickLocal) : null;
    return d && !isNaN(d.getTime()) ? d : null;
  };
  const sendAt = computeSendAt();

  const schedule = async () => {
    if (selected.size === 0) { toast.error("Select at least one lead"); return; }
    if (!sendAt) { toast.error("Pick a valid send time"); return; }
    setBusy(true);
    try {
      const n = await scheduleLeadsBatch(Array.from(selected), sendAt);
      const when_ = when === "now" ? "now (within ~15 min)" : sendAt.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      toast.success(`Queued ${n} email${n === 1 ? "" : "s"} for ${when_}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["outreach-leads"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Scheduling failed");
    } finally {
      setBusy(false);
    }
  };

  const onToggleAuto = async (on: boolean) => {
    try {
      await setAutoScheduleSetting(on);
      qc.invalidateQueries({ queryKey: ["auto-schedule-setting"] });
      toast.success(on
        ? "Auto-schedule ON — new imports will queue automatically (+2 business days)"
        : "Auto-schedule OFF — new imports land as ready; you batch-schedule from here");
    } catch (e: any) {
      toast.error(e?.message ?? "Update failed");
    }
  };

  return (
    <>
      <CourseAvailabilitySettings />
      {/* Admin setting */}
      <Card className="overflow-hidden py-0 gap-0">
        <div className="flex flex-wrap items-center gap-3 p-3">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <div className="min-w-0">
            <div className="text-sm font-semibold">Auto-schedule on import</div>
            <div className="text-[11px] text-muted-foreground">
              When ON, every imported lead gets queued automatically (+2 business days, 9:30 AM CT). When OFF, leads land as <strong>ready</strong> and you schedule them in batches below.
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {settingQuery.isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : (
              <>
                <Switch checked={!!settingQuery.data} onCheckedChange={onToggleAuto} id="autoschedule" />
                <Label htmlFor="autoschedule" className="text-xs">{settingQuery.data ? "ON" : "OFF"}</Label>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Batch scheduler */}
      <Card className="overflow-hidden py-0 gap-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Batch-schedule sends</h2>
          <span className="text-[11px] text-muted-foreground">
            {eligible.length === 0
              ? "No ready leads to schedule"
              : `${eligible.length} lead${eligible.length === 1 ? "" : "s"} ready to schedule`}
          </span>
        </div>

        {eligible.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground">
            Nothing to schedule right now. Import leads on the Campuses tab — with the toggle above OFF, they'll land here as <strong>ready</strong>.
          </div>
        ) : (
          <div className="space-y-3 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-xs">Campus</Label>
              <Select value={campusFilter} onValueChange={(v) => { setCampusFilter(v); setSelected(new Set()); }}>
                <SelectTrigger className="h-8 w-[260px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all" className="text-xs">All campuses ({eligible.length})</SelectItem>
                  {Array.from(new Set(eligible.map((l) => l.campus_id).filter(Boolean) as string[])).map((id) => {
                    const c = campusById.get(id);
                    const n = eligible.filter((l) => l.campus_id === id).length;
                    return <SelectItem key={id} value={id} className="text-xs">{c?.school_name ?? id} ({n})</SelectItem>;
                  })}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={toggleAll}>
                {allSelected ? "Clear selection" : `Select all (${inScope.length})`}
              </Button>
              <span className="text-[11px] text-muted-foreground">{selected.size} selected</span>
            </div>

            <div className="max-h-48 overflow-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/50">
                  <tr className="text-left">
                    <th className="w-8 px-2 py-1.5"></th>
                    <th className="px-2 py-1.5">Campus</th>
                    <th className="px-2 py-1.5">Professor</th>
                    <th className="px-2 py-1.5">Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {inScope.map((l) => (
                    <tr key={l.id} className="hover:bg-muted/30">
                      <td className="px-2 py-1">
                        <Checkbox
                          checked={selected.has(l.id)}
                          onCheckedChange={(v) => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (v) next.add(l.id); else next.delete(l.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td className="px-2 py-1 text-muted-foreground">{l.campus_id ? campusById.get(l.campus_id)?.school_name ?? "—" : "—"}</td>
                      <td className="px-2 py-1">
                        {l.is_phd ? "Dr. " : ""}{[l.first_name, l.last_name].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className="px-2 py-1 font-mono text-[11px]">{l.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-xs">Send</Label>
              <Select value={when} onValueChange={(v) => setWhen(v as typeof when)}>
                <SelectTrigger className="h-8 w-[240px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="two_biz" className="text-xs">
                    +2 business days at 3:30 PM CT (default)
                  </SelectItem>
                  <SelectItem value="now" className="text-xs">Send now (~15 min)</SelectItem>
                  <SelectItem value="pick" className="text-xs">Pick exact date &amp; time</SelectItem>
                </SelectContent>
              </Select>
              {when === "pick" && (
                <Input
                  type="datetime-local"
                  value={pickLocal}
                  onChange={(e) => setPickLocal(e.target.value)}
                  className="h-8 w-[220px] text-xs"
                />
              )}
              {sendAt && when !== "now" && (
                <span className="text-[11px] text-muted-foreground">
                  → {sendAt.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              )}
              <Button onClick={schedule} disabled={busy || selected.size === 0} className="ml-auto">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                Schedule {selected.size || ""}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

export default ScheduleAndSettingsPanel;
