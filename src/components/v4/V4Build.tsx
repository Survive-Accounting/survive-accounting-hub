// STEP 2 · BUILD (v4) — Slides, Chain and Split on one page. Lee, 2026-09-14: "I'd rather have slides and
// chain merged. I prefer the Chain view … So it's almost like slides > chain > split should all exist
// together. They definitely should."
//
// The Chain (the Editor, with ✂ cuts right in its gaps) is the default. Propose slides (talk → AI slides
// per group) and the Split list (names, intros, suggested cuts) are the other two views. Only one is
// mounted at a time: each writes the plan, and two writers on one plan would fight over it.
// "Build final" marks all three steps final, so the learning record keeps its three proposals.
import { useState } from "react";

import { V3_EDGE, V3_MUTED } from "@/components/v3/Shell";
import type { BoothSetInfo, BoothTopic } from "@/lib/talkthrough.functions";
import { loadBlastPlan } from "@/lib/blastoff.functions";
import { loadV4Splits, v4EnsureProposal, v4MarkFinal } from "@/lib/v4.functions";

import { V4Chain } from "./V4Chain";
import { V4_AMBER, V4_MINT, V4_RED, v4Button } from "./V4Chrome";
import { V4Slides } from "./V4Slides";
import { V4Split } from "./V4Split";
import type { V4TopicData } from "./V4TopicPage";

type View = "chain" | "propose" | "splits";
const VIEWS: { id: View; label: string; hint: string }[] = [
  { id: "chain", label: "Chain", hint: "The whole topic as slides — edit, reorder, ✂ cut videos" },
  { id: "propose", label: "Propose slides", hint: "Talk a group through; the AI drafts its teaching slides" },
  { id: "splits", label: "Split list", hint: "Every video as a list: names, intros, suggested cuts" },
];

export function V4Build({ data, onData, set, topic }: { data: V4TopicData; onData: (d: V4TopicData) => void; set: BoothSetInfo; topic: BoothTopic }) {
  const state = data.state!;
  const [view, setView] = useState<View>("chain");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const done = !!(state.final.slides && state.final.chain && state.final.split);

  const finalize = async () => {
    setBusy(true); setErr(null); setNote(null);
    // The mounted view saves on a debounce; switching to nothing first lets that save land.
    const was = view;
    setView("splits");
    try {
      await new Promise((r) => window.setTimeout(r, 900));
      const plan = await loadBlastPlan({ data: { setId: data.setId } });
      const frames = plan?.frames ?? [];
      const order = frames.map((f) => `${f.kind}:${f.id}`);
      const splits = await loadV4Splits({ data: { setId: data.setId } });
      let last = state;
      for (const step of ["slides", "chain", "split"] as const) {
        const snapshot = step === "split" ? splits : step === "chain" ? { order } : { frames };
        await v4EnsureProposal({ data: { setId: data.setId, step, source: "manual", snapshot } });
        const r = await v4MarkFinal({ data: { setId: data.setId, step, snapshot } });
        last = r.state;
      }
      onData({ ...data, state: last });
      setNote("Build final — on to Film.");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setView(was); setBusy(false); }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div role="tablist" aria-label="Build views" style={{ display: "flex", gap: 4, padding: 3, border: `1px solid ${V3_EDGE}`, borderRadius: 10 }}>
          {VIEWS.map((v) => (
            <button key={v.id} type="button" role="tab" aria-selected={view === v.id} title={v.hint} disabled={busy} onClick={() => setView(v.id)}
              style={{ ...v4Button(view === v.id ? "gold" : "ghost"), border: "1.5px solid transparent", ...(view === v.id ? { borderColor: "rgba(252,163,17,0.7)" } : {}) }}>{v.label}</button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: V3_MUTED }}>{VIEWS.find((v) => v.id === view)!.hint}</span>
        <span style={{ flex: 1 }} />
        {done && <span style={{ fontSize: 12.5, color: V4_MINT, fontWeight: 700 }}>✓ Final</span>}
        <button type="button" onClick={() => void finalize()} disabled={busy} style={{ ...v4Button("gold"), fontSize: 13.5, padding: "8px 16px", opacity: busy ? 0.6 : 1 }}
          title="Marks slides, chain and split final together">{done ? "Mark final again" : "Build final"}</button>
      </div>
      {note && <div style={{ marginBottom: 8, fontSize: 13, color: V4_MINT }}>{note}</div>}
      {err && <div style={{ marginBottom: 8, fontSize: 13, color: V4_RED }}>{err}</div>}
      {busy && <div style={{ marginBottom: 8, fontSize: 12.5, color: V4_AMBER }}>Saving and marking final…</div>}
      {view === "chain" && <V4Chain data={data} onData={onData} set={set} topic={topic} embedded />}
      {view === "propose" && <V4Slides data={data} onData={onData} set={set} topic={topic} />}
      {view === "splits" && !busy && <V4Split data={data} onData={onData} embedded />}
    </div>
  );
}
