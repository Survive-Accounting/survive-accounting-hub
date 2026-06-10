// /outreach — ported faithfully from the original app (ProfessorOutreach.tsx).
// Runs on mock data until Supabase is wired.
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Toaster, toast } from "sonner";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OutreachBanner } from "@/components/outreach/OutreachBanner";
import { WeekNavigator } from "@/components/outreach/WeekNavigator";
import { TodayChecklist } from "@/components/outreach/TodayChecklist";
import { EmailTemplatesPanel } from "@/components/outreach/EmailTemplatesPanel";
import CampusTable from "@/components/outreach/CampusTable";
import ApproveCampusModal from "@/components/outreach/ApproveCampusModal";
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
  const [campuses, setCampuses] = useState<Campus[]>(MOCK_CAMPUSES);
  const [filters, setFilters] = useState<CampusFilters>(DEFAULT_CAMPUS_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState<Campus | null>(null);
  const [tab, setTab] = useState("home");
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = manilaTodayISO();
    const dow = new Date(today + "T00:00:00").getDay();
    if (dow === 0) return addDaysISO(today, -1);
    if (dow === 1) return addDaysISO(today, 1);
    return today;
  });

  const weekMonday = mondayOfISO(selectedDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysISO(weekMonday, i));
  const counts = mockWeekCounts(weekDays);

  const patchCampus = (id: string, patch: Partial<Campus>) =>
    setCampuses((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

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
          </p>
        </header>

        <Tabs value={tab} onValueChange={setTab} className="space-y-8">
          <TabsList className="grid w-full grid-cols-3 h-12 gap-2 bg-muted/40 p-1.5">
            <TabsTrigger value="home" className="text-sm font-medium">Home</TabsTrigger>
            <TabsTrigger value="schools" className="text-sm font-medium">Campuses</TabsTrigger>
            <TabsTrigger value="templates" className="text-sm font-medium">Email Queue</TabsTrigger>
          </TabsList>

          <TabsContent value="home" className="mt-8 space-y-8">
            <WeekNavigator selectedDate={selectedDate} onChange={setSelectedDate} counts={counts} />
            <TodayChecklist
              dateISO={selectedDate}
              campuses={campuses}
              onFocusCampus={handleFocusCampus}
              onImportProfessors={() => toast.info("Connect Supabase to import professor leads")}
              onOpenEmailQueue={() => setTab("templates")}
            />
          </TabsContent>

          <TabsContent value="schools" className="mt-8 space-y-8">
            <CampusTable
              campuses={campuses}
              filters={filters}
              onFiltersChange={setFilters}
              onReview={(c) => setReviewing(c)}
              onImportLeads={() => toast.info("Connect Supabase to import professor leads")}
              onAssignPatch={handleAssignPatch}
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
          </TabsContent>

          <TabsContent value="templates" className="mt-8 space-y-8">
            <EmailTemplatesPanel />
          </TabsContent>
        </Tabs>
      </div>

      <ApproveCampusModal
        campus={reviewing ? campuses.find((c) => c.id === reviewing.id) ?? null : null}
        onClose={() => setReviewing(null)}
        onPatch={patchCampus}
        onApprove={(id, patch) => patchCampus(id, patch)}
      />
    </div>
  );
}
