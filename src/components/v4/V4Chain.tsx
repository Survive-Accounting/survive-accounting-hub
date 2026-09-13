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
import { loadBlastPlan } from "@/lib/blastoff.functions";
import { v4ArrangeChain, v4EnsureProposal, v4MarkFinal } from "@/lib/v4.functions";

import { V4_AMBER, V4_MINT, V4_RED, v4Button } from "./V4Chrome";
import type { V4TopicData } from "./V4TopicPage";

const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

export function V4Chain({ data, onData, set, topic }: { data: V4TopicData; onData: (d: V4TopicData) => void; set: BoothSetInfo; topic: BoothTopic }) {
  const state = data.state!;
  const [deckKey, setDeckKey] = useState(0);
  const [showDeck, setShowDeck] = useState(true);
  const [busy, setBusy] = useState(false);
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
        <span style={{ fontSize: 12.5, color: V3_MUTED }}>Group by group: teaching slides, then questions. Then drag to reorder and polish below.</span>
        <span style={{ flex: 1 }} />
        {state.final.chain && <span style={{ fontSize: 12.5, color: V4_MINT, fontWeight: 700 }}>✓ Final</span>}
        <button type="button" onClick={() => void finalize()} disabled={busy} style={{ ...v4Button("gold"), fontSize: 13.5, padding: "8px 16px" }}>{state.final.chain ? "Mark final again" : "Chain final"}</button>
      </div>
      {note && <div style={{ marginTop: 8, fontSize: 13, color: V4_MINT }}>{note}</div>}
      {err && <div style={{ marginTop: 8, fontSize: 13, color: V4_RED }}>{err}</div>}
      {warn && <div style={{ marginTop: 8, fontSize: 12.5, color: V4_AMBER }}>Not recorded for learning — {warn}</div>}
      <div style={{ marginTop: 14 }}>
        {showDeck ? <ReviewDeck key={deckKey} set={set} topic={topic} v4 /> : <div style={{ fontSize: 13, color: V3_CREAM }}>Working…</div>}
      </div>
    </div>
  );
}
