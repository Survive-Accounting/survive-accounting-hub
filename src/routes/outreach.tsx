import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Toaster, toast } from "sonner";
import { Upload, UserPlus, Users } from "lucide-react";
import { AdminShell, PageHeader } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CampusFilterBar from "@/components/outreach/CampusFilterBar";
import CampusTable from "@/components/outreach/CampusTable";
import ApproveCampusModal from "@/components/outreach/ApproveCampusModal";
import AssignToKingModal from "@/components/outreach/AssignToKingModal";
import {
  applyFilters,
  DEFAULT_CAMPUS_FILTERS,
  exportCampusesCsv,
  MOCK_CAMPUSES,
  type Campus,
  type CampusFilters,
} from "@/lib/outreach-mock";

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
  const [campuses, setCampuses] = useState<Campus[]>(MOCK_CAMPUSES);
  const [filters, setFilters] = useState<CampusFilters>(DEFAULT_CAMPUS_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState<Campus | null>(null);
  const [assignOpen, setAssignOpen] = useState<null | "self" | "king">(null);
  const [tab, setTab] = useState("schools");

  const filtered = useMemo(() => applyFilters(campuses, filters), [campuses, filters]);

  const states = useMemo(
    () => Array.from(new Set(campuses.map((c) => c.state))).sort(),
    [campuses],
  );
  const batches = useMemo(
    () =>
      Array.from(
        new Set(campuses.map((c) => c.assignment_batch).filter(Boolean) as string[]),
      ).sort(),
    [campuses],
  );

  const toggleSelect = (id: string, value: boolean) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });

  const toggleSelectAll = (value: boolean) => {
    if (value) setSelectedIds(new Set(filtered.map((c) => c.id)));
    else setSelectedIds(new Set());
  };

  const handleApprove = (id: string) => {
    setCampuses((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              approval_status: "approved",
              ready_for_outreach: true,
              assignment_status: "approved",
            }
          : c,
      ),
    );
  };

  const handleAssignSave = (
    id: string,
    patch: {
      assigned_to: string | null;
      due_date: string | null;
      assignment_status: Campus["assignment_status"];
    },
  ) => {
    setCampuses((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
    toast.success("Assignment updated");
  };

  const handleBulkAssigned = (
    ids: string[],
    batch: string,
    dueDate: string | null,
  ) => {
    const assignee = assignOpen === "self" ? "lee" : "king";
    setCampuses((prev) =>
      prev.map((c) =>
        ids.includes(c.id)
          ? {
              ...c,
              assigned_to: assignee,
              assignment_batch: batch,
              due_date: dueDate,
              assignment_status:
                c.assignment_status === "approved" ? "approved" : "assigned",
            }
          : c,
      ),
    );
    setSelectedIds(new Set());
  };

  const handleImportLeads = (campus: Campus) => {
    toast.info(`Lead import for ${campus.school_name} — coming soon`);
  };

  const selectedCampuses = filtered.filter((c) => selectedIds.has(c.id));

  return (
    <AdminShell>
      <PageHeader
        title="Outreach Dashboard"
        description="Review campuses, assign work, and run the professor outreach pipeline."
        actions={
          <Button variant="outline" onClick={() => exportCampusesCsv(filtered)}>
            <Upload className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <div className="p-6 sm:p-10">
        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className="grid w-full max-w-xl grid-cols-3 h-12 gap-2 bg-muted/40 p-1.5">
            <TabsTrigger value="home" className="text-sm font-medium">
              Home
            </TabsTrigger>
            <TabsTrigger value="schools" className="text-sm font-medium">
              Campuses
            </TabsTrigger>
            <TabsTrigger value="templates" className="text-sm font-medium">
              Email Queue
            </TabsTrigger>
          </TabsList>

          <TabsContent value="home" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              {[
                {
                  label: "Approved campuses",
                  value: campuses.filter((c) => c.approval_status === "approved")
                    .length,
                },
                {
                  label: "Awaiting review",
                  value: campuses.filter(
                    (c) =>
                      c.approval_status !== "approved" &&
                      c.assignment_status !== "not_assigned",
                  ).length,
                },
                {
                  label: "Emails sent",
                  value: campuses.filter((c) => c.emails_sent).length,
                },
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
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="font-display text-xl">Today's queue</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Schedule grid + activity feed land here once Lovable Cloud is enabled.
                For now, use the <strong>Campuses</strong> tab to review, assign, and
                export.
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="schools" className="space-y-4">
            <Card className="overflow-hidden">
              <CampusFilterBar
                filters={filters}
                onChange={setFilters}
                states={states}
                batches={batches}
                filteredCount={filtered.length}
                totalCount={campuses.length}
                rightSlot={
                  <div className="flex items-center gap-2">
                    {selectedIds.size > 0 && (
                      <>
                        <span className="text-xs text-muted-foreground">
                          {selectedIds.size} selected
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setAssignOpen("self")}
                        >
                          <UserPlus className="h-3.5 w-3.5" /> Assign to me
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setAssignOpen("king")}
                        >
                          <Users className="h-3.5 w-3.5" /> Assign to King
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportCampusesCsv(filtered)}
                    >
                      <Upload className="h-3.5 w-3.5" /> Export CSV
                    </Button>
                  </div>
                }
              />
              <CampusTable
                campuses={filtered}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onToggleSelectAll={toggleSelectAll}
                onReview={setReviewing}
                onImportLeads={handleImportLeads}
                onAssignSave={handleAssignSave}
              />
            </Card>
          </TabsContent>

          <TabsContent value="templates" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-display text-xl">Email templates</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Initial, follow-up 1, follow-up 2, and follow-up 3 templates land here
                once Lovable Cloud is enabled.
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <ApproveCampusModal
        campus={reviewing}
        onClose={() => setReviewing(null)}
        onApprove={handleApprove}
      />
      <AssignToKingModal
        open={assignOpen !== null}
        onClose={() => setAssignOpen(null)}
        campuses={selectedCampuses.map((c) => ({ id: c.id, name: c.school_name }))}
        assignee={assignOpen ?? "king"}
        onAssigned={handleBulkAssigned}
      />
      <Toaster position="top-center" richColors />
    </AdminShell>
  );
}
