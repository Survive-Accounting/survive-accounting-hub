import { createFileRoute } from "@tanstack/react-router";
import { AdminShell, PageHeader } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";

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
  return (
    <AdminShell>
      <PageHeader
        title="Outreach"
        description="Track campus lead generation, campaigns, and student conversations."
        actions={
          <Button>
            <Plus className="size-4" /> New campaign
          </Button>
        }
      />
      <div className="p-6 sm:p-10 grid gap-4 md:grid-cols-3">
        {[
          { label: "Active campaigns", value: "—" },
          { label: "Leads this week", value: "—" },
          { label: "Booked sessions", value: "—" },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground font-normal">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-display text-4xl">{s.value}</div>
            </CardContent>
          </Card>
        ))}

        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle className="font-display text-xl">Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground py-12 text-center border-2 border-dashed rounded-md">
            No activity yet. Connect a data source to start tracking outreach.
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
