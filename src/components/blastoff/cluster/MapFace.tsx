// THE MAP FACE — the Editor's right column when the selected slide is a map. The Teaching
// Assistant lives here, inside the step, not on a chat page of its own.
//
// Lee, 2026-09-07: "I want to set it up where I tell the teaching assistant what I'm thinking,
// we go back and forth and refine if needed, to ensure we're on the same page, then it goes and
// builds the cluster for me. I make revisions if needed, etc. Eventually we want to reduce
// revisions as much as possible."
//
// So, top to bottom: the title; THE THREAD — voice-first ("Tell the assistant": dictation,
// typing allowed) → the plan in words comes back as the assistant's reply with its questions →
// Lee answers by voice or type → "Build it" lands the spec on frame.cluster through onPatch and
// the bird's-eye below updates (the phone stage on the left renders it once its renderer lands)
// → "Say a revision" → a full revised spec waits on "Apply" → "Start over" clears the thread.
// While he talks, the plan re-briefs on the rehearsal review's throttle (one call in flight, a
// stale answer dropped) so the reply is forming before he stops. Warnings from checkMapSpec sit
// in orange under the schematic — shown, never fatal. Every AI call: one quiet retry (a spec
// that fails the validator is retried once with the error appended), cost logged with who.
//
// The thread is local to this face (per frame — the deck keys it on the slide id); the map
// itself is on the frame, saved like any edit.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { runMicro } from "@/lib/talkthrough.functions";
import { logCostEvent } from "@/lib/cost-ledger.functions";
import { useDictation } from "@/lib/use-dictation";
import { MAP_EXAMPLES } from "./map-examples";
import {
  buildMapPlanMessages, buildMapReviseMessages, buildMapSpecMessages, checkMapSpec, parseMapPlan, parseMapSpec,
  type MapCard, type MapPlan, type MapSetContext,
} from "@/lib/cluster-brief";
import { getAdminWho } from "@/components/AdminGate";
import { CREAM, EDGE, GOLD, MUTED } from "../BlastOffEditor";
import { LIVE_BRIEF_EVERY_MS } from "../RehearsalReview";
import type { BlastFrame } from "../plan";
import { emptyCluster, shotsOf, type ClusterSpec } from "./cluster-spec";
import { MapSchematic } from "./MapSchematic";

const RED = "#F87171";
const MINT = "#3BF5A0";
const ORANGE = "#FF9F43";
const chip = (on: boolean, color = GOLD): React.CSSProperties => ({
  border: `1px solid ${on ? color : EDGE}`, background: on ? `${color}22` : "transparent", color: on ? color : CREAM,
  borderRadius: 9, padding: "4px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
});
const field: React.CSSProperties = {
  width: "100%", background: "rgba(9,13,26,0.7)", border: `1px solid ${EDGE}`, borderRadius: 9, color: CREAM,
  padding: "7px 9px", fontSize: 13, lineHeight: 1.45, fontFamily: "inherit", boxSizing: "border-box",
};
const subhead: React.CSSProperties = { fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED, fontWeight: 800 };

/** The titles emptyCluster and the quick row hand a new map — the assistant's title replaces
 *  these on Build; one Lee typed is kept. */
const DEFAULT_TITLES = new Set(["New map", "Untitled map"]);

// ------------------------------------------------------------ the spoken take (ReviewDeck's shape)

/** Every FINAL chunk so far plus what SpeechRecognition is still working out; `onBrief(take)`
 *  on a THROTTLE (first new speech at once, then at most once per LIVE_BRIEF_EVERY_MS, the tail
 *  always lands). `reset` clears the take after a turn is sent. */
