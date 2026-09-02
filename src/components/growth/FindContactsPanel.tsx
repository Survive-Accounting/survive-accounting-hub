// FIND CONTACTS — two steps. Step 1: one click runs the scrape (find council pages → read the
// officers → Google-search each personal Instagram to prefill it). Step 2: review the result and
// submit it to the Instagram DM queue. A downloaded spreadsheet + re-import is the alternate path
// for anyone who'd rather verify in Sheets, but the in-app review is the default.
//
// THE REVIEW IS THE PRODUCT. Nothing is written until someone submits, every field is editable, and
// the personal Instagram column — the thing this page exists for — is highlighted so a blank or an
// unconfirmed guess can't slip through unseen.
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Search, Download, Upload, Check, X, Loader2, Instagram, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";

import {
  COUNCIL_KEYS, COUNCIL_LABEL, councilPrompt, flagRows, igProfileUrl,
  igSearchUrl, igState, importSummary, normalizeHandle, officerPrompt, parsePastedContacts,
  councilFromLabel, rolePriority, worstLevel,
  type CouncilKey, type CouncilPage, type OfficerRow, type UrlProbe,
} from "@/lib/find-contacts-shared";
import {
  findCouncilPagesFn, probeUrlsFn, recordIgOutcomeFn, scrapeOfficersFn, sendToDmQueueFn,
} from "@/lib/find-contacts.functions";
import { cn } from "@/lib/utils";

type Phase = "idle" | "working" | "review";
type PageRow = CouncilPage & { probe: UrlProbe | null };

