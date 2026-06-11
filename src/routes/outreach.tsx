// /outreach — ported faithfully from the original app (ProfessorOutreach.tsx).
// Reads the real database; falls back to mock data if the backend is unreachable.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OutreachBanner } from "@/components/outreach/OutreachBanner";
import { WeekNavigator } from "@/components/outreach/WeekNavigator";
import { TodayChecklist } from "@/components/outreach/TodayChecklist";
import { EmailTemplatesPanel } from "@/components/outreach/EmailTemplatesPanel";
import CampusTable from "@/components/outreach/CampusTable";
import ApproveCampusModal from "@/components/outreach/ApproveCampusModal";
import ImportLeadsDialog from "@/components/outreach/ImportLeadsDialog";
import { LeadsPanel } from "@/components/outreach/LeadsPanel";
import { TextsPanel } from "@/components/outreach/TextsPanel";
import { WaitlistCard } from "@/components/outreach/WaitlistCard";
import { BroadcastsPanel } from "@/components/outreach/BroadcastsPanel";
import { UpcomingSendsPanel } from "@/components/outreach/UpcomingSendsPanel";
import {
  DEFAULT_CAMPUS_FILTERS,
  MOCK_CAMPUSES,
  addDaysISO,
  manilaTodayISO,
  mockWeekCounts,
  mondayOfISO,
  type AssignmentStatus,
  type Campus,
  type CampusFilters,
} from "@/lib/outreach-mock";
import {
  fetchCampusIdsForDate,
  fetchCampusPhones,
  fetchCampuses,
  fetchWeekCounts,
  patchCampusDb,
  provisionCampusNumber,
} from "@/lib/outreach-api";

export const Route = createFileRoute("/outreach")({
  head: () => ({
    meta: [
      { title: "Outreach — Survive Accounting" },
      { name: "description", content: "Campus lead generation dashboard." },
    ],
  }),
  component: OutreachPage,
});

