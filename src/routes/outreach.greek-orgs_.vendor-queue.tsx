// /outreach/greek-orgs/vendor-queue — third VA queue: one NATIONAL ORG per
// screen. Find the org's vendor/preferred-partner lists (pre-built search links
// off the org domain), capture each list (url, type, PDF drop → storage), then
// paste the list text: firms parse into an editable preview and confirm inserts
// them into greek_firm_leads (source='national_vendor_list'). Multiple lists per
// org. Enter = confirm & next (lists_found), S = skip with status + note.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ExternalLink, Loader2, Plus, SkipForward, Trash2, Upload } from "lucide-react";

import {
  addVendorList,
  fetchGreekCatalog,
  listVendorLists,
  updateGreekOrgVendor,
  upsertVendorFirms,
  uploadVendorPdf,
  VENDOR_LIST_TYPES,
  VENDOR_STATUSES,
  vendorPdfPublicUrl,
  type GreekOrgCatalog,
} from "@/lib/greek-orgs";
import {
  INDUSTRIES,
  industryLabel,
  parseVendorFirms,
  type ParsedVendorFirm,
} from "@/lib/greek-vendors";
import { FilterPill } from "@/components/outreach/FilterPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/outreach/greek-orgs_/vendor-queue")({
  head: () => ({ meta: [{ title: "GreekIntel — vendor-list queue" }] }),
  component: VendorQueue,
});

const google = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

/** The pre-built hunt links. site: patterns need the domain; the rest work bare. */
function searchLinks(org: string, domain: string | null) {
  const links: { label: string; url: string }[] = [];
  if (domain) {
    links.push(
      {
        label: `site:${domain} "approved vendors"`,
        url: google(`site:${domain} "approved vendors"`),
      },
      {
        label: `site:${domain} filetype:pdf vendor`,
        url: google(`site:${domain} filetype:pdf vendor`),
      },
    );
  }
  links.push(
    {
      label: `"${org} housing corporation" vendor`,
      url: google(`"${org} housing corporation" vendor`),
    },
    {
      label: `"${org}" "approved vendor program"`,
      url: google(`"${org}" "approved vendor program"`),
    },
    { label: `"${org}" convention exhibitors`, url: google(`"${org}" convention exhibitors`) },
  );
  return links;
}

function VendorQueue() {
  const catalogQuery = useQuery({ queryKey: ["greek-catalog"], queryFn: fetchGreekCatalog });
  const catalog = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data]);

  const [status, setStatus] = useState<string | null>("pending");
  const [started, setStarted] = useState(false);
  const [idx, setIdx] = useState(0);

  const queue = useMemo(
    () =>
      catalog
        .filter((o) => !status || (o.vendor_status ?? "pending") === status)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [catalog, status],
  );
  const current = started ? queue[idx] : null;

  function advance() {
    catalogQuery.refetch();
    if (idx + 1 >= queue.length) {
      toast.success("Vendor queue complete.");
      setStarted(false);
      setIdx(0);
    } else {
      setIdx((i) => i + 1);
    }
  }

  if (!started) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">Vendor-list queue</h1>
          <Link to="/outreach/greek-orgs" className="text-sm text-primary underline">
            ← registry
          </Link>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          One national org per screen: hunt its vendor / preferred-partner lists, capture them, and
          extract the firms. Enter = confirm &amp; next, S = skip.
        </p>
        <div className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Status:</span>
            {VENDOR_STATUSES.map((s) => (
              <FilterPill key={s} active={status === s} onClick={() => setStatus(s)}>
                {s}
              </FilterPill>
            ))}
            <FilterPill active={!status} onClick={() => setStatus(null)}>
              any
            </FilterPill>
          </div>
          <Button
            onClick={() => {
              setIdx(0);
              setStarted(true);
            }}
            disabled={queue.length === 0}
          >
            Start queue ({queue.length})
          </Button>
        </div>
      </div>
    );
  }

  if (!current) return <div className="p-6 text-sm text-muted-foreground">Queue empty.</div>;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <button type="button" onClick={() => setStarted(false)} className="text-primary underline">
          ← filters
        </button>
        <span>
          {idx + 1} of {queue.length}
        </span>
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary"
          style={{ width: `${((idx + 1) / queue.length) * 100}%` }}
        />
      </div>
      <OrgVendorCard key={current.id} org={current} onDone={advance} />
    </div>
  );
}

