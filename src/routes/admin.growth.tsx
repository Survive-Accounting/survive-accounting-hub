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
  BarChart3,
  Building2,
  GraduationCap,
  Landmark,
  Megaphone,
  Network,
  Users2,
} from "lucide-react";
import { AdminGate, getAdminWho } from "@/components/AdminGate";
import { AdminSessionGate } from "@/components/AdminSessionGate";
import { cn } from "@/lib/utils";
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

const TABS = [
  { to: "/admin/growth", label: "Overview", icon: BarChart3, exact: true },
  { to: "/admin/growth/campuses", label: "Campuses", icon: Building2 },
  { to: "/admin/growth/chapters", label: "Chapters", icon: GraduationCap },
  { to: "/admin/growth/councils", label: "Councils", icon: Landmark },
  { to: "/admin/growth/orgs", label: "National Orgs", icon: Network },
  { to: "/admin/growth/contacts", label: "Contacts", icon: Users2 },
  { to: "/admin/growth/outreach", label: "Outreach", icon: Megaphone },
] as const;

function GrowthShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [who, setWho] = useState<string | null>(null);
  useEffect(() => setWho(getAdminWho()), []);

  return (
    <AdminGate>
      <AdminSessionGate>
      <Toaster richColors position="top-center" />
      <div className="flex min-h-screen flex-col bg-background">
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
            </nav>
            {who && (
              <span className="hidden shrink-0 rounded-full border px-2 py-0.5 text-[11px] capitalize text-muted-foreground sm:inline">
                {who}
              </span>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-5">
          <Outlet />
        </main>
      </div>
      </AdminSessionGate>
    </AdminGate>
  );
}
