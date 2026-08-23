// /admin/growth/councils — per-campus council rollup (IFC / Panhellenic / NPHC /
// MGC / Other), derived from campus_greek_chapters. One-click public partner page.
import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ExternalLink, RotateCw } from "lucide-react";
import { listGrowthCouncils, type CouncilRow } from "@/lib/growth-admin.functions";
import {
  EmptyRow,
  LoadingRow,
  Pager,
  SearchInput,
  SITE_ORIGIN,
  copy,
  relTime,
} from "@/components/growth/shared";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/growth/councils")({
  component: CouncilsPage,
});

function CouncilsPage() {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => setDq(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(1), [dq]);

  const query = useQuery({
    queryKey: ["growth-councils", dq, page],
    queryFn: () => listGrowthCouncils({ data: { q: dq || undefined, page, pageSize: 50 } }),
    placeholderData: keepPreviousData,
  });
  const rows = query.data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search campus or council…" />
        <button
          onClick={() => query.refetch()}
          className="ml-auto flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm hover:bg-accent/40"
        >
          <RotateCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Campus</th>
              <th className="px-2 py-2 text-left">Council</th>
              <th className="px-2 py-2 text-right">Chapters</th>
              <th className="px-2 py-2 text-right">Contacts</th>
              <th className="px-2 py-2 text-right">Members</th>
              <th className="px-2 py-2 text-left">Outreach</th>
              <th className="px-2 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <LoadingRow colSpan={7} />
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={7}>No councils.</EmptyRow>
            ) : (
              rows.map((r) => <CouncilRowView key={`${r.campusId}/${r.councilSlug}`} r={r} />)
            )}
          </tbody>
        </table>
      </div>

      <Pager page={page} pageSize={50} total={query.data?.total ?? 0} onPage={setPage} />
    </div>
  );
}

function CouncilRowView({ r }: { r: CouncilRow }) {
  const partnerPath = r.campusSlug ? `/partners/council/${r.campusSlug}/${r.councilSlug}` : null;
  return (
    <tr className="border-b last:border-0 hover:bg-accent/30">
      <td className="px-3 py-2 font-medium">{r.campusName}</td>
      <td className="px-2 py-2">
        <span className="rounded-full border px-2 py-0.5 text-xs">{r.councilName}</span>
      </td>
      <td className="px-2 py-2 text-right tabular-nums">{r.chapters}</td>
      <td className="px-2 py-2 text-right tabular-nums">
        {r.contacts || <span className="text-muted-foreground/40">0</span>}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        {r.members || <span className="text-muted-foreground/40">0</span>}
      </td>
      <td className="px-2 py-2 text-xs text-muted-foreground">{relTime(r.lastOutreachAt)}</td>
      <td className="px-2 py-2">
        <div className="flex items-center gap-2">
          <Link
            to="/admin/growth/chapters"
            search={{ campusId: r.campusId, council: r.councilSlug } as never}
            className="rounded-md border px-2 py-1 text-xs hover:bg-accent/40"
          >
            Chapters
          </Link>
          {partnerPath && (
            <>
              <a
                href={`${SITE_ORIGIN}${partnerPath}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent/40"
              >
                <ExternalLink className="h-3 w-3" /> Page
              </a>
              <button
                onClick={() => {
                  copy(`${SITE_ORIGIN}${partnerPath}`);
                  toast.success("Link copied");
                }}
                className="rounded-md border px-2 py-1 text-xs hover:bg-accent/40"
              >
                Copy
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