function useSpokenTake(onBrief: (take: string) => void) {
  const [take, setTake] = useState("");
  const [interim, setInterim] = useState("");
  const dictation = useDictation((final, live) => {
    setInterim(live);
    if (final.trim()) setTake((t) => `${t} ${final}`.trim());
  });
  const lastBriefAt = useRef(0);
  const briefed = useRef("");
  const onBriefRef = useRef(onBrief);
  onBriefRef.current = onBrief;
  useEffect(() => {
    if (!take || take === briefed.current) return;
    const wait = Math.max(0, lastBriefAt.current + LIVE_BRIEF_EVERY_MS - Date.now());
    const id = window.setTimeout(() => { lastBriefAt.current = Date.now(); briefed.current = take; onBriefRef.current(take); }, wait);
    return () => window.clearTimeout(id);
  }, [take]);
  const start = () => { if (!dictation.supported || dictation.on) return; dictation.start(); };
  const stop = () => { dictation.stop(); setInterim(""); };
  const reset = () => { setTake(""); setInterim(""); briefed.current = ""; };
  return { take, interim, on: dictation.on, supported: dictation.supported, toggle: () => (dictation.on ? stop() : start()), stop, reset };
}

/** ONE CALL IN FLIGHT: a newer argument waits as `pending` and runs when the call lands; the
 *  running call asks `stale()` before it writes. */
function useLatestRun<T>(run: (arg: T, stale: () => boolean) => Promise<void>) {
  const inFlight = useRef(false);
  const pending = useRef<{ arg: T } | null>(null);
  const runRef = useRef(run);
  runRef.current = run;
  const go = useCallback(async (arg: T): Promise<void> => {
    if (inFlight.current) { pending.current = { arg }; return; }
    inFlight.current = true;
    try { await runRef.current(arg, () => pending.current !== null); }
    finally {
      inFlight.current = false;
      const p = pending.current;
      pending.current = null;
      if (p) void go(p.arg);
    }
  }, []);
  return go;
}

// ------------------------------------------------------------ the micro lane, priced

/** One micro call, priced into the ledger fire-and-forget, with who. */
async function ask(setId: string, label: string, m: { system: string; user: string }, maxOutput: number): Promise<string> {
  const r = await runMicro({ data: { system: m.system, user: m.user, maxOutput } });
  void logCostEvent({ data: { setId, kind: "ai", usd: r.usage.costUsd, model: r.model, label, who: getAdminWho() } });
  return r.text;
}

/** The plan: one quiet retry on an answer that doesn't parse. */
async function askPlan(setId: string, m: { system: string; user: string }): Promise<MapPlan> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const p = parseMapPlan(await ask(setId, "map plan", m, 700));
    if (p) return p;
  }
  throw new Error("The plan didn't come back clean, twice — try again.");
}

/** The spec (build or revise): a failed validation is retried ONCE with the error appended
 *  ("your last answer failed: …"). Asked at 5,000 output tokens — the micro lane's ceiling is
 *  6,000 since 2026-09-07 (talkthrough.functions.ts); at the old 2,000 a map past eight or so
 *  nodes came back cut off, which read as "not valid JSON". */
async function askSpec(setId: string, label: string, build: (failure?: string) => { system: string; user: string }, id: string): Promise<ClusterSpec> {
  let failure: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = parseMapSpec(await ask(setId, label, build(failure), 5000), id);
    if (r.spec) return r.spec;
    failure = r.error;
  }
  throw new Error(`The map didn't come back clean, twice — last problem: ${failure}`);
}

// ------------------------------------------------------------ the face

type Turn = { who: "lee" | "ta"; text: string; questions?: string[] };

