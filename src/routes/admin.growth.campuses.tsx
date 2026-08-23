// /admin/growth/campuses — compact campus table + detail drawer.
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ExternalLink, RotateCw } from "lucide-react";
import {
  getGrowthCampusDetail,
  listGrowthCampuses,
  type CampusRow,
} from "@/lib/growth-admin.functions";
import {
  ChannelPill,
  Drawer,
  EmptyRow,
  FilterSelect,
  LoadingRow,
  Pager,
  Pill,
  QualityFlags,
  ReadinessDots,
  SearchInput,
  Section,
  SITE_ORIGIN,
  Tile,
  copy,
  fmtDate,
  money,
  relTime,
} from "@/components/growth/shared";
import { toast } from "sonner";

type Search = { filter?: string; q?: string; sec?: boolean; open?: string };

export const Route = createFileRoute("/admin/growth/campuses")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    filter: typeof s.filter === "string" ? s.filter : undefined,
    q: typeof s.q === "string" ? s.q : undefined,
    sec: s.sec === true || s.sec === "true",
    open: typeof s.open === "string" ? s.open : undefined,
  }),
  component: CampusesPage,
});

const FILTER_OPTS = [
  { value: "all", label: "All campuses" },
  { value: "student_ready", label: "Student-ready" },
  { value: "greek_ready", label: "Greek-ready" },
  { value: "outreach_ready", label: "Outreach-ready" },
  { value: "needs_greek", label: "Needs Greek data" },
  { value: "needs_contacts", label: "Needs contacts" },
  { value: "has_users", label: "Has users" },
  { value: "has_revenue", label: "Has revenue" },
] as const;

