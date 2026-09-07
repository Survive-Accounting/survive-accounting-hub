// /admin/illustrations — THE ILLUSTRATION BANK. Every generated picture on every live set's
// Blast Off plan, in one table, classified by the style registry's own predicates:
//
//   off-style  pinned to a preset that isn't the default for its kind (gold)
//   stale      made with an older version of its own preset (orange)
//   current    neither (muted)
//
// WHY (2026-09-06 /v3 audit, "real project #2"): "`isStaleIllustration()` already flags any
// picture made with an older house-style version than the current registry, but the only way to
// find one today is opening each slide's Illustrator panel individually. A cross-set list of
// every stale illustration with a one-click 'switch to current style + queue regenerate' would
// matter every time the style registry gets revised again" — and it just was (02de8431: the
// house style moved from watercolor v4 to riso), so tonight every exam-set picture is off-style.
//
// Tick rows → "Regenerate N selected" → the estimated cost (the library's median, else a stated
// guess) → confirm → ONE AT A TIME, never parallel (Recraft rate limits, and Lee wants to watch):
// a progress line, a ✓ / ✗ per row, Retry on a miss, Stop finishes the in-flight one and halts,
// and a running total of what was spent. Keep-seed (default on) reuses each picture's own seed so
// the composition rhymes and only the medium changes. Click a done row for before / after.
//
// A sibling of the other admin.* pages (no admin shell renders an <Outlet/>); registered in
// lib/site-qa/manifest.ts. The server side is lib/illustrate.functions.ts (listIllustrationsAcrossBank,
// regenerateIllustrationInPlace); the pure parts are lib/illustration-bank.ts.
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { AdminGate, getAdminWho } from "@/components/AdminGate";
import { illustrationStyle, type IllustrationRegistry } from "@/components/blastoff/illustration";
import { useIllustrationRegistry } from "@/components/blastoff/use-illustration-registry";
import {
  BANK_STATUSES, defaultBankFilter, estimateCost, frameKindLabel, rowsNeedingWork, tallyStatuses, targetStyleIdFor, usd,
  type BankRow, type BankStatus,
} from "@/lib/illustration-bank";
import { MISSING_LIBRARY_HINT, listIllustrationsAcrossBank, regenerateIllustrationInPlace, type IllustrationBank } from "@/lib/illustrate.functions";

export const Route = createFileRoute("/admin/illustrations")({
  component: () => <AdminGate><Bank /></AdminGate>,
  head: () => ({ meta: [{ title: "Illustration bank — Survive" }, { name: "robots", content: "noindex" }] }),
});

const GOLD = "#FCA311", CREAM = "#F4EFE6", MUTED = "#9AA3B8", EDGE = "rgba(244,239,230,0.16)", BG = "#070B14", PANEL = "rgba(16,24,44,0.92)";
const ORANGE = "#FB923C", MINT = "#3BF5A0", RED = "#F87171";
const DISPLAY = "'League Spartan', sans-serif";

const btn = (kind: "gold" | "ghost" | "quiet" = "ghost"): CSSProperties => ({
  background: kind === "gold" ? GOLD : "transparent",
  color: kind === "gold" ? "#0B1322" : kind === "quiet" ? MUTED : CREAM,
  border: kind === "gold" ? "none" : `1px solid ${kind === "quiet" ? "transparent" : EDGE}`,
  borderRadius: 10, padding: kind === "quiet" ? "4px 8px" : "7px 12px", fontSize: kind === "quiet" ? 12 : 13, fontWeight: kind === "quiet" ? 700 : 800, cursor: "pointer",
  fontFamily: "'Rubik', system-ui, sans-serif", whiteSpace: "nowrap",
});
const chip = (color = MUTED, on = true): CSSProperties => ({
  fontSize: 10.5, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: on ? color : MUTED,
  border: `1px solid ${on ? color : MUTED}55`, borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap", background: "transparent", cursor: "pointer",
});

const STATUS_COLOR: Record<BankStatus, string> = { "off-style": GOLD, stale: ORANGE, current: MUTED };
const STATUS_LABEL: Record<BankStatus, string> = { "off-style": "Off-style", stale: "Stale", current: "Current" };
type Filter = BankStatus | "all";

