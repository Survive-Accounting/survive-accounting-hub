// /outreach/greek-orgs/queue — VA enrichment queue. One org per screen, worked
// like a deck. STEP 1 find on ProPublica + paste EIN/URL (auto-fills financials +
// itemized fields the API exposes). STEP 2: for e-filed years, open the ProPublica
// /full render, click into the filing, Ctrl+A/Ctrl+C, and paste the whole page —
// the parser pulls officers AND the paid-preparer block out of the paste. Only
// scanned/paper filings need hand-typing. STEP 3 Confirm & next (Enter) / Skip (S).
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ExternalLink, Loader2, SkipForward, Sparkles } from "lucide-react";

import {
  accumulateOfficers,
  councilLabel,
  COUNCILS,
  fetchGreekCampuses,
  fetchGreekCatalog,
  listGreekChapters,
  listGreekFilings,
  ORG_ENRICH_STATUSES,
  proPublicaUrl,
  setOrgEnrichment,
  updateGreekFiling,
  type GreekCampus,
  type GreekChapter,
} from "@/lib/greek-orgs";
import { enrichGreekOrgFilings } from "@/lib/greek-orgs.functions";
import { extractPreparer, parseOfficers } from "@/lib/greek-officers";
import { CampusCombobox } from "@/components/outreach/CampusCombobox";
import { FilterPill } from "@/components/outreach/FilterPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/outreach/greek-orgs_/queue")({
  head: () => ({ meta: [{ title: "GreekIntel — enrichment queue" }] }),
  component: Queue,
});

const money = (n: number | null) =>
  n == null ? "—" : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n / 1e3)}k`;

const fullRenderUrl = (ein: string, objectId: string) =>
  `https://projects.propublica.org/nonprofits/organizations/${ein}/${objectId}/full`;

interface QueueItem {
  orgId: string;
  orgName: string;
  ein: string | null;
  status: string;
  chapter: GreekChapter;
  campus: GreekCampus | null;
}