export function FindContactsPanel({ campusId, campusName, onImported }: {
  campusId: string; campusName: string; onImported?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [rows, setRows] = useState<OfficerRow[]>([]);
  const [existing, setExisting] = useState<{ emails: string[]; handles: string[] }>({ emails: [], handles: [] });
  const [cost, setCost] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [showUrls, setShowUrls] = useState(false);
  const [paste, setPaste] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const flags = useMemo(() => flagRows(rows, existing), [rows, existing]);
  const summary = useMemo(() => importSummary(rows, flags), [rows, flags]);
  const patch = (id: string, p: Partial<OfficerRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const sortRows = (rs: OfficerRow[]) => rs.slice().sort((a, b) => a.council.localeCompare(b.council) || rolePriority(a.position) - rolePriority(b.position));

  const scrapeInto = async (pgs: PageRow[]) => {
    const urls = pgs.filter((p) => /^https?:\/\//i.test(p.url)).map((p) => ({ council: p.council, url: p.url }));
    if (!urls.length) { setErr("No council pages found. Add a URL below, or use the paste fallback."); setShowFallback(true); setPhase("review"); return; }
    setProgress("Reading the pages and searching Instagrams…");
    const r = await scrapeOfficersFn({ data: { campusId, urls } });
    if (!r.ok) { setErr(r.error); setShowFallback(true); setPhase("review"); return; }
    setRows(sortRows(r.officers)); setExisting(r.existing); setCost((c) => c + r.costUsd); setPhase("review");
  };

  // Step 1 — one click: council pages → officers → IG prefill, landing in review.
  const run = async () => {
    setPhase("working"); setErr(null); setProgress("Finding the official council pages…");
    try {
      const r = await findCouncilPagesFn({ data: { campusId } });
      if (!r.ok) { setErr(r.error); setShowFallback(true); setPhase("review"); return; }
      setPages(r.pages); setCost((c) => c + r.costUsd);
      await scrapeInto(r.pages);
    } catch (e) { setErr((e as Error).message); setShowFallback(true); setPhase("review"); }
  };

  const reScrape = async () => { setErr(null); setPhase("working"); try { await scrapeInto(pages); } catch (e) { setErr((e as Error).message); setPhase("review"); } };

  const setUrl = async (council: CouncilKey, url: string) => {
    setPages((ps) => ps.map((p) => (p.council === council ? { ...p, url, probe: null } : p)));
    if (!/^https?:\/\//i.test(url)) return;
    try { const [probe] = await probeUrlsFn({ data: { urls: [url] } }); setPages((ps) => ps.map((p) => (p.council === council ? { ...p, probe } : p))); } catch { /* status is a nicety */ }
  };
  const addCouncil = (council: CouncilKey) => setPages((ps) => (ps.some((p) => p.council === council) ? ps : [...ps, { council, url: "", confidence: "low", probe: null }]));

  const rowsFromPasted = (text: string): OfficerRow[] => parsePastedContacts(text).map((p, i) => ({
    id: `p${i}`, council: councilFromLabel(p.council) ?? "fsl",
    position: p.position, name: p.name, email: p.email, phone: p.phone,
    instagram: p.instagram, instagramSource: p.instagram ? "manual" : null, instagramConfidence: null,
    chapter: p.chapter, sourceUrl: p.sourceUrl, include: true, igVerified: false, sourceChecked: false,
  }));

  const importPasted = () => {
    const parsed = rowsFromPasted(paste);
    if (!parsed.length) { setErr("Couldn't read that — needs a header row naming at least one column (council, name, email…)."); return; }
    setRows(sortRows(parsed)); setErr(null); setShowFallback(false); setPhase("review");
  };

  const onUpload = async (file: File) => {
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
      const parsed = rowsFromPasted(csv);
      if (!parsed.length) { toast.error("Couldn't read that sheet — needs a header row (council, name, instagram…)."); return; }
      setRows(sortRows(parsed)); setErr(null); setShowFallback(false); setPhase("review");
      toast.success(`Loaded ${parsed.length} rows from the sheet.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't open that file."); }
  };

  const download = async () => {
    const XLSX = await import("xlsx");
    const aoa = [
      ["School", "Council", "Type", "Position", "Name", "Email", "Instagram", "Chapter", "Source"],
      ...rows.map((r) => [campusName, COUNCIL_LABEL[r.council], r.name ? "person" : "org", r.position ?? "", r.name ?? "", r.email ?? "", r.instagram ? `@${normalizeHandle(r.instagram)}` : "", r.chapter ?? "", r.sourceUrl ?? ""]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 7 }, { wch: 20 }, { wch: 20 }, { wch: 26 }, { wch: 22 }, { wch: 16 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contacts");
    XLSX.writeFile(wb, `${campusName.replace(/[^a-z0-9]+/gi, "_")}_contacts.xlsx`);
  };

  const submit = async () => {
    setSubmitting(true); setErr(null);
    try {
      const r = await sendToDmQueueFn({ data: { campusId, rows } });
      if (!r.ok) { setErr(r.error ?? "Couldn't submit."); return; }
      toast.success(`${r.imported} sent to the Instagram DM queue.`, { description: "This campus is queued for outreach." });
      onImported?.();
      setPhase("idle"); setRows([]); setPages([]); setCost(0);
    } catch (e) { setErr((e as Error).message); }
    finally { setSubmitting(false); }
  };

  const grouped = useMemo(() => {
    const m = new Map<CouncilKey, OfficerRow[]>();
    for (const r of rows) (m.get(r.council) ?? m.set(r.council, []).get(r.council)!).push(r);
    return [...m.entries()];
  }, [rows]);

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold">Find contacts</h3>
          <p className="text-[11px] text-muted-foreground">
            Step 1: scrape. Step 2: review and send. Nothing saves until you submit.
            {cost > 0 && <> · this run ${cost.toFixed(4)}</>}
          </p>
        </div>
        <div className="flex gap-2">
          {phase === "idle" && (
            <button type="button" onClick={() => void run()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[12.5px] font-bold text-primary-foreground">
              <Search className="size-4" /> Find contacts
            </button>
          )}
          {phase !== "idle" && (
            <button type="button" onClick={() => { setPhase("idle"); setRows([]); setPages([]); setErr(null); setShowFallback(false); }} className="rounded-lg border border-border px-3 py-2 text-[12.5px] font-medium">Start over</button>
          )}
        </div>
      </div>

      {phase === "working" && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-3 text-[12px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" /> {progress || "Working…"}
        </div>
      )}

      {err && (
        <div className="mt-2 rounded border border-rose-500/40 bg-rose-500/10 px-2.5 py-2 text-[12px] text-rose-300">
          {err}
          <button type="button" className="ml-2 font-bold underline" onClick={() => setShowFallback((v) => !v)}>{showFallback ? "hide fallback" : "run it yourself, paste it back"}</button>
        </div>
      )}

      {/* FALLBACK — copy the prompt, run it wherever, paste the result. The backstop, never the default. */}
      {showFallback && (
        <div className="mt-2 rounded border border-dashed border-border p-2.5">
          <p className="text-[11.5px] font-semibold">Run it yourself, paste it back</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button type="button" className="rounded border border-border px-2.5 py-1 text-[11.5px]" onClick={() => { void navigator.clipboard.writeText(councilPrompt(campusName)); toast.success("Step-1 prompt copied"); }}>Copy step-1 prompt</button>
            <button type="button" className="rounded border border-border px-2.5 py-1 text-[11.5px]" onClick={() => { void navigator.clipboard.writeText(officerPrompt(campusName, pages.filter((p) => p.url).map((p) => ({ council: p.council, url: p.url })))); toast.success("Step-2 prompt copied"); }}>Copy step-2 prompt</button>
          </div>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} placeholder="Paste the result — Ctrl+A → Ctrl+C in the sheet, then paste here. Tab-separated, CSV, or a markdown table with a header row." className="mt-2 w-full rounded border border-border bg-background px-2 py-1 text-[12px]" />
          <button type="button" className="mt-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11.5px] font-semibold text-primary-foreground" onClick={importPasted}>Load into the review table</button>
        </div>
      )}

      {/* STEP 2 — review + submit. */}
      {phase === "review" && (
        <div className="mt-3">
          {/* council pages — collapsed; open to fix a URL and re-scrape when a council came back empty */}
          {pages.length > 0 && (
            <div className="mb-2 rounded-lg border border-border/60">
              <button onClick={() => setShowUrls((v) => !v)} className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] text-muted-foreground">
                {showUrls ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />} Council pages ({pages.filter((p) => p.url).length}) — fix a URL to re-scrape
              </button>
              {showUrls && (
                <div className="space-y-1 border-t border-border p-2.5">
                  {pages.map((p) => (
                    <div key={p.council} className="flex flex-wrap items-center gap-2">
                      <span className="w-[120px] shrink-0 text-[11.5px] font-semibold">{COUNCIL_LABEL[p.council]}</span>
                      <input value={p.url} onChange={(e) => void setUrl(p.council, e.target.value)} placeholder="paste the URL" className="flex-1 rounded border border-border bg-background px-2 py-1 text-[11.5px]" style={{ minWidth: 200 }} />
                      <span className="w-[80px] shrink-0 text-[11px]">{!p.url ? <span className="text-muted-foreground">—</span> : p.probe === null ? <span className="text-muted-foreground">…</span> : p.probe.ok ? <span className="text-emerald-400">✓ {p.probe.status}</span> : <span className="text-amber-400">⚠ {p.probe.status ?? "no reply"}</span>}</span>
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {COUNCIL_KEYS.filter((k) => !pages.some((p) => p.council === k)).map((k) => (
                      <button key={k} type="button" className="rounded border border-dashed border-border px-2 py-0.5 text-[10.5px]" onClick={() => addCouncil(k)}>+ {COUNCIL_LABEL[k]}</button>
                    ))}
                    <button type="button" className="ml-auto rounded border border-border px-2.5 py-1 text-[11px] font-medium" onClick={() => void reScrape()}>Re-scrape</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* toolbar */}
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="font-semibold">Review — Instagram is the column that matters.</span>
            <button type="button" onClick={() => void download()} className="ml-auto inline-flex items-center gap-1 rounded border border-border px-2 py-1 hover:bg-muted"><Download className="size-3" /> Download .xlsx</button>
            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 hover:bg-muted"><Upload className="size-3" /> Re-import</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f); e.target.value = ""; }} />
          </div>

          {rows.length === 0 && <p className="text-[12px] text-muted-foreground">No officers came back. Open the council pages above to fix a URL and re-scrape, or use the paste fallback.</p>}

          <div className="space-y-2">
            {grouped.map(([council, list]) => (
              <div key={council} className="rounded-lg border border-border p-2">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{COUNCIL_LABEL[council]}</div>
                <div className="space-y-1">
                  {list.map((r) => <OfficerReviewRow key={r.id} r={r} campusName={campusName} campusId={campusId} flagged={worstLevel(flags.get(r.id) ?? [])} onPatch={patch} />)}
                </div>
              </div>
            ))}
          </div>

          {rows.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
              <p className="text-[12px] text-muted-foreground">{summary.importing} of {summary.total} will be sent{summary.excluded.length > 0 && <> · {summary.excluded.map((e) => `${e.count} ${e.reason}`).join(" · ")}</>}</p>
              <button type="button" disabled={submitting || summary.importing === 0} onClick={() => void submit()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[12.5px] font-bold text-primary-foreground disabled:opacity-40">
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Send {summary.importing} to Instagram DM queue
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// One reviewable officer. Type badge (org/person), editable position/name/email/chapter, and the
// Instagram cell — highlighted amber when a searched handle still needs a human's eyes, green once
// it's listed or confirmed, and flagged when missing so a blank never reads as done.
function OfficerReviewRow({ r, campusName, campusId, flagged, onPatch }: {
  r: OfficerRow; campusName: string; campusId: string; flagged: "ok" | "warn" | "block";
  onPatch: (id: string, p: Partial<OfficerRow>) => void;
}) {
  const ig = igState(r);
  const isPerson = !!(r.name && r.name.trim());
  const igTone = ig === "missing" ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
    : ig === "found_unconfirmed" ? "border-pink-500/50 bg-pink-500/10 text-pink-200"
    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  return (
    <div className={cn("rounded border p-1.5", flagged === "block" ? "border-rose-500/40 bg-rose-500/5" : "border-border")}>
      <div className="flex items-start gap-1.5">
        <input type="checkbox" checked={r.include} onChange={(e) => onPatch(r.id, { include: e.target.checked })} className="mt-1.5" />
        <div className="grid flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-1">
            <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase", isPerson ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>{isPerson ? "person" : "org"}</span>
            <input value={r.position ?? ""} onChange={(e) => onPatch(r.id, { position: e.target.value || null })} placeholder="position" className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px]" style={{ width: 140 }} />
            <input value={r.name ?? ""} onChange={(e) => onPatch(r.id, { name: e.target.value || null })} placeholder="name" className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px]" style={{ width: 140 }} />
            <input value={r.email ?? ""} onChange={(e) => onPatch(r.id, { email: e.target.value || null })} placeholder="email (optional)" className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px]" style={{ width: 190 }} />
            <input value={r.chapter ?? ""} onChange={(e) => onPatch(r.id, { chapter: e.target.value || null })} placeholder="chapter" className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px]" style={{ width: 110 }} />
          </div>

          {/* the Instagram cell — the product of this page */}
          <div className={cn("flex flex-wrap items-center gap-1.5 rounded border px-1.5 py-1 text-[11px]", igTone)}>
            <Instagram className="size-3" />
            {ig === "missing" ? (
              <>
                <span>no personal Instagram</span>
                <a href={igSearchUrl(`${r.name ?? ""} ${campusName} instagram`.trim())} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold underline"><Search className="size-2.5" /> find</a>
                <input placeholder="paste @handle" className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-foreground" style={{ width: 140 }}
                  onChange={(e) => { const v = e.target.value.trim(); if (v) { onPatch(r.id, { instagram: v, instagramSource: "manual", igVerified: true }); void recordIgOutcomeFn({ data: { campusId, outcome: "manual" } }); } }} />
              </>
            ) : (
              <>
                <a href={igProfileUrl(r.instagram ?? "")} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold underline">@{normalizeHandle(r.instagram)} <ExternalLink className="size-2.5" /></a>
                <span className="opacity-80">{ig === "listed" ? "listed on page" : ig === "confirmed" ? "confirmed" : `found by search · ${r.instagramConfidence ?? "low"}`}</span>
                {ig === "found_unconfirmed" && (
                  <>
                    <button type="button" className="inline-flex items-center gap-0.5 font-semibold underline" onClick={() => { onPatch(r.id, { igVerified: true }); void recordIgOutcomeFn({ data: { campusId, outcome: "confirmed" } }); }}><Check className="size-2.5" /> confirm</button>
                    <button type="button" className="inline-flex items-center gap-0.5 font-semibold underline" onClick={() => { onPatch(r.id, { instagram: null, instagramSource: null, instagramConfidence: null, igVerified: false }); void recordIgOutcomeFn({ data: { campusId, outcome: "cleared" } }); }}><X className="size-2.5" /> wrong</button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
