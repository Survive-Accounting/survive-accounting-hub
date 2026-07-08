// /outreach — admin shell, now VERSIONED.
//  - ProfIntel V2 (default): the simplified professor-targeting workflow. The
//    sidebar shows only the ProfIntel section.
//  - Outreach V1 archive: the original broad toolset (Leads · Campuses ·
//    Campaigns · Site) — hidden by default, reachable via the gear → version
//    switch. Nothing is deleted; V1 routes all still work.
// The version is a per-browser preference in localStorage (no settings table for
// per-admin UI prefs yet). The footer is a single gear icon (no text label).
import { AdminGate } from "@/components/AdminGate";
import { useEffect, useState } from "react";
import { createFileRoute, useRouterState, useNavigate, Outlet, Link } from "@tanstack/react-router";
import { Toaster } from "sonner";
import {
  ChevronDown,
  ClipboardList,
  GraduationCap,
  LayoutTemplate,
  Megaphone,
  MessageSquare,
  Search,
  Settings,
  MailCheck,
  Check,
  UserCheck,
  Users,
  Users2,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/outreach")({
  head: () => ({
    meta: [
      { title: "Outreach — Survive Accounting" },
      { name: "description", content: "Campus lead generation dashboard." },
    ],
  }),
  component: OutreachShell,
});

type UiVersion = "v2" | "v1";
const VERSION_KEY = "profintel_ui_version";

type Subtab = { label: string; to: string };
type Section = {
  key: string;
  label: string;
  icon: typeof Search;
  /** True when the current pathname belongs to this section. */
  owns: (pathname: string) => boolean;
  subtabs: Subtab[];
};

const PROFINTEL_SECTION: Section = {
  key: "profintel",
  label: "ProfIntel",
  icon: MailCheck,
  owns: (p) => p.startsWith("/outreach/profintel"),
  subtabs: [
    { label: "Choose campus leads", to: "/outreach/profintel" },
    { label: "Schedule emails", to: "/outreach/profintel-schedule" },
    { label: "Metrics", to: "/outreach/profintel-metrics" },
  ],
};

// Active Roster — SEC-scope governance (which campuses/professors are active for
// the /order pickers + ProfIntel). Shown in V2 since it's core to the SEC focus.
const ACTIVE_ROSTER_SECTION: Section = {
  key: "roster",
  label: "Active Roster",
  icon: UserCheck,
  owns: (p) => p.startsWith("/outreach/active-roster"),
  subtabs: [{ label: "Campuses & Professors", to: "/outreach/active-roster" }],
};

// Reddit listener — read-only campus-subreddit search + mention triage.
const REDDIT_SECTION: Section = {
  key: "reddit",
  label: "Reddit",
  icon: MessageSquare,
  owns: (p) => p.startsWith("/outreach/reddit"),
  subtabs: [{ label: "Listening", to: "/outreach/reddit" }],
};

// Parent-group tracker — manual inventory of campus parent Facebook groups.
const PARENT_GROUPS_SECTION: Section = {
  key: "parent-groups",
  label: "Parent groups",
  icon: Users,
  owns: (p) => p.startsWith("/outreach/parent-groups"),
  subtabs: [{ label: "Tracker", to: "/outreach/parent-groups" }],
};

// Greek org registry — SEC chapter inventory + research link helpers.
const GREEK_SECTION: Section = {
  key: "greek",
  label: "Greek orgs",
  icon: Users2,
  owns: (p) => p.startsWith("/outreach/greek-orgs"),
  subtabs: [{ label: "Registry", to: "/outreach/greek-orgs" }],
};

// V1 archive sections — hidden in V2, shown exactly as before in V1 mode.
// (Includes the Requests/orders admin added on main — a V1 surface hidden in V2.)
const V1_SECTIONS: Section[] = [
  {
    key: "orders",
    label: "Requests",
    icon: ClipboardList,
    owns: (p) => p.startsWith("/outreach/orders"),
    subtabs: [{ label: "All Requests", to: "/outreach/orders" }],
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

/** A subtab is active on an exact match or when the path is nested beneath it. */
function isSubtabActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(to + "/");
}

function OutreachShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Version preference (per-browser). Default V2; hydrate from localStorage.
  const [version, setVersion] = useState<UiVersion>("v2");
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(VERSION_KEY);
      if (v === "v1" || v === "v2") setVersion(v);
    } catch {
      /* ignore */
    }
  }, []);

  const applyVersion = (v: UiVersion) => {
    setVersion(v);
    try {
      window.localStorage.setItem(VERSION_KEY, v);
    } catch {
      /* ignore */
    }
    setSettingsOpen(false);
    // Landing on switch to V2 → ProfIntel (V1 keeps the current route).
    if (v === "v2" && !pathname.startsWith("/outreach/profintel")) {
      navigate({ to: "/outreach/profintel" });
    }
  };

  const sections: Section[] =
    version === "v2"
      ? [
          PROFINTEL_SECTION,
          ACTIVE_ROSTER_SECTION,
          REDDIT_SECTION,
          PARENT_GROUPS_SECTION,
          GREEK_SECTION,
        ]
      : [
          PROFINTEL_SECTION,
          ACTIVE_ROSTER_SECTION,
          REDDIT_SECTION,
          PARENT_GROUPS_SECTION,
          GREEK_SECTION,
          ...V1_SECTIONS,
        ];
  const activeSection = sections.find((s) => s.owns(pathname)) ?? sections[0];
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
                  {sections.map((section) => {
                    const owned = section.owns(pathname);
                    return (
                      <Collapsible
                        key={section.key}
                        defaultOpen={owned}
                        className="group/collapsible"
                      >
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
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={isSubtabActive(pathname, t.to)}
                                  >
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
                {/* Gear icon only — no "Admin settings" text. Opens the version switch. */}
                <SidebarMenuButton
                  onClick={() => setSettingsOpen(true)}
                  tooltip="Settings"
                  aria-label="Settings"
                >
                  <Settings className="h-4 w-4" />
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
              {version === "v1" && (
                <span className="ml-auto rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                  V1 archive
                </span>
              )}
            </header>
            <div className="flex flex-1 flex-col">
              <Outlet />
            </div>
          </div>
        </SidebarInset>

        <VersionSwitchModal
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          version={version}
          onPick={applyVersion}
        />
      </SidebarProvider>
    </AdminGate>
  );
}

function VersionSwitchModal({
  open,
  onOpenChange,
  version,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  version: UiVersion;
  onPick: (v: UiVersion) => void;
}) {
  const options: { key: UiVersion; label: string; note: string }[] = [
    {
      key: "v2",
      label: "ProfIntel V2",
      note: "The simplified professor-targeting workflow (default).",
    },
    {
      key: "v1",
      label: "Outreach V1 archive",
      note: "The original toolset: Lead Finder, Campuses, Campaigns, Site.",
    },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Choose which admin experience to show.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {options.map((o) => {
            const active = version === o.key;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => onPick(o.key)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors",
                  active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    active ? "text-primary" : "text-transparent",
                  )}
                >
                  <Check className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{o.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{o.note}</span>
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
