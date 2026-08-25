// /admin/growth/intelligence — Growth Contact Intelligence. Per-campus view of
// publicly-discovered contacts (council, chapter, business clubs) plus an
// Instagram priority queue. DISCOVERY ONLY — reads the public web, sends nothing.
// The two "Run discovery" buttons call POST server fns that scrape public pages;
// no message, DM, or follow is ever sent from here.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Instagram, Loader2, RotateCw, Search, ShieldAlert } from "lucide-react";
import {
  discoverBusinessClubs,
  discoverChapterContacts,
  getCampusIntel,
  getInstagramQueue,
} from "@/lib/growth-intel.functions";
import { searchCampuses } from "@/lib/campus-overrides.functions";
import { EmptyRow, LoadingRow, Section, StorageBanner } from "@/components/growth/shared";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/growth/intelligence")({
  component: IntelligencePage,
});

// The 10 diverse V1 test campuses (§18), for one-click selection. Any campus can
// still be chosen by name via the search box — these are just a shortcut.
const TEST_CAMPUSES: { id: string; name: string }[] = [
  { id: "b3af67c6-99a5-4677-83d5-aa7d11a89c17", name: "University of Alabama" },
  { id: "3f570e37-5394-4058-baab-508948befedb", name: "University of Georgia" },
  { id: "e330e87c-5467-4c05-9d3d-6cd2398de036", name: "Auburn University" },
  { id: "972451c3-bc5e-48d7-9f88-868a55378efa", name: "Vanderbilt University" },
  { id: "1e6b6504-3a9c-44e2-81a9-ee961f66563a", name: "Ohio State University" },
  { id: "faad6039-be72-4f5c-8ad5-ca7b95e2889f", name: "University of Texas at Austin" },
  { id: "0fa0e5bb-76cd-4299-a9af-f8802eaf317c", name: "Spelman College" },
  { id: "0b7532ee-e905-4012-b835-ab99faf022d6", name: "Howard University" },
  { id: "405335e8-8bb7-4d03-96d2-6d9fb0415684", name: "Middle Tennessee State University" },
  { id: "42c3eddd-939e-48ae-ba21-2d04bdadb84e", name: "Florida Atlantic University" },
];

// ── row shapes (server selects are untyped; describe what we render) ──────────
type StatusRow = {
  category: string;
  entity_id: string | null;
  status: string | null;
  results_found: number | null;
  last_attempted_at: string | null;
};
type CouncilStatusRow = {
  council_type: string;
  status: string | null;
  contacts_found: number | null;
  role_inbox_found: boolean | null;
};
type ClubRow = {
  id: string;
  campus_id: string;
  category: string;
  name: string | null;
  website_url: string | null;
  instagram_url: string | null;
  general_email: string | null;
  confidence: string | null;
  source_url: string | null;
};
type ChapterContactRow = {
  id: string;
  contact_type: string | null;
  name: string | null;
  role: string | null;
  email: string | null;
  instagram_url: string | null;
  confidence: string | null;
  source_url: string | null;
};
type CouncilContactRow = {
  id: string;
  council_type: string | null;
  contact_type: string | null;
  name: string | null;
  role: string | null;
  email: string | null;
  instagram_url: string | null;
  source_url: string | null;
  confidence: string | null;
  is_current: boolean | null;
};
type QueueItem = {
  kind: string;
  campaign: string;
  campus_id: string;
  label: string;
  instagram_url: string;
  confidence: string;
  rank: number;
};

