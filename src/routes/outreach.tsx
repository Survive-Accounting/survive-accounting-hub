// /outreach — ported faithfully from the original app (ProfessorOutreach.tsx).
// Reads the real database; falls back to mock data if the backend is unreachable.
import { AdminGate } from "@/components/AdminGate";
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useRouterState, Outlet } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import { ChevronDown, Home, GraduationCap, Layers, Mail, Megaphone, Settings, Users, Search } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton,
  SidebarMenuSubItem, SidebarProvider, SidebarTrigger, SidebarInset,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { OutreachBanner } from "@/components/outreach/OutreachBanner";
import { HomeDashboard } from "@/components/outreach/HomeDashboard";
import CampusTable from "@/components/outreach/CampusTable";
import { BatchResearchSettingsModal } from "@/components/outreach/BatchResearchSettingsModal";
import { CampusLeadsStatsPanel } from "@/components/outreach/CampusLeadsStatsPanel";
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
  const navigate = useNavigate();
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [usingMock, setUsingMock] = useState(false);
  const [filters, setFilters] = useState<CampusFilters>(DEFAULT_CAMPUS_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [importCampusId, setImportCampusId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const qc = useQueryClient();
  const [tab, setTab] = useState("home");
  const [batchSettingsOpen, setBatchSettingsOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isIndex = pathname === "/outreach" || pathname === "/outreach/";
  const goTab = (t: string) => {
    setTab(t);
    if (!isIndex) navigate({ to: "/outreach" });
  };

  const openLeadFinder = (campusId: string) =>
    navigate({ to: "/outreach/leadfinder/$campusId", params: { campusId } });

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
                    isActive={isIndex && tab === "home"}
                    onClick={() => goTab("home")}
                    tooltip="Home"
                  >
                    <Home className="h-4 w-4" />
                    <span>Home</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname.startsWith("/outreach/leadfinder")}
                    onClick={() => navigate({ to: "/outreach/leadfinder" })}
                    tooltip="Lead Finder™"
                  >
                    <Search className="h-4 w-4" />
                    <span>Lead Finder<sup className="ml-0.5 text-[8px]">™</sup></span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isIndex && tab === "schools"}
                    onClick={() => goTab("schools")}
                    tooltip="Campuses"
                  >
                    <GraduationCap className="h-4 w-4" />
                    <span>Campuses</span>
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
                              isActive={isIndex && tab === item.value}
                            >
                              <button
                                type="button"
                                onClick={() => goTab(item.value)}
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
                    isActive={isIndex && tab === "texts"}
                    onClick={() => goTab("texts")}
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
                <HomeDashboard onCreateCampaign={() => setTab("templates")} />
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
                    onReview={(c) => openLeadFinder(c.id)}
                    onImportLeads={(c) => openLeadFinder(c.id)}
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

      <AddCampusModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={async (created) => {
          const refreshed = await campusQuery.refetch();
          const fresh = refreshed.data?.find((c) => c.id === created.id);
          if (fresh) {
            openLeadFinder(fresh.id);
          } else {
            qc.invalidateQueries({ queryKey: ["campuses"] });
          }
        }}
      />

    </SidebarProvider>
    </AdminGate>
  );
}