function Queue() {
  const campusesQuery = useQuery({ queryKey: ["greek-campuses"], queryFn: fetchGreekCampuses });
  const catalogQuery = useQuery({ queryKey: ["greek-catalog"], queryFn: fetchGreekCatalog });
  const chaptersQuery = useQuery({ queryKey: ["greek-chapters"], queryFn: listGreekChapters });
  const campuses = useMemo(() => campusesQuery.data ?? [], [campusesQuery.data]);
  const catalog = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data]);
  const chapters = useMemo(() => chaptersQuery.data ?? [], [chaptersQuery.data]);
  const campusById = useMemo(() => new Map(campuses.map((c) => [c.id, c])), [campuses]);
  const catalogById = useMemo(() => new Map(catalog.map((o) => [o.id, o])), [catalog]);

  const [campusId, setCampusId] = useState<string | null>(null);
  const [council, setCouncil] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>("pending");
  const [started, setStarted] = useState(false);
  const [idx, setIdx] = useState(0);

  // Build the queue: one org per screen (representative chapter), filtered.
  const queue = useMemo<QueueItem[]>(() => {
    const seen = new Set<string>();
    const items: QueueItem[] = [];
    for (const ch of chapters) {
      if (!ch.greek_org_id) continue;
      if (campusId && ch.campus_id !== campusId) continue;
      if (council && ch.council !== council) continue;
      const org = catalogById.get(ch.greek_org_id);
      const orgStatus = org?.enrichment_status ?? "pending";
      if (status && orgStatus !== status) continue;
      if (seen.has(ch.greek_org_id)) continue;
      seen.add(ch.greek_org_id);
      items.push({
        orgId: ch.greek_org_id,
        orgName: ch.national_org,
        ein: org?.ein ?? null,
        status: orgStatus,
        chapter: ch,
        campus: campusById.get(ch.campus_id ?? "") ?? null,
      });
    }
    return items.sort((a, b) => a.orgName.localeCompare(b.orgName));
  }, [chapters, catalogById, campusById, campusId, council, status]);

  const current = started ? queue[idx] : null;

  function advance() {
    catalogQuery.refetch();
    if (idx + 1 >= queue.length) {
      toast.success("Queue complete.");
      setStarted(false);
      setIdx(0);
    } else {
      setIdx((i) => i + 1);
    }
  }

  if (!started) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">Enrichment queue</h1>
          <Link to="/outreach/greek-orgs" className="text-sm text-primary underline">
            ← registry
          </Link>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Set filters, then work one org per screen. Enter = confirm & next, S = skip.
        </p>
        <div className="space-y-3 rounded-lg border border-border p-4">
          <div>
            <div className="mb-1 text-[11px] uppercase text-muted-foreground">Campus</div>
            <CampusCombobox items={campuses} value={campusId} onChange={setCampusId} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Council:</span>
            <FilterPill active={!council} onClick={() => setCouncil(null)}>
              All
            </FilterPill>
            {COUNCILS.map((c) => (
              <FilterPill key={c} active={council === c} onClick={() => setCouncil(c)}>
                {councilLabel(c)}
              </FilterPill>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Status:</span>
            {ORG_ENRICH_STATUSES.map((s) => (
              <FilterPill key={s} active={status === s} onClick={() => setStatus(s)}>
                {s}
              </FilterPill>
            ))}
            <FilterPill active={!status} onClick={() => setStatus(null)}>
              any
            </FilterPill>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Button
              onClick={() => {
                setIdx(0);
                setStarted(true);
              }}
              disabled={queue.length === 0}
            >
              Start queue ({queue.length})
            </Button>
            {queue.length === 0 && (
              <span className="text-xs text-muted-foreground">No orgs match these filters.</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!current) {
    return <div className="p-6 text-sm text-muted-foreground">Queue empty.</div>;
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      {/* progress */}
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

      <OrgCard key={current.orgId} item={current} onDone={advance} />
    </div>
  );
}

function OrgCard({ item, onDone }: { item: QueueItem; onDone: () => void }) {
  const enrich = useServerFn(enrichGreekOrgFilings);
  const filingsQuery = useQuery({
    queryKey: ["greek-filings", item.orgId],
    queryFn: () => listGreekFilings(item.orgId),
  });
  const filings = filingsQuery.data ?? [];
  const latest = [...filings].sort((a, b) => (b.tax_year ?? 0) - (a.tax_year ?? 0))[0] ?? null;

  const [ein, setEin] = useState(item.ein ?? "");
  const [busy, setBusy] = useState(false);
  const [officersText, setOfficersText] = useState("");
  const [officerYear, setOfficerYear] = useState("");
  const [savedPastes, setSavedPastes] = useState(0);
  const [prepFirm, setPrepFirm] = useState("");
  const [prepPhone, setPrepPhone] = useState("");
  const [prepAddress, setPrepAddress] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (latest?.tax_year && !officerYear) setOfficerYear(String(latest.tax_year));
  }, [latest, officerYear]);

  // e-filed years with a /full render (per-year object ids from the enrich scrape).
  const einDigits =
    ein.replace(/-/g, "").match(/\b\d{9}\b/)?.[0] ?? item.ein?.replace(/\D/g, "") ?? "";
  const renderYears =
    einDigits.length === 9
      ? filings
          .filter((f) => f.object_id && f.tax_year != null)
          .sort((a, b) => (b.tax_year ?? 0) - (a.tax_year ?? 0))
      : [];

  /** Whole-page paste → officers + best-effort preparer auto-fill (editable). */
  function onOfficersPaste(text: string) {
    setOfficersText(text);
    const prep = extractPreparer(text);
    if (prep.firm && !prepFirm.trim()) setPrepFirm(prep.firm);
    if (prep.phone && !prepPhone.trim()) setPrepPhone(prep.phone);
    if (prep.address && !prepAddress.trim()) setPrepAddress(prep.address);
  }

  /** Save the current paste for its year and clear the box — supports the
   *  multi-paste tenure flow (latest + oldest + a middle year). */
  async function saveOfficersPaste() {
    const y = Number(officerYear);
    if (!y) return toast.error("Set the filing year for this paste.");
    const officers = parseOfficers(officersText);
    if (officers.length === 0) return toast.error("No (name, title) pairs found in that paste.");
    setBusy(true);
    try {
      const r = await accumulateOfficers(item.orgId, officers, y);
      toast.success(`${y}: ${officers.length} officers (${r.inserted} new, ${r.updated} updated).`);
      setOfficersText("");
      setSavedPastes((n) => n + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save officers.");
    } finally {
      setBusy(false);
    }
  }

  async function runEnrich() {
    if (!ein.trim()) return toast.error("Paste an EIN or ProPublica URL first.");
    setBusy(true);
    try {
      const r = (await enrich({ data: { orgId: item.orgId, einOrUrl: ein.trim() } })) as
        | { ok: false; error: string }
        | { ok: true; filings: number };
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(`Pulled ${r.filings} filing years.`);
        filingsQuery.refetch();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enrich failed.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmNext() {
    setBusy(true);
    try {
      // Save officers (if pasted) + preparer (onto the latest filing) + mark enriched.
      const officers = parseOfficers(officersText);
      const y = Number(officerYear);
      if (officers.length && y) await accumulateOfficers(item.orgId, officers, y);
      if (latest && (prepFirm.trim() || prepPhone.trim() || prepAddress.trim())) {
        await updateGreekFiling(latest.id, {
          preparer_firm: prepFirm.trim() || null,
          preparer_phone: prepPhone.trim() || null,
          preparer_address: prepAddress.trim() || null,
        });
      }
      await setOrgEnrichment(item.orgId, "enriched");
      toast.success("Enriched.");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    try {
      await setOrgEnrichment(item.orgId, "no_filing_found", note.trim() || null);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  // Keyboard: Enter = confirm, S = skip (ignored while typing in a field).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
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
  }, [busy, officersText, officerYear, prepFirm, prepPhone, prepAddress, note, latest]);

  return (
    <div className="rounded-lg border border-border bg-card/60 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-lg font-bold">
          {item.chapter.letters ? `${item.chapter.letters} · ` : ""}
          {item.orgName}
        </span>
        {item.chapter.chapter_designation && (
          <span className="text-muted-foreground">({item.chapter.chapter_designation})</span>
        )}
        <Badge variant="outline" className="text-[10px] uppercase">
          {councilLabel(item.chapter.council)}
        </Badge>
        <span className="text-muted-foreground">{item.campus?.name ?? "—"}</span>
      </div>

      {/* STEP 1 */}
      <div className="mt-3 rounded-md border border-border p-3">
        <div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
          Step 1 · Find on ProPublica
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={proPublicaUrl(
              item.orgName,
              item.chapter.chapter_designation,
              item.campus?.city ?? null,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
          >
            Find on ProPublica <ExternalLink className="h-3 w-3" />
          </a>
          <Input
            value={ein}
            onChange={(e) => setEin(e.target.value)}
            placeholder="EIN or ProPublica URL"
            className="h-8 w-56 text-sm"
          />
          <Button size="sm" className="h-8" disabled={busy} onClick={runEnrich}>
            {busy ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-3.5 w-3.5" />
            )}
            Pull filings
          </Button>
        </div>
      </div>

      {/* STEP 2 */}
      <div className="mt-3 rounded-md border border-border p-3">
        <div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
          Step 2 · Review the most-recent 990
        </div>
        {latest ? (
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <Badge className="bg-emerald-100 text-[10px] text-emerald-700">
              {latest.tax_year} rev {money(latest.revenue)}
            </Badge>
            <Badge className="bg-blue-100 text-[10px] text-blue-700">
              assets {money(latest.assets_eoy)}
            </Badge>
            <span className="text-muted-foreground">
              contributions {money(latest.contributions)} · salaries {money(latest.salaries)}
            </span>
            {latest.pdf_url && (
              <a
                href={latest.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                open 990 PDF
              </a>
            )}
          </div>
        ) : (
          <div className="mb-2 text-xs text-muted-foreground">
            Pull filings above; financials auto-fill from ProPublica.
          </div>
        )}

        {renderYears.length > 0 ? (
          <div className="mb-2 rounded-md border border-primary/30 bg-primary/5 p-2 text-[11px]">
            <div className="flex flex-wrap items-center gap-1.5">
              <a
                href={fullRenderUrl(einDigits, renderYears[0].object_id!)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded border border-primary/40 bg-background px-2 py-0.5 font-medium text-primary hover:bg-primary/10"
              >
                View filing render ({renderYears[0].tax_year}) <ExternalLink className="h-3 w-3" />
              </a>
              {renderYears.slice(1).map((f) => (
                <a
                  key={f.id}
                  href={fullRenderUrl(einDigits, f.object_id!)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOfficerYear(String(f.tax_year))}
                  title={`Open the ${f.tax_year} render (also sets the paste year)`}
                  className="rounded border border-border bg-background px-1.5 py-0.5 text-primary hover:bg-muted"
                >
                  {f.tax_year}
                </a>
              ))}
            </div>
            <div className="mt-1 text-muted-foreground">
              Click into the filing, then <kbd className="rounded bg-muted px-1">Ctrl+A</kbd>,{" "}
              <kbd className="rounded bg-muted px-1">Ctrl+C</kbd> the page → paste in the officers
              box. Officers and preparer are extracted from the paste. Tenure tip: paste the latest
              year, the oldest year, and one middle year (Save officers between pastes) — 3 pastes ≈
              tenure.
            </div>
          </div>
        ) : (
          filings.length > 0 && (
            <div className="mb-2 text-[11px] text-muted-foreground">
              No e-file render for this org. Scanned/paper filings have no text and no render —
              enter the president/treasurer/advisor by hand from the PDF images, or Skip with a
              note.
            </div>
          )
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            value={prepFirm}
            onChange={(e) => setPrepFirm(e.target.value)}
            placeholder="Paid preparer firm"
            className="h-8 text-sm"
          />
          <Input
            value={prepPhone}
            onChange={(e) => setPrepPhone(e.target.value)}
            placeholder="Preparer phone"
            className="h-8 text-sm"
          />
          <Input
            value={prepAddress}
            onChange={(e) => setPrepAddress(e.target.value)}
            placeholder="Preparer address"
            className="h-8 text-sm sm:col-span-2"
          />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Officers (Part VII) for year</span>
          <Input
            value={officerYear}
            onChange={(e) => setOfficerYear(e.target.value)}
            className="h-7 w-20 text-[11px]"
          />
          {savedPastes > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {savedPastes} paste{savedPastes === 1 ? "" : "s"} saved
            </Badge>
          )}
        </div>
        <Textarea
          value={officersText}
          onChange={(e) => onOfficersPaste(e.target.value)}
          placeholder="Paste the /full render page here (Ctrl+A, Ctrl+C) — or type the Part VII block for scanned filings"
          className="mt-1 min-h-[70px] text-[11px]"
        />
        {officersText.trim() && (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">
              Parsed {parseOfficers(officersText).length} officer(s).
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              disabled={busy}
              onClick={saveOfficersPaste}
            >
              Save officers for {officerYear || "…"}
            </Button>
          </div>
        )}
      </div>

      {/* STEP 3 */}
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
