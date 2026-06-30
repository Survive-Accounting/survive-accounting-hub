// /outreach — admin shell. Three primary sections (Leads · Campuses · Campaigns),
// each revealing its subtabs in the sidebar. The shell is intentionally minimal:
// no persistent metrics widgets, no banners — just navigation + an Outlet. Every
// subtab is a real route so URLs are shareable and the chrome stays calm.
import { AdminGate } from "@/components/AdminGate";
import { useState } from "react";
import { createFileRoute, useRouterState, Outlet, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { ChevronDown, GraduationCap, LayoutTemplate, Megaphone, Search, Settings, MailCheck } from "lucide-react";

import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton,
  SidebarMenuSubItem, SidebarProvider, SidebarTrigger, SidebarInset,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BatchResearchSettingsModal } from "@/components/outreach/BatchResearchSettingsModal";
import { fetchCampuses } from "@/lib/outreach-api";
import { MOCK_CAMPUSES, type Campus } from "@/lib/outreach-mock";

export const Route = createFileRoute("/outreach")({
  head: () => ({
    meta: [
      { title: "Outreach — Survive Accounting" },
      { name: "description", content: "Campus lead generation dashboard." },
    ],
  }),
  component: OutreachShell,
});

type Subtab = { label: string; to: string };
type Section = {
  key: string;
  label: string;
  icon: typeof Search;
  /** True when the current pathname belongs to this section. */
  owns: (pathname: string) => boolean;
  subtabs: Subtab[];
};

const SECTIONS: Section[] = [
  {
    key: "profintel",
    label: "ProfIntel",
    icon: MailCheck,
    owns: (p) => p.startsWith("/outreach/profintel"),
    subtabs: [
      { label: "Choose campus leads", to: "/outreach/profintel" },
      { label: "Schedule emails", to: "/outreach/profintel-schedule" },
    ],
  },
  {
    key: "leads",
    label: "Leads",
    icon: Search,
    owns: (p) => p.startsWith("/outreach/leadfinder") || p.startsWith("/outreach/research"),
    subtabs: [
      { label: "Leaderboard", to: "/outreach/leadfinder-leaderboard" },
      { label: "Review & Import", to: "/outreach/leadfinder" },
      { label: "Run Research", to: "/outreach/research" },
    ],
  },
  {
    key: "campuses",
    label: "Campuses",
    icon: GraduationCap,
    owns: (p) => p.startsWith("/outreach/campuses"),
    subtabs: [{ label: "All Campuses", to: "/outreach/campuses" }],
  },
  {
    key: "campaigns",
    label: "Campaigns",
    icon: Megaphone,
    owns: (p) => p.startsWith("/outreach/campaign") || p.startsWith("/outreach/students"),
    subtabs: [
      { label: "Priority Queue", to: "/outreach/campaign-targets" },
      { label: "Metrics", to: "/outreach/campaign-metrics" },
      { label: "Students", to: "/outreach/students" },
    ],
  },
  {
    key: "site",
    label: "Site",
    icon: LayoutTemplate,
    owns: (p) => p.startsWith("/outreach/landing"),
    subtabs: [{ label: "Landing Page", to: "/outreach/landing" }],
  },
];

/** A subtab is active on an exact match or when the path is nested beneath it
 * (e.g. /outreach/leadfinder/$campusId is nested under /outreach/leadfinder). */
function isSubtabActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(to + "/");
}

function OutreachShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [adminOpen, setAdminOpen] = useState(false);

  // Loaded only for the Admin-settings modal; the query is shared/cached with
  // the section routes, so this adds no extra fetch in practice.
  const campusQuery = useQuery({ queryKey: ["campuses"], queryFn: fetchCampuses, retry: 1 });
  const campuses: Campus[] = campusQuery.data ?? (campusQuery.isError ? MOCK_CAMPUSES : []);

  const activeSection = SECTIONS.find((s) => s.owns(pathname)) ?? SECTIONS[0];
  const activeSubtab = activeSection.subtabs.find((t) => isSubtabActive(pathname, t.to));

  return (
    <AdminGate>
      <SidebarProvider>
        <Toaster richColors position="top-center" />
        <Sidebar collapsible="icon">
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {SECTIONS.map((section) => {
                    const owned = section.owns(pathname);
                    return (
                      <Collapsible key={section.key} defaultOpen={owned} className="group/collapsible">
                        <SidebarMenuItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton isActive={owned} tooltip={section.label}>
                              <section.icon className="h-4 w-4" />
                              <span>{section.label}</span>
                              <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              {section.subtabs.map((t) => (
                                <SidebarMenuSubItem key={t.to}>
                                  <SidebarMenuSubButton asChild isActive={isSubtabActive(pathname, t.to)}>
                                    <Link to={t.to} className="flex w-full items-center">
                                      <span>{t.label}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuItem>
                      </Collapsible>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => setAdminOpen(true)} tooltip="Admin settings">
                  <Settings className="h-4 w-4" />
                  <span>Admin settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset>
          <div className="flex min-h-screen flex-col bg-background">
            <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur">
              <SidebarTrigger />
              <span className="text-sm font-semibold">{activeSection.label}</span>
              {activeSubtab && (
                <>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-sm text-muted-foreground">{activeSubtab.label}</span>
                </>
              )}
            </header>
            <div className="flex flex-1 flex-col">
              <Outlet />
            </div>
          </div>
        </SidebarInset>

        <BatchResearchSettingsModal
          open={adminOpen}
          onOpenChange={setAdminOpen}
          campuses={campuses}
        />
      </SidebarProvider>
    </AdminGate>
  );
}
