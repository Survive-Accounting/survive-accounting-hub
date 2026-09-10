// THE SPLIT WIZARD — cards on the left, splits on the right, drag them where they go, confirm.
//
// Lee, 2026-09-10: "it's getting messy now that we have the splits… better that we go through a
// bit of a wizard before we begin doing anything with these CEQ sets, where the first thing we do
// is split it appropriately… all the CEQs on the left and splits on the right. I create the
// splits I want, select one or many and drag them into the split I want. Then confirm and it does
// it." The logic is split-wizard.ts (pure, tested); this is the surface. Opened over the map.
//
// One save, on Confirm: the whole running order, rebuilt — every split keeps its own opener and
// sign-off, a new split gets the standard opener, and the head frame carries the split's name.
// Until Confirm nothing is written, so Close is a free undo.
import { useEffect, useMemo, useState, type DragEvent } from "react";

import { loadBlastPlan, saveBlastPlan } from "@/lib/blastoff.functions";
import type { BoothSetInfo } from "@/lib/talkthrough.functions";
import { CRAM_NOT_LECTURE } from "@/components/brand-cards/slogans";
import { V3_CREAM, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";

import { reconcilePlan, type BlastPlan } from "./plan";
import { moveBucket, moveUnits, newBucket, readBuckets, removeBucket, renameBucket, splitProblem, writeBuckets, type CardUnit, type SplitBucket } from "./split-wizard";

const MINT = "#3BF5A0";
const DRAG_MIME = "application/x-sa-cards";

const btn: React.CSSProperties = { font: "inherit", fontSize: 11.5, fontWeight: 700, padding: "5px 10px", borderRadius: 8, border: `1px solid ${V3_EDGE}`, background: "transparent", color: V3_CREAM, cursor: "pointer", whiteSpace: "nowrap" };
const field: React.CSSProperties = { font: "inherit", fontSize: 13, fontWeight: 700, padding: "6px 9px", borderRadius: 8, border: `1px solid ${V3_EDGE}`, background: "rgba(244,239,230,0.05)", color: V3_CREAM, outline: "none", width: "100%", boxSizing: "border-box" };

function fit(s: string, n = 110): string { const t = s.replace(/\s+/g, " ").trim(); return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`; }

export function SplitWizard({ set, onClose, onSaved }: { set: BoothSetInfo; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const [buckets, setBuckets] = useState<SplitBucket[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [over, setOver] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const stems = useMemo(() => new Map(set.ceqs.map((c) => [c.id, c.stem || c.label || c.id])), [set.ceqs]);

  useEffect(() => {
    let live = true;
    loadBlastPlan({ data: { setId: set.id } })
      .then((stored) => { if (live) setBuckets(readBuckets(reconcilePlan(stored as BlastPlan | null, set.ceqs).frames)); })
      .catch((e) => { if (live) setLoadErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [set.id, set.ceqs]);

  const all = useMemo(() => (buckets ?? []).flatMap((b) => b.units.map((u) => ({ u, bucket: b }))), [buckets]);
  const problem = buckets ? splitProblem(buckets) : "Loading…";

  const togglePick = (id: string, e: React.MouseEvent) => {
    setPicked((s) => {
      const n = new Set(e.ctrlKey || e.metaKey || e.shiftKey ? s : []);
      if (n.has(id) && s.size === 1) n.delete(id); else n.add(id);
      return n;
    });
  };
  const dragStart = (e: DragEvent, id: string) => {
    const ids = picked.has(id) ? [...picked] : [id];
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(ids));
    e.dataTransfer.effectAllowed = "move";
  };
  const idsOf = (e: DragEvent): string[] => { try { const v = JSON.parse(e.dataTransfer.getData(DRAG_MIME)) as unknown; return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; } catch { return []; } };
  const dropOn = (e: DragEvent, key: string, index: number) => {
    e.preventDefault(); e.stopPropagation(); setOver(null);
    const ids = idsOf(e); if (!ids.length || !buckets) return;
    setBuckets(moveUnits(buckets, ids, key, index));
    setPicked(new Set());
  };
  const allow = (e: DragEvent, key: string) => { if (e.dataTransfer.types.includes(DRAG_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(key); } };

  const confirm = async () => {
    if (!buckets || problem) return;
    setBusy(true); setErr(null);
    try {
      await saveBlastPlan({ data: { setId: set.id, frames: writeBuckets(buckets, CRAM_NOT_LECTURE) as never } });
      await onSaved();
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={`Arrange the splits of ${set.name}`} onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 2147482700, background: "rgba(5,8,16,0.7)", display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(1040px, 100%)", maxHeight: "90vh", display: "flex", flexDirection: "column", background: "#0B0F1E", border: `1px solid ${V3_GOLD}66`, borderRadius: 16, boxShadow: "0 30px 80px rgba(0,0,0,0.6)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${V3_EDGE}` }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: V3_GOLD }}>Splits</span>
          <span style={{ fontWeight: 900, fontSize: 16, color: V3_CREAM }}>{set.name}</span>
          <span style={{ fontSize: 12, color: V3_MUTED }}>Click a card to pick it (Ctrl for several), drag it into a split. Nothing is written until you confirm.</span>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={{ ...btn, color: V3_MUTED }}>close</button>
        </div>

        {loadErr && <div style={{ padding: 18, color: "#FF8B7E", fontSize: 13 }}>Could not load the plan: {loadErr}</div>}
        {!buckets && !loadErr && <div style={{ padding: 18, color: V3_MUTED, fontSize: 13 }}>Loading the running order…</div>}

        {buckets && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 0, minHeight: 0, flex: 1 }}>
            {/* THE CARDS — every question in the set, in running order, each tagged with its split. */}
            <div style={{ overflowY: "auto", padding: "12px 14px", borderRight: `1px solid ${V3_EDGE}` }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: V3_MUTED, marginBottom: 8 }}>{all.length} cards</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {all.map(({ u, bucket }, i) => <CardRow key={u.id} u={u} n={i + 1} stem={stems.get(u.ceqId) ?? u.ceqId} tag={bucket.name || `Split ${buckets.indexOf(bucket) + 1}`} on={picked.has(u.id)} onPick={(e) => togglePick(u.id, e)} onDragStart={(e) => dragStart(e, u.id)} />)}
              </div>
            </div>

            {/* THE SPLITS — named buckets; drop cards on one, or between its cards. */}
            <div style={{ overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
              {buckets.map((b, bi) => (
                <div key={b.key} onDragOver={(e) => allow(e, b.key)} onDragLeave={() => setOver((o) => (o === b.key ? null : o))} onDrop={(e) => dropOn(e, b.key, b.units.length)}
                  style={{ border: `1.5px solid ${over === b.key ? MINT : V3_EDGE}`, background: over === b.key ? "rgba(59,245,160,0.06)" : "rgba(244,239,230,0.02)", borderRadius: 12, padding: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 900, color: V3_GOLD, border: `1px solid ${V3_GOLD}88`, borderRadius: 999, padding: "1px 7px" }}>#{bi + 1}</span>
                    <input value={b.name} placeholder={`Split ${bi + 1} — name it`} onChange={(e) => setBuckets(renameBucket(buckets, b.key, e.target.value))} style={field} />
                    <button type="button" title="Earlier" disabled={bi === 0} onClick={() => setBuckets(moveBucket(buckets, b.key, -1))} style={{ ...btn, padding: "4px 7px", opacity: bi === 0 ? 0.4 : 1 }}>▲</button>
                    <button type="button" title="Later" disabled={bi === buckets.length - 1} onClick={() => setBuckets(moveBucket(buckets, b.key, 1))} style={{ ...btn, padding: "4px 7px", opacity: bi === buckets.length - 1 ? 0.4 : 1 }}>▼</button>
                    {b.units.length === 0 && <button type="button" onClick={() => setBuckets(removeBucket(buckets, b.key))} style={{ ...btn, padding: "4px 7px", color: V3_MUTED }} title="Remove this empty split">✕</button>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8, minHeight: 28 }}>
                    {b.units.length === 0 && <div style={{ fontSize: 11.5, color: V3_MUTED, padding: "6px 4px" }}>Drop cards here.</div>}
                    {b.units.map((u, ui) => (
                      <div key={u.id} draggable onDragStart={(e) => dragStart(e, u.id)} onDragOver={(e) => allow(e, b.key)} onDrop={(e) => dropOn(e, b.key, ui)} onClick={(e) => togglePick(u.id, e)}
                        style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 12, padding: "4px 8px", borderRadius: 7, cursor: "grab", background: picked.has(u.id) ? "rgba(59,245,160,0.12)" : "transparent", border: `1px solid ${picked.has(u.id) ? MINT : "transparent"}`, color: u.skipped ? V3_MUTED : V3_CREAM, textDecoration: u.skipped ? "line-through" : "none" }}>
                        <span style={{ color: V3_MUTED, fontVariantNumeric: "tabular-nums", minWidth: 18 }}>{ui + 1}.</span>
                        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fit(stems.get(u.ceqId) ?? u.ceqId, 80)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => setBuckets([...buckets, newBucket("")])} style={{ ...btn, borderColor: `${V3_GOLD}88`, color: V3_GOLD, alignSelf: "flex-start" }}>+ split</button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderTop: `1px solid ${V3_EDGE}` }}>
          <span style={{ fontSize: 12, color: err ? "#FF8B7E" : problem ? "#FF9F43" : V3_MUTED }}>{err ?? problem ?? `${buckets?.length ?? 0} splits · every card placed`}</span>
          <span style={{ flex: 1 }} />
          {picked.size > 0 && <span style={{ fontSize: 11.5, color: MINT }}>{picked.size} picked — drag them into a split</span>}
          <button type="button" onClick={onClose} style={btn}>cancel</button>
          <button type="button" onClick={() => void confirm()} disabled={!!problem || busy} style={{ ...btn, border: `1.5px solid ${MINT}`, background: "rgba(59,245,160,0.12)", opacity: problem || busy ? 0.5 : 1 }}>{busy ? "Writing…" : "Confirm the splits"}</button>
        </div>
      </div>
    </div>
  );
}

function CardRow({ u, n, stem, tag, on, onPick, onDragStart }: { u: CardUnit; n: number; stem: string; tag: string; on: boolean; onPick: (e: React.MouseEvent) => void; onDragStart: (e: DragEvent) => void }) {
  return (
    <div draggable onDragStart={onDragStart} onClick={onPick}
      style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "6px 9px", borderRadius: 8, cursor: "grab", border: `1px solid ${on ? MINT : V3_EDGE}`, background: on ? "rgba(59,245,160,0.10)" : "transparent", color: u.skipped ? V3_MUTED : V3_CREAM }}>
      <span style={{ color: V3_MUTED, fontSize: 11, fontVariantNumeric: "tabular-nums", minWidth: 20 }}>{n}.</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.35, textDecoration: u.skipped ? "line-through" : "none" }}>{fit(stem)}</span>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", color: V3_GOLD, whiteSpace: "nowrap" }}>{tag}</span>
    </div>
  );
}
