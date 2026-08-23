// /admin/growth/chapters — the highest-use marketing table. Compact list from
// campus_greek_chapters; row-click drawer with public link, execs, claim, and the
// outreach timeline + quick actions.
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ExternalLink, Instagram, RotateCw } from "lucide-react";
import {
  getGrowthChapterDetail,
  listGrowthChapters,
  type ChapterRow,
} from "@/lib/growth-admin.functions";
import { listOutreachEvents } from "@/lib/growth-outreach.functions";
import {
  ChannelPill,
  Drawer,
  EmptyRow,
  FilterSelect,
  LoadingRow,
  Pager,
  Pill,
  SearchInput,
  Section,
  SITE_ORIGIN,
  copy,
  fmtDate,
  money,
  relTime,
} from "@/components/growth/shared";
import { OutreachActions } from "@/components/growth/OutreachActions";
import { councilSlugOf } from "@/lib/growth-util";
import { toast } from "sonner";

type Search = { q?: string; council?: string; status?: string; campusId?: string };

export const Route = createFileRoute("/admin/growth/chapters")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: typeof s.q === "string" ? s.q : undefined,
    council: typeof s.council === "string" ? s.council : undefined,
    status: typeof s.status === "string" ? s.status : undefined,
    campusId: typeof s.campusId === "string" ? s.campusId : undefined,
  }),
  component: ChaptersPage,
});

const COUNCIL_OPTS = [
  { value: "all", label: "All councils" },
  { value: "ifc", label: "IFC" },
  { value: "panhellenic", label: "Panhellenic" },
  { value: "nphc", label: "NPHC" },
  { value: "mgc", label: "MGC" },
  { value: "other", label: "Other" },
] as const;
const STATUS_OPTS = [
  { value: "all", label: "All statuses" },
  { value: "claimed", label: "Claimed" },
  { value: "unclaimed", label: "Unclaimed" },
  { value: "needs_contact", label: "Needs contact" },
] as const;

function ChaptersPage() {
  const search = Route.useSearch();
  const [q, setQ] = useState(search.q ?? "");
  const [dq, setDq] = useState(search.q ?? "");
  const [council, setCouncil] = useState<string>(search.council ?? "all");
  const [status, setStatus] = useState<string>(search.status ?? "all");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDq(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(1), [dq, council, status]);

  const query = useQuery({
    queryKey: ["growth-chapters", dq, council, status, search.campusId, page],
    queryFn: () =>
      listGrowthChapters({
        data: {
          q: dq || undefined,
          council: council as never,
          status: status as never,
          campusId: search.campusId,
          page,
          pageSize: 50,
        },
      }),
    placeholderData: keepPreviousData,
  });
  const rows = query.data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Search chapter, org, letters, campus…"
        />
        <FilterSelect value={council} onChange={setCouncil} options={COUNCIL_OPTS as never} />
        <FilterSelect value={status} onChange={setStatus} options={STATUS_OPTS as never} />
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
              <th className="px-3 py-2 text-left">Chapter</th>
              <th className="px-2 py-2 text-left">Campus</th>
              <th className="px-2 py-2 text-left">Council</th>
              <th className="px-2 py-2 text-left">Status</th>
              <th className="px-2 py-2 text-right">Members</th>
              <th className="px-2 py-2 text-right">Revenue</th>
              <th className="px-2 py-2 text-left">Outreach</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <LoadingRow colSpan={8} />
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={8}>No chapters match.</EmptyRow>
            ) : (
              rows.map((r) => <ChapterRowView key={r.id} r={r} onOpen={() => setOpenId(r.id)} />)
            )}
          </tbody>
        </table>
      </div>

      <Pager page={page} pageSize={50} total={query.data?.total ?? 0} onPage={setPage} />

      <ChapterDrawer
        chapterId={openId}
        onClose={() => setOpenId(null)}
        onChanged={() => query.refetch()}
      />
    </div>
  );
}

function councilLabel(raw: string | null): string {
  if (!raw) return "—";
  const { slug, name } = councilSlugOf(raw);
  return slug === "other" ? raw : name;
}

