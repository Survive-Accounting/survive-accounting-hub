import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { AdminShell, PageHeader } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, FileText, Pencil, GraduationCap } from "lucide-react";

export const Route = createFileRoute("/ceq")({
  component: CeqLayout,
});

// Placeholder seed
const sampleCeqs = [
  { id: "1", title: "Accrual vs Cash Basis", topic: "Financial Accounting" },
  { id: "2", title: "Inventory Costing Methods", topic: "Cost Accounting" },
  { id: "3", title: "Bond Amortization", topic: "Intermediate Accounting" },
];

function CeqLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (pathname !== "/ceq") {
    return <Outlet />;
  }

  return (
    <AdminShell>
      <PageHeader
        title="CEQ Content Engine"
        description="Build, edit, and tutor with conceptual exam questions for accounting students."
        actions={
          <Button asChild>
            <Link to="/ceq/create">
              <Plus className="size-4" /> New CEQ
            </Link>
          </Button>
        }
      />
      <div className="p-6 sm:p-10 space-y-3">
        {sampleCeqs.map((c) => (
          <Card key={c.id}>
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-10 rounded-md bg-secondary grid place-items-center">
                  <FileText className="size-4 text-secondary-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.title}</div>
                  <div className="text-xs text-muted-foreground">{c.topic}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link to="/ceq/$id/edit" params={{ id: c.id }}>
                    <Pencil className="size-3.5" /> Edit
                  </Link>
                </Button>
                <Button size="sm" asChild>
                  <Link to="/ceq/$id/tutor" params={{ id: c.id }}>
                    <GraduationCap className="size-3.5" /> Tutor
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AdminShell>
  );
}
