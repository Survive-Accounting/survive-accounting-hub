// /outreach — ported faithfully from the original app (ProfessorOutreach.tsx).
// Reads the real database; falls back to mock data if the backend is unreachable.
import { AdminGate } from "@/components/AdminGate";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import { ChevronDown, Home, GraduationCap, Layers, Mail, Megaphone, Settings, Users } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton,
  SidebarMenuSubItem, SidebarProvider, SidebarTrigger, SidebarInset,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { OutreachBanner } from "@/components/outreach/OutreachBanner";
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
import { TutoringRequestsPanel } from "@/components/outreach/TutoringRequestsPanel";
// WaitlistCard removed from sidebar layout
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



  const campaignsItems = [
    { value: "schools", label: "Campuses", icon: GraduationCap },
    { value: "audiences", label: "Audiences", icon: Users },
    { value: "templates", label: "Email Queue", icon: Mail },
  ] as const;
  const campaignsOpen = campaignsItems.some((i) => i.value === tab);

  return (
    <AdminGate>
    <SidebarProvider>
      <Toaster richColors position="top-center" />
      <Sidebar collapsible="icon">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={tab === "home"}
                    onClick={() => setTab("home")}
                    tooltip="Home"
                  >
                    <Home className="h-4 w-4" />
                    <span>Home</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <Collapsible defaultOpen={campaignsOpen} className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip="Campaigns">
                        <Megaphone className="h-4 w-4" />
                        <span>Campaigns</span>
                        <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {campaignsItems.map((item) => (
                          <SidebarMenuSubItem key={item.value}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={tab === item.value}
                            >
                              <button
                                type="button"
                                onClick={() => setTab(item.value)}
                                className="flex w-full items-center gap-2"
                              >
                                <item.icon className="h-3.5 w-3.5" />
                                <span>{item.label}</span>
                              </button>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={tab === "texts"}
                    onClick={() => setTab("texts")}
                    tooltip="Students"
                  >
                    <Layers className="h-4 w-4" />
                    <span>Students</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setBatchSettingsOpen(true)}
                tooltip="Admin settings"
              >
                <Settings className="h-4 w-4" />
                <span>Admin settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <div className="min-h-screen bg-background">
          <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur">
            <SidebarTrigger />
            <span className="text-sm font-semibold">Outreach Dashboard</span>
            {usingMock && (
              <span className="ml-2 text-xs text-amber-600">(sample data — database unreachable)</span>
            )}
          </header>
          <div className="mx-auto max-w-7xl px-6 py-6">
            <OutreachBanner />

            <Tabs value={tab} onValueChange={setTab} className="space-y-6 mt-4">
              <TabsContent value="home" className="space-y-8">
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

              <TabsContent value="schools" className="space-y-6">
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

              <TabsContent value="audiences" className="space-y-4">
                <AudiencesPanel campuses={campuses} />
              </TabsContent>

              <TabsContent value="templates" className="space-y-4">
                <EmailQueueShell campuses={campuses} />
              </TabsContent>

              <TabsContent value="texts" className="space-y-4">
                <Tabs defaultValue="requests" className="space-y-4">
                  <TabsList className="grid w-full max-w-md grid-cols-2">
                    <TabsTrigger value="requests">Requests</TabsTrigger>
                    <TabsTrigger value="conversations">Conversations</TabsTrigger>
                  </TabsList>
                  <TabsContent value="requests" className="space-y-4">
                    <TutoringRequestsPanel />
                  </TabsContent>
                  <TabsContent value="conversations" className="space-y-4">
                    <TextsPanel campuses={campuses} />
                  </TabsContent>
                </Tabs>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </SidebarInset>

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

    </SidebarProvider>
    </AdminGate>
  );
}
