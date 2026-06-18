// /outreach/leadfinder — picks the first campus that still needs review and
// redirects to /outreach/leadfinder/$campusId.
import { useEffect, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";

import { fetchCampuses } from "@/lib/outreach-api";

export const Route = createFileRoute("/outreach/leadfinder/")({
  head: () => ({
    meta: [
      { title: "Lead Finder — Survive Accounting" },
      { name: "description", content: "Pick a campus to scrape and triage." },
    ],
  }),
  component: LeadFinderIndex,
});

function LeadFinderIndex() {
  const navigate = useNavigate();
  const campusQuery = useQuery({ queryKey: ["campuses"], queryFn: fetchCampuses, retry: 1 });

  const firstId = useMemo(() => {
    const all = campusQuery.data ?? [];
    const pending = all.find((c) => !c.archived && c.approval_status !== "approved");
    return (pending ?? all[0])?.id ?? null;
  }, [campusQuery.data]);

  useEffect(() => {
    if (firstId) {
      navigate({ to: "/outreach/leadfinder/$campusId", params: { campusId: firstId }, replace: true });
    }
  }, [firstId, navigate]);

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="flex flex-col items-center gap-3 text-center">
        {campusQuery.isLoading ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <div className="text-sm text-muted-foreground">Loading campuses…</div>
          </>
        ) : firstId ? (
          <div className="text-sm text-muted-foreground">Opening Lead Finder…</div>
        ) : (
          <>
            <div className="text-base font-medium">No campuses yet.</div>
            <Link to="/outreach" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              <ArrowLeft className="h-4 w-4" /> Back to Outreach Dashboard
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
