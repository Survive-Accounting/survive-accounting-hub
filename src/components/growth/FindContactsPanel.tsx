// FIND CONTACTS — a CRM in a modal. One click scrapes the council pages, reads the officers, and
// Google-searches each personal Instagram to prefill it; the result opens as an editable spreadsheet
// you fix in place, add rows to, download or re-import, and submit to the Instagram DM queue.
//
// When the scrape gets org accounts but no officer NAMES (a common case — many council pages list a
// handle and nothing else), there's nobody to DM yet, so we say so plainly and lay out the empty
// President / Scholarship-chair rows for each council to fill by hand. Nothing saves until submit.
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Search, Download, Upload, Check, Loader2, Plus, Trash2, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";

import {
  COUNCIL_KEYS, COUNCIL_LABEL, councilPrompt, flagRows, igSearchUrl, importSummary,
  normalizeHandle, officerPrompt, parsePastedContacts, councilFromLabel, rolePriority,
  type CouncilKey, type CouncilPage, type OfficerRow, type UrlProbe,
} from "@/lib/find-contacts-shared";
import {
  findCouncilPagesFn, probeUrlsFn, scrapeOfficersFn, sendToDmQueueFn,
} from "@/lib/find-contacts.functions";
import { cn } from "@/lib/utils";

type Phase = "idle" | "working" | "review";
type PageRow = CouncilPage & { probe: UrlProbe | null };

const MANUAL_COUNCILS: CouncilKey[] = ["ifc", "panhellenic", "nphc", "mgc"];
let RID = 0;
const emptyRow = (council: CouncilKey, position: string | null): OfficerRow => ({
  id: `m${RID++}`, council, position, name: null, email: null, phone: null, instagram: null,
  instagramSource: null, instagramConfidence: null, chapter: null, sourceUrl: null,
  include: true, igVerified: false, sourceChecked: false,
});

