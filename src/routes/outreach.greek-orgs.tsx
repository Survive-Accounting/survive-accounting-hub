// GreekIntel — Chapters / Leads / People tabs + ProPublica enrichment + signals.
// /outreach/greek-orgs — Greek org registry v2. Per-campus chapters
// (campus_greek_chapters) linked to the national catalog (greek_orgs), plus
// ProPublica 990 enrichment: per-org filings (financials) and officers/advisors
// tenure — THE LEADS. Registry only; no outreach. Add-chapter + CSV import are
// gated behind ?admin=1. Reuses the shared CampusCombobox + FilterPill.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Users2,
} from "lucide-react";

import {
  accumulateOfficers,
  addGreekChapter,
  COUNCILS,
  councilLabel,
  deleteGreekChapter,
  fetchCampusContext,
  fetchFirmRollup,
  fetchGreekCampuses,
  fetchGreekCatalog,
  FILING_ITEM_FIELDS,
  FIRM_SOURCES,
  GREEK_STATUSES,
  importChapterGpaTsv,
  importGreekChaptersCsv,
  linkedInAdvisorUrl,
  listAllFilings,
  listChapterGpa,
  listGreekChapters,
  listGreekFilings,
  listGreekPeople,
  nextGreekStatus,
  proPublicaUrl,
  sosSearchUrl,
  updateCampusFslUrl,
  updateGreekChapter,
  updateGreekFiling,
  updateGreekPerson,
  upsertCampusContext,
  upsertFirmLead,
  type CampusContext,
  type FirmRow,
  type GreekCampus,
  type GreekChapter,
  type GreekFiling,
  type GreekOrgCatalog,
  type GreekPerson,
} from "@/lib/greek-orgs";
import { enrichGreekOrgFilings } from "@/lib/greek-orgs.functions";
import { parseOfficers } from "@/lib/greek-officers";
import { deriveNameFromDomain, INDUSTRIES, industryLabel } from "@/lib/greek-vendors";
import { computeOrgSignals, SIGNALS, signalLabel, type SignalKey } from "@/lib/greek-signals";
import { FilterPill } from "@/components/outreach/FilterPill";
import { CampusCombobox } from "@/components/outreach/CampusCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/outreach/greek-orgs")({
  validateSearch: (s: Record<string, unknown>): { admin?: number } => ({
    admin: s.admin === "1" || s.admin === 1 ? 1 : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Outreach — Greek orgs" },
      { name: "description", content: "SEC Greek chapter registry + ProPublica enrichment." },
    ],
  }),
  component: GreekOrgs,
});