function ChapterRowView({ r, onOpen }: { r: ChapterRow; onOpen: () => void }) {
  return (
    <tr onClick={onOpen} className="cursor-pointer border-b last:border-0 hover:bg-accent/40">
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="font-medium">{r.chapterName}</span>
          {r.letters && <span className="text-xs text-muted-foreground">{r.letters}</span>}
          {r.isNationalOrg && (
            <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">HQ</span>
          )}
        </div>
      </td>
      <td className="px-2 py-2 text-xs text-muted-foreground">{r.campusName}</td>
      <td className="px-2 py-2 text-xs">{councilLabel(r.council)}</td>
      <td className="px-2 py-2">
        <span className="flex items-center gap-1">
          <Pill status={r.claimStatus ?? "unclaimed"} />
          {r.needsContact && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              no contact
            </span>
          )}
        </span>
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        {r.members || <span className="text-muted-foreground/40">0</span>}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        {r.seatRevenueCents ? (
          money(r.seatRevenueCents)
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </td>
      <td className="px-2 py-2 text-xs text-muted-foreground">
        {r.followUpsDue > 0 ? (
          <Pill status="pending">{r.followUpsDue} due</Pill>
        ) : (
          relTime(r.lastOutreachAt)
        )}
      </td>
      <td className="px-2 py-2 text-right">
        {r.instagram && (
          <a
            href={r.instagram}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex text-muted-foreground hover:text-foreground"
          >
            <Instagram className="h-4 w-4" />
          </a>
        )}
      </td>
    </tr>
  );
}

function ChapterDrawer({
  chapterId,
  onClose,
  onChanged,
}: {
  chapterId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const q = useQuery({
    queryKey: ["growth-chapter-detail", chapterId],
    queryFn: () => getGrowthChapterDetail({ data: { chapterId: chapterId! } }),
    enabled: !!chapterId,
  });
  const events = useQuery({
    queryKey: ["growth-chapter-events", chapterId],
    queryFn: () => listOutreachEvents({ data: { entityType: "chapter", entityId: chapterId! } }),
    enabled: !!chapterId,
  });
  const d = q.data;
  const url = d?.publicPath ? `${SITE_ORIGIN}${d.publicPath}` : null;

  const refetchAll = () => {
    void q.refetch();
    void events.refetch();
    onChanged();
  };

  return (
    <Drawer
      open={!!chapterId}
      onClose={onClose}
      title={d?.chapterName ?? "Chapter"}
      subtitle={d ? [d.campusName, d.letters].filter(Boolean).join(" · ") : undefined}
    >
      {!d ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm hover:bg-accent/40"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Public page
              </a>
            )}
            {url && (
              <button
                onClick={() => {
                  copy(url);
                  toast.success("Link copied");
                }}
                className="rounded-md border px-2.5 py-1.5 text-sm hover:bg-accent/40"
              >
                Copy link
              </button>
            )}
            {d.instagram && (
              <a
                href={d.instagram}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm hover:bg-accent/40"
              >
                <Instagram className="h-3.5 w-3.5" /> Instagram
              </a>
            )}
            <Pill status={d.claimStatus ?? "unclaimed"} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Members" value={d.members} />
            <MiniStat label="Size" value={d.size ?? "—"} />
            <MiniStat label="Seat rev" value={money(d.seatRevenueCents)} />
          </div>

          <Section title="Quick log">
            <OutreachActions
              target={{ entityType: "chapter", entityId: d.id, campusId: d.campusId }}
              onLogged={refetchAll}
            />
          </Section>

          {d.claimContact && (
            <Section title="Claim contact">
              <ContactLine
                name={d.claimContact.name}
                role={d.claimContact.position}
                email={d.claimContact.email}
                phone={d.claimContact.phone}
                tag={d.claimContact.status ?? undefined}
              />
            </Section>
          )}

          <Section title={`Execs & people (${d.execs.length})`}>
            {d.execs.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No people on file. Add them in Contacts.
              </div>
            ) : (
              <div className="space-y-1.5">
                {d.execs.map((p, i) => (
                  <ContactLine
                    key={i}
                    name={p.name}
                    role={p.role}
                    email={p.email}
                    phone={p.phone}
                    tag={p.isCurrent ? "current" : "former"}
                    term={p.term}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section title="Outreach timeline">
            <Timeline events={events.data?.rows ?? []} ready={events.data?.storageReady ?? true} />
          </Section>
        </>
      )}
    </Drawer>
  );
}

function ContactLine({
  name,
  role,
  email,
  phone,
  tag,
  term,
}: {
  name: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  tag?: string;
  term?: string | null;
}) {
  return (
    <div className="rounded-md border px-2.5 py-1.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{name ?? "—"}</span>
        {tag && (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${tag === "former" ? "bg-muted text-muted-foreground" : "bg-emerald-100 text-emerald-700"}`}
          >
            {tag}
            {term ? ` · ${term}` : ""}
          </span>
        )}
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        {role && <span>{role}</span>}
        {email && <span>{email}</span>}
        {phone && <span>{phone}</span>}
      </div>
    </div>
  );
}

export function Timeline({
  events,
  ready,
}: {
  events: {
    id: number;
    channel: string;
    direction: string;
    status: string;
    notes: string | null;
    subject: string | null;
    occurredAt: string;
    nextFollowUpAt: string | null;
    createdBy: string | null;
  }[];
  ready: boolean;
}) {
  if (!ready)
    return (
      <div className="text-sm text-muted-foreground">
        Apply the growth migration to record outreach events.
      </div>
    );
  if (events.length === 0)
    return <div className="text-sm text-muted-foreground">No outreach logged yet.</div>;
  return (
    <div className="space-y-1.5">
      {events.map((e) => (
        <div key={e.id} className="flex items-start gap-2 text-sm">
          <span className="w-14 shrink-0 pt-0.5 text-xs text-muted-foreground">
            {fmtDate(e.occurredAt)}
          </span>
          <ChannelPill channel={e.channel} />
          <Pill status={e.status} />
          <span className="min-w-0 flex-1 text-muted-foreground">
            {e.notes ?? e.subject ?? (e.direction === "inbound" ? "inbound" : "")}
            {e.nextFollowUpAt && (
              <span className="ml-1 text-amber-600">· follow up {fmtDate(e.nextFollowUpAt)}</span>
            )}
          </span>
        </div>
      ))}
    </div>
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