function OutreachPage() {
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [usingMock, setUsingMock] = useState(false);
  const [filters, setFilters] = useState<CampusFilters>(DEFAULT_CAMPUS_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState<Campus | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importCampusId, setImportCampusId] = useState<string | null>(null);
  const qc = useQueryClient();
  const [tab, setTab] = useState("home");
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = manilaTodayISO();
    const dow = new Date(today + "T00:00:00").getDay();
    if (dow === 0) return addDaysISO(today, -1);
    if (dow === 1) return addDaysISO(today, 1);
    return today;
  });

  // ----- Campuses: real data, mock fallback -----
  const campusQuery = useQuery({ queryKey: ["campuses"], queryFn: fetchCampuses, retry: 1 });
  const phonesQuery = useQuery({ queryKey: ["campus-phones"], queryFn: fetchCampusPhones, retry: 1 });
  const qcMain = useQueryClient();

  const handleProvisionNumber = async (campusId: string) => {
    toast.info("Finding a local number…");
    const res = await provisionCampusNumber(campusId);
    if (res.ok) {
      toast.success(`Number ready: ${res.phone}`);
      qcMain.invalidateQueries({ queryKey: ["campus-phones"] });
    } else toast.error(res.error ?? "Provisioning failed");
  };
  useEffect(() => {
    if (campusQuery.data) {
      setCampuses(campusQuery.data);
      setUsingMock(false);
    } else if (campusQuery.isError) {
      setCampuses(MOCK_CAMPUSES);
      setUsingMock(true);
    }
  }, [campusQuery.data, campusQuery.isError]);

  // ----- Week strip counts -----
  const weekMonday = mondayOfISO(selectedDate);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysISO(weekMonday, i)),
    [weekMonday],
  );
  const countsQuery = useQuery({
    queryKey: ["week-counts", weekDays[0], weekDays[6]],
    queryFn: () => fetchWeekCounts(weekDays[0], weekDays[6]),
    retry: 1,
  });
  const counts = countsQuery.data ?? (usingMock ? mockWeekCounts(weekDays) : {});

  // ----- Today's assigned campuses (checklist step 1) -----
  const dayIdsQuery = useQuery({
    queryKey: ["day-campus-ids", selectedDate],
    queryFn: () => fetchCampusIdsForDate(selectedDate),
    retry: 1,
  });
  const todaysCampuses = useMemo(() => {
    if (!dayIdsQuery.data) return undefined;
    const byId = new Map(campuses.map((c) => [c.id, c]));
    return dayIdsQuery.data.map((id) => byId.get(id)).filter(Boolean) as Campus[];
  }, [dayIdsQuery.data, campuses]);

  // ----- Patching: local state immediately, database in the background -----
  const patchCampus = (id: string, patch: Partial<Campus>) => {
    setCampuses((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    if (!usingMock) {
      patchCampusDb(id, patch).catch((e) =>
        toast.error(`Save failed: ${e?.message ?? "unknown error"}`),
      );
    }
  };

  const handleAssignPatch = (
    id: string,
    patch: { assigned_to: string | null; due_date: string | null; assignment_status: AssignmentStatus },
  ) => patchCampus(id, patch);

  const handleFocusCampus = (name: string) => {
    setFilters((f) => ({ ...f, search: name }));
    setTab("schools");
  };

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-center" />
      <div className="mx-auto max-w-7xl px-6 py-8">
        <OutreachBanner />
        <header className="mb-8 mt-2">
          <h1 className="text-2xl font-bold tracking-tight font-sans">Outreach Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage leads, campuses, templates, and outreach campaigns.
            {usingMock && (
              <span className="ml-2 text-amber-600">(showing sample data — database unreachable)</span>
            )}
          </p>
        </header>

        <Tabs value={tab} onValueChange={setTab} className="space-y-8">
          <TabsList className="grid w-full grid-cols-4 h-12 gap-2 bg-muted/40 p-1.5">
            <TabsTrigger value="home" className="text-sm font-medium">Home</TabsTrigger>
            <TabsTrigger value="schools" className="text-sm font-medium">Campuses</TabsTrigger>
            <TabsTrigger value="templates" className="text-sm font-medium">Email Queue</TabsTrigger>
            <TabsTrigger value="texts" className="text-sm font-medium">Texts</TabsTrigger>
          </TabsList>

          <TabsContent value="home" className="mt-8 space-y-8">
            <WeekNavigator selectedDate={selectedDate} onChange={setSelectedDate} counts={counts} />
            <TodayChecklist
              dateISO={selectedDate}
              campuses={campuses}
              todaysCampuses={todaysCampuses}
              onFocusCampus={handleFocusCampus}
              onImportProfessors={() => { setImportCampusId(null); setImportOpen(true); }}
              onOpenEmailQueue={() => setTab("templates")}
              onOpenTexts={() => setTab("texts")}
            />
          </TabsContent>

          <TabsContent value="schools" className="mt-8 space-y-8">
            {campusQuery.isLoading ? (
              <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
                Loading campuses…
              </div>
            ) : (
              <CampusTable
                campuses={campuses}
                filters={filters}
                onFiltersChange={setFilters}
                onReview={(c) => setReviewing(c)}
                onImportLeads={(c) => { setImportCampusId(c.id); setImportOpen(true); }}
                onAssignPatch={handleAssignPatch}
                campusPhones={phonesQuery.data}
                onProvisionNumber={handleProvisionNumber}
                selectedIds={selectedIds}
                onToggleSelect={(id, value) =>
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (value) next.add(id); else next.delete(id);
                    return next;
                  })
                }
                onToggleSelectAll={(ids, value) =>
                  setSelectedIds(value ? new Set(ids) : new Set())
                }
              />
            )}
            <LeadsPanel campuses={campuses} />
          </TabsContent>

          <TabsContent value="templates" className="mt-8 space-y-4">
            <BroadcastsPanel campuses={campuses} />
            <EmailTemplatesPanel />
          </TabsContent>

          <TabsContent value="texts" className="mt-8 space-y-4">
            <WaitlistCard />
            <TextsPanel campuses={campuses} />
          </TabsContent>
        </Tabs>
      </div>

      <ImportLeadsDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        campuses={campuses}
        defaultCampusId={importCampusId}
        usingMock={usingMock}
        onImported={() => qc.invalidateQueries({ queryKey: ["outreach-leads"] })}
      />
      <ApproveCampusModal
        campus={reviewing ? campuses.find((c) => c.id === reviewing.id) ?? null : null}
        onClose={() => setReviewing(null)}
        onPatch={patchCampus}
        onApprove={(id, patch) => patchCampus(id, patch)}
      />
    </div>
  );
}