function CampusesPage() {
  const search = Route.useSearch();
  const nav = Route.useNavigate();
  const [q, setQ] = useState(search.q ?? "");
  const [dq, setDq] = useState(search.q ?? "");
  const [filter, setFilter] = useState<string>(search.filter ?? "all");
  const [secOnly, setSecOnly] = useState<boolean>(!!search.sec);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(search.open ?? null);

  useEffect(() => {
    const t = setTimeout(() => setDq(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(1), [dq, filter, secOnly]);
  useEffect(() => {
    if (search.filter && search.filter !== filter) setFilter(search.filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.filter]);

  const query = useQuery({
    queryKey: ["growth-campuses", dq, filter, secOnly, page],
    queryFn: () =>
      listGrowthCampuses({
        data: { q: dq || undefined, filter: filter as never, secOnly, page, pageSize: 50 },
      }),
    placeholderData: keepPreviousData,
  });
  const rows = query.data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Campuses" value={(query.data?.kpis.campuses ?? 0).toLocaleString()} />
        <Tile
          label="Student-ready"
          value={(query.data?.kpis.studentReadyCampuses ?? 0).toLocaleString()}
          accent="emerald"
          onClick={() => setFilter("student_ready")}
          active={filter === "student_ready"}
        />
        <Tile
          label="Greek-ready"
          value={(query.data?.kpis.greekReadyCampuses ?? 0).toLocaleString()}
          accent="emerald"
          onClick={() => setFilter("greek_ready")}
          active={filter === "greek_ready"}
        />
        <Tile
          label="Needs contacts"
          value={
            (query.data?.kpis.campuses ?? 0) - (query.data?.kpis.outreachReadyCampuses ?? 0) > 0
              ? (
                  (query.data?.kpis.campuses ?? 0) - (query.data?.kpis.outreachReadyCampuses ?? 0)
                ).toLocaleString()
              : "0"
          }
          accent="amber"
          onClick={() => setFilter("needs_contacts")}
          active={filter === "needs_contacts"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search campus, state, course code…" />
        <FilterSelect value={filter} onChange={setFilter} options={FILTER_OPTS as never} />
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={secOnly}
            onChange={(e) => setSecOnly(e.target.checked)}
            className="h-4 w-4"
          />
          SEC only
        </label>
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
              <th className="px-2 py-2 text-left">Ready</th>
              <th className="px-2 py-2 text-left">Course</th>
              <th className="px-2 py-2 text-right">Chapters</th>
              <th className="px-2 py-2 text-right">Members</th>
              <th className="px-2 py-2 text-right">Revenue</th>
              <th className="px-2 py-2 text-left">Outreach</th>
              <th className="px-2 py-2 text-left">Flags</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <LoadingRow colSpan={8} />
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={8}>No campuses match.</EmptyRow>
            ) : (
              rows.map((r) => <CampusRowView key={r.id} r={r} onOpen={() => setOpenId(r.id)} />)
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <Pager page={page} pageSize={50} total={query.data?.total ?? 0} onPage={setPage} />
      </div>

      <CampusDrawer campusId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function CampusRowView({ r, onOpen }: { r: CampusRow; onOpen: () => void }) {
  const rev = r.directRevenueCents + r.seatRevenueCents;
  return (
    <tr onClick={onOpen} className="cursor-pointer border-b last:border-0 hover:bg-accent/40">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          {r.colorPrimary && (
            <span
              className="h-3 w-3 shrink-0 rounded-full border"
              style={{ background: r.colorPrimary }}
            />
          )}
          <span className="font-medium">{r.name}</span>
          {r.isSec && (
            <span className="rounded bg-primary/10 px-1 text-[10px] font-semibold text-primary">
              SEC
            </span>
          )}
          {r.state && <span className="text-xs text-muted-foreground">{r.state}</span>}
        </div>
      </td>
      <td className="px-2 py-2">
        <ReadinessDots student={r.studentReady} greek={r.greekReady} outreach={r.outreachReady} />
      </td>
      <td className="px-2 py-2 font-mono text-xs">
        {r.courseCode ?? <span className="text-muted-foreground/40">—</span>}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        {r.chapters || <span className="text-muted-foreground/40">0</span>}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        {r.members || <span className="text-muted-foreground/40">0</span>}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        {rev ? money(rev) : <span className="text-muted-foreground/40">—</span>}
      </td>
      <td className="px-2 py-2 text-xs text-muted-foreground">
        {r.followUpsDue > 0 ? (
          <Pill status="pending">{r.followUpsDue} due</Pill>
        ) : (
          relTime(r.lastOutreachAt)
        )}
      </td>
      <td className="px-2 py-2">
        <QualityFlags flags={r} />
      </td>
    </tr>
  );
}

function CampusDrawer({ campusId, onClose }: { campusId: string | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["growth-campus-detail", campusId],
    queryFn: () => getGrowthCampusDetail({ data: { campusId: campusId! } }),
    enabled: !!campusId,
  });
  const d = q.data;
  return (
    <Drawer
      open={!!campusId}
      onClose={onClose}
      title={d?.name ?? "Campus"}
      subtitle={d ? [d.state, d.isSec ? "SEC" : null].filter(Boolean).join(" · ") : undefined}
    >
      {!d ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {d.publicPath ? (
              <a
                href={`${SITE_ORIGIN}${d.publicPath}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm hover:bg-accent/40"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Public page
              </a>
            ) : null}
            {d.publicPath && (
              <button
                onClick={() => {
                  copy(`${SITE_ORIGIN}${d.publicPath}`);
                  toast.success("Link copied");
                }}
                className="rounded-md border px-2.5 py-1.5 text-sm hover:bg-accent/40"
              >
                Copy link
              </button>
            )}
            <ReadinessDots
              student={d.studentReady}
              greek={d.greekReady}
              outreach={d.outreachReady}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Chapters" value={d.chapters.length} />
            <MiniStat label="Members" value={d.members} />
            <MiniStat label="Revenue" value={money(d.directRevenueCents + d.seatRevenueCents)} />
          </div>

          <Section title="Course & routing">
            <dl className="space-y-1 text-sm">
              <Row label="Intro 1 code" value={d.courseCode ?? "— needs review"} />
              <Row label="Public route" value={d.publicPath ?? "— no slug"} />
              <Row label="Outreach status" value={d.outreachStatus ?? "—"} />
            </dl>
          </Section>

          {d.flags.length > 0 && (
            <Section title="Data quality">
              <div className="flex flex-wrap gap-1.5">
                {d.flags.map((f) => (
                  <span
                    key={f}
                    className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </Section>
          )}

          <Section title={`Councils (${d.councils.length})`}>
            {d.councils.length === 0 ? (
              <div className="text-sm text-muted-foreground">No councils yet.</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {d.councils.map((c) => (
                  <span key={c.slug} className="rounded-full border px-2 py-0.5 text-xs">
                    {c.name} · {c.chapters}
                  </span>
                ))}
              </div>
            )}
          </Section>

          <Section title={`Chapters (${d.chapters.length})`}>
            {d.chapters.length === 0 ? (
              <div className="text-sm text-muted-foreground">No chapters imported.</div>
            ) : (
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {d.chapters.slice(0, 60).map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {c.chapterName}
                      {c.letters && (
                        <span className="ml-1 text-xs text-muted-foreground">{c.letters}</span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      {c.members > 0 && <span>{c.members} mem</span>}
                      <Pill status={c.claimStatus ?? "unclaimed"} />
                    </span>
                  </div>
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
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
