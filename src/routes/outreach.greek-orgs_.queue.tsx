// /outreach/greek-orgs/queue — VA enrichment queue. One CHAPTER per screen (each
// campus's house corp is its own nonprofit), worked like a deck. Priority buttons
// pick a batch to work in a sensible order — an entire campus, or an entire
// national org across campuses — each showing how many are left to do.
// STEP 1 find on ProPublica + paste EIN/URL. STEP 2 review the 990 + paste the
// /full render for officers/preparer. STEP 3 Confirm & next (Enter) / Skip (S).
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ChevronDown, ExternalLink, Loader2, SkipForward, Sparkles } from "lucide-react";

import {
  accumulateOfficers,
  councilLabel,
  einFromPastedUrl,
  fetchGreekCampuses,
  fetchGreekCatalog,
  listChapterFilings,
  listGreekChapters,
  proPublicaSearchVariants,
  setChapterEnrichment,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/outreach/greek-orgs_/queue")({
  head: () => ({ meta: [{ title: "GreekIntel — enrichment queue" }] }),
  component: Queue,
});

const money = (n: number | null) =>
  n == null ? "—" : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n / 1e3)}k`;

const fullRenderUrl = (ein: string, objectId: string) =>
  `https://projects.propublica.org/nonprofits/organizations/${ein}/${objectId}/full`;

// Priority groups — the order VAs should work. A group is either a whole campus
// or a whole national org (across every campus). This is the current assignment;
// edit this list to re-prioritize. `match` runs against each chapter.
type PriorityGroup = {
  key: string;
  label: string;
  match: (ch: GreekChapter, campusName: string) => boolean;
  order: "org" | "campus"; // sort within the group
};
const PRIORITY_GROUPS: PriorityGroup[] = [
  {
    key: "ole-miss",
    label: "All Ole Miss",
    order: "org",
    match: (_ch, campusName) => campusName === "University of Mississippi",
  },
  {
    key: "kkg",
    label: "All KKG",
    order: "campus",
    match: (ch) => /kappa kappa gamma/i.test(ch.national_org),
  },
  {
    key: "ato",
    label: "All ATO",
    order: "campus",
    match: (ch) => /alpha tau omega/i.test(ch.national_org),
  },
  {
    key: "phi-psi",
    label: "All Phi Psi",
    order: "campus",
    match: (ch) => /phi kappa psi/i.test(ch.national_org),
  },
  {
    key: "phi-tau",
    label: "All Phi Tau",
    order: "campus",
    match: (ch) => /phi kappa tau/i.test(ch.national_org),
  },
];

interface QueueItem {
  chapterId: string;
  orgId: string;
  orgName: string;
  ein: string | null;
  propublicaUrl: string | null;
  status: string;
  chapter: GreekChapter;
  campus: GreekCampus | null;
}