function IntelligencePage() {
  const [campusId, setCampusId] = useState<string | null>(null);
  const [campusName, setCampusName] = useState<string>("");

  const intel = useQuery({
    queryKey: ["growth-intel-campus", campusId],
    queryFn: () => getCampusIntel({ data: { campusId: campusId! } }),
    enabled: !!campusId,
  });
  const queue = useQuery({
    queryKey: ["growth-intel-ig-queue"],
    queryFn: () => getInstagramQueue({ data: { limit: 300 } }),
    enabled: !!campusId,
  });

  const storageReady =
    (intel.data?.storageReady ?? true) && (queue.data?.storageReady ?? true);

  const refetchAll = () => {
    void intel.refetch();
    void queue.refetch();
  };

  return (
    <div className="space-y-4">
      {campusId && !storageReady && <StorageBanner />}

      <CampusPicker
        campusId={campusId}
        campusName={campusName}
        onPick={(id, name) => {
          setCampusId(id);
          setCampusName(name);
        }}
        onClear={() => {
          setCampusId(null);
          setCampusName("");
        }}
      />

      {!campusId ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          Pick a campus to see its discovered contacts and Instagram queue.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <DiscoverButtons
              campusId={campusId}
              disabled={!storageReady}
              onDone={refetchAll}
            />
            <button
              onClick={refetchAll}
              className="ml-auto flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm hover:bg-accent/40"
              title="Refresh"
            >
              <RotateCw
                className={cn("h-3.5 w-3.5", (intel.isFetching || queue.isFetching) && "animate-spin")}
              />
            </button>
          </div>

          <StatusStrip
            loading={intel.isLoading}
            councilStatus={(intel.data?.councilStatus ?? []) as CouncilStatusRow[]}
            statuses={(intel.data?.statuses ?? []) as StatusRow[]}
          />

          <CouncilContactsSection
            loading={intel.isLoading}
            rows={(intel.data?.councilContacts ?? []) as CouncilContactRow[]}
          />

          <ChapterContactsSection
            loading={intel.isLoading}
            rows={(intel.data?.chapterContacts ?? []) as ChapterContactRow[]}
          />

          <BusinessClubsSection
            loading={intel.isLoading}
            rows={(intel.data?.clubs ?? []) as ClubRow[]}
          />

          <InstagramQueueSection
            loading={queue.isLoading}
            campusId={campusId}
            campusName={campusName}
            items={(queue.data?.items ?? []) as QueueItem[]}
          />
        </>
      )}
    </div>
  );
}

// ── campus picker ─────────────────────────────────────────────────────────────
function CampusPicker({
  campusId,
  campusName,
  onPick,
  onClear,
}: {
  campusId: string | null;
  campusName: string;
  onPick: (id: string, name: string) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDq(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const hits = useQuery({
    queryKey: ["growth-intel-campus-search", dq],
    queryFn: () => searchCampuses({ data: { q: dq } }),
    enabled: dq.trim().length >= 2,
  });

  if (campusId) {
    return (
      <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            Campus
          </span>
          {campusName || "Selected campus"}
        </div>
        <button onClick={onClear} className="text-xs text-muted-foreground underline">
          change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search any campus by name…"
          className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          autoFocus
        />
        {hits.data && hits.data.length > 0 && (
          <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-background shadow-lg">
            {hits.data.map((c: { id: string; name: string }) => (
              <button
                key={c.id}
                onClick={() => onPick(c.id, c.name)}
                className="block w-full px-2.5 py-1.5 text-left text-sm hover:bg-accent/40"
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Test campuses
        </span>
        {TEST_CAMPUSES.map((c) => (
          <button
            key={c.id}
            onClick={() => onPick(c.id, c.name)}
            className="rounded-full border px-2 py-0.5 text-xs hover:border-primary/50 hover:bg-accent/40"
          >
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── discovery buttons ─────────────────────────────────────────────────────────
function DiscoverButtons({
  campusId,
  disabled,
  onDone,
}: {
  campusId: string;
  disabled: boolean;
  onDone: () => void;
}) {
  const runClubs = useServerFn(discoverBusinessClubs);
  const runChapters = useServerFn(discoverChapterContacts);
  const [busy, setBusy] = useState<null | "clubs" | "chapters">(null);

  const run = async (
    kind: "clubs" | "chapters",
    fn: () => Promise<{ ok?: boolean; cost?: number }>,
  ) => {
    if (busy) return;
    setBusy(kind);
    try {
      const res = await fn();
      const cost = typeof res?.cost === "number" ? ` ($${res.cost.toFixed(2)})` : "";
      toast.success(`Discovery complete${cost}`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Discovery failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <button
        disabled={disabled || busy !== null}
        onClick={() => run("clubs", () => runClubs({ data: { campusId } }))}
        className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {busy === "clubs" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Search className="h-3.5 w-3.5" />
        )}
        Discover business clubs
      </button>
      <button
        disabled={disabled || busy !== null}
        onClick={() => run("chapters", () => runChapters({ data: { campusId, limit: 5 } }))}
        className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {busy === "chapters" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Search className="h-3.5 w-3.5" />
        )}
        Discover chapter contacts
      </button>
      <span className="text-xs text-muted-foreground">
        Run discovery (reads public web; sends nothing) — takes a minute or two.
      </span>
    </>
  );
}

// ── discovery-status strip ────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, string> = {
  not_run: "border-dashed border-muted-foreground/40 bg-transparent text-muted-foreground",
  running: "border-sky-300 bg-sky-50 text-sky-700",
  complete: "border-emerald-300 bg-emerald-50 text-emerald-700",
  no_result: "border-amber-300 bg-amber-100 text-amber-800",
  error: "border-rose-300 bg-rose-50 text-rose-700",
};

function StatusChip({ status }: { status: string }) {
  const key = STATUS_STYLE[status] ? status : "not_run";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        STATUS_STYLE[key],
      )}
    >
      {status === "not_run" ? "not run" : status.replace(/_/g, " ")}
    </span>
  );
}

function agg(rows: { status: string | null; count: number }[]): { status: string; found: number } {
  if (rows.length === 0) return { status: "not_run", found: 0 };
  const found = rows.reduce((s, r) => s + (r.count || 0), 0);
  const any = (s: string) => rows.some((r) => (r.status || "") === s);
  let status: string;
  if (any("running")) status = "running";
  else if (found > 0 || any("complete")) status = "complete";
  else if (any("no_result")) status = "no_result";
  else if (any("error") || any("failed")) status = "error";
  else status = rows[0].status || "not_run";
  return { status, found };
}

function StatusStrip({
  loading,
  councilStatus,
  statuses,
}: {
  loading: boolean;
  councilStatus: CouncilStatusRow[];
  statuses: StatusRow[];
}) {
  const byCategory = (cat: string) =>
    statuses
      .filter((s) => s.category === cat)
      .map((s) => ({ status: s.status, count: s.results_found || 0 }));

  const council = agg(
    councilStatus.map((s) => ({ status: s.status, count: s.contacts_found || 0 })),
  );
  const chapter = agg(byCategory("chapter"));
  const wib = agg(byCategory("women_in_business"));
  const invfin = agg(byCategory("investment_finance"));

  const cards: { label: string; note?: string; s: { status: string; found: number } }[] = [
    { label: "Council", note: "from Campus Backfill", s: council },
    { label: "Chapter", s: chapter },
    { label: "Women in Business", s: wib },
    { label: "Investment / Finance", s: invfin },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            <span className="truncate">{c.label}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <>
                <StatusChip status={c.s.status} />
                <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                  {c.s.found} found
                </span>
              </>
            )}
          </div>
          {c.note && <div className="mt-1 text-[10px] text-muted-foreground">{c.note}</div>}
        </div>
      ))}
    </div>
  );
}

// ── shared presentational bits ────────────────────────────────────────────────
function ConfidencePill({ confidence }: { confidence: string | null }) {
  const key = (confidence ?? "").toLowerCase();
  const style =
    key === "high"
      ? "bg-emerald-100 text-emerald-700"
      : key === "medium"
        ? "bg-amber-100 text-amber-700"
        : key === "low"
          ? "bg-muted text-muted-foreground"
          : "bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold", style)}>
      {confidence || "—"}
    </span>
  );
}

function IgLink({ url }: { url: string | null }) {
  if (!url) return <span className="text-muted-foreground/40">—</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-pink-600 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      <Instagram className="h-3.5 w-3.5" /> IG
    </a>
  );
}

