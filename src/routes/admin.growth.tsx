// /admin/growth — internal Growth workspace. Unifies Campus → Council → Chapter
// → National Org → People → Outreach → Students → Revenue behind one set of
// obvious tabs. Same "Don't Make Me Think" philosophy as the student product:
// search, filters, visual status, obvious actions — no dense CRM forms.
//
// Gated by <AdminGate> (the same passcode + identity gate as /outreach). Server
// reads use the service-role client; the gate is the UI deterrent.
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Toaster } from "sonner";
import {
  Activity,
  BarChart3,
  Building2,
  GraduationCap,
  Landmark,
  Layers,
  Network,
  Radar,
  Rocket,
  Send,
  Users2,
} from "lucide-react";
import { AdminGate, getAdminWho } from "@/components/AdminGate";
import { AdminSessionGate } from "@/components/AdminSessionGate";
import { cn } from "@/lib/utils";
import { useAdminDarkDocument } from "@/components/growth/v2";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/admin/growth")({
  head: () => ({
    meta: [
      { title: "Growth — Survive Accounting" },
      { name: "description", content: "Internal growth workspace." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: GrowthShell,
});

// NAVIGATION (V2). Three things, because there are only three jobs: work the campuses,
// watch what happens, check the scoreboard.
//
// The older per-source workspaces stay reachable under More ▾ — EXCEPT the manual outreach
// log, which is deliberately absent. It writes rows that LOOK like sends (status='sent',
// no message_id) and one accidental visit put four phantom emails on the daily counter.
// It comes back when it's wired to real sends, not before.
const TABS = [
  { to: "/admin/growth/coldoutreach", label: "Cold Outreach", icon: Send },
  { to: "/admin/growth", label: "Campuses", icon: Building2, exact: true },
  { to: "/admin/growth/campaigns", label: "Campaigns", icon: Rocket },
  { to: "/admin/growth/activity", label: "Activity", icon: Activity },
  { to: "/admin/growth/results", label: "Results", icon: BarChart3 },
] as const;

const MORE_TABS = [
  { to: "/admin/growth/king", label: "King HQ", icon: Rocket },
  { to: "/admin/growth/tranches", label: "Batches", icon: Layers },
  { to: "/admin/growth/campuses", label: "Campus table", icon: Building2 },
  { to: "/admin/growth/chapters", label: "Chapters", icon: GraduationCap },
  { to: "/admin/growth/councils", label: "Councils", icon: Landmark },
  { to: "/admin/growth/orgs", label: "National Orgs", icon: Network },
  { to: "/admin/growth/contacts", label: "Contacts", icon: Users2 },
  { to: "/admin/growth/intelligence", label: "Contact Intel", icon: Radar },
] as const;

function GrowthShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [who, setWho] = useState<string | null>(null);
  useEffect(() => setWho(getAdminWho()), []);
  // The workspace wears the product's navy — see .sa-admin-dark in styles.css.
  useAdminDarkDocument();
  // Cold Outreach is its own focused surface — it carries its own two-tab header, so the broader
  // Growth nav is hidden there (see the v2 spec: strip everything else away).
  const bare = pathname.startsWith("/admin/growth/coldoutreach");

  return (
    <AdminGate>
      <AdminSessionGate>
        <Toaster richColors position="top-center" />
        <div className="flex min-h-screen flex-col bg-background">
          {!bare && (
          <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
            <div className="mx-auto flex w-full max-w-[1400px] items-center gap-4 px-5 py-2.5">
              <div className="flex items-center gap-2">
                <div className="grid size-7 place-items-center rounded-md bg-primary font-display text-sm text-primary-foreground">
                  S
                </div>
                <span className="text-sm font-semibold">Growth</span>
              </div>
              <nav className="flex flex-1 items-center gap-0.5 overflow-x-auto">
                {TABS.map((t) => {
                  const active =
                    "exact" in t && t.exact
                      ? pathname === t.to
                      : pathname === t.to || pathname.startsWith(t.to + "/");
                  const Icon = t.icon;
                  return (
                    <Link
                      key={t.to}
                      to={t.to}
                      className={cn(
                        "flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {t.label}
                    </Link>
                  );
                })}
                <MoreMenu pathname={pathname} />
              </nav>
              {who && (
                <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
                  {who}
                </span>
              )}
            </div>
          </header>
          )}
          <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-5">
            <Outlet />
          </main>
        </div>
      </AdminSessionGate>
    </AdminGate>
  );
}

function MoreMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const activeMore = MORE_TABS.some((t) => pathname === t.to || pathname.startsWith(t.to + "/"));
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          activeMore
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
      >
        More ▾
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-44 rounded-md border border-border bg-background p-1 shadow-lg">
          {MORE_TABS.map((t) => {
            const Icon = t.icon;
            const active = pathname === t.to || pathname.startsWith(t.to + "/");
            return (
              <Link
                key={t.to}
                to={t.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2 rounded px-2 py-1.5 text-xs",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
