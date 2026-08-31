// FIND CONTACTS — click → review → import. Replaces the copy-prompt/Gemini/Claude/xlsx loop with
// two model calls and one review step.
//
// THE REVIEW TABLE IS THE PRODUCT. Nothing saves until a person has looked at it, every field is
// editable in place, and the rules that block a row are the pure ones in find-contacts-shared —
// the same functions the server re-runs at import, so the UI can inform but never decide.
import { useMemo, useState } from "react";

import {
  COUNCIL_KEYS, COUNCIL_LABEL, canImport, councilPrompt, flagRows, igProfileUrl, igSearchQuery,
  igSearchUrl, igState, importSummary, normalizeHandle, officerPrompt, parsePastedContacts,
  councilFromLabel, rolePriority, worstLevel,
  type CouncilKey, type CouncilPage, type OfficerRow, type UrlProbe,
} from "@/lib/find-contacts-shared";
import {
  findCouncilPagesFn, importReviewedContactsFn, probeUrlsFn, recordIgOutcomeFn, scrapeOfficersFn,
} from "@/lib/find-contacts.functions";

type Step = "idle" | "councils" | "officers" | "done";
type PageRow = CouncilPage & { probe: UrlProbe | null };

const BTN: React.CSSProperties = { minHeight: 34, borderRadius: 8, fontWeight: 800, fontSize: 12.5, padding: "0 12px" };
const INPUT = "w-full rounded border px-2 py-1 text-[12px]";