function SourceLink({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      <ExternalLink className="h-3 w-3" /> source
    </a>
  );
}

// ── council contacts (read-only) ──────────────────────────────────────────────
function CouncilContactsSection({
  loading,
  rows,
}: {
  loading: boolean;
  rows: CouncilContactRow[];
}) {
  return (
    <Section title={`Council contacts (${rows.length})`}>
      <div className="mb-2 text-xs text-muted-foreground">
        from Campus Backfill (read-only) — collected for COUNCIL_DISTRIBUTION.
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Council</th>
              <th className="px-2 py-2 text-left">Type</th>
              <th className="px-2 py-2 text-left">Name / role</th>
              <th className="px-2 py-2 text-left">Email</th>
              <th className="px-2 py-2 text-left">IG</th>
              <th className="px-2 py-2 text-left">Conf.</th>
              <th className="px-2 py-2 text-left">Src</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <LoadingRow colSpan={7} />
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={7}>No council contacts from Backfill yet.</EmptyRow>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium uppercase">{r.council_type ?? "—"}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">
                    {(r.contact_type ?? "—").replace(/_/g, " ")}
                  </td>
                  <td className="px-2 py-2">
                    {r.name ?? <span className="text-muted-foreground/40">—</span>}
                    {r.role && <span className="ml-1 text-xs text-muted-foreground">· {r.role}</span>}
                  </td>
                  <td className="px-2 py-2 text-xs">
                    {r.email ?? <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-2 py-2 text-xs">
                    <IgLink url={r.instagram_url} />
                  </td>
                  <td className="px-2 py-2">
                    <ConfidencePill confidence={r.confidence} />
                  </td>
                  <td className="px-2 py-2">
                    <SourceLink url={r.source_url} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ── chapter contacts ──────────────────────────────────────────────────────────
function ChapterContactsSection({
  loading,
  rows,
}: {
  loading: boolean;
  rows: ChapterContactRow[];
}) {
  return (
    <Section title={`Chapter contacts (${rows.length})`}>
      <div className="mb-2 text-xs text-muted-foreground">collected for CHAPTER_DISTRIBUTION.</div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-2 py-2 text-left">Name</th>
              <th className="px-2 py-2 text-left">Role</th>
              <th className="px-2 py-2 text-left">Email</th>
              <th className="px-2 py-2 text-left">IG</th>
              <th className="px-2 py-2 text-left">Conf.</th>
              <th className="px-2 py-2 text-left">Src</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <LoadingRow colSpan={7} />
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={7}>
                No chapter contacts yet — run discovery to collect them.
              </EmptyRow>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {(r.contact_type ?? "—").replace(/_/g, " ")}
                  </td>
                  <td className="px-2 py-2 font-medium">
                    {r.name ?? <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{r.role ?? "—"}</td>
                  <td className="px-2 py-2 text-xs">
                    {r.email ?? <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-2 py-2 text-xs">
                    <IgLink url={r.instagram_url} />
                  </td>
                  <td className="px-2 py-2">
                    <ConfidencePill confidence={r.confidence} />
                  </td>
                  <td className="px-2 py-2">
                    <SourceLink url={r.source_url} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ── business clubs (grouped by category) ──────────────────────────────────────
const CLUB_CATEGORY_LABEL: Record<string, string> = {
  women_in_business: "Women in Business",
  investment_finance: "Investment / Finance",
};

function BusinessClubsSection({ loading, rows }: { loading: boolean; rows: ClubRow[] }) {
  const groups = useMemo(() => {
    const m = new Map<string, ClubRow[]>();
    for (const r of rows) {
      const k = r.category || "other";
      (m.get(k) ?? m.set(k, []).get(k)!).push(r);
    }
    return [...m.entries()];
  }, [rows]);

  return (
    <Section title={`Business clubs (${rows.length})`}>
      <div className="mb-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
        Collected for CAMPUS REP RECRUITMENT — a separate channel from Greek distribution (§16).
      </div>
      {loading ? (
        <div className="py-8 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">
          No business clubs yet — run discovery to collect them.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(([cat, list]) => (
            <div key={cat}>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {CLUB_CATEGORY_LABEL[cat] ?? cat.replace(/_/g, " ")} ({list.length})
              </div>
              <div className="space-y-1.5">
                {list.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{r.name ?? "—"}</span>
                    <ConfidencePill confidence={r.confidence} />
                    {r.general_email && (
                      <span className="text-xs text-muted-foreground">{r.general_email}</span>
                    )}
                    <div className="ml-auto flex items-center gap-3">
                      <IgLink url={r.instagram_url} />
                      {r.website_url && (
                        <a
                          href={r.website_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" /> site
                        </a>
                      )}
                      <SourceLink url={r.source_url} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ── instagram priority queue (grouped by campaign) ────────────────────────────
const CAMPAIGN_ORDER = [
  "COUNCIL_DISTRIBUTION",
  "CHAPTER_DISTRIBUTION",
  "CAMPUS_REP_RECRUITMENT",
] as const;

function InstagramQueueSection({
  loading,
  campusId,
  campusName,
  items,
}: {
  loading: boolean;
  campusId: string;
  campusName: string;
  items: QueueItem[];
}) {
  const forCampus = items.filter((i) => i.campus_id === campusId);
  const byCampaign = (c: string) =>
    forCampus.filter((i) => i.campaign === c).sort((a, b) => b.rank - a.rank);

  return (
    <Section title={`Instagram priority queue (${forCampus.length})`}>
      <div className="mb-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        Manual human sending only — this tool never sends, DMs, or follows anyone.
      </div>
      {loading ? (
        <div className="py-8 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : forCampus.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">
          No Instagram accounts queued for {campusName || "this campus"} yet.
        </div>
      ) : (
        <div className="space-y-4">
          {CAMPAIGN_ORDER.map((camp) => {
            const list = byCampaign(camp);
            if (list.length === 0) return null;
            return (
              <div key={camp}>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {camp.replace(/_/g, " ")} ({list.length})
                </div>
                <div className="space-y-1.5">
                  {list.map((i, idx) => (
                    <div
                      key={`${i.instagram_url}-${idx}`}
                      className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
                    >
                      <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {idx + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{i.label}</span>
                      <ConfidencePill confidence={i.confidence} />
                      <IgLink url={i.instagram_url} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
