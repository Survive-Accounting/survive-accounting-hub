// SUGGESTED CARDS — a finished CEQ job, reviewed. Mounted above the deck on the Editor.
//
// Lee, 2026-09-10: "it takes my brainstorms and gives me at least the starting points (not always
// the finished products, unless we're confident it can get it right)." So every candidate shows
// its confidence and its why, the correct choice is lit, and he ticks what to keep. Kept ones land
// as DRAFT cards — the Editor's own draft chip from there; nothing reaches a student.
import { useEffect, useMemo, useState } from "react";

import { V3_CREAM, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { kickQueue, useCeqJobs } from "@/components/v3/ceq-queue-client";
import { applyCeqJob, enqueueCeqJob, type CeqJobRow } from "@/lib/ceq-queue.functions";
import type { CandidateCard } from "@/lib/ceq-queue-brief";

const MINT = "#3BF5A0";
const KIND_LABEL: Record<CandidateCard["kind"], string> = { question: "QUESTION", tricky: "TRICKY", example: "EXAMPLE" };
const KIND_COLOR: Record<CandidateCard["kind"], string> = { question: V3_MUTED, tricky: "#FF8B7E", example: "#7DD3FC" };

const small: React.CSSProperties = { font: "inherit", fontSize: 11.5, fontWeight: 700, padding: "5px 11px", borderRadius: 8, border: `1px solid ${V3_EDGE}`, background: "transparent", color: V3_CREAM, cursor: "pointer", whiteSpace: "nowrap" };

export function SuggestedCards({ deckId, deckName, onApplied }: { deckId: string; deckName: string; onApplied?: () => void }) {
  const { jobs, error, reload } = useCeqJobs(deckId);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // The newest job with something to show; older done ones stay reachable by their count.
  const current = useMemo(() => jobs.find((j) => j.status === "done" && j.result && j.result.cards.length > j.decided) ?? jobs[0] ?? null, [jobs]);
  const [keep, setKeep] = useState<Set<number>>(() => new Set());
  useEffect(() => { setKeep(new Set()); }, [current?.id]);

  const queue = async () => {
    setBusy("queuing"); setErr(null);
    try { await enqueueCeqJob({ data: { deckId } }); kickQueue(); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };
  const apply = async () => {
    if (!current) return;
    setBusy("adding"); setErr(null);
    try {
      const r = await applyCeqJob({ data: { jobId: current.id, keep: [...keep].map((candidate) => ({ candidate })) } });
      setKeep(new Set()); reload(); onApplied?.();
      setErr(r.added ? null : "Nothing kept — the rest were recorded as dropped.");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  const pending = jobs.filter((j) => j.status === "queued" || j.status === "running");
  const cards = current?.status === "done" && current.result ? current.result.cards : [];
  const undecided = current ? cards.length > current.decided : false;

  return (
    <section style={{ border: `1px solid ${V3_EDGE}`, borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: V3_GOLD }}>Suggested cards</span>
        <span style={{ fontSize: 12, color: V3_MUTED }}>
          {pending.length ? `${pending.length} generating…` : current?.status === "failed" ? "the last run failed" : cards.length ? `${cards.length} candidates from what you said` : "from your brainstorm, in the background"}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" disabled={!!busy} onClick={() => void queue()} style={{ ...small, borderColor: `${V3_GOLD}88`, color: V3_GOLD, opacity: busy ? 0.5 : 1 }} title="Turn what you said in the Booth into candidate cards — runs in the background">
          {busy === "queuing" ? "Queuing…" : "Generate cards"}
        </button>
      </div>
      {(err || error) && <div style={{ fontSize: 12, color: "#FF8B7E", marginTop: 8 }}>{err ?? error}</div>}
      {current?.status === "failed" && current.error && <div style={{ fontSize: 12, color: "#FF8B7E", marginTop: 8 }}>{current.error}</div>}

      {undecided && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10, marginTop: 12 }}>
            {cards.map((c, i) => {
              const on = keep.has(i);
              return (
                <label key={i} style={{ display: "block", border: `1px solid ${on ? MINT : V3_EDGE}`, background: on ? "rgba(59,245,160,0.06)" : "transparent", borderRadius: 10, padding: "10px 12px", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" checked={on} onChange={(e) => setKeep((s) => { const n = new Set(s); if (e.target.checked) n.add(i); else n.delete(i); return n; })} />
                    <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.12em", color: KIND_COLOR[c.kind] }}>{KIND_LABEL[c.kind]}</span>
                    <span style={{ flex: 1 }} />
                    <span title="How sure the model is this survives your review" style={{ fontSize: 10.5, color: c.confidence >= 0.75 ? MINT : c.confidence >= 0.5 ? V3_GOLD : "#FF9F43", fontVariantNumeric: "tabular-nums" }}>{Math.round(c.confidence * 100)}%</span>
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: V3_CREAM, marginTop: 6, lineHeight: 1.4 }}>{c.stem}</div>
                  <ol style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12, color: V3_MUTED, lineHeight: 1.55 }}>
                    {c.choices.map((ch, k) => <li key={k} style={{ color: ch.correct ? MINT : V3_MUTED, fontWeight: ch.correct ? 700 : 400 }}>{ch.text}{ch.correct && ch.feedback ? <span style={{ color: V3_MUTED, fontWeight: 400 }}> — {ch.feedback}</span> : null}</li>)}
                  </ol>
                  {c.why && <div style={{ fontSize: 11, color: V3_MUTED, marginTop: 6, fontStyle: "italic" }}>{c.why}</div>}
                </label>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
            <button type="button" disabled={!!busy || keep.size === 0} onClick={() => void apply()} style={{ ...small, border: `1.5px solid ${MINT}`, background: "rgba(59,245,160,0.12)", opacity: busy || keep.size === 0 ? 0.5 : 1 }}>
              {busy === "adding" ? "Adding…" : `Add ${keep.size} as draft${keep.size === 1 ? "" : "s"} to ${deckName}`}
            </button>
            <button type="button" disabled={!!busy} onClick={() => { setKeep(new Set()); void apply(); }} style={{ ...small, color: V3_MUTED }} title="Record all of these as dropped — the next run learns from it">drop them all</button>
            <span style={{ fontSize: 11.5, color: V3_MUTED }}>
              {current?.result?.dropped ? `${current.result.dropped} the parser refused · ` : ""}{current?.model ? `${current.model.split("/").pop()} · ` : ""}{current?.costUsd != null ? `~$${current.costUsd.toFixed(3)}` : ""}
            </span>
          </div>
        </>
      )}
      {!undecided && jobs.length > 0 && !pending.length && current?.status === "done" && (
        <div style={{ fontSize: 12, color: V3_MUTED, marginTop: 8 }}>Every candidate from the last run has been decided. Generate again after you've talked more.</div>
      )}
    </section>
  );
}

export type { CeqJobRow };