function Queue() {
  const campusesQuery = useQuery({ queryKey: ["greek-campuses"], queryFn: fetchGreekCampuses });
  const catalogQuery = useQuery({ queryKey: ["greek-catalog"], queryFn: fetchGreekCatalog });
  const chaptersQuery = useQuery({ queryKey: ["greek-chapters"], queryFn: listGreekChapters });
  const campuses = useMemo(() => campusesQuery.data ?? [], [campusesQuery.data]);
  const chapters = useMemo(() => chaptersQuery.data ?? [], [chaptersQuery.data]);
  const campusById = useMemo(() => new Map(campuses.map((c) => [c.id, c])), [campuses]);

  const [groupKey, setGroupKey] = useState<string | null>(null);
  const [campusId, setCampusId] = useState<string | null>(null);
  const [onlyPending, setOnlyPending] = useState(true);
  const [started, setStarted] = useState(false);
  const [idx, setIdx] = useState(0);

  const campusName = (ch: GreekChapter) => campusById.get(ch.campus_id ?? "")?.name ?? "";

  // Chapters matching a selection (priority group OR ad-hoc campus), then the
  // pending filter, sorted for a sensible working order.
  function chaptersFor(sel: { group?: PriorityGroup | null; campusId?: string | null }) {
    let rows = chapters.filter((ch) => ch.greek_org_id);
    if (sel.group) rows = rows.filter((ch) => sel.group!.match(ch, campusName(ch)));
    else if (sel.campusId) rows = rows.filter((ch) => ch.campus_id === sel.campusId);
    const order = sel.group?.order ?? "org";
    return rows.sort((a, b) =>
      order === "campus"
        ? campusName(a).localeCompare(campusName(b)) || a.national_org.localeCompare(b.national_org)
        : a.national_org.localeCompare(b.national_org) ||
          campusName(a).localeCompare(campusName(b)),
    );
  }

  // Live pending count per priority group (the work remaining) for the buttons.
  const groupCounts = useMemo(() => {
    const m = new Map<string, { pending: number; total: number }>();
    for (const g of PRIORITY_GROUPS) {
      const rows = chaptersFor({ group: g });
      m.set(g.key, {
        total: rows.length,
        pending: rows.filter((ch) => ch.enrichment_status !== "enriched").length,
      });
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters, campuses]);

  const activeGroup = PRIORITY_GROUPS.find((g) => g.key === groupKey) ?? null;
  const queue = useMemo<QueueItem[]>(() => {
    const rows = chaptersFor({
      group: activeGroup,
      campusId: activeGroup ? null : campusId,
    }).filter((ch) => (onlyPending ? ch.enrichment_status !== "enriched" : true));
    return rows.map((ch) => ({
      chapterId: ch.id,
      orgId: ch.greek_org_id!,
      orgName: ch.national_org,
      ein: ch.ein,
      propublicaUrl: ch.propublica_url,
      status: ch.enrichment_status,
      chapter: ch,
      campus: campusById.get(ch.campus_id ?? "") ?? null,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters, campuses, groupKey, campusId, onlyPending]);

  const current = started ? queue[idx] : null;

  function advance() {
    chaptersQuery.refetch();
    if (idx + 1 >= queue.length) {
      toast.success("Batch complete.");
      setStarted(false);
      setIdx(0);
    } else {
      setIdx((i) => i + 1);
    }
  }

  if (!started) {
    const selectionLabel = activeGroup
      ? activeGroup.label
      : campusId
        ? (campusById.get(campusId)?.name ?? "campus")
        : null;
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">Enrichment queue</h1>
          <Link to="/outreach/greek-orgs" className="text-sm text-primary underline">
            ← registry
          </Link>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Pick a priority batch, then work one chapter per screen. Enter = confirm & next, S = skip.
          The number is how many are still pending in that batch.
        </p>

        <div className="space-y-4 rounded-lg border border-border p-4">
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase text-muted-foreground">
              Priority order
            </div>
            <div className="flex flex-col gap-1.5">
              {PRIORITY_GROUPS.map((g, i) => {
                const c = groupCounts.get(g.key) ?? { pending: 0, total: 0 };
                const active = groupKey === g.key;
                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => {
                      setGroupKey(active ? null : g.key);
                      setCampusId(null);
                    }}
                    className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                      active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">{i + 1}.</span>
                      <span className="font-medium">{g.label}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Badge
                        className={`text-[10px] ${c.pending > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}
                      >
                        {c.pending} pending
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">of {c.total}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-1 text-[11px] uppercase text-muted-foreground">Or any campus</div>
            <CampusCombobox
              items={campuses}
              value={campusId}
              onChange={(v) => {
                setCampusId(v);
                setGroupKey(null);
              }}
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyPending}
              onChange={(e) => setOnlyPending(e.target.checked)}
            />
            Only pending (hide already-enriched)
          </label>

          <div className="flex items-center gap-3 border-t border-border pt-3">
            <Button
              onClick={() => {
                setIdx(0);
                setStarted(true);
              }}
              disabled={queue.length === 0 || (!activeGroup && !campusId)}
            >
              Start{selectionLabel ? ` — ${selectionLabel}` : ""} ({queue.length})
            </Button>
            {!activeGroup && !campusId && (
              <span className="text-xs text-muted-foreground">Pick a batch above.</span>
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
          ← batches
        </button>
        <span>
          {activeGroup?.label ?? campusById.get(campusId ?? "")?.name} · {idx + 1} of {queue.length}
        </span>
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary"
          style={{ width: `${((idx + 1) / queue.length) * 100}%` }}
        />
      </div>

      <ChapterCard key={current.chapterId} item={current} onDone={advance} />
    </div>
  );
}

function ChapterCard({ item, onDone }: { item: QueueItem; onDone: () => void }) {
  const enrich = useServerFn(enrichGreekOrgFilings);
  const filingsQuery = useQuery({
    queryKey: ["chapter-filings", item.chapterId],
    queryFn: () => listChapterFilings(item.chapterId),
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
      const r = await accumulateOfficers(item.chapterId, item.orgId, officers, y);
      toast.success(`${y}: ${officers.length} officers (${r.inserted} new, ${r.updated} updated).`);
      setOfficersText("");
      setSavedPastes((n) => n + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save officers.");
    } finally {
      setBusy(false);
    }
  }

  function onEinChange(raw: string) {
    setEin(einFromPastedUrl(raw));
  }

  async function runEnrich() {
    if (!ein.trim()) return toast.error("Paste an EIN or ProPublica URL first.");
    setBusy(true);
    try {
      const r = (await enrich({ data: { chapterId: item.chapterId, einOrUrl: ein.trim() } })) as
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
      if (officers.length && y) await accumulateOfficers(item.chapterId, item.orgId, officers, y);
      if (latest && (prepFirm.trim() || prepPhone.trim() || prepAddress.trim())) {
        await updateGreekFiling(latest.id, {
          preparer_firm: prepFirm.trim() || null,
          preparer_phone: prepPhone.trim() || null,
          preparer_address: prepAddress.trim() || null,
        });
      }
      await setChapterEnrichment(item.chapterId, "enriched");
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
      await setChapterEnrichment(item.chapterId, "no_filing_found", note.trim() || null);
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
        {item.propublicaUrl && (
          <div className="mb-2 text-xs">
            <a
              href={item.propublicaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-emerald-700 hover:bg-emerald-100"
            >
              Saved ProPublica page <ExternalLink className="h-3 w-3" />
            </a>
            <span className="ml-2 text-muted-foreground">
              found once, saved forever — no need to search again.
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs">
                Find on ProPublica <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
              {proPublicaSearchVariants(
                item.orgName,
                item.chapter.chapter_designation,
                item.campus?.state ?? null,
                item.campus?.city ?? null,
              ).map((v, i) => (
                <DropdownMenuItem key={i} asChild>
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex cursor-pointer items-center justify-between gap-2"
                  >
                    <span className="truncate text-xs">{v.label}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </a>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Input
            value={ein}
            onChange={(e) => onEinChange(e.target.value)}
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
        <div className="mt-1.5 text-[10px] text-muted-foreground">
          Try each until you find it, then paste the URL — the EIN fills automatically. 90 seconds
          max; if none hit, press S with "not on ProPublica" as the note.
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
              No e-file render for this chapter. Scanned/paper filings have no text and no render —
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