/** What happened to one row in this session's run. */
type Outcome =
  | { state: "running" }
  | { state: "ok"; before: string; after: BankRow; costUsd: number | null }
  | { state: "err"; error: string };

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const dateShort = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—");

function Thumb({ url, size = 56, title, onClick }: { url: string; size?: number; title?: string; onClick?: () => void }) {
  // The transparent PNG on the dark panel — what the phone shows, at a glance. Click = the
  // pop-out below (2026-09-06, Lee: "click an illustration in the bank and have it pop out").
  return (
    <div title={onClick ? "Click to view" : title} onClick={onClick} role={onClick ? "button" : undefined}
      style={{ width: size, height: size, borderRadius: 8, background: "#000", border: `1px solid ${EDGE}`, display: "grid", placeItems: "center", overflow: "hidden", flexShrink: 0, cursor: onClick ? "zoom-in" : undefined }}>
      <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} loading="lazy" />
    </div>
  );
}

/** THE POP-OUT: the picture on the black 9:16 stage at phone proportions — what a student
 *  sees, not a square on white — with its subject beside it and the way to its slide. Escape
 *  or a click outside closes. */
function Lightbox({ row, reg, onClose }: { row: BankRow | null; reg: IllustrationRegistry; onClose: () => void }) {
  useEffect(() => {
    if (!row) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [row, onClose]);
  if (!row) return null;
  const style = illustrationStyle(row.stylePreset, reg);
  const stageH = Math.min(760, typeof window !== "undefined" ? window.innerHeight * 0.84 : 760);
  const stageW = Math.round(stageH * 9 / 16);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(3,5,10,0.88)", display: "grid", placeItems: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 22, alignItems: "stretch", maxWidth: "min(1100px, 96vw)" }}>
        {/* the stage: black, 9:16, the picture placed where a blank slide would put it */}
        <div style={{ width: stageW, height: stageH, background: "#000", borderRadius: 18, border: `1px solid ${EDGE}`, position: "relative", overflow: "hidden", flexShrink: 0 }}>
          <img src={row.assetUrl} alt={row.title} style={{ position: "absolute", left: "50%", top: "44%", transform: "translate(-50%, -50%)", width: "72%", objectFit: "contain" }} />
        </div>
        <div style={{ width: 320, background: PANEL, border: `1px solid ${EDGE}`, borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10, color: CREAM, fontSize: 13 }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 800, lineHeight: 1.15 }}>{row.title || "(untitled)"}</div>
          <div style={{ color: MUTED, fontSize: 12 }}>{row.topicName} · {row.setName} · {frameKindLabel(row.frameKind)}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span style={chip(MUTED)}>{style.label.replace(/\s*\(.*\)$/, "")} v{row.styleVersion ?? "?"}</span>
            <span style={chip(STATUS_COLOR[row.status])}>{STATUS_LABEL[row.status]}</span>
            {row.seed !== null && <span style={chip(MUTED)}>seed {row.seed}</span>}
          </div>
          <div style={{ fontSize: 10.5, color: GOLD, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 }}>subject</div>
          <div style={{ lineHeight: 1.45 }}>{row.prompt}</div>
          {row.teachingIntent && (<>
            <div style={{ fontSize: 10.5, color: GOLD, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 }}>teaching point</div>
            <div style={{ lineHeight: 1.45, color: MUTED }}>{row.teachingIntent}</div>
          </>)}
          <div style={{ flex: 1 }} />
          <a href={row.reviewPath} style={{ ...btn("gold"), textAlign: "center", textDecoration: "none" }}>Open this slide in Review →</a>
          <a href={row.assetUrl} target="_blank" rel="noopener noreferrer" style={{ ...btn("ghost"), textAlign: "center", textDecoration: "none" }}>Open the PNG ↗</a>
          <button onClick={onClose} style={btn("quiet")}>close · esc</button>
        </div>
      </div>
    </div>
  );
}