export function FindContactsPanel({ campusId, campusName, onImported, autoStart }: {
  campusId: string; campusName: string; onImported?: () => void; autoStart?: boolean;
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
  const [manual, setManual] = useState(false); // came in via "Add manually", not a failed scrape
  const fileRef = useRef<HTMLInputElement | null>(null);

  const flags = useMemo(() => flagRows(rows, existing), [rows, existing]);
  const summary = useMemo(() => importSummary(rows, flags), [rows, flags]);
  // The "scrape came up short" banner is only for an actual scrape that returned no names.
  const noNames = !manual && phase === "review" && rows.length > 0 && !rows.some((r) => r.name && r.name.trim());

  const patch = (id: string, p: Partial<OfficerRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const remove = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));
  const sortRows = (rs: OfficerRow[]) => rs.slice().sort((a, b) => a.council.localeCompare(b.council) || rolePriority(a.position) - rolePriority(b.position));

  const scrapeInto = async (pgs: PageRow[]) => {
    const urls = pgs.filter((p) => /^https?:\/\//i.test(p.url)).map((p) => ({ council: p.council, url: p.url }));
    if (!urls.length) { setErr("No council pages found. Use the paste fallback, or complete manually."); setRows(MANUAL_COUNCILS.flatMap((c) => [emptyRow(c, "Scholarship Chair"), emptyRow(c, "President")])); setPhase("review"); return; }
    setProgress("Reading the pages and searching Instagrams…");
    const r = await scrapeOfficersFn({ data: { campusId, urls } });
    if (!r.ok) { setErr(r.error); setShowFallback(true); setPhase("review"); return; }
    setRows(sortRows(r.officers)); setExisting(r.existing); setCost((c) => c + r.costUsd); setPhase("review");
  };

  const run = async () => {
    setPhase("working"); setErr(null); setManual(false); setProgress("Finding the official council pages…");
    try {
      const r = await findCouncilPagesFn({ data: { campusId } });
      if (!r.ok) { setErr(r.error); setShowFallback(true); setPhase("review"); return; }
      setPages(r.pages); setCost((c) => c + r.costUsd);
      await scrapeInto(r.pages);
    } catch (e) { setErr((e as Error).message); setShowFallback(true); setPhase("review"); }
  };
  const reScrape = async () => { setErr(null); setPhase("working"); try { await scrapeInto(pages); } catch (e) { setErr((e as Error).message); setPhase("review"); } };

  // Skip the scrape entirely — open a blank table with a President + Scholarship-chair row per council
  // to fill by hand. The scrape only ever gets ~40% of the roster; this is the other 60%.
  const addManually = () => { setErr(null); setManual(true); setRows(MANUAL_COUNCILS.flatMap((c) => [emptyRow(c, "Scholarship Chair"), emptyRow(c, "President")])); setPhase("review"); };

  // Scrape-contacts entry point: kick the scrape off the moment the modal opens.
  const started = useRef(false);
  useEffect(() => { if (autoStart && !started.current) { started.current = true; void run(); } }, [autoStart]); // eslint-disable-line react-hooks/exhaustive-deps

  const setUrl = async (council: CouncilKey, url: string) => {
    setPages((ps) => ps.map((p) => (p.council === council ? { ...p, url, probe: null } : p)));
    if (!/^https?:\/\//i.test(url)) return;
    try { const [probe] = await probeUrlsFn({ data: { urls: [url] } }); setPages((ps) => ps.map((p) => (p.council === council ? { ...p, probe } : p))); } catch { /* status only */ }
  };
  const addCouncilPage = (council: CouncilKey) => setPages((ps) => (ps.some((p) => p.council === council) ? ps : [...ps, { council, url: "", confidence: "low", probe: null }]));

  // "Complete manually" — guarantee a President + Scholarship-chair row for every council, so every
  // slot is present to type into even when the scrape returned none.
  const completeManually = () => setRows((rs) => {
    const has = (c: CouncilKey, re: RegExp) => rs.some((r) => r.council === c && re.test(r.position ?? ""));
    const add: OfficerRow[] = [];
    for (const c of MANUAL_COUNCILS) {
      if (!has(c, /scholar|academ/i)) add.push(emptyRow(c, "Scholarship Chair"));
      if (!has(c, /president/i)) add.push(emptyRow(c, "President"));
    }
    return sortRows([...rs, ...add]);
  });

  const rowsFromPasted = (text: string): OfficerRow[] => parsePastedContacts(text).map((p, i) => ({
    id: `p${i}`, council: councilFromLabel(p.council) ?? "fsl", position: p.position, name: p.name, email: p.email,
    phone: p.phone, instagram: p.instagram, instagramSource: p.instagram ? "manual" : null, instagramConfidence: null,
    chapter: p.chapter, sourceUrl: p.sourceUrl, include: true, igVerified: false, sourceChecked: false,
  }));
  const importPasted = () => {
    const parsed = rowsFromPasted(paste);
    if (!parsed.length) { setErr("Couldn't read that — needs a header row (council, name, instagram…)."); return; }
    setRows(sortRows(parsed)); setErr(null); setShowFallback(false); setPhase("review");
  };
  const onUpload = async (file: File) => {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const parsed = rowsFromPasted(XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]));
      if (!parsed.length) { toast.error("Couldn't read that sheet — needs a header row."); return; }
      setRows(sortRows(parsed)); setErr(null); setPhase("review"); toast.success(`Loaded ${parsed.length} rows.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't open that file."); }
  };
  const download = async () => {
    const XLSX = await import("xlsx");
    const aoa = [["School", "Council", "Role", "Name", "Instagram", "Chapter", "Email"],
      ...rows.map((r) => [campusName, COUNCIL_LABEL[r.council], r.position ?? "", r.name ?? "", r.instagram ? `@${normalizeHandle(r.instagram)}` : "", r.chapter ?? "", r.email ?? ""])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 24 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Contacts");
    XLSX.writeFile(wb, `${campusName.replace(/[^a-z0-9]+/gi, "_")}_contacts.xlsx`);
  };

  const submit = async () => {
    setSubmitting(true); setErr(null);
    try {
      const r = await sendToDmQueueFn({ data: { campusId, rows } });
      if (!r.ok) { setErr(r.error ?? "Couldn't submit."); return; }
      toast.success(`Saved ${r.imported} contact${r.imported === 1 ? "" : "s"}.`, { description: "Added to this campus and its DM queue." });
      onImported?.();
      setPhase("idle"); setRows([]); setPages([]); setCost(0);
    } catch (e) { setErr((e as Error).message); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold">Find contacts</h3>
          <p className="text-[11px] text-muted-foreground">One click scrapes the councils; fix the table and send.{cost > 0 && <> · this run ${cost.toFixed(4)}</>}</p>
        </div>
        <div className="flex items-center gap-2">
          {phase === "review" && (
            <>
              <button type="button" title="Download .xlsx" onClick={() => void download()} className="grid size-8 place-items-center rounded-lg border border-border hover:bg-muted"><Download className="size-4" /></button>
              <button type="button" title="Import .xlsx / .csv" onClick={() => fileRef.current?.click()} className="grid size-8 place-items-center rounded-lg border border-border hover:bg-muted"><Upload className="size-4" /></button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f); e.target.value = ""; }} />
            </>
          )}
          {phase === "idle"
            ? <>
                <button type="button" onClick={addManually} className="rounded-lg border border-border px-3 py-2 text-[12.5px] font-medium hover:bg-muted">Add manually</button>
                <button type="button" onClick={() => void run()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[12.5px] font-bold text-primary-foreground"><Search className="size-4" /> Find contacts</button>
              </>
            : <button type="button" onClick={() => { setPhase("idle"); setRows([]); setPages([]); setErr(null); setShowFallback(false); setManual(false); }} className="rounded-lg border border-border px-3 py-2 text-[12.5px] font-medium">Start over</button>}
        </div>
      </div>

      {phase === "working" && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-3 text-[12px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" /> {progress || "Working…"}
        </div>
      )}

      {err && (
        <div className="mt-2 rounded border border-rose-500/40 bg-rose-500/10 px-2.5 py-2 text-[12px] text-rose-300">
          {err} <button type="button" className="ml-2 font-bold underline" onClick={() => setShowFallback((v) => !v)}>{showFallback ? "hide" : "run it yourself, paste it back"}</button>
        </div>
      )}
      {showFallback && (
        <div className="mt-2 rounded border border-dashed border-border p-2.5">
          <p className="text-[11.5px] font-semibold">Run it yourself, paste it back</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button type="button" className="rounded border border-border px-2.5 py-1 text-[11.5px]" onClick={() => { void navigator.clipboard.writeText(councilPrompt(campusName)); toast.success("Step-1 prompt copied"); }}>Copy step-1 prompt</button>
            <button type="button" className="rounded border border-border px-2.5 py-1 text-[11.5px]" onClick={() => { void navigator.clipboard.writeText(officerPrompt(campusName, pages.filter((p) => p.url).map((p) => ({ council: p.council, url: p.url })))); toast.success("Step-2 prompt copied"); }}>Copy step-2 prompt</button>
          </div>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} placeholder="Paste the result — Ctrl+A → Ctrl+C in the sheet, then paste. Header row + council, name, instagram…" className="mt-2 w-full rounded border border-border bg-background px-2 py-1 text-[12px]" />
          <button type="button" className="mt-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11.5px] font-semibold text-primary-foreground" onClick={importPasted}>Load into the table</button>
        </div>
      )}

      {phase === "review" && (
        <div className="mt-3 space-y-2">
          {/* scrape came up short — org accounts but no officer names */}
          {noNames && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5">
              <div className="text-[12.5px] font-semibold text-amber-300">😔 Scrape came up short</div>
              <div className="mt-0.5 text-[11.5px] text-amber-300/90">The council pages listed org accounts but no officer names — so there's nobody to DM yet. Add them by hand below.</div>
              <button type="button" onClick={completeManually} className="mt-2 rounded-lg bg-amber-500/90 px-3 py-1.5 text-[11.5px] font-semibold text-amber-950">Complete manually</button>
              <div className="mt-1 text-[10px] text-amber-300/70">Can't find something? Leave it blank.</div>
            </div>
          )}

          {/* council pages fixer */}
          {pages.length > 0 && (
            <div className="rounded-lg border border-border/60">
              <button onClick={() => setShowUrls((v) => !v)} className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] text-muted-foreground">
                {showUrls ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />} Council pages ({pages.filter((p) => p.url).length}) — fix a URL to re-scrape
              </button>
              {showUrls && (
                <div className="space-y-1 border-t border-border p-2.5">
                  {pages.map((p) => (
                    <div key={p.council} className="flex flex-wrap items-center gap-2">
                      <span className="w-[120px] shrink-0 text-[11.5px] font-semibold">{COUNCIL_LABEL[p.council]}</span>
                      <input value={p.url} onChange={(e) => void setUrl(p.council, e.target.value)} placeholder="paste the URL" className="flex-1 rounded border border-border bg-background px-2 py-1 text-[11.5px]" style={{ minWidth: 200 }} />
                      <span className="w-[70px] shrink-0 text-[11px]">{!p.url ? <span className="text-muted-foreground">—</span> : p.probe === null ? <span className="text-muted-foreground">…</span> : p.probe.ok ? <span className="text-emerald-400">✓</span> : <span className="text-amber-400">⚠</span>}</span>
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {COUNCIL_KEYS.filter((k) => !pages.some((p) => p.council === k)).map((k) => (
                      <button key={k} type="button" className="rounded border border-dashed border-border px-2 py-0.5 text-[10.5px]" onClick={() => addCouncilPage(k)}>+ {COUNCIL_LABEL[k]}</button>
                    ))}
                    <button type="button" className="ml-auto inline-flex items-center gap-1 rounded border border-border px-2.5 py-1 text-[11px] font-medium" onClick={() => void reScrape()}><RefreshCw className="size-3" /> Re-scrape</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* the spreadsheet */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-[11.5px]" style={{ minWidth: 720 }}>
              <thead>
                <tr className="bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="w-6 px-1 py-1.5"></th>
                  <th className="px-1.5 py-1.5 font-medium">Council</th>
                  <th className="px-1.5 py-1.5 font-medium">Role</th>
                  <th className="px-1.5 py-1.5 font-medium">Name</th>
                  <th className="px-1.5 py-1.5 font-medium">Instagram</th>
                  <th className="px-1.5 py-1.5 font-medium">Chapter</th>
                  <th className="px-1.5 py-1.5 font-medium">Email</th>
                  <th className="w-6 px-1 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const missingIg = !normalizeHandle(r.instagram);
                  const isPerson = !!(r.name && r.name.trim());
                  return (
                    <tr key={r.id} className="border-t border-border/60">
                      <td className="px-1 py-1 align-middle"><input type="checkbox" checked={r.include} onChange={(e) => patch(r.id, { include: e.target.checked })} /></td>
                      <td className="px-1 py-1">
                        <select value={r.council} onChange={(e) => patch(r.id, { council: e.target.value as CouncilKey })} className="w-full rounded border border-transparent bg-transparent px-1 py-1 hover:border-border focus:border-border">
                          {COUNCIL_KEYS.map((k) => <option key={k} value={k}>{COUNCIL_LABEL[k]}</option>)}
                        </select>
                      </td>
                      <Cell value={r.position} onChange={(v) => patch(r.id, { position: v })} placeholder="role" />
                      <Cell value={r.name} onChange={(v) => patch(r.id, { name: v })} placeholder={isPerson ? "" : "org — leave blank"} />
                      <td className="px-1 py-1">
                        <div className={cn("flex items-center gap-1 rounded px-1", missingIg && "bg-amber-500/10")}>
                          <input value={r.instagram ?? ""} onChange={(e) => patch(r.id, { instagram: e.target.value || null, instagramSource: e.target.value ? "manual" : null })} placeholder="@handle" className="min-w-0 flex-1 bg-transparent py-1 text-pink-300 placeholder:text-amber-400/70 focus:outline-none" />
                          {missingIg && <a href={igSearchUrl(`${r.name ?? ""} ${campusName} instagram`.trim())} target="_blank" rel="noreferrer" title="Google this person + Instagram" className="shrink-0 text-primary"><Search className="size-3" /></a>}
                        </div>
                      </td>
                      <Cell value={r.chapter} onChange={(v) => patch(r.id, { chapter: v })} placeholder="—" />
                      <Cell value={r.email} onChange={(v) => patch(r.id, { email: v })} placeholder="—" />
                      <td className="px-1 py-1 text-center"><button onClick={() => remove(r.id)} title="Remove row" className="text-muted-foreground hover:text-red-400"><Trash2 className="size-3.5" /></button></td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-4 text-center text-[12px] text-muted-foreground">No rows. Add one below, complete manually, or paste a sheet.</td></tr>}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={() => setRows((rs) => [...rs, emptyRow("ifc", null)])} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"><Plus className="size-3" /> add a row</button>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
            <p className="text-[12px] text-muted-foreground">{summary.importing} of {summary.total} will be sent{summary.excluded.length > 0 && <> · {summary.excluded.map((e) => `${e.count} ${e.reason}`).join(" · ")}</>}</p>
            <button type="button" disabled={submitting || summary.importing === 0} onClick={() => void submit()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[12.5px] font-bold text-primary-foreground disabled:opacity-40">
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save {summary.importing} contact{summary.importing === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// A bare inline table cell — looks like text until you focus it.
function Cell({ value, onChange, placeholder }: { value: string | null; onChange: (v: string | null) => void; placeholder?: string }) {
  return (
    <td className="px-1 py-1">
      <input value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} placeholder={placeholder} className="w-full rounded border border-transparent bg-transparent px-1 py-1 hover:border-border focus:border-border focus:outline-none" />
    </td>
  );
}
