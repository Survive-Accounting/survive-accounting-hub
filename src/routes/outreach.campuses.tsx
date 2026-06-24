// /outreach/campuses — All Campuses directory. The campus table, stats, filters,
// assignment workflow, add-campus and import-leads flows — relocated here from the
// old "schools" tab. Data flow is unchanged: real campuses with a mock fallback,
// optimistic local patches mirrored to the database in the background.
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import CampusTable from "@/components/outreach/CampusTable";
import { CampusLeadsStatsPanel } from "@/components/outreach/CampusLeadsStatsPanel";
import { LeadsPanel } from "@/components/outreach/LeadsPanel";
import AddCampusModal from "@/components/outreach/AddCampusModal";
import ImportLeadsDialog from "@/components/outreach/ImportLeadsDialog";
import { ArchiveAllLeadsButton } from "@/components/outreach/ArchiveAllLeadsButton";
import { BatchResearchSettingsModal } from "@/components/outreach/BatchResearchSettingsModal";
import {
  DEFAULT_CAMPUS_FILTERS,
  MOCK_CAMPUSES,
  type AssignmentStatus,
  type Campus,
  type CampusFilters,
} from "@/lib/outreach-mock";
import { fetchCampusPhones, fetchCampuses, patchCampusDb } from "@/lib/outreach-api";

export const Route = createFileRoute("/outreach/campuses")({
  head: () => ({ meta: [{ title: "Campuses — Survive Accounting" }] }),
  component: CampusesPage,
});

function CampusesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [usingMock, setUsingMock] = useState(false);
  const [filters, setFilters] = useState<CampusFilters>(DEFAULT_CAMPUS_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [importCampusId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [batchSettingsOpen, setBatchSettingsOpen] = useState(false);

  const campusQuery = useQuery({ queryKey: ["campuses"], queryFn: fetchCampuses, retry: 1 });
  const phonesQuery = useQuery({ queryKey: ["campus-phones"], queryFn: fetchCampusPhones, retry: 1 });

  useEffect(() => {
    if (campusQuery.data) {
      setCampuses(campusQuery.data);
      setUsingMock(false);
    } else if (campusQuery.isError) {
      setCampuses(MOCK_CAMPUSES);
      setUsingMock(true);
    }
  }, [campusQuery.data, campusQuery.isError]);

  const openLeadFinder = (campusId: string) =>
    navigate({ to: "/outreach/leadfinder/$campusId", params: { campusId } });

  // Patch local state immediately; mirror to the database in the background.
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

  const handleTogglePersonalPhone = (campusId: string, next: boolean) => {
    patchCampus(campusId, { use_personal_phone: next });
    toast.success(next ? "Switched to personal cell for this campus" : "Reverted to main line");
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-6">
      {usingMock && (
        <div className="mb-4 text-xs text-amber-600">(sample data — database unreachable)</div>
      )}

      <CampusLeadsStatsPanel
        campuses={campuses}
        onOpenSettings={() => setBatchSettingsOpen(true)}
      />

      <div className="mt-6 flex items-center justify-between gap-2">
        <ArchiveAllLeadsButton />
        <button
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
        >
          + Add Campus
        </button>
      </div>

      {campusQuery.isLoading ? (
        <div className="mt-6 rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Loading campuses…
        </div>
      ) : (
        <div className="mt-6">
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
        </div>
      )}

      <div className="mt-6">
        <LeadsPanel campuses={campuses} />
      </div>

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
    </div>
  );
}
