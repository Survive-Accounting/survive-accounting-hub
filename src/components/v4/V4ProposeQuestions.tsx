// STEP 1 · TALK → PROPOSE (v4). Lee talks through the practice exam questions for the topic; the AI proposes
// the groups, then fills each group with questions — written into the set as drafts, in their groups, for
// him to review right below. Two stages (lib/v4.functions.ts proposeV4QuestionGroups, then one
// proposeV4GroupQuestions per group) so no single request has to write the whole topic.
//
// The talk box is the browser's dictation — fine for a few minutes of talking; paste or type works too.
import { useState } from "react";

import { V3_CREAM, V3_EDGE, V3_MUTED } from "@/components/v3/Shell";
import { useDictation } from "@/lib/use-dictation";
import { proposeV4GroupQuestions, proposeV4QuestionGroups } from "@/lib/v4.functions";

import { V4_AMBER, V4_MINT, V4_RED, v4Button, v4Field } from "./V4Chrome";
import type { V4TopicData } from "./V4TopicPage";

export function V4ProposeQuestions({ data, onData, topicName }: { data: V4TopicData; onData: (d: V4TopicData) => void; topicName: string }) {
  const [open, setOpen] = useState(data.cards.length === 0);
  const [talk, setTalk] = useState("");
  const [interim, setInterim] = useState("");
  const mic = useDictation((final, live) => { setInterim(live); if (final.trim()) setTalk((t) => `${t} ${final}`.trim()); });
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  const propose = async () => {
    if (mic.on) { mic.stop(); setInterim(""); }
    const said = `${talk} ${interim}`.trim();
    setBusy(true); setErr(null); setWarn(null); setProgress("Working out the groups…");
    try {
      const g = await proposeV4QuestionGroups({ data: { setId: data.setId, topicName, talk: said } });
      if (!g.ok) { setErr(g.error); return; }
      if (g.logWarning) setWarn(g.logWarning);
      let latest: V4TopicData = { ...data, state: g.state };
      onData(latest);
      let added = 0;
      for (let i = 0; i < g.groups.length; i++) {
        const group = g.groups[i];
        setProgress(`Writing questions for ${group.name} (${i + 1} of ${g.groups.length})…`);
        const r = await proposeV4GroupQuestions({ data: { setId: data.setId, topicName, talk: said, proposalId: g.proposalId, group } });
        added += r.added;
        if (r.logWarning) setWarn(r.logWarning);
        latest = { ...latest, cards: r.cards };
        onData(latest);
      }
      setProgress(`Proposed ${added} question${added === 1 ? "" : "s"} across ${g.groups.length} group${g.groups.length === 1 ? "" : "s"} — review them below. They stay drafts until Questions final.`);
      setOpen(false);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setProgress(null); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ marginBottom: 12, border: `1px solid ${V3_EDGE}`, borderRadius: 12, padding: "10px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" onClick={() => setOpen((v) => !v)} style={{ all: "unset", cursor: "pointer", fontSize: 14, fontWeight: 800, color: V3_CREAM }}>{open ? "▾" : "▸"} 🎙 Talk through the practice exam → propose questions</button>
        {progress && !open && <span style={{ fontSize: 12.5, color: busy ? V4_AMBER : V4_MINT }}>{progress}</span>}
      </div>
      {open && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <textarea value={mic.on && interim ? `${talk} ${interim}`.trim() : talk} onChange={(e) => { setInterim(""); setTalk(e.target.value); }} rows={5}
              placeholder="Talk (or paste) through the practice exam: what gets asked, where students slip, the groups you'd put it in…" style={{ ...v4Field, resize: "vertical" }} />
            {mic.supported && (
              <button type="button" onClick={() => { if (mic.on) { mic.stop(); setInterim(""); } else mic.start(); }} style={{ ...v4Button(), color: mic.on ? V4_RED : V3_CREAM, borderColor: mic.on ? V4_RED : V3_EDGE }}>{mic.on ? "● stop" : "🎙 Talk"}</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={() => void propose()} disabled={busy} style={{ ...v4Button("gold"), opacity: busy ? 0.6 : 1 }}>{busy ? "Proposing…" : "Propose questions"}</button>
            <span style={{ fontSize: 12, color: V3_MUTED }}>Adds to what's here — existing questions and groups stay. New ones arrive as drafts.</span>
          </div>
          {progress && <div style={{ fontSize: 12.5, color: busy ? V4_AMBER : V4_MINT }}>{progress}</div>}
        </div>
      )}
      {err && <div style={{ marginTop: 8, fontSize: 12.5, color: V4_RED }}>{err}</div>}
      {warn && <div style={{ marginTop: 8, fontSize: 12.5, color: V4_AMBER }}>Not recorded for learning — {warn}</div>}
    </div>
  );
}
