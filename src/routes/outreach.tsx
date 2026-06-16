// /outreach — ported faithfully from the original app (ProfessorOutreach.tsx).
// Reads the real database; falls back to mock data if the backend is unreachable.
import { AdminGate } from "@/components/AdminGate";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OutreachBanner } from "@/components/outreach/OutreachBanner";
import { CampusQueuePanel } from "@/components/outreach/CampusQueuePanel";
import { HomeDashboard } from "@/components/outreach/HomeDashboard";
import { refreshClaim, markClaimApproved } from "@/lib/outreach-queue";
import CampusTable from "@/components/outreach/CampusTable";
import { BatchResearchSettingsModal } from "@/components/outreach/BatchResearchSettingsModal";
import { CampusLeadsStatsPanel } from "@/components/outreach/CampusLeadsStatsPanel";
import ApproveCampusModal from "@/components/outreach/ApproveCampusModal";
import { ResearchErrorBoundary } from "@/components/outreach/ResearchErrorBoundary";
import AddCampusModal from "@/components/outreach/AddCampusModal";
import ImportLeadsDialog from "@/components/outreach/ImportLeadsDialog";
import { LeadsPanel } from "@/components/outreach/LeadsPanel";
import { TextsPanel } from "@/components/outreach/TextsPanel";
import { WaitlistCard } from "@/components/outreach/WaitlistCard";
import { EmailQueueShell } from "@/components/outreach/EmailQueueShell";
import { ArchiveAllLeadsButton } from "@/components/outreach/ArchiveAllLeadsButton";
import { AudiencesPanel } from "@/components/outreach/AudiencesPanel";
import {
  DEFAULT_CAMPUS_FILTERS,
  MOCK_CAMPUSES,
  type AssignmentStatus,
  type Campus,
  type CampusFilters,
} from "@/lib/outreach-mock";
import {
  fetchCampusPhones,
  fetchCampuses,
  patchCampusDb,
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
  const [reviewInitialStep, setReviewInitialStep] = useState<string | undefined>(undefined);
  const [autoResearchId, setAutoResearchId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importCampusId, setImportCampusId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const qc = useQueryClient();
  const [tab, setTab] = useState("home");
  const [batchSettingsOpen, setBatchSettingsOpen] = useState(false);

  // ----- Campuses: real data, mock fallback -----
  const campusQuery = useQuery({ queryKey: ["campuses"], queryFn: fetchCampuses, retry: 1 });
  const phonesQuery = useQuery({ queryKey: ["campus-phones"], queryFn: fetchCampusPhones, retry: 1 });
  

  const handleTogglePersonalPhone = (campusId: string, next: boolean) => {
    patchCampus(campusId, { use_personal_phone: next });
    toast.success(next ? "Switched to personal cell for this campus" : "Reverted to main line");
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



  return (
    <AdminGate>

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
          <TabsList className="grid w-full grid-cols-5 h-12 gap-2 bg-muted/40 p-1.5">
            <TabsTrigger value="home" className="text-sm font-medium">Home</TabsTrigger>
            <TabsTrigger value="schools" className="text-sm font-medium">Campuses</TabsTrigger>
            <TabsTrigger value="audiences" className="text-sm font-medium">Audiences</TabsTrigger>
            <TabsTrigger value="templates" className="text-sm font-medium">Email Queue</TabsTrigger>
            <TabsTrigger value="texts" className="text-sm font-medium">Texts</TabsTrigger>
          </TabsList>

          <TabsContent value="home" className="mt-8 space-y-8">
            <HomeDashboard
              onCreateCampaign={() => setTab("templates")}
              onImportLeads={() => { setImportCampusId(null); setImportOpen(true); }}
              onOpenAISettings={() => setBatchSettingsOpen(true)}
              onViewTexts={() => setTab("texts")}
            />
            <details className="rounded-md border border-border bg-card">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-muted-foreground">
                Campus approval queue
              </summary>
              <div className="p-3">
                <CampusQueuePanel
                  onReview={(campusId) => {
                    const c = campuses.find((x) => x.id === campusId);
                    if (c) setReviewing(c);
                  }}
                />
              </div>
            </details>
          </TabsContent>


          <TabsContent value="schools" className="mt-8 space-y-6">
            <CampusLeadsStatsPanel
              campuses={campuses}
              onOpenSettings={() => setBatchSettingsOpen(true)}
            />
            <div className="flex items-center justify-between gap-2">
              <ArchiveAllLeadsButton />
              <button
                onClick={() => setAddOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
              >
                + Add Campus
              </button>
            </div>
            {campusQuery.isLoading ? (
              <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
                Loading campuses…
              </div>
            ) : (
              <CampusTable
                campuses={campuses}
                filters={filters}
                onFiltersChange={setFilters}
                onReview={(c) => { setReviewInitialStep("1"); setReviewing(c); }}
                onImportLeads={(c) => { setReviewInitialStep("3"); setReviewing(c); }}
                onAssignPatch={handleAssignPatch}
                campusPhones={phonesQuery.data}
                onTogglePersonalPhone={handleTogglePersonalPhone}
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
            <EmailQueueShell campuses={campuses} />
          </TabsContent>

          <TabsContent value="texts" className="mt-8 space-y-4">
            <WaitlistCard />
            <TextsPanel campuses={campuses} />
          </TabsContent>
        </Tabs>
      </div>

      <BatchResearchSettingsModal
        open={batchSettingsOpen}
        onOpenChange={setBatchSettingsOpen}
        campuses={campuses}
      />

      <ImportLeadsDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        campuses={campuses}
        defaultCampusId={importCampusId}
        usingMock={usingMock}
        onImported={() => qc.invalidateQueries({ queryKey: ["outreach-leads"] })}
      />
      <ResearchErrorBoundary onReset={() => { setReviewing(null); setAutoResearchId(null); setReviewInitialStep(undefined); }}>
        <ApproveCampusModal
          campus={reviewing ? campuses.find((c) => c.id === reviewing.id) ?? null : null}
          autoStartResearch={autoResearchId}
          initialStep={reviewInitialStep}
          onClose={() => {
            if (reviewing) refreshClaim(reviewing.id).catch(() => {});
            setReviewing(null);
            setAutoResearchId(null);
            setReviewInitialStep(undefined);
          }}
          onPatch={(id, patch) => {
            patchCampus(id, patch);
            refreshClaim(id).catch(() => {});
          }}
          onApprove={(id, patch) => {
            patchCampus(id, patch);
            markClaimApproved(id)
              .catch(() => {})
              .finally(() => qc.invalidateQueries({ queryKey: ["campus-queue"] }));
          }}
        />
      </ResearchErrorBoundary>

      <AddCampusModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={async (created, autoResearch) => {
          // Refresh the campuses list so the new row appears, then open
          // the approval modal (auto-triggering AI research if requested).
          const refreshed = await campusQuery.refetch();
          const fresh = refreshed.data?.find((c) => c.id === created.id);
          if (fresh) {
            setReviewing(fresh);
            if (autoResearch) setAutoResearchId(created.id);
          } else {
            // Fallback: at least invalidate so the table updates.
            qc.invalidateQueries({ queryKey: ["campuses"] });
          }
        }}
      />

    </div>
    </AdminGate>
  );
}
