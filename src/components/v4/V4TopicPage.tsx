// /v4/$topic/$set/$step — one topic, the step bar, and the step itself.
//
// A set that isn't a v4 topic yet shows the START panel: a dry run first (what moves, what's stripped,
// the starting groups), then one button. Lee, on migrating: "Strip old cuts and the auto-inserted
// intro/slogan/bio/outro slides. Put me at step 1 with the existing questions pre-loaded as if the AI
// had proposed them, so I can review, group and mark final." The old plan is kept on the set.
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { V3Note, V3Shell, V3_CREAM, V3_DISPLAY, V3_EDGE, V3_MUTED } from "@/components/v3/Shell";
import { blastOffPath, useV3Set } from "@/components/v3/use-bank";
import { loadV4Topic, startV4Topic } from "@/lib/v4.functions";

import { V4Questions } from "./V4Questions";
import { V4StepBar, V4_RED, v4Button } from "./V4Chrome";
import { V4_STEPS, V4_STEP_LABEL, type V4Step } from "./v4-topic";

export type V4TopicData = Awaited<ReturnType<typeof loadV4Topic>>;
type Preview = Awaited<ReturnType<typeof startV4Topic>>["preview"];

export function V4TopicPage({ topicKey, setKey, step }: { topicKey: string; setKey: string; step?: string }) {
  const { topics, error, topic, set } = useV3Set(topicKey, setKey);
  const navigate = useNavigate();
  const [data, setData] = useState<V4TopicData | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!set) return;
    try { setData(await loadV4Topic({ data: { setId: set.id } })); setLoadErr(null); }
    catch (e) { setLoadErr(e instanceof Error ? e.message : String(e)); }
  }, [set]);
  useEffect(() => { void reload(); }, [reload]);

  // No step in the URL → the step the topic is on.
  useEffect(() => {
    if (!step && data?.state) void navigate({ to: "/v4/$topic/$set/$step", params: { topic: topicKey, set: setKey, step: data.state.step }, replace: true });
  }, [step, data, navigate, topicKey, setKey]);

  const current = (V4_STEPS as readonly string[]).includes(step ?? "") ? (step as V4Step) : data?.state?.step ?? "questions";
  return (
    <V3Shell wide crumbs={[{ label: "V4", to: "/v4" }, { label: set?.name ?? setKey }]}>
      {error && <V3Note tone="bad">Could not load the bank: {error}</V3Note>}
      {loadErr && <V3Note tone="bad">{loadErr}</V3Note>}
      {(!topics || (set && !data)) && !error && !loadErr && <V3Note>Loading…</V3Note>}
      {topics && !set && <V3Note tone="bad">No set called “{setKey}” in “{topicKey}”.</V3Note>}

      {set && topic && data && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <h1 style={{ fontFamily: V3_DISPLAY, fontSize: 30, fontWeight: 900, letterSpacing: "-0.01em", margin: 0 }}>{set.name}</h1>
            <span style={{ fontSize: 12.5, color: V3_MUTED }}>{topic.name}</span>
          </div>
          {data.state && <V4StepBar topicKey={topicKey} setKey={setKey} state={data.state} current={current} />}
          {data.learningError && <V3Note tone="bad">The learning record isn't saving yet — {data.learningError}</V3Note>}

          {!data.state && <StartPanel setId={set.id} onStarted={async () => { await reload(); void navigate({ to: "/v4/$topic/$set/$step", params: { topic: topicKey, set: setKey, step: "questions" } }); }} />}
          {data.state && current === "questions" && <V4Questions data={data} onData={setData} />}
          {data.state && current !== "questions" && (
            <div style={{ border: `1px dashed ${V3_EDGE}`, borderRadius: 12, padding: "16px 18px", maxWidth: 680 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: V3_CREAM }}>{V4_STEP_LABEL[current]} is the next part of v4 being built.</div>
              <div style={{ marginTop: 6, fontSize: 13, color: V3_MUTED, lineHeight: 1.55 }}>
                {data.state.final.questions ? "Your questions are final. " : "Finish Questions first. "}
                Until this step lands, the set's slides are still editable in the v3 Editor — its chain is already stripped of old cuts and bookends, in the order it had.
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <a href={blastOffPath(topic, set, "results")} style={{ ...v4Button(), textDecoration: "none" }}>Open in the v3 Editor</a>
                <Link to="/v4/$topic/$set/$step" params={{ topic: topicKey, set: setKey, step: "questions" }} style={{ ...v4Button(), textDecoration: "none" }}>Back to Questions</Link>
              </div>
            </div>
          )}
        </>
      )}
    </V3Shell>
  );
}

function StartPanel({ setId, onStarted }: { setId: string; onStarted: () => Promise<void> }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    startV4Topic({ data: { setId, dryRun: true } }).then((r) => setPreview(r.preview)).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [setId]);
  const start = async () => {
    setBusy(true); setErr(null);
    try { await startV4Topic({ data: { setId, dryRun: false } }); await onStarted(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ marginTop: 16, border: `1px solid ${V3_EDGE}`, borderRadius: 14, padding: "16px 18px", maxWidth: 680 }}>
      <div style={{ fontSize: 17, fontWeight: 900, color: V3_CREAM }}>Start this topic in v4</div>
      {!preview && !err && <div style={{ marginTop: 8, fontSize: 13, color: V3_MUTED }}>Working out what would change…</div>}
      {preview && (
        <>
          <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13.5, color: V3_CREAM, lineHeight: 1.7 }}>
            <li><b>{preview.questions}</b> questions come into Step 1, as the first proposal for you to review.</li>
            <li>Starting groups from its splits: {preview.groups.length ? preview.groups.map((g) => `${g.name} (${g.questions})`).join(" · ") : "none"}{preview.ungrouped ? ` · ${preview.ungrouped} not grouped yet` : ""}.</li>
            <li>The chain goes from <b>{preview.slidesBefore}</b> to <b>{preview.slidesAfter}</b> slides: {preview.cuts} cut{preview.cuts === 1 ? "" : "s"} and the auto-inserted intro / slogan / bio / outro slides come out. Everything else stays, in order.</li>
            <li>The old plan is kept on the set, so this can be put back.</li>
          </ul>
          <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
            <button type="button" onClick={() => void start()} disabled={busy} style={{ ...v4Button("gold"), fontSize: 14, padding: "8px 16px", opacity: busy ? 0.6 : 1 }}>{busy ? "Starting…" : "Start in v4"}</button>
            <span style={{ fontSize: 12, color: V3_MUTED }}>v3 keeps working; this set's splits start fresh in v4.</span>
          </div>
        </>
      )}
      {err && <div style={{ marginTop: 10, fontSize: 13, color: V4_RED }}>{err}</div>}
    </div>
  );
}