const STATUS_STYLE: Record<string, string> = {
  identified: "bg-slate-100 text-slate-600 border-slate-200",
  researching: "bg-blue-100 text-blue-700 border-blue-200",
  pilot: "bg-amber-100 text-amber-700 border-amber-200",
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  declined: "bg-red-100 text-red-700 border-red-200",
  dormant: "bg-muted text-muted-foreground border-border",
};
const inputCls = "h-9 rounded-md border border-input bg-background px-2 text-sm";
const fmtMoney = (n: number | null) =>
  n == null ? "—" : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}k`;

function GreekOrgs() {
  const { admin } = Route.useSearch();
  const isAdmin = admin === 1;
  const [tab, setTab] = useState<"chapters" | "people" | "leads" | "firms">("chapters");

  const campusesQuery = useQuery({ queryKey: ["greek-campuses"], queryFn: fetchGreekCampuses });
  const catalogQuery = useQuery({ queryKey: ["greek-catalog"], queryFn: fetchGreekCatalog });
  const chaptersQuery = useQuery({ queryKey: ["greek-chapters"], queryFn: listGreekChapters });
  const allFilingsQuery = useQuery({ queryKey: ["greek-all-filings"], queryFn: listAllFilings });
  const gpaQuery = useQuery({ queryKey: ["greek-gpa"], queryFn: listChapterGpa });
  const peopleQuery = useQuery({ queryKey: ["greek-people"], queryFn: listGreekPeople });
  const campuses = useMemo(() => campusesQuery.data ?? [], [campusesQuery.data]);
  const catalog = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data]);
  const chapters = useMemo(() => chaptersQuery.data ?? [], [chaptersQuery.data]);
  const campusById = useMemo(() => new Map(campuses.map((c) => [c.id, c])), [campuses]);
  const catalogById = useMemo(() => new Map(catalog.map((o) => [o.id, o])), [catalog]);

  // Per-org signals from all filings + GPA terms.
  const signalsByOrg = useMemo(() => {
    const fBy = new Map<string, any[]>();
    for (const f of allFilingsQuery.data ?? []) {
      if (!f.org_id) continue;
      (fBy.get(f.org_id) ?? fBy.set(f.org_id, []).get(f.org_id)!).push(f);
    }
    const gBy = new Map<string, any[]>();
    for (const g of gpaQuery.data ?? []) {
      if (!g.greek_org_id) continue;
      (gBy.get(g.greek_org_id) ?? gBy.set(g.greek_org_id, []).get(g.greek_org_id)!).push(g);
    }
    const m = new Map<string, SignalKey[]>();
    for (const id of new Set([...fBy.keys(), ...gBy.keys()])) {
      const sig = computeOrgSignals(fBy.get(id) ?? [], gBy.get(id) ?? []);
      if (sig.length) m.set(id, sig);
    }
    return m;
  }, [allFilingsQuery.data, gpaQuery.data]);

  const refetchAll = () => {
    chaptersQuery.refetch();
    catalogQuery.refetch();
    allFilingsQuery.refetch();
    gpaQuery.refetch();
    peopleQuery.refetch();
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-1 flex items-center gap-2">
        <Users2 className="h-5 w-5" />
        <h1 className="text-xl font-bold tracking-tight">Greek org registry</h1>
        <Badge variant="outline" className="text-[10px]">
          GreekIntel
        </Badge>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <FilterPill active={tab === "chapters"} onClick={() => setTab("chapters")}>
          Chapters
        </FilterPill>
        <FilterPill active={tab === "leads"} onClick={() => setTab("leads")}>
          Leads
        </FilterPill>
        <FilterPill active={tab === "people"} onClick={() => setTab("people")}>
          People
        </FilterPill>
        <FilterPill active={tab === "firms"} onClick={() => setTab("firms")}>
          Firms
        </FilterPill>
        <Link
          to="/outreach/greek-orgs/queue"
          className="ml-2 inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/10"
        >
          Enrichment queue →
        </Link>
        <Link
          to="/outreach/greek-orgs/people-queue"
          className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/10"
        >
          People queue →
        </Link>
        <Link
          to="/outreach/greek-orgs/vendor-queue"
          className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/10"
        >
          Vendor queue →
        </Link>
      </div>

      {tab === "chapters" && (
        <ChaptersTab
          isAdmin={isAdmin}
          campuses={campuses}
          catalog={catalog}
          catalogById={catalogById}
          campusById={campusById}
          chapters={chapters}
          filings={allFilingsQuery.data ?? []}
          signalsByOrg={signalsByOrg}
          loading={chaptersQuery.isLoading}
          refetchChapters={refetchAll}
          refetchCampuses={() => campusesQuery.refetch()}
          refetchCatalog={() => catalogQuery.refetch()}
        />
      )}
      {tab === "leads" && (
        <LeadsTab
          catalog={catalog}
          signalsByOrg={signalsByOrg}
          filings={allFilingsQuery.data ?? []}
          people={peopleQuery.data ?? []}
          onPersonChanged={() => peopleQuery.refetch()}
        />
      )}
      {tab === "people" && (
        <PeopleTab campuses={campuses} chapters={chapters} catalogById={catalogById} />
      )}
      {tab === "firms" && <FirmsTab catalogById={catalogById} />}
    </div>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  "990_preparer": "990 preparer",
  "990_fundraiser": "990 fundraiser",
  "990_contractor": "990 contractor",
  national_vendor_list: "vendor list",
  manual: "manual",
};

function FirmsTab({ catalogById }: { catalogById: Map<string, GreekOrgCatalog> }) {
  const firmsQuery = useQuery({ queryKey: ["greek-firms"], queryFn: fetchFirmRollup });
  const firms = useMemo(() => firmsQuery.data ?? [], [firmsQuery.data]);
  const [open, setOpen] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [industry, setIndustry] = useState<string>("");

  const filtered = useMemo(
    () =>
      firms.filter(
        (f) => (!source || f.sources.includes(source)) && (!industry || f.industry === industry),
      ),
    [firms, source, industry],
  );

  async function saveLead(name: string, patch: Parameters<typeof upsertFirmLead>[1]) {
    try {
      await upsertFirmLead(name, patch);
      firmsQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save.");
    }
  }

  return (
    <>
      <FirmQuickAdd onAdded={() => firmsQuery.refetch()} />

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Source:</span>
        <FilterPill active={!source} onClick={() => setSource(null)}>
          All
        </FilterPill>
        {FIRM_SOURCES.map((s) => (
          <FilterPill key={s} active={source === s} onClick={() => setSource(s)}>
            {SOURCE_LABEL[s]}
          </FilterPill>
        ))}
        <span className="ml-2 text-[11px] text-muted-foreground">Industry:</span>
        <select
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          className="h-7 rounded-md border border-input bg-background px-1.5 text-[11px]"
        >
          <option value="">all</option>
          {INDUSTRIES.map((i) => (
            <option key={i} value={i}>
              {industryLabel(i)}
            </option>
          ))}
        </select>
        <span className="ml-2 text-[11px] text-muted-foreground">
          {filtered.length} of {firms.length} firms
        </span>
      </div>

      {firmsQuery.isLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
          No firms match. 990 preparers/fundraisers roll up from filings; vendor-list firms come
          from the vendor queue.
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((f) => (
            <FirmRowCard
              key={f.firm_name}
              f={f}
              catalogById={catalogById}
              expanded={open === f.firm_name}
              onToggle={() => setOpen((v) => (v === f.firm_name ? null : f.firm_name))}
              onSave={(patch) => saveLead(f.firm_name, patch)}
            />
          ))}
        </div>
      )}
    </>
  );
}

/** One-line manual firm quick-add: website URL → derived (editable) name →
 *  industry → note. Doubles as King's vendor-list logger via the source select
 *  (org + list URL fields appear for source=vendor list). */
function FirmQuickAdd({ onAdded }: { onAdded: () => void }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [industry, setIndustry] = useState("");
  const [source, setSource] = useState<string>("manual");
  const [vendorOrg, setVendorOrg] = useState("");
  const [vendorUrl, setVendorUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function onUrl(v: string) {
    setUrl(v);
    if (!nameTouched && v.trim()) setName(deriveNameFromDomain(v));
  }

  async function add() {
    if (!name.trim()) return toast.error("Firm name required (paste a website URL to derive it).");
    setBusy(true);
    try {
      await upsertFirmLead(name.trim(), {
        source,
        website_url: url.trim() || null,
        industry: industry || null,
        phone: phone.trim() || null,
        notes: note.trim() || null,
        vendor_list_org: source === "national_vendor_list" ? vendorOrg.trim() || null : null,
        vendor_list_url: source === "national_vendor_list" ? vendorUrl.trim() || null : null,
      });
      toast.success(`Added ${name.trim()}.`);
      setUrl("");
      setName("");
      setNameTouched(false);
      setPhone("");
      setNote("");
      onAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3 rounded-lg border border-border p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          value={url}
          onChange={(e) => onUrl(e.target.value)}
          placeholder="website URL (holmesmurphy.com)"
          className="h-8 w-56 text-xs"
        />
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameTouched(true);
          }}
          placeholder="firm name"
          className="h-8 w-44 text-xs"
        />
        <select
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-1.5 text-xs"
        >
          <option value="">industry…</option>
          {INDUSTRIES.map((i) => (
            <option key={i} value={i}>
              {industryLabel(i)}
            </option>
          ))}
        </select>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-1.5 text-xs"
        >
          {FIRM_SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABEL[s]}
            </option>
          ))}
        </select>
        {source === "national_vendor_list" && (
          <>
            <Input
              value={vendorOrg}
              onChange={(e) => setVendorOrg(e.target.value)}
              placeholder="national org"
              className="h-8 w-36 text-xs"
            />
            <Input
              value={vendorUrl}
              onChange={(e) => setVendorUrl(e.target.value)}
              placeholder="list URL"
              className="h-8 w-40 text-xs"
            />
          </>
        )}
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="phone"
          className="h-8 w-28 text-xs"
        />
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="note (optional)"
          className="h-8 w-36 text-xs"
        />
        <Button size="sm" className="h-8" disabled={busy} onClick={add}>
          {busy ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="mr-1 h-3.5 w-3.5" />
          )}
          Add firm
        </Button>
      </div>
    </div>
  );
}

function FirmRowCard({
  f,
  catalogById,
  expanded,
  onToggle,
  onSave,
}: {
  f: FirmRow;
  catalogById: Map<string, GreekOrgCatalog>;
  expanded: boolean;
  onToggle: () => void;
  onSave: (patch: Parameters<typeof upsertFirmLead>[1]) => void;
}) {
  const [notes, setNotes] = useState(f.notes ?? "");
  const [website, setWebsite] = useState(f.website_url ?? "");
  // A status/notes edit on a lead-less 990 firm creates its row — carry the
  // right source so the chip doesn't degrade to "manual".
  const primarySource =
    f.sources.find((s) => s === "national_vendor_list") ??
    f.sources.find((s) => s.startsWith("990_")) ??
    "manual";

  return (
    <div className="rounded-lg border border-border bg-card/60 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button type="button" onClick={onToggle} className="font-semibold hover:underline">
          {f.firm_name}
        </button>
        {f.sources.map((s) => (
          <Badge
            key={s}
            variant="outline"
            className={`text-[10px] ${s === "national_vendor_list" ? "border-violet-300 bg-violet-50 text-violet-700" : ""}`}
          >
            {SOURCE_LABEL[s] ?? s}
          </Badge>
        ))}
        {f.industry && (
          <Badge variant="secondary" className="text-[10px]">
            {industryLabel(f.industry)}
          </Badge>
        )}
        {/* The money column: this vendor/manual firm also shows up in N 990s. */}
        <Badge
          className={`text-[10px] ${f.seen_in_990s > 0 ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}
          title="Cross-reference: filings whose preparer/fundraiser matches this firm (normalized name)"
        >
          seen in {f.seen_in_990s} 990{f.seen_in_990s === 1 ? "" : "s"}
        </Badge>
        {f.org_ids.length > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            {f.org_ids.length} org{f.org_ids.length === 1 ? "" : "s"}
          </Badge>
        )}
        {f.phone && <span className="text-muted-foreground">{f.phone}</span>}
        {f.website_url && (
          <a
            href={f.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-primary underline"
          >
            site <ExternalLink className="h-3 w-3" />
          </a>
        )}
        <select
          value={f.status}
          onChange={(e) => onSave({ status: e.target.value, source: primarySource })}
          className={`ml-auto h-7 rounded-md border border-input bg-background px-1.5 text-[11px]`}
        >
          {["new", "contacted", "meeting", "client", "passed"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {(f.address || f.vendor_list_org) && (
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          {f.address && <span>{f.address}</span>}
          {f.vendor_list_org && (
            <span>
              via {f.vendor_list_org}
              {f.vendor_list_url && (
                <>
                  {" "}
                  <a
                    href={f.vendor_list_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    list
                  </a>
                </>
              )}
              {f.category ? ` · ${f.category}` : ""}
            </span>
          )}
        </div>
      )}
      {expanded && (
        <div className="mt-2 space-y-2">
          {f.org_ids.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {f.org_ids.map((id) => (
                <span
                  key={id}
                  className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px]"
                >
                  {catalogById.get(id)?.name ?? id}
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              onBlur={() =>
                website !== (f.website_url ?? "") &&
                onSave({ website_url: website || null, source: primarySource })
              }
              placeholder="website URL"
              className="h-7 w-64 text-[11px]"
            />
            <select
              value={f.industry ?? ""}
              onChange={(e) => onSave({ industry: e.target.value || null, source: primarySource })}
              className="h-7 rounded-md border border-input bg-background px-1.5 text-[11px]"
            >
              <option value="">industry…</option>
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>
                  {industryLabel(i)}
                </option>
              ))}
            </select>
          </div>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() =>
              notes !== (f.notes ?? "") && onSave({ notes: notes || null, source: primarySource })
            }
            placeholder="Lead notes…"
            className="min-h-[44px] text-[11px]"
          />
        </div>
      )}
    </div>
  );
}

function ChaptersTab({
  isAdmin,
  campuses,
  catalog,
  catalogById,
  campusById,
  chapters,
  filings,
  signalsByOrg,
  loading,
  refetchChapters,
  refetchCampuses,
  refetchCatalog,
}: {
  isAdmin: boolean;
  campuses: GreekCampus[];
  catalog: GreekOrgCatalog[];
  catalogById: Map<string, GreekOrgCatalog>;
  campusById: Map<string, GreekCampus>;
  chapters: GreekChapter[];
  filings: Pick<GreekFiling, "org_id" | "tax_year" | "revenue">[];
  signalsByOrg: Map<string, SignalKey[]>;
  loading: boolean;
  refetchChapters: () => void;
  refetchCampuses: () => void;
  refetchCatalog: () => void;
}) {
  const [campusId, setCampusId] = useState<string | null>(null);
  const [council, setCouncil] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [signal, setSignal] = useState<SignalKey | null>(null);
  const [openId, setOpenId] = useState<string | null>(null); // drawer
  const selectedCampus = campusId ? (campusById.get(campusId) ?? null) : null;

  // Latest revenue + YoY per org for the dense-row chips.
  const revByOrg = useMemo(() => {
    const byOrg = new Map<string, { year: number; revenue: number | null }[]>();
    for (const f of filings) {
      if (!f.org_id || f.tax_year == null) continue;
      (byOrg.get(f.org_id) ?? byOrg.set(f.org_id, []).get(f.org_id)!).push({
        year: f.tax_year,
        revenue: f.revenue,
      });
    }
    const m = new Map<string, { year: number; revenue: number | null; yoy: number | null }>();
    for (const [orgId, rows] of byOrg) {
      const withRev = rows.filter((r) => r.revenue != null).sort((a, b) => a.year - b.year);
      const latest = withRev[withRev.length - 1];
      if (!latest) continue;
      const prev = withRev[withRev.length - 2];
      const yoy =
        prev?.revenue != null && prev.revenue !== 0 && latest.revenue != null
          ? Math.round(((latest.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100)
          : null;
      m.set(orgId, { year: latest.year, revenue: latest.revenue, yoy });
    }
    return m;
  }, [filings]);

  const filtered = useMemo(
    () =>
      chapters
        .filter(
          (ch) =>
            (!campusId || ch.campus_id === campusId) &&
            (!council || ch.council === council) &&
            (!status || ch.status === status) &&
            (!signal ||
              (ch.greek_org_id != null &&
                (signalsByOrg.get(ch.greek_org_id) ?? []).includes(signal))),
        )
        .sort(
          (a, b) =>
            (campusById.get(a.campus_id ?? "")?.name ?? "").localeCompare(
              campusById.get(b.campus_id ?? "")?.name ?? "",
            ) || a.national_org.localeCompare(b.national_org),
        ),
    [chapters, campusId, council, status, signal, campusById, signalsByOrg],
  );

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <CampusCombobox items={campuses} value={campusId} onChange={setCampusId} />
        <span className="text-[11px] text-muted-foreground">
          {filtered.length} of {chapters.length} chapters
        </span>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Council:</span>
        <FilterPill active={!council} onClick={() => setCouncil(null)}>
          All
        </FilterPill>
        {COUNCILS.map((c) => (
          <FilterPill key={c} active={council === c} onClick={() => setCouncil(c)}>
            {councilLabel(c)}
          </FilterPill>
        ))}
        <span className="ml-3 text-[11px] text-muted-foreground">Status:</span>
        <FilterPill active={!status} onClick={() => setStatus(null)}>
          All
        </FilterPill>
        {GREEK_STATUSES.map((s) => (
          <FilterPill key={s} active={status === s} onClick={() => setStatus(s)}>
            {s}
          </FilterPill>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Signal:</span>
        <FilterPill active={!signal} onClick={() => setSignal(null)}>
          Any
        </FilterPill>
        {SIGNALS.map((s) => (
          <FilterPill key={s.key} active={signal === s.key} onClick={() => setSignal(s.key)}>
            {s.label}
          </FilterPill>
        ))}
      </div>

      {selectedCampus && (
        <div className="mb-4 space-y-3 rounded-lg border border-border bg-muted/20 p-3">
          <FslEditor campus={selectedCampus} onSaved={refetchCampuses} />
          <CampusContextPanel campus={selectedCampus} />
        </div>
      )}

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <GpaImport onDone={refetchChapters} />
        {isAdmin && <CsvImport onDone={refetchChapters} />}
      </div>
      {isAdmin && (
        <div className="mb-3">
          <QuickAdd
            campuses={campuses}
            catalog={catalog}
            defaultCampusId={campusId}
            onAdded={refetchChapters}
          />
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
          No chapters match this filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left">Org</th>
                <th className="px-2 py-1.5 text-left">Campus</th>
                <th className="px-2 py-1.5 text-left">Status</th>
                <th className="px-2 py-1.5 text-right">Latest rev</th>
                <th className="px-2 py-1.5 text-right">YoY</th>
                <th className="px-2 py-1.5 text-left">Signals</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ch) => {
                const rev = ch.greek_org_id ? revByOrg.get(ch.greek_org_id) : undefined;
                const sig = ch.greek_org_id ? (signalsByOrg.get(ch.greek_org_id) ?? []) : [];
                return (
                  <tr
                    key={ch.id}
                    onClick={() => setOpenId(ch.id)}
                    className="cursor-pointer border-t border-border/60 hover:bg-muted/30"
                  >
                    <td className="px-2 py-1.5">
                      <span className="font-semibold">
                        {ch.letters ? `${ch.letters} · ` : ""}
                        {ch.national_org}
                      </span>
                      {ch.chapter_designation && (
                        <span className="ml-1 text-muted-foreground">
                          ({ch.chapter_designation})
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {campusById.get(ch.campus_id ?? "")?.name ?? "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await updateGreekChapter(ch.id, { status: nextGreekStatus(ch.status) });
                            refetchChapters();
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Failed to update.");
                          }
                        }}
                        title="Click to cycle status"
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_STYLE[ch.status] ?? STATUS_STYLE.identified}`}
                      >
                        {ch.status}
                      </button>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {rev ? (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700">
                          {rev.year} {fmtMoney(rev.revenue)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {rev?.yoy != null ? (
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[10px] ${rev.yoy >= 0 ? "border-emerald-200 text-emerald-700" : "border-red-200 text-red-600"}`}
                        >
                          {rev.yoy >= 0 ? "+" : ""}
                          {rev.yoy}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <SignalChips signals={sig} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {openId != null &&
        (() => {
          const ch = filtered.find((c) => c.id === openId) ?? chapters.find((c) => c.id === openId);
          if (!ch) return null;
          return (
            <ChapterDrawer
              ch={ch}
              campus={campusById.get(ch.campus_id ?? "") ?? null}
              org={ch.greek_org_id ? (catalogById.get(ch.greek_org_id) ?? null) : null}
              signals={ch.greek_org_id ? (signalsByOrg.get(ch.greek_org_id) ?? []) : []}
              onChanged={() => {
                refetchChapters();
                refetchCatalog();
              }}
              onClose={() => setOpenId(null)}
            />
          );
        })()}
    </>
  );
}

function SignalChips({ signals }: { signals: SignalKey[] }) {
  if (signals.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {signals.map((s) => (
        <span
          key={s}
          title={SIGNALS.find((x) => x.key === s)?.hint}
          className="cursor-help rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
        >
          {signalLabel(s)}
        </span>
      ))}
    </span>
  );
}

// Click-open drawer: everything the old always-expanded card held (research
// links, filings/enrich, officers paste, edit fields) lives here now.
function ChapterDrawer({
  ch,
  campus,
  org,
  signals,
  onChanged,
  onClose,
}: {
  ch: GreekChapter;
  campus: GreekCampus | null;
  org: GreekOrgCatalog | null;
  signals: SignalKey[];
  onChanged: () => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function patch(p: Parameters<typeof updateGreekChapter>[1]) {
    try {
      await updateGreekChapter(ch.id, p);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update.");
    }
  }

  const links = [
    {
      label: "990s (ProPublica)",
      url: proPublicaUrl(ch.national_org, ch.chapter_designation, campus?.city ?? null),
    },
    { label: "Advisor (LinkedIn)", url: linkedInAdvisorUrl(ch.national_org, campus?.name ?? "") },
    { label: "SOS search", url: sosSearchUrl(campus?.state ?? null) },
  ];
  if (campus?.fsl_url) links.push({ label: "FSL directory", url: campus.fsl_url });

  return (
    <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-background p-4 text-xs shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-bold">
                {ch.letters ? `${ch.letters} · ` : ""}
                {ch.national_org}
              </span>
              {ch.chapter_designation && (
                <span className="text-muted-foreground">({ch.chapter_designation})</span>
              )}
              <Badge variant="outline" className="text-[10px] uppercase">
                {councilLabel(ch.council)}
              </Badge>
              <span className="text-muted-foreground">{campus?.name ?? "—"}</span>
              {org?.ein && <span className="text-emerald-700">EIN {org.ein}</span>}
            </div>
            {signals.length > 0 && (
              <div className="mt-1">
                <SignalChips signals={signals} />
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => patch({ status: nextGreekStatus(ch.status) })}
            title="Click to cycle status"
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_STYLE[ch.status] ?? STATUS_STYLE.identified}`}
          >
            {ch.status}
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close (Esc)"
            className="shrink-0 rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
          >
            ✕
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] hover:bg-muted"
            >
              {l.label}
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </a>
          ))}
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
          >
            <Pencil className="h-3 w-3" /> Edit fields
          </button>
        </div>

        {editing && (
          <ChapterEditor
            ch={ch}
            onSaved={() => {
              setEditing(false);
              onChanged();
            }}
          />
        )}

        {ch.greek_org_id ? (
          <EnrichBlock orgId={ch.greek_org_id} org={org} onEnriched={onChanged} />
        ) : (
          <div className="mt-2 text-muted-foreground">No national org linked.</div>
        )}
      </div>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 90;
  const h = 22;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / span) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="inline-block align-middle">
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-primary"
      />
    </svg>
  );
}

function EnrichBlock({
  orgId,
  org,
  onEnriched,
}: {
  orgId: string;
  org: GreekOrgCatalog | null;
  onEnriched: () => void;
}) {
  const enrich = useServerFn(enrichGreekOrgFilings);
  const filingsQuery = useQuery({
    queryKey: ["greek-filings", orgId],
    queryFn: () => listGreekFilings(orgId),
  });
  const filings = filingsQuery.data ?? [];
  const [ein, setEin] = useState(org?.ein ?? "");
  const [busy, setBusy] = useState(false);
  const [openFiling, setOpenFiling] = useState<string | null>(null);

  async function runEnrich() {
    if (!ein.trim()) return toast.error("Paste an EIN or ProPublica URL.");
    setBusy(true);
    try {
      const r = (await enrich({ data: { orgId, einOrUrl: ein.trim() } })) as
        | { ok: false; error: string }
        | { ok: true; filings: number; years: number[] };
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(`Enriched: ${r.filings} filing years.`);
        filingsQuery.refetch();
        onEnriched();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enrich failed.");
    } finally {
      setBusy(false);
    }
  }

  // latest-year chips + YoY
  const byYearAsc = [...filings].sort((a, b) => (a.tax_year ?? 0) - (b.tax_year ?? 0));
  const latest = byYearAsc[byYearAsc.length - 1];
  const prev = byYearAsc[byYearAsc.length - 2];
  const yoy =
    latest?.revenue != null && prev?.revenue != null && prev.revenue !== 0
      ? Math.round(((latest.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100)
      : null;

  return (
    <div className="mt-2 rounded-md border border-dashed border-primary/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">EIN / ProPublica URL</span>
        <Input
          value={ein}
          onChange={(e) => setEin(e.target.value)}
          placeholder="23-7219356"
          className="h-8 w-48 text-sm"
        />
        <Button size="sm" className="h-7" disabled={busy} onClick={runEnrich}>
          {busy ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="mr-1 h-3.5 w-3.5" />
          )}
          Enrich filings
        </Button>
        {org?.propublica_url && (
          <a
            href={org.propublica_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-primary underline"
          >
            ProPublica <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {filings.length > 0 && (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {latest && (
              <>
                <Badge className="bg-emerald-100 text-[10px] text-emerald-700">
                  {latest.tax_year} rev {fmtMoney(latest.revenue)}
                </Badge>
                <Badge className="bg-blue-100 text-[10px] text-blue-700">
                  assets {fmtMoney(latest.assets_eoy)}
                </Badge>
                {yoy != null && (
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${yoy >= 0 ? "text-emerald-700" : "text-red-600"}`}
                  >
                    YoY {yoy >= 0 ? "+" : ""}
                    {yoy}%
                  </Badge>
                )}
              </>
            )}
            <span className="text-muted-foreground">
              <Sparkline values={byYearAsc.map((f) => f.revenue ?? 0)} />
            </span>
          </div>

          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="px-1 text-left">Year</th>
                  <th className="px-1 text-right">Revenue</th>
                  <th className="px-1 text-right">Expenses</th>
                  <th className="px-1 text-right">Assets</th>
                  <th className="px-1 text-right">Liabilities</th>
                  <th className="px-1 text-left">990</th>
                  <th className="px-1 text-left">PDF fields</th>
                </tr>
              </thead>
              <tbody>
                {filings.map((f) => (
                  <FragmentRow key={f.id}>
                    <tr className="border-t border-border/60">
                      <td className="px-1 tabular-nums">{f.tax_year}</td>
                      <td className="px-1 text-right tabular-nums">{fmtMoney(f.revenue)}</td>
                      <td className="px-1 text-right tabular-nums">{fmtMoney(f.expenses)}</td>
                      <td className="px-1 text-right tabular-nums">{fmtMoney(f.assets_eoy)}</td>
                      <td className="px-1 text-right tabular-nums">
                        {fmtMoney(f.liabilities_eoy)}
                      </td>
                      <td className="px-1">
                        {f.pdf_url ? (
                          <a
                            href={f.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline"
                          >
                            PDF
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-1">
                        <button
                          type="button"
                          onClick={() => setOpenFiling((v) => (v === f.id ? null : f.id))}
                          className="inline-flex items-center gap-0.5 text-primary hover:underline"
                        >
                          {openFiling === f.id ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                          edit
                        </button>
                      </td>
                    </tr>
                    {openFiling === f.id && (
                      <tr>
                        <td colSpan={7} className="px-1 pb-2">
                          <FilingDrawer
                            filing={f}
                            onSaved={() => {
                              filingsQuery.refetch();
                              onEnriched();
                            }}
                          />
                        </td>
                      </tr>
                    )}
                  </FragmentRow>
                ))}
              </tbody>
            </table>
          </div>

          <OfficersPaste orgId={orgId} defaultYear={latest?.tax_year ?? null} onDone={onEnriched} />
        </>
      )}
    </div>
  );
}

function OfficersPaste({
  orgId,
  defaultYear,
  onDone,
}: {
  orgId: string;
  defaultYear: number | null;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [year, setYear] = useState(defaultYear ? String(defaultYear) : "");
  const [busy, setBusy] = useState(false);

  async function run() {
    const y = Number(year);
    if (!y) return toast.error("Enter the filing year for this officers block.");
    const officers = parseOfficers(text);
    if (officers.length === 0) return toast.error("No (name, title) pairs found in that paste.");
    setBusy(true);
    try {
      const r = await accumulateOfficers(orgId, officers, y);
      toast.success(`${officers.length} officers: ${r.inserted} new, ${r.updated} updated.`);
      setText("");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save officers.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 border-t border-border/60 pt-2">
      <div className="mb-1 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
        Paste 990 Part VII officers
        <Input
          value={year}
          onChange={(e) => setYear(e.target.value)}
          placeholder="year"
          className="h-7 w-20 text-[11px]"
        />
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste the officers/directors block…"
        className="min-h-[60px] text-[11px]"
      />
      <Button size="sm" className="mt-1 h-7" disabled={busy} onClick={run}>
        {busy ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="mr-1 h-3.5 w-3.5" />
        )}
        Extract officers
      </Button>
    </div>
  );
}

function PeopleTab({
  campuses,
  chapters,
  catalogById,
}: {
  campuses: GreekCampus[];
  chapters: GreekChapter[];
  catalogById: Map<string, GreekOrgCatalog>;
}) {
  const peopleQuery = useQuery({ queryKey: ["greek-people"], queryFn: listGreekPeople });
  const people = useMemo(() => peopleQuery.data ?? [], [peopleQuery.data]);
  const [campusId, setCampusId] = useState<string | null>(null);
  const [titleFilter, setTitleFilter] = useState("");

  // org → set of campus_ids (a national org may have chapters at many campuses).
  const orgCampuses = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const ch of chapters) {
      if (!ch.greek_org_id || !ch.campus_id) continue;
      (m.get(ch.greek_org_id) ?? m.set(ch.greek_org_id, new Set()).get(ch.greek_org_id)!).add(
        ch.campus_id,
      );
    }
    return m;
  }, [chapters]);

  const rows = useMemo(() => {
    const tf = titleFilter.trim().toLowerCase();
    return people
      .filter((p) => {
        if (campusId && !(orgCampuses.get(p.org_id)?.has(campusId) ?? false)) return false;
        if (tf && !(p.titles ?? []).some((t) => t.toLowerCase().includes(tf))) return false;
        return true;
      })
      .sort((a, b) => b.years_count - a.years_count || (b.last_year ?? 0) - (a.last_year ?? 0));
  }, [people, campusId, titleFilter, orgCampuses]);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <CampusCombobox items={campuses} value={campusId} onChange={setCampusId} />
        <Input
          value={titleFilter}
          onChange={(e) => setTitleFilter(e.target.value)}
          placeholder="Filter title (advisor / president / treasurer)…"
          className="h-8 w-64 text-sm"
        />
        <span className="text-[11px] text-muted-foreground">{rows.length} people</span>
      </div>

      {peopleQuery.isLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
          No people yet. Enrich a chapter's filings, then paste its 990 Part VII officers block.
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((p) => (
            <PersonRow
              key={p.id}
              p={p}
              orgName={catalogById.get(p.org_id)?.name ?? "—"}
              onChanged={() => peopleQuery.refetch()}
            />
          ))}
        </div>
      )}
    </>
  );
}

