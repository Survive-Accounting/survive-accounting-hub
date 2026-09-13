// STEP 4 · SPLIT (v4). A split is a cut between two slides of the chain — nothing else. Every change goes
// through the server (v4ApplySplits), which rebuilds the intro / outro tied to each cut, so un-cutting is
// one click and leaves no slides behind. The post rows follow their splits (publish-rekey), as in v3.
//
// Lee, 2026-09-13: "AI can suggest where to cut, or I cut myself. Un-splitting must be one click and fully
// reversible, with no leftover slides. For every split, automatically add the outro as the last slide,
// just before the cut. The intro defaults to the bio slide at the start of each split. I can swap in a
// different intro myself."
import { useEffect, useMemo, useState } from "react";

import { getAdminWho } from "@/components/AdminGate";
import { FRAME_LABEL, insertStem, type BlastFrame } from "@/components/blastoff/plan";
import { FRAME_BUDGET, contentCount, frameCountLabel, frameFlag } from "@/components/blastoff/reel";
import { V3_CREAM, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { rekeyAfterPlanChange } from "@/components/v3/publish-rekey";
import { loadBlastPlan } from "@/lib/blastoff.functions";
import { loadV4Splits, v4ApplySplits, v4EnsureProposal, v4MarkFinal } from "@/lib/v4.functions";

import { V4_AMBER, V4_MINT, V4_RED, v4Button, v4Field } from "./V4Chrome";
import type { V4TopicData } from "./V4TopicPage";
import { INTRO_LABEL, contentOf, suggestCuts, type IntroChoice, type V4Splits } from "./v4-chain";
import type { V4Card } from "./v4-topic";

export function V4Split({ data, onData }: { data: V4TopicData; onData: (d: V4TopicData) => void }) {
  const state = data.state!;
  const cards = data.cards as V4Card[];
  const [frames, setFrames] = useState<BlastFrame[] | null>(null);
  const [splits, setSplits] = useState<V4Splits | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<string[] | null>(null);

  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const cardGroup = (id: string) => cardById.get(id)?.group ?? null;
  const groupName = (id: string | null) => state.groups.find((g) => g.id === id)?.name ?? null;

  useEffect(() => {
    let alive = true;
    Promise.all([loadBlastPlan({ data: { setId: data.setId } }), loadV4Splits({ data: { setId: data.setId } })])
      .then(([p, s]) => {
        if (!alive) return;
        setFrames((p?.frames ?? []) as BlastFrame[]);
        setSplits(s);
        void v4EnsureProposal({ data: { setId: data.setId, step: "split", source: "manual", snapshot: s } }).then((r) => { if (!r.ok) setWarn(r.error ?? null); });
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    return () => { alive = false; };
  }, [data.setId]);

  const apply = async (next: V4Splits, action: string) => {
    setBusy(true); setErr(null);
    try {
      const r = await v4ApplySplits({ data: { setId: data.setId, splits: next, action, who: getAdminWho() } });
      setFrames(r.frames as BlastFrame[]);
      setSplits(r.splits);
      setWarn(r.logWarning);
      void rekeyAfterPlanChange(data.setId, r.before as BlastFrame[], r.frames as BlastFrame[]).catch((e) => setWarn(`post rows not re-keyed: ${e instanceof Error ? e.message : String(e)}`));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  if (err && !frames) return <div style={{ color: V4_RED, fontSize: 13 }}>{err}</div>;
  if (!frames || !splits) return <div style={{ color: V3_MUTED, fontSize: 13 }}>Loading the chain…</div>;

  const content = contentOf(frames);
  const cutAt = new Map(splits.cuts.map((c) => [c.after, c]));
  // The runs, for the counts: content between cuts.
  const runs: BlastFrame[][] = [[]];
  content.forEach((f) => { runs[runs.length - 1].push(f); if (cutAt.has(f.id)) runs.push([]); });
  const runOf = new Map<string, number>();
  runs.forEach((r, i) => r.forEach((f) => runOf.set(f.id, i)));

  const toggleCut = (id: string) => {
    const has = cutAt.has(id);
    void apply({ ...splits, cuts: has ? splits.cuts.filter((c) => c.after !== id) : [...splits.cuts, { after: id, intro: "bio" }] }, has ? "uncut" : "cut");
  };
  const setCut = (id: string, patch: { intro?: IntroChoice; name?: string }) => void apply({ ...splits, cuts: splits.cuts.map((c) => (c.after === id ? { ...c, ...patch } : c)) }, patch.intro ? "intro" : "name");

  const finalize = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await v4MarkFinal({ data: { setId: data.setId, step: "split", snapshot: splits } });
      onData({ ...data, state: r.state });
      setWarn(r.logWarning);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const RunHeader = ({ index, intro, name, onIntro, onName }: { index: number; intro: IntroChoice; name?: string; onIntro: (i: IntroChoice) => void; onName: (n: string) => void }) => {
    const count = contentCount(runs[index] ?? []);
    const flag = frameFlag(count);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 10px", background: "rgba(252,163,17,0.07)", borderTop: `2px solid ${V3_GOLD}`, borderBottom: `1px solid ${V3_EDGE}` }}>
        <span style={{ fontSize: 13, fontWeight: 900, color: V3_GOLD }}>Split {index + 1}</span>
        <input defaultValue={name ?? ""} key={`${index}:${name ?? ""}`} placeholder="Name this video" onBlur={(e) => { if ((e.target.value.trim() || undefined) !== (name?.trim() || undefined)) onName(e.target.value.trim()); }} style={{ ...v4Field, width: 220, padding: "4px 8px" }} />
        <label style={{ fontSize: 12, color: V3_MUTED, display: "flex", gap: 6, alignItems: "center" }}>Intro
          <select value={intro} disabled={busy} onChange={(e) => onIntro(e.target.value as IntroChoice)} style={{ ...v4Field, width: 130, padding: "4px 8px", colorScheme: "dark" }}>
            {(Object.keys(INTRO_LABEL) as IntroChoice[]).map((k) => <option key={k} value={k}>{INTRO_LABEL[k]}</option>)}
          </select>
        </label>
        <span style={{ fontSize: 12, color: flag === "over" ? V4_RED : flag === "long" ? V4_AMBER : V3_MUTED }}>{frameCountLabel(count)}</span>
        <span style={{ fontSize: 11.5, color: V3_MUTED }}>· outro added at the end</span>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 14px", border: `1px solid ${V3_EDGE}`, borderRadius: 12 }}>
        <span style={{ fontSize: 13.5, color: V3_CREAM }}><b>{runs.length}</b> video{runs.length === 1 ? "" : "s"} · {content.length} slides</span>
        <button type="button" disabled={busy} style={v4Button()} onClick={() => setSuggested(suggestCuts(frames, cardGroup))}>Suggest cuts</button>
        {suggested && (
          <>
            <span style={{ fontSize: 12.5, color: V3_MUTED }}>{suggested.length} suggested (dashed below)</span>
            <button type="button" disabled={busy} style={v4Button("gold")} onClick={() => { void apply({ ...splits, cuts: suggested.map((after) => cutAt.get(after) ?? { after, intro: "bio" as const }) }, "use-suggested"); setSuggested(null); }}>Use these cuts</button>
            <button type="button" style={{ ...v4Button(), color: V3_MUTED }} onClick={() => setSuggested(null)}>✕</button>
          </>
        )}
        <span style={{ flex: 1 }} />
        {state.final.split && <span style={{ fontSize: 12.5, color: V4_MINT, fontWeight: 700 }}>✓ Final</span>}
        <button type="button" onClick={() => void finalize()} disabled={busy} style={{ ...v4Button("gold"), fontSize: 13.5, padding: "8px 16px" }}>{state.final.split ? "Mark final again" : "Split final"}</button>
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: V3_MUTED }}>Click ✂ between two slides to cut there; click it again to take the cut away — its intro and outro go with it. Loose ceiling {FRAME_BUDGET.ceiling} frames a video.</div>
      {err && <div style={{ marginTop: 8, fontSize: 13, color: V4_RED }}>{err}</div>}
      {warn && <div style={{ marginTop: 8, fontSize: 12.5, color: V4_AMBER }}>{warn}</div>}

      <div style={{ marginTop: 12, border: `1px solid ${V3_EDGE}`, borderRadius: 12, overflow: "hidden", opacity: busy ? 0.7 : 1 }}>
        <RunHeader index={0} intro={splits.startIntro} name={splits.startName} onIntro={(i) => void apply({ ...splits, startIntro: i }, "intro")} onName={(n) => void apply({ ...splits, startName: n || undefined }, "name")} />
        {content.map((f, i) => {
          const card = f.kind === "ceq" && f.ceqId ? cardById.get(f.ceqId) : undefined;
          const words = card ? card.stem : f.needs ? `⚠ ${f.needs}` : insertStem(f) || (f.bullets ?? [])[0] || "";
          const g = groupName(f.kind === "ceq" && f.ceqId ? cardGroup(f.ceqId) : f.v4Group ?? null);
          const cut = cutAt.get(f.id);
          const isLast = i === content.length - 1;
          const suggestedHere = suggested?.includes(f.id) && !cut;
          return (
            <div key={f.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", opacity: f.skipped ? 0.45 : 1 }}>
                <span style={{ fontSize: 11, color: V3_MUTED, minWidth: 26, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: f.kind === "ceq" ? V4_MINT : f.needs || card?.placeholder ? V4_AMBER : V3_MUTED, minWidth: 100 }}>{f.kind === "ceq" ? "Question" : FRAME_LABEL[f.kind]}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: V3_CREAM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card?.placeholder ? `PLACEHOLDER — ${card.placeholder.note}` : words || "(no words)"}{f.skipped ? " (skipped)" : ""}</span>
                {g && <span style={{ fontSize: 11, color: V3_MUTED, whiteSpace: "nowrap" }}>{g}</span>}
              </div>
              {!isLast && (
                cut ? (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 10px" }}>
                      <span style={{ fontSize: 11.5, color: V3_MUTED }}>↑ outro</span>
                      <span style={{ flex: 1, height: 0, borderTop: `2px dashed ${V3_GOLD}` }} />
                      <button type="button" disabled={busy} onClick={() => toggleCut(f.id)} title="Take this cut away — its intro and outro go with it" style={{ ...v4Button("gold"), padding: "2px 10px" }}>✂ un-cut</button>
                      <span style={{ flex: 1, height: 0, borderTop: `2px dashed ${V3_GOLD}` }} />
                    </div>
                    <RunHeader index={runOf.get(content[i + 1].id) ?? 0} intro={cut.intro} name={cut.name} onIntro={(intro) => setCut(f.id, { intro })} onName={(name) => setCut(f.id, { name })} />
                  </>
                ) : (
                  <div style={{ display: "flex", justifyContent: "center", height: 14, alignItems: "center" }}>
                    <button type="button" disabled={busy} onClick={() => toggleCut(f.id)} title="Cut the video here"
                      style={{ all: "unset", cursor: "pointer", fontSize: 11, lineHeight: 1, padding: "0 10px", borderRadius: 999, color: suggestedHere ? V3_GOLD : V3_MUTED, border: `1px ${suggestedHere ? "dashed" : "solid"} ${suggestedHere ? V3_GOLD : "transparent"}` }}>✂</button>
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