export function MapFace({ sel, setId, set, card, talkthrough, onPatch }: {
  sel: BlastFrame; setId: string;
  set: MapSetContext;
  /** The set card this map sits after, when there is one — the question it explains. */
  card?: MapCard;
  /** What Lee said and stamped about that card in Step 1. */
  talkthrough?: string;
  onPatch: (p: Partial<BlastFrame>) => void;
}) {
  const cluster = sel.cluster ?? emptyCluster("New map");
  const built = cluster.nodes.length > 0;
  const cardIds = useMemo(() => new Set(set.ceqs.map((c) => c.id)), [set.ceqs]);
  const warnings = useMemo(() => checkMapSpec(cluster, { cardIds }), [cluster, cardIds]);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [plan, setPlan] = useState<MapPlan | null>(null);
  const [draft, setDraft] = useState("");
  const [live, setLive] = useState<{ for: string; plan: MapPlan } | null>(null);
  const [busy, setBusy] = useState<"plan" | "build" | "revise" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ spec: ClusterSpec; warnings: string[] } | null>(null);
  const [shot, setShot] = useState<number | null>(0);
  const [copied, setCopied] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const leeSaid = (turnsNow: Turn[], extra: string) => [...turnsNow.filter((t) => t.who === "lee").map((t) => t.text), extra].filter(Boolean).join("\n\n");

  // THE LIVE RE-BRIEF while he talks (plan phase only — a revision is a whole spec, not worth
  // re-running every few seconds). One in flight; a stale answer is dropped.
  const turnsRef = useRef(turns); turnsRef.current = turns;
  const planRef = useRef(plan); planRef.current = plan;
  const draftRef = useRef(draft); draftRef.current = draft;
  const runLive = useLatestRun<string>(async (take, stale) => {
    if (built) return;
    const text = `${draftRef.current} ${take}`.trim();
    try {
      const p = await askPlan(setId, buildMapPlanMessages({ brainstorm: leeSaid(turnsRef.current, text), set, card, talkthrough, priorPlan: planRef.current ?? undefined }));
      if (!alive.current || stale()) return;
      setLive({ for: text, plan: p });
    } catch { /* the live draft is a courtesy — Send makes the real call */ }
  });
  const talk = useSpokenTake((take) => void runLive(take));
  const spoken = `${draft} ${talk.take}`.trim();

  /** SEND: before a map exists, the turn goes to the plan brief; after, to the revise brief. */
  const send = async () => {
    const text = spoken;
    if (!text || busy) return;
    talk.stop();
    const next: Turn[] = [...turns, { who: "lee", text }];
    setTurns(next);
    setDraft(""); talk.reset(); setError(null);
    if (!built) {
      setBusy("plan");
      try {
        const p = live && live.for === text ? live.plan : await askPlan(setId, buildMapPlanMessages({ brainstorm: leeSaid(next, ""), set, card, talkthrough, priorPlan: plan ?? undefined }));
        if (!alive.current) return;
        setPlan(p); setLive(null);
        setTurns((t) => [...t, { who: "ta", text: p.plan, questions: p.questions }]);
      } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : String(e)); }
      finally { if (alive.current) setBusy(null); }
    } else {
      setBusy("revise");
      try {
        const spec = await askSpec(setId, "map revise", (failure) => buildMapReviseMessages({ spec: cluster, spoken: text, failure }), cluster.id);
        if (!alive.current) return;
        const w = checkMapSpec(spec, { cardIds });
        setPending({ spec, warnings: w });
        setTurns((t) => [...t, { who: "ta", text: `Revised: ${spec.nodes.length} node${spec.nodes.length === 1 ? "" : "s"}, ${shotsOf(spec).length} shots. Apply it below, or say more.` }]);
      } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : String(e)); }
      finally { if (alive.current) setBusy(null); }
    }
  };

  /** BUILD IT: the agreed plan → the spec, onto the frame. */
  const build = async () => {
    if (!plan || busy) return;
    talk.stop();
    setBusy("build"); setError(null);
    try {
      const spec = await askSpec(setId, "map build", (failure) => buildMapSpecMessages({ plan: plan.plan, brainstorm: leeSaid(turns, ""), set, examples: MAP_EXAMPLES, card, id: cluster.id, failure }), cluster.id);
      if (!alive.current) return;
      const titled: ClusterSpec = DEFAULT_TITLES.has(cluster.title) || !cluster.title.trim() ? spec : { ...spec, title: cluster.title };
      onPatch({ cluster: titled });
      setShot(0); setPending(null);
      const w = checkMapSpec(titled, { cardIds });
      setTurns((t) => [...t, { who: "ta", text: `Built: ${titled.nodes.length} node${titled.nodes.length === 1 ? "" : "s"}, ${shotsOf(titled).length} shots.${w.length ? ` ${w.length} thing${w.length === 1 ? "" : "s"} to look at under the map.` : ""} Say a revision if it's not right.` }]);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (alive.current) setBusy(null); }
  };

  const apply = () => { if (!pending) return; onPatch({ cluster: pending.spec }); setPending(null); setShot(0); };
  const startOver = () => { talk.stop(); talk.reset(); setTurns([]); setPlan(null); setLive(null); setDraft(""); setPending(null); setError(null); };
  const copyJson = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(cluster, null, 2)); setCopied(true); window.setTimeout(() => alive.current && setCopied(false), 1500); }
    catch { setError("Couldn't copy — select the JSON and copy it by hand."); }
  };

  const micTitle = talk.supported
    ? (built ? "Say what to change on the map — a full revised map comes back and waits for Apply" : "Tell the assistant what you're thinking — the plan forms while you talk; Send when you're done")
    : "Dictation needs Chrome or Edge — typing works";
  const shownPlan = live && !built && spoken && live.for === spoken ? live.plan : null;

  return (
    <div>
      {/* the title */}
      <label style={{ fontSize: 11, color: MUTED, display: "block" }}>Title — what the map is
        <input style={{ ...field, marginTop: 4 }} value={cluster.title} placeholder="e.g. Buy supplies on account" onChange={(e) => onPatch({ cluster: { ...cluster, title: e.target.value } })} /></label>
      <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>{built ? `${cluster.nodes.length} node${cluster.nodes.length === 1 ? "" : "s"} · ${shotsOf(cluster).length} shots · space walks them on the stage` : "Nothing on the field yet — tell the assistant, or pick an example under Map on the quick row."}</div>

      {/* THE THREAD */}
      <div style={{ marginTop: 10, borderTop: `1px solid ${EDGE}`, paddingTop: 8 }}>
        <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap" }}>
          <span style={subhead}>The assistant</span>
          {busy && <span style={{ fontSize: 11, color: MUTED }}>{busy === "plan" ? "planning…" : busy === "build" ? "building the map…" : "revising…"}</span>}
          {turns.length > 0 && <button style={{ ...chip(false), marginLeft: "auto", padding: "2px 8px", fontSize: 10.5 }} title="Clear the thread (the map on the frame stays)" onClick={startOver}>Start over</button>}
        </div>
        {turns.length > 0 && (
          <div className="flex flex-col" style={{ gap: 6, marginTop: 6 }}>
            {turns.map((t, i) => (
              <div key={i} style={{ fontSize: 12, lineHeight: 1.45, color: CREAM, padding: "6px 9px", borderRadius: 8, border: `1px solid ${t.who === "ta" ? `${GOLD}66` : EDGE}`, background: t.who === "ta" ? "rgba(252,163,17,0.06)" : "rgba(9,13,26,0.4)" }}>
                <div style={{ ...subhead, color: t.who === "ta" ? GOLD : MUTED, marginBottom: 2 }}>{t.who === "ta" ? "Assistant" : "You"}</div>
                <div style={{ whiteSpace: "pre-wrap" }}>{t.text}</div>
                {!!t.questions?.length && (
                  <div style={{ marginTop: 4 }}>
                    {t.questions.map((q, k) => <div key={k} style={{ color: ORANGE }}>? {q}</div>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {/* the input: dictation lands in the take; typing goes in the box; both go together on Send */}
        <div style={{ marginTop: 8 }}>
          <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap" }}>
            <button style={chip(talk.on, RED)} disabled={!talk.supported || !!busy} title={micTitle} onClick={talk.toggle}>
              {talk.on ? "■ stop" : built ? "🎙 Say a revision" : "🎙 Tell the assistant"}
            </button>
            {talk.on && !talk.take && !talk.interim && <span style={{ fontSize: 11, color: MUTED }}>listening…</span>}
          </div>
          {(talk.take || talk.interim) && <div style={{ fontSize: 11.5, color: MUTED, fontStyle: "italic", marginTop: 4 }}>“{talk.take}{talk.interim ? <span style={{ opacity: 0.6 }}> {talk.interim}</span> : null}”</div>}
          <textarea style={{ ...field, minHeight: 56, marginTop: 6 }} value={draft} disabled={!!busy}
            placeholder={built ? "or type the change — “make the entry a thousand”, “add the card at the top”" : plan ? "answer, or say more" : "or type it — “buy supplies on account: the equation, then the entry, then post it”"}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }} />
          {shownPlan && (
            <div style={{ marginTop: 6, fontSize: 11.5, color: MUTED, lineHeight: 1.45, padding: "6px 9px", borderRadius: 8, border: `1px dashed ${GOLD}55` }}>
              <div style={{ ...subhead, color: GOLD, marginBottom: 2 }}>forming…</div>
              <div style={{ whiteSpace: "pre-wrap" }}>{shownPlan.plan}</div>
              {shownPlan.questions.map((q, k) => <div key={k} style={{ color: ORANGE }}>? {q}</div>)}
            </div>
          )}
          <div className="flex" style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <button style={{ ...chip(true), opacity: spoken && !busy ? 1 : 0.5 }} disabled={!spoken || !!busy} title={built ? "Send the change to the assistant (Ctrl+Enter)" : "Send this to the assistant — the plan in words comes back (Ctrl+Enter)"} onClick={() => void send()}>
              {built ? "Revise" : "Send"}
            </button>
            {plan && !built && (
              <button style={{ ...chip(true, MINT), opacity: busy ? 0.5 : 1 }} disabled={!!busy} title="The plan is right — build the map from it onto this slide" onClick={() => void build()}>Build it</button>
            )}
            {plan && built && (
              <button style={chip(false, MINT)} disabled={!!busy} title="Build the map again from the plan above (replaces what's on the slide)" onClick={() => void build()}>Rebuild from the plan</button>
            )}
          </div>
        </div>
        {pending && (
          <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, border: `1px solid ${MINT}66`, background: "rgba(59,245,160,0.05)" }}>
            <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap" }}>
              <span style={{ ...subhead, color: MINT }}>Revised map</span>
              <span style={{ fontSize: 11, color: MUTED }}>{pending.spec.nodes.length} nodes · {shotsOf(pending.spec).length} shots</span>
            </div>
            {pending.warnings.length > 0 && <div style={{ marginTop: 4 }}>{pending.warnings.map((w, i) => <div key={i} style={{ fontSize: 11, color: ORANGE }}>⚠ {w}</div>)}</div>}
            <div className="flex" style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <button style={chip(true, MINT)} title="Put the revised map on the slide — it saves like any edit" onClick={apply}>✓ Apply</button>
              <button style={chip(false)} onClick={() => setPending(null)}>✕ Dismiss</button>
            </div>
          </div>
        )}
        {error && <div style={{ fontSize: 11.5, color: RED, marginTop: 6 }}>⚠ {error}</div>}
      </div>

      {/* THE BIRD'S-EYE */}
      <div style={{ marginTop: 10, borderTop: `1px solid ${EDGE}`, paddingTop: 8 }}>
        <div style={{ ...subhead, marginBottom: 6 }}>Bird's-eye · {cluster.field.w} × {cluster.field.h}</div>
        <MapSchematic spec={pending?.spec ?? cluster} shot={shot} onShot={setShot} w={280} />
        {pending && <div style={{ fontSize: 10.5, color: MINT, marginTop: 4 }}>showing the revision — Apply to keep it</div>}
        {warnings.length > 0 && !pending && (
          <div style={{ marginTop: 6 }}>
            {warnings.map((w, i) => <div key={i} style={{ fontSize: 11, color: ORANGE, lineHeight: 1.4 }}>⚠ {w}</div>)}
          </div>
        )}
      </div>

      {/* THE JSON */}
      <details style={{ marginTop: 10, borderTop: `1px solid ${EDGE}`, paddingTop: 8 }}>
        <summary style={{ ...subhead, cursor: "pointer", listStyle: "none" }}>JSON <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: "none" }}>· the spec as stored, read-only</span></summary>
        <div className="flex" style={{ gap: 6, marginTop: 6 }}>
          <button style={{ ...chip(copied, MINT), padding: "2px 8px", fontSize: 10.5 }} onClick={() => void copyJson()}>{copied ? "copied" : "copy"}</button>
        </div>
        <pre style={{ ...field, marginTop: 6, fontSize: 10.5, lineHeight: 1.35, maxHeight: 320, overflow: "auto", whiteSpace: "pre", margin: "6px 0 0" }}>{JSON.stringify(cluster, null, 2)}</pre>
      </details>
    </div>
  );
}
