// /admin/reps — the referral / attribution console. A SELF-CONTAINED admin shell (its own
// AdminGate + its own top-tab nav), deliberately NOT wired into the shared /outreach sidebar so it
// doesn't collide with concurrent Growth Admin nav work. Four tabs, matching the V1 spec exactly:
//   Create link · Partners · Links · Conversions
//
// Design principle: Don't Make Me Think. One big Create action, search, simple tables, copy
// buttons — no dashboards, no help walls.
import { AdminGate } from "@/components/AdminGate";
import { AdminSessionGate } from "@/components/AdminSessionGate";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { BarChart3, Link2, Users, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/reps")({
  head: () => ({ meta: [{ title: "Reps & Links — Survive Accounting" }] }),
  component: RepsShell,
});

const TABS = [
  { to: "/admin/reps", label: "Create link", icon: Zap, exact: true },
  { to: "/admin/reps/partners", label: "Partners", icon: Users, exact: false },
  { to: "/admin/reps/links", label: "Links", icon: Link2, exact: false },
  { to: "/admin/reps/conversions", label: "Conversions", icon: BarChart3, exact: false },
] as const;

function RepsShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <AdminGate>
      <AdminSessionGate>
      <Toaster richColors position="top-center" />
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3">
            <span className="mr-2 flex items-center gap-2 text-sm font-semibold">
              <span className="grid h-6 w-6 place-items-center rounded-md bg-primary/10 text-primary">
                <Link2 className="h-3.5 w-3.5" />
              </span>
              Reps &amp; Links
            </span>
            <nav className="flex flex-wrap items-center gap-1">
              {TABS.map((t) => {
                const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
                return (
                  <Link
                    key={t.to}
                    to={t.to}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <t.icon className="h-3.5 w-3.5" />
                    {t.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">
          <Outlet />
        </main>
      </div>
      </AdminSessionGate>
    </AdminGate>
  );
}