function PersonRow({
  p,
  orgName,
  onChanged,
}: {
  p: GreekPerson;
  orgName: string;
  onChanged: () => void;
}) {
  const [email, setEmail] = useState(p.email ?? "");
  const [phone, setPhone] = useState(p.phone ?? "");
  const [linkedin, setLinkedin] = useState(p.linkedin_url ?? "");

  async function save(patch: Parameters<typeof updateGreekPerson>[1]) {
    try {
      await updateGreekPerson(p.id, patch);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save.");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card/60 p-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold">{p.person_name}</span>
        {p.is_current && (
          <Badge className="bg-emerald-100 text-[10px] text-emerald-700">current</Badge>
        )}
        <span className="text-muted-foreground">{orgName}</span>
        <Badge variant="secondary" className="text-[10px]">
          {p.years_count} yr{p.years_count === 1 ? "" : "s"}
        </Badge>
        <span className="text-[10px] text-muted-foreground">
          {p.first_year}–{p.last_year}
        </span>
        <span className="flex flex-wrap gap-1">
          {(p.titles ?? []).map((t) => (
            <span
              key={t}
              className="rounded border border-border bg-background px-1 py-0.5 text-[10px]"
            >
              {t}
            </span>
          ))}
        </span>
      </div>
      <div className="mt-1.5 grid gap-1.5 sm:grid-cols-3">
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => email !== (p.email ?? "") && save({ email: email || null })}
          placeholder="email"
          className="h-7 text-[11px]"
        />
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={() => phone !== (p.phone ?? "") && save({ phone: phone || null })}
          placeholder="phone"
          className="h-7 text-[11px]"
        />
        <Input
          value={linkedin}
          onChange={(e) => setLinkedin(e.target.value)}
          onBlur={() =>
            linkedin !== (p.linkedin_url ?? "") && save({ linkedin_url: linkedin || null })
          }
          placeholder="linkedin url"
          className="h-7 text-[11px]"
        />
      </div>
    </div>
  );
}