function OrgVendorCard({ org, onDone }: { org: GreekOrgCatalog; onDone: () => void }) {
  const listsQuery = useQuery({
    queryKey: ["vendor-lists", org.name],
    queryFn: () => listVendorLists(org.name),
  });
  const lists = listsQuery.data ?? [];

  const [busy, setBusy] = useState(false);
  const [domain, setDomain] = useState(org.domain ?? "");
  const [housing, setHousing] = useState(org.housing_entity ?? "");
  // list capture
  const [listUrl, setListUrl] = useState("");
  const [listType, setListType] = useState<string>("approved_vendors");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [listNotes, setListNotes] = useState("");
  // firm extraction
  const [pasteText, setPasteText] = useState("");
  const [preview, setPreview] = useState<ParsedVendorFirm[]>([]);
  const [insertedCount, setInsertedCount] = useState(0);
  // skip
  const [skipStatus, setSkipStatus] = useState<string>("none_found");
  const [note, setNote] = useState("");

  const domainClean = domain
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0];

  async function saveOrgFields() {
    await updateGreekOrgVendor(org.id, {
      domain: domainClean || null,
      housing_entity: housing.trim() || null,
    });
  }

  async function captureList() {
    if (!listUrl.trim() && !pdfFile) return toast.error("Give the list a URL and/or drop its PDF.");
    setBusy(true);
    try {
      let pdfPath: string | null = null;
      if (pdfFile) pdfPath = await uploadVendorPdf(org.name, pdfFile);
      await addVendorList({
        national_org: org.name,
        list_type: listType,
        url: listUrl.trim() || null,
        pdf_storage_path: pdfPath,
        notes: listNotes.trim() || null,
      });
      await saveOrgFields();
      toast.success("List captured.");
      setPdfFile(null);
      setListNotes("");
      listsQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to capture list.");
    } finally {
      setBusy(false);
    }
  }

  function runParse() {
    const firms = parseVendorFirms(pasteText);
    if (firms.length === 0) return toast.error("No firms recognized in that paste.");
    setPreview(firms);
  }
  const setPreviewField = (i: number, field: keyof ParsedVendorFirm, v: string) =>
    setPreview((rows) => rows.map((r, j) => (j === i ? { ...r, [field]: v || null } : r)));

  async function confirmFirms() {
    if (preview.length === 0) return;
    setBusy(true);
    try {
      const n = await upsertVendorFirms(preview, org.name, listUrl.trim() || null);
      toast.success(`${n} firms saved to leads (source: national_vendor_list).`);
      setInsertedCount((c) => c + n);
      setPreview([]);
      setPasteText("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save firms.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmNext() {
    setBusy(true);
    try {
      await saveOrgFields();
      await updateGreekOrgVendor(org.id, { vendor_status: "lists_found" });
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    try {
      await saveOrgFields();
      await updateGreekOrgVendor(org.id, {
        vendor_status: skipStatus,
        vendor_notes: note.trim() || null,
      });
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  // Enter = confirm & next, S = skip (ignored while typing).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      const typing =
        el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
      if (e.key === "Enter" && !typing && !busy) {
        e.preventDefault();
        confirmNext();
      } else if ((e.key === "s" || e.key === "S") && !typing && !busy) {
        e.preventDefault();
        skip();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, domain, housing, skipStatus, note]);

  return (
    <div className="rounded-lg border border-border bg-card/60 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-lg font-bold">{org.name}</span>
        {insertedCount > 0 && (
          <Badge className="bg-emerald-100 text-[10px] text-emerald-700">
            {insertedCount} firms saved
          </Badge>
        )}
        {lists.length > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            {lists.length} list{lists.length === 1 ? "" : "s"}
          </Badge>
        )}
      </div>

      {/* domain + housing entity */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="org domain (alphadeltapi.org)"
          className="h-8 w-64 text-sm"
        />
        <a
          href={google(`${org.name} national organization official site`)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
        >
          find domain <ExternalLink className="h-3 w-3" />
        </a>
        <Input
          value={housing}
          onChange={(e) => setHousing(e.target.value)}
          placeholder="housing entity (ADPi Properties, Inc.)"
          className="h-8 w-64 text-sm"
        />
      </div>

      {/* search links */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {searchLinks(org.name, domainClean || null).map((l) => (
          <a
            key={l.label}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] hover:bg-muted"
          >
            {l.label} <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </a>
        ))}
        {!domainClean && (
          <span className="text-[10px] text-muted-foreground">
            (set the domain to unlock the site: searches)
          </span>
        )}
      </div>

      {/* list capture */}
      <div className="mt-3 rounded-md border border-border p-3">
        <div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
          Capture a list (repeat per list found)
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={listUrl}
            onChange={(e) => setListUrl(e.target.value)}
            placeholder="list URL"
            className="h-8 w-72 text-sm"
          />
          <select
            value={listType}
            onChange={(e) => setListType(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            {VENDOR_LIST_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-dashed border-border px-2 py-1.5 text-xs hover:bg-muted">
            <Upload className="h-3.5 w-3.5" />
            {pdfFile ? pdfFile.name : "PDF drop"}
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <Input
            value={listNotes}
            onChange={(e) => setListNotes(e.target.value)}
            placeholder="notes"
            className="h-8 w-40 text-sm"
          />
          <Button size="sm" className="h-8" disabled={busy} onClick={captureList}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add list
          </Button>
        </div>
        {lists.length > 0 && (
          <div className="mt-2 space-y-0.5 text-[11px]">
            {lists.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {l.list_type.replace(/_/g, " ")}
                </Badge>
                {l.url && (
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="max-w-[300px] truncate text-primary underline"
                  >
                    {l.url}
                  </a>
                )}
                {l.pdf_storage_path && (
                  <a
                    href={vendorPdfPublicUrl(l.pdf_storage_path)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    stored PDF
                  </a>
                )}
                {l.notes && <span className="text-muted-foreground">{l.notes}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* firm extraction */}
      <div className="mt-3 rounded-md border border-border p-3">
        <div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
          Extract firms from the list
        </div>
        <Textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder="Paste the vendor list text (copy the PDF text or the web page) — firms, phones, and categories are parsed into an editable preview"
          className="min-h-[80px] text-[11px]"
        />
        <div className="mt-1 flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-7" onClick={runParse}>
            Parse firms
          </Button>
          {pasteText.trim() && (
            <span className="text-[10px] text-muted-foreground">
              {parseVendorFirms(pasteText).length} recognized
            </span>
          )}
        </div>

        {preview.length > 0 && (
          <div className="mt-2">
            <div className="mb-1 text-[10px] text-muted-foreground">
              Editable preview — nothing saves until you confirm.
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
              {preview.map((f, i) => (
                <div key={i} className="flex flex-wrap items-center gap-1">
                  <Input
                    value={f.name}
                    onChange={(e) => setPreviewField(i, "name", e.target.value)}
                    className="h-7 w-52 text-[11px]"
                  />
                  <Input
                    value={f.phone ?? ""}
                    onChange={(e) => setPreviewField(i, "phone", e.target.value)}
                    placeholder="phone"
                    className="h-7 w-32 text-[11px]"
                  />
                  <Input
                    value={f.website ?? ""}
                    onChange={(e) => setPreviewField(i, "website", e.target.value)}
                    placeholder="website"
                    className="h-7 w-48 text-[11px]"
                  />
                  <select
                    value={f.industry ?? ""}
                    onChange={(e) => setPreviewField(i, "industry", e.target.value)}
                    className="h-7 rounded-md border border-input bg-background px-1 text-[10px]"
                  >
                    <option value="">industry…</option>
                    {INDUSTRIES.map((ind) => (
                      <option key={ind} value={ind}>
                        {industryLabel(ind)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    title="Remove row"
                    onClick={() => setPreview((rows) => rows.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <Button size="sm" className="mt-2 h-8" disabled={busy} onClick={confirmFirms}>
              {busy ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="mr-1 h-3.5 w-3.5" />
              )}
              Confirm {preview.length} firms → leads
            </Button>
          </div>
        )}
      </div>

      {/* confirm / skip */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button disabled={busy} onClick={confirmNext}>
          {busy ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Check className="mr-1 h-4 w-4" />
          )}
          Confirm &amp; next{" "}
          <kbd className="ml-1 rounded bg-primary-foreground/20 px-1 text-[10px]">Enter</kbd>
        </Button>
        <div className="flex items-center gap-1">
          <select
            value={skipStatus}
            onChange={(e) => setSkipStatus(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-1.5 text-xs"
          >
            <option value="none_found">none found</option>
            <option value="portal_gated">portal gated</option>
          </select>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="skip note"
            className="h-8 w-40 text-xs"
          />
          <Button variant="outline" disabled={busy} onClick={skip}>
            <SkipForward className="mr-1 h-4 w-4" /> Skip{" "}
            <kbd className="ml-1 rounded bg-muted px-1 text-[10px]">S</kbd>
          </Button>
        </div>
      </div>
    </div>
  );
}
