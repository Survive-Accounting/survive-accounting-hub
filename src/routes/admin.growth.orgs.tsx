// /admin/growth/orgs — national organizations with campus/chapter drilldown and
// a one-click public national partner-page link.
import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ExternalLink, RotateCw } from "lucide-react";
import { getGrowthOrgDetail, listGrowthOrgs, type OrgRow } from "@/lib/growth-admin.functions";
import { renderQueryState } from "@/components/growth/QueryState";
import {
  Drawer,
  EmptyRow,
  LoadingRow,
  Pager,
  Section,
  SearchInput,
  SITE_ORIGIN,
  copy,
} from "@/components/growth/shared";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/growth/orgs")({
  component: OrgsPage,
});

function OrgsPage() {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDq(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(1), [dq]);

  const query = useQuery({
    queryKey: ["growth-orgs", dq, page],
    queryFn: () => listGrowthOrgs({ data: { q: dq || undefined, page, pageSize: 50 } }),
    placeholderData: keepPreviousData,
  });
  const rows = query.data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search organization or letters…" />
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
              <th className="px-3 py-2 text-left">Organization</th>
              <th className="px-2 py-2 text-left">Council</th>
              <th className="px-2 py-2 text-right">Campuses</th>
              <th className="px-2 py-2 text-right">Chapters</th>
              <th className="px-2 py-2 text-right">Claimed</th>
              <th className="px-2 py-2 text-right">People</th>
              <th className="px-2 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <LoadingRow colSpan={7} />
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={7}>No organizations.</EmptyRow>
            ) : (
              rows.map((r) => <OrgRowView key={r.id} r={r} onOpen={() => setOpenId(r.id)} />)
            )}
          </tbody>
        </table>
      </div>

      <Pager page={page} pageSize={50} total={query.data?.total ?? 0} onPage={setPage} />

      <OrgDrawer orgId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function OrgRowView({ r, onOpen }: { r: OrgRow; onOpen: () => void }) {
  return (
    <tr onClick={onOpen} className="cursor-pointer border-b last:border-0 hover:bg-accent/40">
      <td className="px-3 py-2">
        <span className="font-medium">{r.name}</span>
        {r.letters && <span className="ml-1.5 text-xs text-muted-foreground">{r.letters}</span>}
      </td>
      <td className="px-2 py-2 text-xs uppercase text-muted-foreground">{r.council ?? "—"}</td>
      <td className="px-2 py-2 text-right tabular-nums">{r.campuses}</td>
      <td className="px-2 py-2 text-right tabular-nums">{r.chapters}</td>
      <td className="px-2 py-2 text-right tabular-nums">
        {r.claimedChapters || <span className="text-muted-foreground/40">0</span>}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        {r.people || <span className="text-muted-foreground/40">0</span>}
      </td>
      <td className="px-2 py-2">
        <a
          href={`${SITE_ORIGIN}/partners/national/${r.slug}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent/40"
        >
          <ExternalLink className="h-3 w-3" /> Partner page
        </a>
      </td>
    </tr>
  );
}

function OrgDrawer({ orgId, onClose }: { orgId: string | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["growth-org-detail", orgId],
    queryFn: () => getGrowthOrgDetail({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });
  const d = q.data;
  const partnerUrl = d ? `${SITE_ORIGIN}/partners/national/${d.slug}` : null;
  return (
    <Drawer
      open={!!orgId}
      onClose={onClose}
      title={d?.name ?? "Organization"}
      subtitle={d ? [d.letters, d.council].filter(Boolean).join(" · ") : undefined}
    >
      {!d ? (
        renderQueryState(q, { label: "organization" }) ?? <div className="py-10 text-center text-sm text-muted-foreground">Not found.</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {partnerUrl && (
              <a
                href={partnerUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm hover:bg-accent/40"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Partner page
              </a>
            )}
            {partnerUrl && (
              <button
                onClick={() => {
                  copy(partnerUrl);
                  toast.success("Link copied");
                }}
                className="rounded-md border px-2.5 py-1.5 text-sm hover:bg-accent/40"
              >
                Copy link
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Campuses" value={d.campuses} />
            <MiniStat label="Chapters" value={d.chapters} />
            <MiniStat label="Members" value={d.members} />
          </div>

          <Section title={`Campuses (${d.campusList.length})`}>
            {d.campusList.length === 0 ? (
              <div className="text-sm text-muted-foreground">No chapters yet.</div>
            ) : (
              <div className="max-h-96 space-y-1 overflow-y-auto">
                {d.campusList.map((c) => (
                  <Link
                    key={c.campusId}
                    to="/admin/growth/chapters"
                    search={{ campusId: c.campusId } as never}
                    className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm hover:bg-accent/40"
                  >
                    <span className="min-w-0 truncate">{c.campusName}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {c.chapters} chapters{c.claimed ? ` · ${c.claimed} claimed` : ""}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </Drawer>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