// ---- Editors / admin forms (add + CSV gated behind ?admin=1) -----------------
function ChapterEditor({ ch, onSaved }: { ch: GreekChapter; onSaved: () => void }) {
  const [status, setStatus] = useState(ch.status);
  const [chapterDesignation, setChapterDesignation] = useState(ch.chapter_designation ?? "");
  const [council, setCouncil] = useState(ch.council ?? "");
  const [letters, setLetters] = useState(ch.letters ?? "");
  const [members, setMembers] = useState(
    ch.member_count_estimate != null ? String(ch.member_count_estimate) : "",
  );
  const [houseCorp, setHouseCorp] = useState(ch.house_corp_name ?? "");
  const [corp990, setCorp990] = useState(ch.house_corp_990_url ?? "");
  const [notes, setNotes] = useState(ch.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await updateGreekChapter(ch.id, {
        status,
        chapter_designation: chapterDesignation.trim() || null,
        council: council || null,
        letters: letters.trim() || null,
        member_count_estimate: members.trim() ? Number(members.replace(/[^\d]/g, "")) : null,
        house_corp_name: houseCorp.trim() || null,
        house_corp_990_url: corp990.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success("Saved.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!confirm("Delete this chapter?")) return;
    try {
      await deleteGreekChapter(ch.id);
      toast.success("Deleted.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete.");
    }
  }

  return (
    <div className="mt-2 grid gap-2 rounded-md border border-dashed border-primary/40 p-3 sm:grid-cols-2">
      <label className="text-[11px] font-medium text-muted-foreground">
        Status
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={`mt-0.5 w-full capitalize ${inputCls}`}
        >
          {GREEK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="text-[11px] font-medium text-muted-foreground">
        Chapter designation
        <Input
          value={chapterDesignation}
          onChange={(e) => setChapterDesignation(e.target.value)}
          className="mt-0.5 h-9 text-sm"
        />
      </label>
      <label className="text-[11px] font-medium text-muted-foreground">
        Council
        <select
          value={council}
          onChange={(e) => setCouncil(e.target.value)}
          className={`mt-0.5 w-full ${inputCls}`}
        >
          <option value="">—</option>
          {COUNCILS.map((c) => (
            <option key={c} value={c}>
              {councilLabel(c)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-[11px] font-medium text-muted-foreground">
        Letters
        <Input
          value={letters}
          onChange={(e) => setLetters(e.target.value)}
          className="mt-0.5 h-9 text-sm"
        />
      </label>
      <label className="text-[11px] font-medium text-muted-foreground">
        Member estimate
        <Input
          value={members}
          onChange={(e) => setMembers(e.target.value)}
          className="mt-0.5 h-9 text-sm"
        />
      </label>
      <label className="text-[11px] font-medium text-muted-foreground">
        House corp name
        <Input
          value={houseCorp}
          onChange={(e) => setHouseCorp(e.target.value)}
          className="mt-0.5 h-9 text-sm"
        />
      </label>
      <label className="text-[11px] font-medium text-muted-foreground">
        House corp 990 URL
        <Input
          value={corp990}
          onChange={(e) => setCorp990(e.target.value)}
          className="mt-0.5 h-9 text-sm"
        />
      </label>
      <label className="text-[11px] font-medium text-muted-foreground sm:col-span-2">
        Notes
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-0.5 min-h-[52px] text-sm"
        />
      </label>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Check className="mr-1 h-4 w-4" />
          )}
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-red-600 hover:text-red-700"
          onClick={remove}
        >
          <Trash2 className="mr-1 h-4 w-4" /> Delete
        </Button>
      </div>
    </div>
  );
}

function FslEditor({ campus, onSaved }: { campus: GreekCampus; onSaved: () => void }) {
  const [value, setValue] = useState(campus.fsl_url ?? "");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await updateCampusFslUrl(campus.id, value);
      toast.success("Saved.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-medium text-muted-foreground">FSL directory URL</span>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://…"
        className="h-8 w-80 text-sm"
      />
      <Button size="sm" variant="outline" className="h-7" disabled={saving} onClick={save}>
        <Check className="mr-1 h-3.5 w-3.5" /> Save
      </Button>
      {campus.fsl_url && (
        <a
          href={campus.fsl_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-primary underline"
        >
          Open <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

function QuickAdd({
  campuses,
  catalog,
  defaultCampusId,
  onAdded,
}: {
  campuses: GreekCampus[];
  catalog: GreekOrgCatalog[];
  defaultCampusId: string | null;
  onAdded: () => void;
}) {
  const [campusId, setCampusId] = useState(defaultCampusId ?? "");
  const [org, setOrg] = useState("");
  const [designation, setDesignation] = useState("");
  const [council, setCouncil] = useState("");
  const [letters, setLetters] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!campusId) return toast.error("Pick a campus.");
    if (!org.trim()) return toast.error("National org is required.");
    setSaving(true);
    try {
      await addGreekChapter({
        campus_id: campusId,
        national_org: org,
        chapter_designation: designation || null,
        council: council || null,
        letters: letters || null,
      });
      toast.success("Chapter added.");
      setOrg("");
      setDesignation("");
      setLetters("");
      onAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Plus className="h-4 w-4" /> Add a chapter{" "}
        <span className="text-[10px] text-muted-foreground">(admin)</span>
      </div>
      <div className="grid gap-2">
        <select value={campusId} onChange={(e) => setCampusId(e.target.value)} className={inputCls}>
          <option value="">Select campus…</option>
          {campuses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Input
          value={org}
          onChange={(e) => setOrg(e.target.value)}
          placeholder="National org"
          list="greek-catalog"
          className="text-sm"
        />
        <datalist id="greek-catalog">
          {catalog.map((o) => (
            <option key={o.id} value={o.name} />
          ))}
        </datalist>
        <div className="flex gap-2">
          <Input
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            placeholder="Designation"
            className="flex-1 text-sm"
          />
          <Input
            value={letters}
            onChange={(e) => setLetters(e.target.value)}
            placeholder="Letters"
            className="w-28 text-sm"
          />
        </div>
        <select value={council} onChange={(e) => setCouncil(e.target.value)} className={inputCls}>
          <option value="">Council…</option>
          {COUNCILS.map((c) => (
            <option key={c} value={c}>
              {councilLabel(c)}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={add} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-1 h-4 w-4" />
          )}
          Add chapter
        </Button>
      </div>
    </div>
  );
}

function CsvImport({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    if (!text.trim()) return toast.error("Paste CSV or choose a file first.");
    setBusy(true);
    setResult(null);
    try {
      const r = await importGreekChaptersCsv(text);
      setResult(`Imported ${r.inserted}, skipped ${r.skipped}.`);
      toast.success(`Imported ${r.inserted} chapter(s).`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Upload className="h-4 w-4" /> CSV import{" "}
        <span className="text-[10px] text-muted-foreground">(admin)</span>
      </div>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) f.text().then(setText);
        }}
        className="mb-2 block w-full text-[11px]"
      />
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="…or paste CSV (campus_slug,national_org,…)"
        className="min-h-[60px] font-mono text-[11px]"
      />
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" onClick={run} disabled={busy}>
          {busy ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-1 h-4 w-4" />
          )}
          Import
        </Button>
        {result && <span className="text-[11px] text-muted-foreground">{result}</span>}
      </div>
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// ---- Filing itemized drawer ("from the PDF" manual entry) --------------------
function FilingDrawer({ filing, onSaved }: { filing: GreekFiling; onSaved: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const f of FILING_ITEM_FIELDS) {
      const v = (filing as unknown as Record<string, unknown>)[f];
      o[f] = v == null ? "" : String(v);
    }
    o.fundraiser_firm = filing.fundraiser_firm ?? "";
    o.preparer_firm = filing.preparer_firm ?? "";
    return o;
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setVals((s) => ({ ...s, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {};
      for (const f of FILING_ITEM_FIELDS) {
        const raw = vals[f].replace(/[^0-9.-]/g, "");
        patch[f] = raw === "" ? null : Number(raw);
      }
      patch.fundraiser_firm = vals.fundraiser_firm.trim() || null;
      patch.preparer_firm = vals.preparer_firm.trim() || null;
      await updateGreekFiling(filing.id, patch);
      toast.success("Saved PDF fields.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-dashed border-primary/40 p-2">
      <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
        {filing.tax_year} — from the PDF (manual)
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {FILING_ITEM_FIELDS.map((f) => (
          <label key={f} className="text-[10px] text-muted-foreground">
            {f.replace(/_/g, " ")}
            <Input
              value={vals[f]}
              onChange={(e) => set(f, e.target.value)}
              className="mt-0.5 h-7 text-[11px]"
            />
          </label>
        ))}
        <label className="text-[10px] text-muted-foreground">
          fundraiser firm
          <Input
            value={vals.fundraiser_firm}
            onChange={(e) => set("fundraiser_firm", e.target.value)}
            className="mt-0.5 h-7 text-[11px]"
          />
        </label>
        <label className="text-[10px] text-muted-foreground">
          preparer firm
          <Input
            value={vals.preparer_firm}
            onChange={(e) => set("preparer_firm", e.target.value)}
            className="mt-0.5 h-7 text-[11px]"
          />
        </label>
      </div>
      <Button size="sm" className="mt-1.5 h-7" disabled={saving} onClick={save}>
        {saving ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Check className="mr-1 h-3.5 w-3.5" />
        )}
        Save PDF fields
      </Button>
    </div>
  );
}

// ---- Campus context panel ----------------------------------------------------
const CTX_NUM: [keyof CampusContext, string][] = [
  ["enrollment", "Enrollment"],
  ["undergrad_enrollment", "Undergrad"],
  ["business_enrollment", "Business school"],
  ["tuition_in_state", "Tuition (in-state)"],
  ["tuition_out_state", "Tuition (out-state)"],
  ["greek_population_pct", "Greek %"],
];
const CTX_DATE: [keyof CampusContext, string][] = [
  ["rush_fall_start", "Rush (fall)"],
  ["rush_spring_start", "Rush (spring)"],
  ["semester_start", "Semester start"],
  ["semester_end", "Semester end"],
];
const CTX_TEXT: [keyof CampusContext, string][] = [
  ["midterm_window", "Midterm window"],
  ["finals_window", "Finals window"],
  ["football_schedule_url", "Football schedule URL"],
  ["fsl_grade_report_url", "FSL grade report URL"],
];

function CampusContextPanel({ campus }: { campus: GreekCampus }) {
  const ctxQuery = useQuery({
    queryKey: ["campus-context", campus.id],
    queryFn: () => fetchCampusContext(campus.id),
  });
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  if (ctxQuery.data && !loaded) {
    const c = ctxQuery.data as unknown as Record<string, unknown>;
    const o: Record<string, string> = {};
    for (const [k] of [...CTX_NUM, ...CTX_DATE, ...CTX_TEXT])
      o[k as string] = c[k as string] != null ? String(c[k as string]) : "";
    o.notes = (c.notes as string) ?? "";
    setVals(o);
    setLoaded(true);
  }
  const set = (k: string, v: string) => setVals((s) => ({ ...s, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {};
      for (const [k] of CTX_NUM) {
        const r = (vals[k as string] ?? "").replace(/[^0-9.-]/g, "");
        patch[k as string] = r === "" ? null : Number(r);
      }
      for (const [k] of CTX_DATE) patch[k as string] = vals[k as string]?.trim() || null;
      for (const [k] of CTX_TEXT) patch[k as string] = vals[k as string]?.trim() || null;
      patch.notes = vals.notes?.trim() || null;
      await upsertCampusContext(campus.id, patch as Partial<CampusContext>);
      toast.success("Campus context saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[11px] font-semibold uppercase text-muted-foreground"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Campus context
      </button>
      {open && (
        <div className="mt-2">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {[...CTX_NUM, ...CTX_TEXT].map(([k, label]) => (
              <label key={k as string} className="text-[10px] text-muted-foreground">
                {label}
                <Input
                  value={vals[k as string] ?? ""}
                  onChange={(e) => set(k as string, e.target.value)}
                  className="mt-0.5 h-7 text-[11px]"
                />
              </label>
            ))}
            {CTX_DATE.map(([k, label]) => (
              <label key={k as string} className="text-[10px] text-muted-foreground">
                {label}
                <Input
                  type="date"
                  value={vals[k as string] ?? ""}
                  onChange={(e) => set(k as string, e.target.value)}
                  className="mt-0.5 h-7 text-[11px]"
                />
              </label>
            ))}
          </div>
          <Textarea
            value={vals.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Notes"
            className="mt-1.5 min-h-[44px] text-[11px]"
          />
          <Button size="sm" className="mt-1.5 h-7" disabled={saving} onClick={save}>
            {saving ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="mr-1 h-3.5 w-3.5" />
            )}
            Save context
          </Button>
        </div>
      )}
    </div>
  );
}

// ---- GPA bulk import ---------------------------------------------------------
function GpaImport({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [tsv, setTsv] = useState("");
  const [term, setTerm] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [unmatched, setUnmatched] = useState<{ org: string; gpa: number | null }[]>([]);

  async function run() {
    if (!term.trim()) return toast.error("Enter a term (e.g. fall_2025).");
    if (!tsv.trim()) return toast.error("Paste the GPA report (TSV).");
    setBusy(true);
    setUnmatched([]);
    try {
      const r = await importChapterGpaTsv(tsv, term.trim(), sourceUrl.trim() || null);
      setUnmatched(r.unmatched);
      toast.success(`Imported ${r.imported} GPA rows; ${r.unmatched.length} unmatched.`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm font-semibold"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Upload className="h-4 w-4" /> GPA import (TSV)
      </button>
      {open && (
        <div className="mt-2 grid gap-2">
          <div className="flex gap-2">
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="term e.g. fall_2025"
              className="w-40 text-sm"
            />
            <Input
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="source URL (optional)"
              className="flex-1 text-sm"
            />
          </div>
          <Textarea
            value={tsv}
            onChange={(e) => setTsv(e.target.value)}
            placeholder="org [tab] gpa [tab] rank [tab] members"
            className="min-h-[80px] font-mono text-[11px]"
          />
          <Button size="sm" onClick={run} disabled={busy}>
            {busy ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-1 h-4 w-4" />
            )}
            Import GPA
          </Button>
          {unmatched.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800">
              Unmatched (pair manually): {unmatched.map((u) => u.org).join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Leads tab: orgs ranked by signal count ---------------------------------
function LeadsTab({
  catalog,
  signalsByOrg,
  filings,
  people,
  onPersonChanged,
}: {
  catalog: GreekOrgCatalog[];
  signalsByOrg: Map<string, SignalKey[]>;
  filings: Pick<GreekFiling, "org_id" | "tax_year" | "revenue">[];
  people: GreekPerson[];
  onPersonChanged: () => void;
}) {
  const nameById = useMemo(() => new Map(catalog.map((o) => [o.id, o.name])), [catalog]);
  const latestRevByOrg = useMemo(() => {
    const m = new Map<string, { year: number; revenue: number | null }>();
    for (const f of filings) {
      if (!f.org_id || f.tax_year == null) continue;
      const cur = m.get(f.org_id);
      if (!cur || f.tax_year > cur.year) m.set(f.org_id, { year: f.tax_year, revenue: f.revenue });
    }
    return m;
  }, [filings]);
  const topPersonByOrg = useMemo(() => {
    const m = new Map<string, GreekPerson>();
    for (const p of people) {
      const cur = m.get(p.org_id);
      if (!cur || p.years_count > cur.years_count) m.set(p.org_id, p);
    }
    return m;
  }, [people]);

  const rows = useMemo(
    () =>
      [...signalsByOrg.entries()]
        .map(([orgId, sig]) => ({ orgId, sig }))
        .sort((a, b) => b.sig.length - a.sig.length),
    [signalsByOrg],
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
        No signals yet. Enrich chapters' filings and import GPA to surface leads.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map(({ orgId, sig }) => {
        const rev = latestRevByOrg.get(orgId);
        const top = topPersonByOrg.get(orgId);
        return (
          <div key={orgId} className="rounded-lg border border-border bg-card/60 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold">{nameById.get(orgId) ?? "—"}</span>
              <Badge className="bg-amber-100 text-[10px] text-amber-700">
                {sig.length} signal{sig.length === 1 ? "" : "s"}
              </Badge>
              {rev && (
                <span className="text-muted-foreground">
                  {rev.year} rev {fmtMoney(rev.revenue)}
                </span>
              )}
            </div>
            <div className="mt-1">
              <SignalChips signals={sig} />
            </div>
            {top ? (
              <div className="mt-2">
                <div className="mb-0.5 text-[10px] uppercase text-muted-foreground">
                  Top-tenure contact
                </div>
                <PersonRow
                  p={top}
                  orgName={nameById.get(orgId) ?? "—"}
                  onChanged={onPersonChanged}
                />
              </div>
            ) : (
              <div className="mt-1 text-[10px] text-muted-foreground">No officers logged yet.</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
