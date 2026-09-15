// STEP 3 · CHAIN (v4). One ordered chain for the whole topic: "for each group, its teaching slides then
// its practice questions" (Lee, 2026-09-13) — arranged in one click, then reordered and polished in the
// Editor itself, mounted here in v4 mode (no cutting: that's the Split step's job).
//
// The arrangement is written on the server, so the Editor is taken down first (its pending save
// flushes), then the chain is arranged, then the Editor comes back reading the new order.
import { useState } from "react";

import { getAdminWho } from "@/components/AdminGate";
import { ReviewDeck } from "@/components/blastoff/ReviewDeck";
import { V3_CREAM, V3_EDGE, V3_MUTED } from "@/components/v3/Shell";
import type { BoothSetInfo, BoothTopic } from "@/lib/talkthrough.functions";
import type { BlastFrame } from "@/components/blastoff/plan";
import { rekeyAfterPlanChange } from "@/components/v3/publish-rekey";
import { loadBlastPlan } from "@/lib/blastoff.functions";
import { loadV4Splits, v4ApplySplits, v4ArrangeChain, v4EnsureProposal, v4MarkFinal } from "@/lib/v4.functions";

import { V4_AMBER, V4_MINT, V4_RED, v4Button } from "./V4Chrome";
import type { V4TopicData } from "./V4TopicPage";

const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

export function V4Chain({ data, onData, set, topic, embedded = false }: { data: V4TopicData; onData: (d: V4TopicData) => void; set: BoothSetInfo; topic: BoothTopic; embedded?: boolean }) {
  const state = data.state!;
  const [deckKey, setDeckKey] = useState(0);
  const [showDeck, setShowDeck] = useState(true);
  const [busy, setBusy] = useState(false);
  /** The gaps whose cut is being applied — the deck stays up while they are. */
  const [cutting, setCutting] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  const arrange = async () => {
    if (!window.confirm("Arrange the chain group by group — each group's teaching slides, then its questions? Your current order is recorded, and you can reorder after.")) return;
    setBusy(true); setErr(null); setNote(null);
    try {
      setShowDeck(false);
      await wait(900); // the Editor's debounced save lands before the server rewrites the order
      const r = await v4ArrangeChain({ data: { setId: data.setId, who: getAdminWho() } });
      setWarn(r.logWarning);
      setNote(`Arranged — ${r.slides} slides, group by group.`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setDeckKey((k) => k + 1); setShowDeck(true); setBusy(false); }
  };

  // A CUT, RIGHT IN THE CHAIN (2026-09-14): the ✂ in a gap toggles a cut after that slide. Same server path
  // as the Split list (v4ApplySplits rebuilds the bookends), so the Editor comes down around the write.
  // A bound outro's ✂ is the cut it closes (`v4out-<slide id>`). A new cut opens with no intro — Easy
  // Points videos run back to back; the Split list swaps in the bio or a title card.
  // A CUT IS ONE CLICK (2026-09-15). Lee: "when I cut between slides? it's a lot to refresh it right now and
  // then lose my place. Loses time." The Editor stays up: the new slides reach it on its own plan channel
  // (BlastOffEditor's `sa-plan:<setId>` adopt), so the spine keeps its place, its zoom and its scroll.
  const toggleCut = async (frameId: string) => {
    const id = frameId.startsWith("v4out-") ? frameId.slice("v4out-".length) : frameId;
    setErr(null); setNote(null);
    setCutting((c) => [...c, id]);
    try {
      await wait(550); // the Editor's 500 ms debounced save lands first, so the cut is applied over it
      const s = await loadV4Splits({ data: { setId: data.setId } });
      const has = s.cuts.some((c) => c.after === id);
      const next = { ...s, cuts: has ? s.cuts.filter((c) => c.after !== id) : [...s.cuts, { after: id, intro: "none" as const }] };
      const r = await v4ApplySplits({ data: { setId: data.setId, splits: next, action: has ? "uncut" : "cut", who: getAdminWho() } });
      setWarn(r.logWarning);
      // hand the new slides straight to the open Editor (and again in a moment, in case it was mid-save)
      const tell = () => { try { const ch = new BroadcastChannel(`sa-plan:${data.setId}`); ch.postMessage({ from: "v4-cut", frames: r.frames, updatedAt: r.updatedAt }); ch.close(); } catch { /* the deck reloads on its own next visit */ } };
      tell();
      window.setTimeout(tell, 900);
      void rekeyAfterPlanChange(data.setId, r.before as BlastFrame[], r.frames as BlastFrame[]).catch((e) => setWarn(`post rows not re-keyed: ${e instanceof Error ? e.message : String(e)}`));
      setNote(has ? "Cut removed — its outro went with it." : `Cut — ${r.splits.cuts.length + 1} videos now.`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setCutting((c) => c.filter((x) => x !== id)); }
  };

  const finalize = async () => {
    setBusy(true); setErr(null);
    try {
      setShowDeck(false);
      await wait(900);
      const plan = await loadBlastPlan({ data: { setId: data.setId } });
      const order = (plan?.frames ?? []).map((f) => `${f.kind}:${f.id}`);
      const ensured = await v4EnsureProposal({ data: { setId: data.setId, step: "chain", source: "manual", snapshot: { order } } });
      if (!ensured.ok) setWarn(ensured.error ?? null);
      const r = await v4MarkFinal({ data: { setId: data.setId, step: "chain", snapshot: { order } } });
      onData({ ...data, state: r.state });
      if (r.logWarning) setWarn(r.logWarning);
      setNote("Chain final — on to Split.");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setDeckKey((k) => k + 1); setShowDeck(true); setBusy(false); }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 14px", border: `1px solid ${V3_EDGE}`, borderRadius: 12, maxWidth: 1000 }}>
        <button type="button" onClick={() => void arrange()} disabled={busy} style={{ ...v4Button("gold"), opacity: busy ? 0.6 : 1 }}>Arrange the chain</button>
        <span style={{ fontSize: 12.5, color: V3_MUTED }}>Group by group: teaching slides, then questions. Drag to reorder; ✂ in a gap cuts a new video there.</span>
        <span style={{ flex: 1 }} />
        {!embedded && state.final.chain && <span style={{ fontSize: 12.5, color: V4_MINT, fontWeight: 700 }}>✓ Final</span>}
        {!embedded && <button type="button" onClick={() => void finalize()} disabled={busy} style={{ ...v4Button("gold"), fontSize: 13.5, padding: "8px 16px" }}>{state.final.chain ? "Mark final again" : "Chain final"}</button>}
      </div>
      {note && <div style={{ marginTop: 8, fontSize: 13, color: V4_MINT }}>{note}</div>}
      {err && <div style={{ marginTop: 8, fontSize: 13, color: V4_RED }}>{err}</div>}
      {warn && <div style={{ marginTop: 8, fontSize: 12.5, color: V4_AMBER }}>Not recorded for learning — {warn}</div>}
      <div style={{ marginTop: 14 }}>
        {showDeck ? <ReviewDeck key={deckKey} set={set} topic={topic} v4 onV4Cut={(id) => void toggleCut(id)} /> : <div style={{ fontSize: 13, color: V3_CREAM }}>Working…</div>}
        {cutting.length > 0 && <div role="status" style={{ position: "fixed", right: 18, bottom: 18, zIndex: 40, padding: "7px 12px", borderRadius: 999, background: "rgba(7,11,20,0.92)", border: "1px solid #FCA31166", color: "#FCA311", fontSize: 12, fontWeight: 800 }}>✂ cutting…</div>}
      </div>
    </div>
  );
}