export function FindContactsPanel({ campusId, campusName, onImported }: {
  campusId: string; campusName: string; onImported?: () => void;
}) {
  const [step, setStep] = useState<Step>("idle");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [rows, setRows] = useState<OfficerRow[]>([]);
  const [existing, setExisting] = useState<{ emails: string[]; handles: string[] }>({ emails: [], handles: [] });
  const [cost, setCost] = useState(0);
  const [fromCache, setFromCache] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [showFallback, setShowFallback] = useState(false);
  const [paste, setPaste] = useState("");

  const flags = useMemo(() => flagRows(rows, existing), [rows, existing]);
  const summary = useMemo(() => importSummary(rows, flags), [rows, flags]);

  const patch = (id: string, p: Partial<OfficerRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

  // ── step 1 ──
  const findCouncils = async (refresh = false) => {
    setBusy("councils"); setErr(null); setResult(null);
    try {
      const r = await findCouncilPagesFn({ data: { campusId, refresh } });
      if (!r.ok) { setErr(r.error); setShowFallback(true); return; }
      setPages(r.pages); setCost((c) => c + r.costUsd); setFromCache(r.fromCache); setStep("councils");
    } catch (e) { setErr((e as Error).message); setShowFallback(true); }
    finally { setBusy(null); }
  };

  const setUrl = async (council: CouncilKey, url: string) => {
    setPages((ps) => ps.map((p) => (p.council === council ? { ...p, url, probe: null } : p)));
    if (!/^https?:\/\//i.test(url)) return;
    try {
      const [probe] = await probeUrlsFn({ data: { urls: [url] } });
      setPages((ps) => ps.map((p) => (p.council === council ? { ...p, probe } : p)));
    } catch { /* the status is a nicety; a missing one never blocks continuing */ }
  };

  const addCouncil = (council: CouncilKey) =>
    setPages((ps) => (ps.some((p) => p.council === council) ? ps : [...ps, { council, url: "", confidence: "low", probe: null }]));

  // ── step 2 ──
  const scrape = async () => {
    const urls = pages.filter((p) => /^https?:\/\//i.test(p.url)).map((p) => ({ council: p.council, url: p.url }));
    if (!urls.length) { setErr("Add at least one council URL first."); return; }
    setBusy("officers"); setErr(null);
    try {
      const r = await scrapeOfficersFn({ data: { campusId, urls } });
      if (!r.ok) { setErr(r.error); setShowFallback(true); return; }
      setRows(r.officers.slice().sort((a, b) => a.council.localeCompare(b.council) || rolePriority(a.position) - rolePriority(b.position)));
      setExisting(r.existing); setCost((c) => c + r.costUsd); setStep("officers");
    } catch (e) { setErr((e as Error).message); setShowFallback(true); }
    finally { setBusy(null); }
  };

  const doImport = async () => {
    setBusy("import"); setErr(null);
    try {
      const r = await importReviewedContactsFn({ data: { campusId, rows } });
      if (!r.ok) { setErr(r.error ?? "Import failed."); return; }
      setResult({ imported: r.imported, skipped: r.skipped });
      setStep("done");
      onImported?.();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  };

  const importPasted = () => {
    const parsed = parsePastedContacts(paste);
    if (!parsed.length) { setErr("Couldn't read that — needs a header row naming at least one column (council, name, email…)."); return; }
    setRows(parsed.map((p, i) => ({
      id: `p${i}`,
      council: councilFromLabel(p.council) ?? "fsl",
      position: p.position, name: p.name, email: p.email, phone: p.phone,
      instagram: p.instagram,
      instagramSource: p.instagram ? "manual" : null,
      instagramConfidence: null,
      sourceUrl: p.sourceUrl,
      include: true, igVerified: false, sourceChecked: false,
    })));
    setErr(null); setStep("officers"); setShowFallback(false);
  };

  // ── render ──
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold">Find contacts</h3>
          <p className="text-[11px] text-muted-foreground">
            Two model calls, one review. Nothing saves until you import.
            {cost > 0 && <> · this run ${cost.toFixed(4)}</>}
            {fromCache && <> · council URLs from cache</>}
          </p>
        </div>
        <div className="flex gap-2">
          {step === "idle" && (
            <button type="button" style={{ ...BTN, background: "var(--primary, #0f172a)", color: "#fff" }} disabled={busy !== null} onClick={() => void findCouncils()}>
              {busy === "councils" ? "Finding…" : "Find contacts"}
            </button>
          )}
          {step !== "idle" && (
            <button type="button" style={{ ...BTN, border: "1px solid var(--border)" }} onClick={() => { setStep("idle"); setPages([]); setRows([]); setResult(null); setErr(null); }}>
              Start over
            </button>
          )}
        </div>
      </div>

      {err && (
        <div className="mt-2 rounded border border-rose-300 bg-rose-50 px-2.5 py-2 text-[12px] text-rose-800">
          {err}
          <button type="button" className="ml-2 font-bold underline" onClick={() => setShowFallback((v) => !v)}>
            {showFallback ? "hide fallback" : "use the copy-prompt fallback"}
          </button>
        </div>
      )}

      {/* §6 FALLBACK — King's current workflow, preserved as a backstop, never the default. */}
      {showFallback && (
        <div className="mt-2 rounded border border-dashed border-border p-2.5">
          <p className="text-[11.5px] font-semibold">Fallback — run it yourself, paste it back</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button type="button" style={{ ...BTN, border: "1px solid var(--border)" }}
              onClick={() => void navigator.clipboard.writeText(councilPrompt(campusName))}>Copy step-1 prompt</button>
            <button type="button" style={{ ...BTN, border: "1px solid var(--border)" }}
              onClick={() => void navigator.clipboard.writeText(officerPrompt(campusName, pages.filter((p) => p.url).map((p) => ({ council: p.council, url: p.url }))))}>Copy step-2 prompt</button>
          </div>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4}
            placeholder="Paste the result — tab-separated, CSV, or a markdown table. Needs a header row."
            className="mt-2 w-full rounded border px-2 py-1 text-[12px]" />
          <button type="button" style={{ ...BTN, background: "var(--primary, #0f172a)", color: "#fff", marginTop: 6 }} onClick={importPasted}>
            Load pasted rows into the review table
          </button>
        </div>
      )}

      {/* ── STEP 1: the council pages ── */}
      {step === "councils" && (
        <div className="mt-3">
          <p className="text-[11.5px] font-semibold">Step 1 — council pages. Fix anything wrong, then continue.</p>
          <div className="mt-1.5 grid gap-1">
            {pages.map((p) => (
              <div key={p.council} className="flex flex-wrap items-center gap-2">
                <span className="w-[130px] shrink-0 text-[12px] font-semibold">{COUNCIL_LABEL[p.council]}</span>
                <input value={p.url} onChange={(e) => void setUrl(p.council, e.target.value)} placeholder="paste the URL" className={INPUT} style={{ flex: 1, minWidth: 220 }} />
                <span className="w-[92px] shrink-0 text-[11.5px]">
                  {!p.url ? <span className="text-muted-foreground">— not found</span>
                    : p.probe === null ? <span className="text-muted-foreground">checking…</span>
                    : p.probe.ok ? <span className="text-emerald-600">✓ {p.probe.status}</span>
                    : <span className="text-amber-600">⚠ {p.probe.status ?? "no reply"}</span>}
                </span>
                {p.confidence === "low" && p.url && <span className="text-[10px] uppercase text-amber-600">low conf</span>}
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {COUNCIL_KEYS.filter((k) => !pages.some((p) => p.council === k)).map((k) => (
              <button key={k} type="button" style={{ ...BTN, border: "1px dashed var(--border)", minHeight: 28 }} onClick={() => addCouncil(k)}>+ {COUNCIL_LABEL[k]}</button>
            ))}
          </div>
          <div className="mt-2.5 flex gap-2">
            <button type="button" style={{ ...BTN, background: "var(--primary, #0f172a)", color: "#fff" }} disabled={busy !== null} onClick={() => void scrape()}>
              {busy === "officers" ? "Reading pages…" : "Find the officers →"}
            </button>
            <button type="button" style={{ ...BTN, border: "1px solid var(--border)" }} disabled={busy !== null} onClick={() => void findCouncils(true)}>Re-run search</button>
          </div>
        </div>
      )}

      {/* ── STEP 2: the review table ── */}
      {step === "officers" && (
        <div className="mt-3">
          <p className="text-[11.5px] font-semibold">Step 2 — review. Edit anything; untick to exclude.</p>
          <div className="mt-1.5 grid gap-1.5">
            {rows.map((r) => {
              const f = flags.get(r.id) ?? [];
              const level = worstLevel(f);
              const ig = igState(r);
              const mark = level === "block" ? "✗" : level === "warn" ? "⚠" : "✓";
              const tone = level === "block" ? "border-rose-300 bg-rose-50" : level === "warn" ? "border-amber-300 bg-amber-50" : "border-border";
              return (
                <div key={r.id} className={`rounded border p-2 ${tone}`}>
                  <div className="flex items-start gap-2">
                    <input type="checkbox" checked={r.include} onChange={(e) => patch(r.id, { include: e.target.checked })} className="mt-1" />
                    <span className="w-4 shrink-0 text-[13px] font-bold">{mark}</span>
                    <div className="grid flex-1 gap-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <select value={r.council} onChange={(e) => patch(r.id, { council: e.target.value as CouncilKey })} className="rounded border px-1 py-0.5 text-[11.5px]">
                          {COUNCIL_KEYS.map((k) => <option key={k} value={k}>{COUNCIL_LABEL[k]}</option>)}
                        </select>
                        <input value={r.position ?? ""} onChange={(e) => patch(r.id, { position: e.target.value || null })} placeholder="position" className="rounded border px-1.5 py-0.5 text-[11.5px]" style={{ width: 150 }} />
                        <input value={r.name ?? ""} onChange={(e) => patch(r.id, { name: e.target.value || null })} placeholder="name" className="rounded border px-1.5 py-0.5 text-[11.5px]" style={{ width: 150 }} />
                        <input value={r.email ?? ""} onChange={(e) => patch(r.id, { email: e.target.value || null })} placeholder="email" className="rounded border px-1.5 py-0.5 text-[11.5px]" style={{ width: 200 }} />
                        <input value={r.phone ?? ""} onChange={(e) => patch(r.id, { phone: e.target.value || null })} placeholder="phone" className="rounded border px-1.5 py-0.5 text-[11.5px]" style={{ width: 120 }} />
                      </div>

                      {/* the Instagram row — three states, one fast fallback */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
                        {ig === "missing" ? (
                          <>
                            <span className="text-muted-foreground">◇ no personal Instagram</span>
                            <a href={igSearchUrl(igSearchQuery({ name: r.name, campusName, council: r.council, position: r.position }))} target="_blank" rel="noreferrer" className="font-semibold underline">Search ↗</a>
                            <input placeholder="paste handle" className="rounded border px-1.5 py-0.5 text-[11.5px]" style={{ width: 150 }}
                              onChange={(e) => { const v = e.target.value.trim(); if (v) { patch(r.id, { instagram: v, instagramSource: "manual", igVerified: true }); void recordIgOutcomeFn({ data: { campusId, outcome: "manual" } }); } }} />
                          </>
                        ) : (
                          <>
                            <a href={igProfileUrl(r.instagram ?? "")} target="_blank" rel="noreferrer" className="font-semibold underline">@{normalizeHandle(r.instagram)}</a>
                            <span className="text-muted-foreground">
                              {ig === "listed" ? "listed on council page" : ig === "confirmed" ? "confirmed" : `found by search · ${r.instagramConfidence ?? "low"} confidence`}
                            </span>
                            {ig === "found_unconfirmed" && (
                              <>
                                <button type="button" className="font-semibold underline" onClick={() => { patch(r.id, { igVerified: true }); void recordIgOutcomeFn({ data: { campusId, outcome: "confirmed" } }); }}>Confirm</button>
                                <button type="button" className="font-semibold underline" onClick={() => { patch(r.id, { instagram: null, instagramSource: null, instagramConfidence: null, igVerified: false }); void recordIgOutcomeFn({ data: { campusId, outcome: "cleared" } }); }}>Wrong — clear</button>
                              </>
                            )}
                          </>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <input value={r.sourceUrl ?? ""} onChange={(e) => patch(r.id, { sourceUrl: e.target.value || null })} placeholder="source URL (required)" className="rounded border px-1.5 py-0.5 text-[11px]" style={{ width: 280 }} />
                        {r.sourceUrl && <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="underline">open ↗</a>}
                        <label className="flex items-center gap-1"><input type="checkbox" checked={r.igVerified} onChange={(e) => patch(r.id, { igVerified: e.target.checked })} /> IG verified</label>
                        <label className="flex items-center gap-1"><input type="checkbox" checked={r.sourceChecked} onChange={(e) => patch(r.id, { sourceChecked: e.target.checked })} /> Source checked</label>
                      </div>

                      {f.map((x) => (
                        <p key={x.code} className={`text-[11px] ${x.level === "block" ? "text-rose-700" : "text-amber-700"}`}>{x.level === "block" ? "✗" : "⚠"} {x.message}</p>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
            {rows.length === 0 && <p className="text-[12px] text-muted-foreground">No officers came back. Try the fallback, or fix the council URLs and re-run.</p>}
          </div>

          {/* the footer — what will import and why the rest will not */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
            <p className="text-[12px]">
              <b>Import {summary.importing} of {summary.total}</b>
              {summary.excluded.length > 0 && (
                <span className="text-muted-foreground"> · excluded: {summary.excluded.map((e) => `${e.count} ${e.reason}`).join(" · ")}</span>
              )}
            </p>
            <button type="button" style={{ ...BTN, background: "var(--primary, #0f172a)", color: "#fff" }} disabled={busy !== null || summary.importing === 0} onClick={() => void doImport()}>
              {busy === "import" ? "Importing…" : `Import ${summary.importing}`}
            </button>
          </div>
        </div>
      )}

      {step === "done" && result && (
        <p className="mt-3 rounded border border-emerald-300 bg-emerald-50 px-2.5 py-2 text-[12px] text-emerald-800">
          Imported {result.imported}{result.skipped > 0 && <> · skipped {result.skipped}</>}. Duplicates and rows without a contact method or source were left out.
        </p>
      )}
    </div>
  );
}