function Bank() {
  const [bank, setBank] = useState<IllustrationBank | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [keepSeed, setKeepSeed] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState<BankRow | null>(null);
  const closeView = useCallback(() => setView(null), []);
  // The run: what's in flight, where it is, what it has cost. stopRef is read between pictures —
  // Stop never aborts a Recraft call mid-draw (that would still be billed).
  const [run, setRun] = useState<{ total: number; done: number; current: BankRow | null; spent: number; stopped: boolean } | null>(null);
  const stopRef = useRef(false);
  // THE REGISTRY (2026-09-06, v6): the labels and targets on this page read the same DB-backed
  // registry the server classified the rows by (getRegistry) — edited at /admin/illustrations/styles.
  const { registry: reg } = useIllustrationRegistry();

  const refresh = useCallback(() => {
    listIllustrationsAcrossBank().then((b) => {
      setBank(b);
      setFilter((f) => f ?? defaultBankFilter(b.totals));
    }).catch((e) => setErr(errText(e)));
  }, []);
  useEffect(refresh, [refresh]);

  const rows = bank?.rows ?? [];
  const topics = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) if (!seen.has(r.topicId)) seen.set(r.topicId, r.topicName);
    return [...seen.entries()];
  }, [rows]);
  const visible = useMemo(() => rows.filter((r) => (filter === "all" || !filter || r.status === filter) && (!topic || r.topicId === topic)), [rows, filter, topic]);
  const groups = useMemo(() => {
    const out: { topicId: string; topicName: string; sets: { setId: string; setName: string; rows: BankRow[] }[] }[] = [];
    for (const r of visible) {
      let t = out[out.length - 1];
      if (!t || t.topicId !== r.topicId) { t = { topicId: r.topicId, topicName: r.topicName, sets: [] }; out.push(t); }
      let s = t.sets[t.sets.length - 1];
      if (!s || s.setId !== r.setId) { s = { setId: r.setId, setName: r.setName, rows: [] }; t.sets.push(s); }
      s.rows.push(r);
    }
    return out;
  }, [visible]);

  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.key));
  const toggleAllVisible = () => setSelected((s) => {
    const n = new Set(s);
    if (allVisibleSelected) for (const r of visible) n.delete(r.key); else for (const r of visible) n.add(r.key);
    return n;
  });
  const toggle = (key: string) => setSelected((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.key)), [rows, selected]);
  // The style each selected picture would land in — riso for exam content, watercolor for a
  // strategy short — named on the button so Lee sees the split before he pays for it.
  const targetLabel = useMemo(() => {
    const ids = [...new Set(selectedRows.map((r) => targetStyleIdFor(r.topicKind, undefined, reg)))];
    return ids.map((id) => illustrationStyle(id, reg).label.replace(/\s*\(.*\)$/, "")).join(" / ") || "the house style";
  }, [selectedRows, reg]);
  const estimate = estimateCost(bank?.medianCostUsd ?? null, selectedRows.length);
  /** "REGENERATE ALL STALE" (2026-09-06, v6 Part 2: "a 'Regenerate all stale' action with a
   *  count and a confirm"): every stale and off-style picture in the bank — not only the
   *  visible ones — selected in one go and straight to the same confirm (count + estimate). */
  const needing = useMemo(() => rowsNeedingWork(rows), [rows]);
  const selectAllNeedingWork = () => {
    setSelected(new Set(needing.map((r) => r.key)));
    setFilter("all");
    setConfirming(true);
  };

  /** One picture, one call. Returns what it cost, or throws with the server's exact message. */
  const regenerateOne = useCallback(async (r: BankRow): Promise<number> => {
    setOutcomes((o) => ({ ...o, [r.key]: { state: "running" } }));
    try {
      const res = await regenerateIllustrationInPlace({ data: { setId: r.setId, frameId: r.frameId, keepSeed, who: getAdminWho() } });
      setOutcomes((o) => ({ ...o, [r.key]: { state: "ok", before: r.assetUrl, after: res.row, costUsd: res.costUsd } }));
      // The row itself now carries the new picture and reads "current".
      setBank((b) => {
        if (!b) return b;
        const next = b.rows.map((x) => (x.key === r.key ? res.row : x));
        return { ...b, rows: next, totals: tallyStatuses(next) };
      });
      return res.costUsd ?? 0;
    } catch (e) {
      setOutcomes((o) => ({ ...o, [r.key]: { state: "err", error: errText(e) } }));
      throw e;
    }
  }, [keepSeed]);

  /** SEQUENTIAL, always. An error marks its row ✗ (with Retry) and the run moves on to the next
   *  picture; only Stop halts it — and Stop lets the one in flight finish first. */
  const runSelected = async () => {
    const queue = selectedRows.slice();
    setConfirming(false);
    stopRef.current = false;
    setRun({ total: queue.length, done: 0, current: null, spent: 0, stopped: false });
    let spent = 0, done = 0;
    for (const r of queue) {
      if (stopRef.current) break;
      setRun({ total: queue.length, done, current: r, spent, stopped: false });
      try { spent += await regenerateOne(r); } catch { /* recorded on the row; keep going */ }
      done += 1;
      setSelected((s) => { const n = new Set(s); n.delete(r.key); return n; });
      setRun({ total: queue.length, done, current: null, spent, stopped: false });
    }
    setRun({ total: queue.length, done, current: null, spent, stopped: stopRef.current && done < queue.length });
  };

  const retry = async (r: BankRow) => {
    try { const c = await regenerateOne(r); setRun((x) => (x ? { ...x, spent: x.spent + c } : x)); } catch { /* on the row */ }
  };

  const running = !!run && (run.current !== null || (run.done < run.total && !run.stopped));
  const defaults = bank?.defaults;

  return (
    <div style={{ minHeight: "100vh", background: BG, color: CREAM, fontFamily: "'Rubik', system-ui, sans-serif", padding: "16px clamp(12px, 4vw, 26px) 120px" }}>
      <header className="flex items-center gap-3" style={{ marginBottom: 6, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 21, letterSpacing: "0.06em", textTransform: "uppercase", margin: 0 }}>🖼 Illustration bank</h1>
        <a href="/v3" style={{ color: MUTED, fontSize: 13, textDecoration: "underline" }}>← /v3</a>
        <a href="/leeportal" style={{ color: MUTED, fontSize: 13, textDecoration: "underline" }}>portal</a>
        <a href="/admin/illustrations/styles" style={{ color: GOLD, fontSize: 13, textDecoration: "underline" }} title="Edit the styles, bump a version, test a draft on the phone stage">style editor →</a>
      </header>
      <p style={{ fontSize: 12.5, color: MUTED, margin: "0 0 12px", maxWidth: 820 }}>
        Every generated picture on every live set's plan, judged by the style registry as it stands right now
        {defaults ? <> — exam content: <b style={{ color: CREAM }}>{defaults.exam.label} v{defaults.exam.version}</b>; strategy shorts: <b style={{ color: CREAM }}>{defaults.strategy.label.replace(/\s*\(.*\)$/, "")} v{defaults.strategy.version}</b></> : null}.
        Regenerate keeps each picture's own subject and teaching intent; only the render changes.
      </p>
      {err && <div style={{ color: RED, fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {!bank && !err && <div style={{ color: MUTED, fontSize: 13 }}>Reading every plan…</div>}
      {bank?.libraryMissing && <div style={{ color: ORANGE, fontSize: 12.5, marginBottom: 12 }}>The illustration library table is missing — {MISSING_LIBRARY_HINT}. Costs below are the stated guess.</div>}
      <Lightbox row={view} reg={reg} onClose={closeView} />

      {bank && (
        <>
          {/* FILTERS */}
          <div className="flex items-center gap-2" style={{ flexWrap: "wrap", marginBottom: 10 }}>
            {([...BANK_STATUSES, "all"] as Filter[]).map((f) => {
              const n = f === "all" ? bank.totals.all : bank.totals[f];
              const c = f === "all" ? CREAM : STATUS_COLOR[f];
              return <button key={f} onClick={() => setFilter(f)} style={{ ...chip(c, filter === f), opacity: n === 0 && filter !== f ? 0.45 : 1 }}>{f === "all" ? "All" : STATUS_LABEL[f]} · {n}</button>;
            })}
            <span style={{ width: 1, height: 18, background: EDGE, margin: "0 4px" }} />
            <button onClick={() => setTopic(null)} style={chip(CREAM, topic === null)}>every topic</button>
            {topics.map(([id, name]) => <button key={id} onClick={() => setTopic(id)} style={chip(CREAM, topic === id)}>{name}</button>)}
            <span style={{ flex: 1 }} />
            <button disabled={!needing.length || running} onClick={selectAllNeedingWork} style={{ ...btn("ghost"), borderColor: needing.length ? `${ORANGE}88` : EDGE, color: needing.length ? ORANGE : MUTED, opacity: !needing.length || running ? 0.5 : 1 }}
              title="Select every stale and off-style picture in the whole bank and go to the confirm — count and cost first, nothing spent yet">
              Regenerate all stale · {needing.length}
            </button>
          </div>

          {/* THE RUN BAR */}
          <section style={{ background: PANEL, border: `1px solid ${selected.size ? `${GOLD}66` : EDGE}`, borderRadius: 14, padding: 12, marginBottom: 14, position: "sticky", top: 8, zIndex: 2 }}>
            <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
              <label className="flex items-center gap-2" style={{ fontSize: 12.5, cursor: "pointer" }}>
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} disabled={running || !visible.length} />
                select all visible ({visible.length})
              </label>
              <label className="flex items-center gap-2" style={{ fontSize: 12.5, cursor: "pointer" }} title="Reuse each picture's own seed so the composition rhymes with the one it replaces — same layout, new medium. Off = a fresh roll.">
                <input type="checkbox" checked={keepSeed} onChange={(e) => setKeepSeed(e.target.checked)} disabled={running} />
                keep seed <span style={{ color: MUTED }}>— same composition, new medium</span>
              </label>
              <span style={{ flex: 1 }} />
              {!confirming && (
                <button disabled={!selected.size || running} onClick={() => setConfirming(true)} style={{ ...btn("gold"), opacity: !selected.size || running ? 0.5 : 1 }}>
                  Regenerate {selected.size} selected in {targetLabel}
                </button>
              )}
              {running && <button onClick={() => { stopRef.current = true; setRun((x) => (x ? { ...x, stopped: true } : x)); }} style={btn("ghost")}>Stop after this one</button>}
            </div>

            {confirming && !running && (
              <div className="flex items-center gap-3" style={{ flexWrap: "wrap", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${EDGE}`, fontSize: 13 }}>
                <span>
                  {selected.size} picture{selected.size === 1 ? "" : "s"}, one at a time, about <b style={{ color: GOLD }}>{usd(estimate.total)}</b>
                  <span style={{ color: MUTED }}> ({estimate.basis}).</span>
                  {estimate.guess && <span style={{ color: ORANGE }}> That number is a guess.</span>}
                </span>
                <button onClick={() => void runSelected()} style={btn("gold")}>Confirm — spend it</button>
                <button onClick={() => setConfirming(false)} style={btn("ghost")}>Cancel</button>
              </div>
            )}

            {run && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${EDGE}`, fontSize: 13 }}>
                {run.current
                  ? <span><b style={{ color: GOLD }}>{run.done + 1} of {run.total}</b> · {run.current.setName} / {frameKindLabel(run.current.frameKind)} · {usd(run.spent)} so far{run.stopped ? " · stopping after this one" : ""}</span>
                  : run.stopped
                    ? <span><b style={{ color: ORANGE }}>Stopped</b> after {run.done} of {run.total} · {usd(run.spent)} spent</span>
                    : <span><b style={{ color: MINT }}>Done</b> · {run.done} of {run.total} · {usd(run.spent)} spent</span>}
              </div>
            )}
          </section>

          {!visible.length && <div style={{ color: MUTED, fontSize: 13 }}>Nothing here for that filter.</div>}

          {/* THE TABLE: topic → set → one row per picture */}
          {groups.map((g) => (
            <section key={g.topicId} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: GOLD, margin: "0 0 6px" }}>{g.topicName}</div>
              {g.sets.map((s) => (
                <div key={s.setId} style={{ background: PANEL, border: `1px solid ${EDGE}`, borderRadius: 14, padding: "8px 10px", marginBottom: 8 }}>
                  <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 15, margin: "2px 0 6px" }}>{s.setName} <span style={{ color: MUTED, fontSize: 12, fontFamily: "'Rubik', system-ui, sans-serif", fontWeight: 500 }}>· {s.rows.length}</span></div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                      <tbody>
                        {s.rows.map((r) => {
                          const oc = outcomes[r.key];
                          const isOpen = open === r.key && oc?.state === "ok";
                          return (
                            <Row key={r.key} r={r} reg={reg} oc={oc} checked={selected.has(r.key)} disabled={running} isOpen={isOpen}
                              onToggle={() => toggle(r.key)} onOpen={() => setOpen(isOpen ? null : r.key)} onRetry={() => void retry(r)} onView={() => setView(r)} />
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function Row({ r, reg, oc, checked, disabled, isOpen, onToggle, onOpen, onRetry, onView }: {
  r: BankRow; reg: IllustrationRegistry; oc: Outcome | undefined; checked: boolean; disabled: boolean; isOpen: boolean;
  onToggle: () => void; onOpen: () => void; onRetry: () => void; onView: () => void;
}) {
  const style = illustrationStyle(r.stylePreset, reg);
  const styleName = r.stylePreset && r.stylePreset === style.id ? style.label.replace(/\s*\(.*\)$/, "") : (r.stylePreset ?? "no preset");
  const cellStyle: CSSProperties = { padding: "6px 8px", borderTop: `1px solid ${EDGE}`, verticalAlign: "middle" };
  return (
    <>
      <tr style={{ opacity: oc?.state === "running" ? 0.7 : 1 }}>
        <td style={{ ...cellStyle, width: 28 }}><input type="checkbox" checked={checked} onChange={onToggle} disabled={disabled} /></td>
        <td style={{ ...cellStyle, width: 64 }}><Thumb url={r.assetUrl} title={r.prompt} onClick={onView} /></td>
        <td style={cellStyle}>
          <div style={{ fontWeight: 700 }}>{r.title || <span style={{ color: MUTED }}>(untitled)</span>}</div>
          <div style={{ color: MUTED, fontSize: 11.5 }}>
            {frameKindLabel(r.frameKind)}{r.teachingIntent ? ` · ${r.teachingIntent}` : ""}
            {" · "}<a href={r.reviewPath} style={{ color: GOLD, textDecoration: "none" }} title="Open this slide on the Review deck">slide in Review →</a>
          </div>
        </td>
        <td style={{ ...cellStyle, whiteSpace: "nowrap" }}><span style={chip(MUTED)}>{styleName} v{r.styleVersion ?? "?"}</span></td>
        <td style={{ ...cellStyle, whiteSpace: "nowrap" }}><span style={chip(STATUS_COLOR[r.status])}>{STATUS_LABEL[r.status]}</span></td>
        <td style={{ ...cellStyle, color: MUTED, whiteSpace: "nowrap" }}>{dateShort(r.generatedAt)}</td>
        <td style={{ ...cellStyle, whiteSpace: "nowrap", textAlign: "right" }}>
          {oc?.state === "running" && <span style={{ color: GOLD }}>drawing…</span>}
          {oc?.state === "ok" && (
            <button onClick={onOpen} style={btn("quiet")} title="before / after">
              <span style={{ color: MINT }}>✓</span> {oc.costUsd === null ? "" : usd(oc.costUsd)} · {isOpen ? "hide" : "before / after"}
            </button>
          )}
          {oc?.state === "err" && (
            <span className="flex items-center gap-2" style={{ justifyContent: "flex-end" }}>
              <span style={{ color: RED, maxWidth: 360, whiteSpace: "normal", textAlign: "left" }} title={oc.error}>✗ {oc.error}</span>
              <button onClick={onRetry} disabled={disabled} style={btn("ghost")}>Retry</button>
            </span>
          )}
        </td>
      </tr>
      {isOpen && oc?.state === "ok" && (
        <tr>
          <td colSpan={7} style={{ padding: "6px 8px 12px 44px" }}>
            <div className="flex items-center gap-4" style={{ flexWrap: "wrap" }}>
              <div><div style={{ fontSize: 10.5, color: MUTED, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>before</div><Thumb url={oc.before} size={160} /></div>
              <span style={{ color: MUTED, fontSize: 18 }}>→</span>
              <div><div style={{ fontSize: 10.5, color: GOLD, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>after · {illustrationStyle(oc.after.stylePreset, reg).label.replace(/\s*\(.*\)$/, "")} v{oc.after.styleVersion}</div><Thumb url={oc.after.assetUrl} size={160} /></div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

