// IMPROVE PROCESS — Step 5's body. Lee, 2026-09-07: "I'd love a Step 5: Improve Process. This
// one can show the stats for time spent each section, and on what tasks, (maybe just rank by
// total time spent on each?, descending order?), recommendations, etc. And it's like in big
// text at top (Time to beat: ~# minutes) and it's an average of all the previous ones. So, I'm
// constantly trying to go faster where I can. Gamifies it a bit. … Which tasks do I get
// distracted most? I am excited about the potential of this tool to help me objectively work
// on my ADD with no shame. Using AI as an ADD consultant in a way. Step 5 … can take all the
// comments I've left at each step for what would've been better, what sucked, etc, and we can
// just have step 5 suggest claude code prompts, new approaches, guardrails, etc."
//
// Reads production_runs (lib/production-run.functions.ts listProductionRuns — every set, so the
// average and the cross-set table come from one call), plus the widget's own localStorage copy
// of the active run so a run still in flight shows here before its last save lands. Everything
// numeric is the pure model (lib/production-run.ts); the consultant is lib/improve-brief.ts on
// the micro lane; a suggested prompt lands in the Idea Bank through saveIdea, filed
// BUILD_IN_PUBLIC / Process, with the run it came from in context.
//
// THE RULE (decided with Lee): Time to beat averages COMPLETE runs only — every step done,
// none skipped — and never includes the run being looked at. A run that skipped a step is
// listed, marked, and left out of the bar.
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

import { getAdminWho } from "@/components/AdminGate";
import { newIdeaId } from "@/components/ideas/model";
import { V3Note, V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { RUN_KEY } from "@/components/v3/ProductionTimer";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { saveIdea } from "@/lib/ideas.functions";
import { buildImproveMessages, parseImprove, type ImproveSuggestions } from "@/lib/improve-brief";
import {
  DEFAULT_TASK_LISTS, distractionStats, fmtDuration, fmtElapsed, fmtMin, isCompleteRun, normalizeRun, normalizeTaskLists,
  RUN_STEP_LABEL, RUN_STEPS, runPauses, runTotals, runTotalSeconds, stepAverages, taskKeyFor, timeToBeat,
  type ProductionRun, type RunStepId, type TaskLists,
} from "@/lib/production-run";
import { getProductionTaskLists, listProductionRuns, setProductionTaskLists } from "@/lib/production-run.functions";
import { runMicro, type BoothSetInfo, type BoothTopic } from "@/lib/talkthrough.functions";

const MINT = "#3BF5A0", ORANGE = "#FF9F43", ROSE = "#FF8B7E", SKY = "#7DD3FC";

const improvePath = (r: ProductionRun): string => `/v3/${r.topicSlug}/${r.setSlug}/blast-off/improve`;
const endOf = (r: ProductionRun): Date => (r.status === "running" ? new Date() : new Date(r.endedAt ?? r.startedAt));
const dateOf = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function ImprovePage({ topic, set }: { topic: BoothTopic; set: BoothSetInfo }) {
  const [runs, setRuns] = useState<ProductionRun[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(() => {
    listProductionRuns({ data: {} })
      .then((r) => {
        // The widget's local copy of the run in flight may be ahead of (or absent from) the server.
        let local: ProductionRun | null = null;
        try { const raw = localStorage.getItem(RUN_KEY); local = raw ? normalizeRun(JSON.parse(raw)) : null; } catch { /* none */ }
        const merged = local && local.setId === set.id ? [local, ...r.runs.filter((x) => x.id !== local!.id)] : r.runs;
        setRuns(merged.sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
        setLoadErr(r.error ?? null);
      })
      .catch((e) => { setRuns([]); setLoadErr(e instanceof Error ? e.message : String(e)); });
  }, [set.id]);
  useEffect(load, [load]);
  // A run still in flight keeps moving — re-read the local copy every few seconds.
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 5000); return () => clearInterval(t); }, []);
  useEffect(() => { if (tick > 0 && runs?.some((r) => r.status === "running" && r.setId === set.id)) load(); }, [tick, runs, set.id, load]);

  const mine = useMemo(() => (runs ?? []).filter((r) => r.setId === set.id), [runs, set.id]);
  const run = useMemo(() => mine.find((r) => r.id === pickedId) ?? mine[0] ?? null, [mine, pickedId]);
  /** Every OTHER run — other sets, and this set's earlier ones — is what the bar is set by. */
  const pool = useMemo(() => (runs ?? []).filter((r) => !run || r.id !== run.id), [runs, run]);
  const beat = useMemo(() => timeToBeat(pool), [pool]);
  const completeCount = pool.filter(isCompleteRun).length;
  const avgSteps = useMemo(() => stepAverages(pool), [pool]);
  const now = endOf(run ?? { status: "done", endedAt: null, startedAt: new Date().toISOString() } as ProductionRun);
  const totals = run ? runTotals(run, now) : null;
  const total = totals?.total ?? 0;
  const under = beat != null && total < beat;
  const distract = useMemo(() => distractionStats(runs ?? []), [runs]);

  return (
    <div>
      <h1 style={{ fontFamily: V3_DISPLAY, fontSize: 30, fontWeight: 900, letterSpacing: "-0.01em", margin: "0 0 6px" }}>Improve Process</h1>
      <div style={{ color: V3_MUTED, fontSize: 13, marginBottom: 20, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span>{topic.name} · {set.name}</span>
        {mine.length > 1 && (
          <select value={run?.id ?? ""} onChange={(e) => setPickedId(e.target.value)} style={selectStyle}>
            {mine.map((r) => <option key={r.id} value={r.id}>{dateOf(r.startedAt)} · {fmtDuration(runTotalSeconds(r, endOf(r)))}{isCompleteRun(r) ? "" : r.status === "running" ? " · running" : " · incomplete"}</option>)}
          </select>
        )}
      </div>

      {loadErr && <V3Note tone="bad">{loadErr}</V3Note>}
      {!runs && !loadErr && <V3Note>Loading the runs…</V3Note>}

      {/* TIME TO BEAT — big, at the top, always. */}
      <section style={{ ...card, display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 24 }}>
        <div>
          <div style={kicker}>Time to beat</div>
          <div style={{ fontFamily: V3_DISPLAY, fontSize: 56, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1, color: V3_CREAM }}>
            {beat == null ? "—" : fmtMin(beat)}
          </div>
          <div style={{ color: V3_MUTED, fontSize: 12.5, marginTop: 8 }}>
            {beat == null ? "finish one full run to set the bar" : `${completeCount} complete run${completeCount === 1 ? "" : "s"} in the average`}
            {run && <> · this run {run.status === "running" ? "in progress" : isCompleteRun(run) ? "complete" : "incomplete — not counted"}</>}
          </div>
        </div>
        {run && (
          <div>
            <div style={kicker}>This run</div>
            <div style={{ fontFamily: V3_DISPLAY, fontSize: 40, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1, color: beat == null ? V3_CREAM : under ? MINT : ORANGE }}>
              {fmtMin(total)}
            </div>
            <div style={{ color: V3_MUTED, fontSize: 12.5, marginTop: 8 }}>
              {fmtElapsed(total)}{beat != null && <> · {under ? `${fmtDuration(beat - total)} under` : total === beat ? "on the bar" : `${fmtDuration(total - beat)} over`}</>}
              {run.status === "running" && <> · still running</>}
            </div>
          </div>
        )}
        {runs && !run && <div style={{ color: V3_MUTED, fontSize: 13.5, lineHeight: 1.5, maxWidth: 420 }}>No run on this set yet. Start recording on Brainstorm and the clock starts itself; the Editor and Rehearse &amp; Film ask "ready?" when you land.</div>}
      </section>

      {run && totals && (
        <>
          {/* PER STEP — this run against the average. */}
          <section style={card}>
            <div style={kicker}>Where the minutes went, by step</div>
            {(() => {
              const max = Math.max(1, ...totals.steps.map((s) => s.seconds), ...RUN_STEPS.map((s) => avgSteps[s] ?? 0));
              return totals.steps.map((s) => {
                const avg = avgSteps[s.step];
                return (
                  <div key={s.step} style={{ display: "grid", gridTemplateColumns: "150px 1fr 90px", alignItems: "center", gap: 12, padding: "6px 0" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: s.status === "skipped" ? V3_MUTED : V3_CREAM }}>{s.label}{s.status === "skipped" && <span style={{ color: V3_MUTED, fontWeight: 400 }}> · skipped</span>}{s.status === "running" && <span style={{ color: MINT, fontWeight: 400 }}> · running</span>}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <Bar w={s.seconds / max} color={avg != null && s.seconds > avg ? ORANGE : MINT} />
                      {avg != null && <Bar w={avg / max} color={V3_EDGE} thin />}
                    </div>
                    <div style={{ fontSize: 12.5, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      <span style={{ color: V3_CREAM }}>{fmtDuration(s.seconds)}</span>
                      {avg != null && <span style={{ color: V3_MUTED }}> / {fmtDuration(avg)}</span>}
                    </div>
                  </div>
                );
              });
            })()}
            <div style={{ color: V3_MUTED, fontSize: 11, marginTop: 6 }}>Bright bar: this run. Thin bar: the average of complete runs.{Object.keys(avgSteps).length === 0 && " No average yet."}</div>
          </section>

          {/* TASKS, by time desc. */}
          <section style={card}>
            <div style={kicker}>Tasks, longest first</div>
            <table style={table}>
              <thead><tr>{["Task", "Step", "Time", "Share", "Pauses"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {totals.tasks.filter((t) => t.seconds > 0 || t.pauses > 0).map((t) => (
                  <tr key={`${t.step}/${t.key}`}>
                    <td style={td}>{t.label}{t.status === "running" && <span style={{ color: MINT }}> · running</span>}</td>
                    <td style={{ ...td, color: V3_MUTED }}>{t.stepLabel}</td>
                    <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>{fmtDuration(t.seconds)}</td>
                    <td style={{ ...td, fontVariantNumeric: "tabular-nums", color: V3_MUTED }}>{Math.round(t.share * 100)}%</td>
                    <td style={{ ...td, color: t.pauses ? ORANGE : V3_MUTED }}>{t.pauses || "—"}</td>
                  </tr>
                ))}
                {totals.tasks.every((t) => t.seconds === 0 && t.pauses === 0) && <tr><td colSpan={5} style={{ ...td, color: V3_MUTED }}>Nothing timed yet.</td></tr>}
              </tbody>
            </table>
            {totals.tasks.some((t) => t.status === "skipped") && (
              <div style={{ color: V3_MUTED, fontSize: 11.5, marginTop: 8 }}>Skipped: {totals.tasks.filter((t) => t.status === "skipped").map((t) => t.label).join(" · ")}</div>
            )}
          </section>

          {/* DISTRACTIONS — every pause, with its reason. No verdicts. */}
          <section style={card}>
            <div style={kicker}>Distractions</div>
            {runPauses(run).length === 0
              ? <div style={{ color: V3_MUTED, fontSize: 13.5 }}>{run.status === "running" ? "No pauses so far." : "One sitting — no pauses."}</div>
              : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  {runPauses(run).map((p, i) => (
                    <li key={i} style={{ display: "flex", gap: 10, fontSize: 13, alignItems: "baseline" }}>
                      <span style={{ color: ORANGE, fontVariantNumeric: "tabular-nums", minWidth: 44 }}>{p.endedAt ? fmtDuration(p.seconds) : "open"}</span>
                      <span style={{ color: V3_MUTED, minWidth: 200 }}>{RUN_STEP_LABEL[p.step]}{p.taskLabel ? ` · ${p.taskLabel}` : ""}</span>
                      <span style={{ color: V3_CREAM }}>{p.reason || <i style={{ color: V3_MUTED }}>no reason given</i>}</span>
                    </li>
                  ))}
                </ul>
              )}
            {distract.mostPaused && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${V3_EDGE}`, fontSize: 13 }}>
                <span style={{ color: V3_MUTED }}>Most paused task across every run: </span>
                <b>{RUN_STEP_LABEL[distract.mostPaused.step]} · {distract.mostPaused.label}</b>
                <span style={{ color: V3_MUTED }}> — {distract.mostPaused.count}× , {fmtDuration(distract.mostPaused.seconds)} total; {fmtDuration(distract.totalPaused)} paused over {distract.pauses.length} pause{distract.pauses.length === 1 ? "" : "s"} in all.</span>
              </div>
            )}
          </section>

          {/* THE STEP COMMENTS. */}
          <section style={card}>
            <div style={kicker}>What you said at each step</div>
            {RUN_STEPS.some((s) => run.steps[s].note)
              ? RUN_STEPS.filter((s) => run.steps[s].note).map((s) => (
                <div key={s} style={{ marginBottom: 8, fontSize: 13.5, lineHeight: 1.5 }}>
                  <span style={{ color: V3_GOLD, fontWeight: 700 }}>{RUN_STEP_LABEL[s]}</span> <span style={{ color: V3_CREAM }}>{run.steps[s].note}</span>
                </div>
              ))
              : <div style={{ color: V3_MUTED, fontSize: 13.5 }}>No comments on this run — the box comes up when you finish a step.</div>}
          </section>

          <Consultant run={run} priorRuns={pool} topic={topic} set={set} />
        </>
      )}

      {/* EVERY RUN, every set. */}
      {runs && runs.length > 0 && (
        <section style={card}>
          <div style={kicker}>Every run</div>
          <table style={table}>
            <thead><tr>{["Date", "Set", "Total", "Complete?", ""].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} style={{ background: run && r.id === run.id ? "rgba(252,163,17,0.08)" : "transparent" }}>
                  <td style={{ ...td, color: V3_MUTED, whiteSpace: "nowrap" }}>{dateOf(r.startedAt)}</td>
                  <td style={td}>{r.setName || r.setId}{r.topicName && <span style={{ color: V3_MUTED }}> · {r.topicName}</span>}</td>
                  <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>{fmtDuration(runTotalSeconds(r, endOf(r)))}</td>
                  <td style={{ ...td, color: isCompleteRun(r) ? MINT : r.status === "running" ? SKY : V3_MUTED }}>{isCompleteRun(r) ? "complete" : r.status === "running" ? "running" : r.status === "abandoned" ? "abandoned" : "incomplete"}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    {r.setId === set.id
                      ? <button type="button" onClick={() => setPickedId(r.id)} style={linkBtn}>show</button>
                      : <Link to={improvePath(r)} style={{ color: V3_GOLD, fontSize: 12.5, textDecoration: "none" }}>→ its Improve page</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <TaskListEditor />
    </div>
  );
}

// ------------------------------------------------------------------ the consultant

function Consultant({ run, priorRuns, topic, set }: { run: ProductionRun; priorRuns: ProductionRun[]; topic: BoothTopic; set: BoothSetInfo }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [out, setOut] = useState<ImproveSuggestions | null>(null);
  const [saved, setSaved] = useState<Record<number, "saving" | "saved" | "copied" | "error">>({});

  const ask = async () => {
    setBusy(true); setErr(null);
    try {
      const comments = RUN_STEPS.filter((s) => run.steps[s].note).map((s) => ({ step: RUN_STEP_LABEL[s], note: run.steps[s].note! }));
      const { system, user } = buildImproveMessages(run, priorRuns, comments);
      const r = await runMicro({ data: { system, user, maxOutput: 1500 } });
      const parsed = parseImprove(r.text);
      if (!parsed) throw new Error("The model didn't answer in the expected shape — try again.");
      setOut(parsed); setSaved({});
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const toIdeaBank = async (i: number, p: { title: string; prompt: string }) => {
    setSaved((s) => ({ ...s, [i]: "saving" }));
    try {
      await saveIdea({ data: {
        id: newIdeaId(), title: p.title, body: `From Improve Process on ${set.name} (${topic.name}): ${out?.headline ?? ""}`.trim(),
        categories: ["BUILD_IN_PUBLIC"], subcategory: "Process", status: "DRAFTED",
        sourcePath: `/v3/${run.topicSlug}/${run.setSlug}/blast-off/improve`, context: { setId: set.id, runId: run.id },
        promptMd: p.prompt, promptFilename: null, createdBy: getAdminWho() ?? "lee", sourceKind: "web", attachments: [], audioPath: null, transcriptStatus: null,
      } });
      setSaved((s) => ({ ...s, [i]: "saved" }));
    } catch { setSaved((s) => ({ ...s, [i]: "error" })); }
  };
  const copy = async (i: number, text: string) => {
    const ok = await copyToClipboard(text);
    setSaved((s) => ({ ...s, [i]: ok ? "copied" : "error" }));
  };

  return (
    <section style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={kicker}>The consultant</div>
          <div style={{ color: V3_MUTED, fontSize: 13, lineHeight: 1.5, maxWidth: 560 }}>Reads this run's minutes, every pause and its reason, your comments, and the runs before it. Direct, concrete, no shame — and prompts you can paste straight into Claude Code.</div>
        </div>
        <button type="button" onClick={() => void ask()} disabled={busy} style={{ ...primary, marginLeft: "auto" }}>{busy ? "Thinking…" : out ? "Suggest again" : "Suggest improvements"}</button>
      </div>
      {err && <div style={{ color: ROSE, fontSize: 13, marginTop: 10 }}>{err}</div>}
      {out && (
        <div style={{ marginTop: 16 }}>
          {out.headline && <div style={{ fontFamily: V3_DISPLAY, fontSize: 20, fontWeight: 800, lineHeight: 1.3, marginBottom: 14 }}>{out.headline}</div>}
          {out.bottlenecks.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={sub}>Bottlenecks</div>
              {out.bottlenecks.map((b, i) => (
                <div key={i} style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 4 }}>
                  <b>{b.task}</b>{b.minutes ? <span style={{ color: ORANGE }}> · {b.minutes} min</span> : null}{b.why && <span style={{ color: V3_MUTED }}> — {b.why}</span>}
                </div>
              ))}
            </div>
          )}
          {out.approaches.length > 0 && <List title="New approaches" items={out.approaches} />}
          {out.guardrails.length > 0 && <List title="Guardrails" items={out.guardrails} />}
          {out.prompts.length > 0 && (
            <div>
              <div style={sub}>Claude Code prompts</div>
              {out.prompts.map((p, i) => (
                <div key={i} style={{ border: `1px solid ${V3_EDGE}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <b style={{ fontSize: 13.5 }}>{p.title}</b>
                    <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                      {saved[i] === "saved" && <span style={{ color: MINT, fontSize: 11.5 }}>in the bank</span>}
                      {saved[i] === "copied" && <span style={{ color: MINT, fontSize: 11.5 }}>copied</span>}
                      {saved[i] === "error" && <span style={{ color: ROSE, fontSize: 11.5 }}>didn't work</span>}
                      <button type="button" onClick={() => void toIdeaBank(i, p)} disabled={saved[i] === "saving" || saved[i] === "saved"} style={small}>→ Idea bank</button>
                      <button type="button" onClick={() => void copy(i, p.prompt)} style={small}>copy</button>
                    </span>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.55, color: V3_CREAM, whiteSpace: "pre-wrap" }}>{p.prompt}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={sub}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6 }}>{items.map((s, i) => <li key={i}>{s}</li>)}</ul>
    </div>
  );
}

// ------------------------------------------------------------------ the task-list editor

function TaskListEditor() {
  const [lists, setLists] = useState<TaskLists | null>(null);
  const [source, setSource] = useState<"settings" | "code">("code");
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getProductionTaskLists().then((r) => { setLists(r.lists); setSource(r.source); }).catch((e) => { setLists(DEFAULT_TASK_LISTS); setMsg(e instanceof Error ? e.message : String(e)); });
  }, []);

  const edit = (step: RunStepId, f: (t: TaskLists[RunStepId]) => TaskLists[RunStepId]) => {
    setLists((l) => (l ? { ...l, [step]: f(l[step]) } : l)); setDirty(true); setMsg(null);
  };
  const save = async () => {
    if (!lists) return;
    const valid = normalizeTaskLists(lists);
    if (!valid) { setMsg("Every step needs at least one task with a label."); return; }
    setBusy(true);
    try { const r = await setProductionTaskLists({ data: valid }); setLists(r.lists); setSource("settings"); setDirty(false); setMsg("Saved — the next run uses these."); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  return (
    <details style={{ ...card, padding: 0 }}>
      <summary style={{ cursor: "pointer", padding: "14px 18px", fontSize: 13, fontWeight: 700, color: V3_CREAM, listStyle: "none" }}>
        <span style={kicker}>The task lists</span>
        <span style={{ color: V3_MUTED, fontWeight: 400 }}>{source === "settings" ? "edited from here" : "code defaults"} · rename, reorder, add, remove — per step; the next run picks them up</span>
      </summary>
      <div style={{ padding: "0 18px 18px" }}>
        {!lists && <div style={{ color: V3_MUTED, fontSize: 13 }}>Loading…</div>}
        {lists && RUN_STEPS.map((step) => (
          <div key={step} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: V3_GOLD, marginBottom: 6 }}>{RUN_STEP_LABEL[step]}{step === "talkthrough" && <span style={{ color: V3_MUTED, fontWeight: 400 }}> · "talk" is the recorder's; keep its key</span>}{step === "film" && <span style={{ color: V3_MUTED, fontWeight: 400 }}> · "r1" / "r2" tick themselves off; keep their keys</span>}</div>
            {lists[step].map((t, i) => (
              <div key={t.key} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                <span style={{ color: V3_MUTED, fontSize: 11, minWidth: 64, fontFamily: "ui-monospace, monospace" }}>{t.key}</span>
                <input value={t.label} onChange={(e) => edit(step, (l) => l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} style={input} />
                <button type="button" disabled={i === 0} onClick={() => edit(step, (l) => { const c = [...l]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; return c; })} style={small} title="Up">↑</button>
                <button type="button" disabled={i === lists[step].length - 1} onClick={() => edit(step, (l) => { const c = [...l]; [c[i], c[i + 1]] = [c[i + 1], c[i]]; return c; })} style={small} title="Down">↓</button>
                <button type="button" disabled={lists[step].length <= 1} onClick={() => edit(step, (l) => l.filter((_, j) => j !== i))} style={{ ...small, color: ROSE }} title="Remove">×</button>
              </div>
            ))}
            <button type="button" onClick={() => { const label = window.prompt("New task"); if (label?.trim()) edit(step, (l) => [...l, { key: taskKeyFor(label, l), label: label.trim() }]); }} style={{ ...small, marginTop: 2 }}>+ add a task</button>
          </div>
        ))}
        {lists && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={() => void save()} disabled={!dirty || busy} style={primary}>{busy ? "Saving…" : "Save the lists"}</button>
            <button type="button" onClick={() => { setLists(DEFAULT_TASK_LISTS); setDirty(true); setMsg(null); }} style={small}>Reset to the code defaults</button>
            {msg && <span style={{ color: msg.startsWith("Saved") ? MINT : ROSE, fontSize: 12.5 }}>{msg}</span>}
          </div>
        )}
      </div>
    </details>
  );
}

// ------------------------------------------------------------------ bits

function Bar({ w, color, thin = false }: { w: number; color: string; thin?: boolean }) {
  return <div style={{ height: thin ? 4 : 12, width: `${Math.max(0, Math.min(1, w)) * 100}%`, minWidth: w > 0 ? 3 : 0, background: color, borderRadius: 6 }} />;
}

const card: CSSProperties = { border: `1px solid ${V3_EDGE}`, borderRadius: 14, padding: "16px 18px", marginTop: 16 };
const kicker: CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: V3_MUTED, marginBottom: 10, display: "block" };
const sub: CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: V3_GOLD, marginBottom: 6 };
const table: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th: CSSProperties = { textAlign: "left", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: V3_MUTED, padding: "4px 8px 8px", borderBottom: `1px solid ${V3_EDGE}` };
const td: CSSProperties = { padding: "7px 8px", borderBottom: `1px solid ${V3_EDGE}`, color: V3_CREAM, verticalAlign: "top" };
const primary: CSSProperties = { font: "inherit", fontSize: 12.5, fontWeight: 800, padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${V3_GOLD}`, background: "rgba(252,163,17,0.12)", color: V3_CREAM, cursor: "pointer" };
const small: CSSProperties = { font: "inherit", fontSize: 11.5, fontWeight: 700, padding: "4px 8px", borderRadius: 8, border: `1px solid ${V3_EDGE}`, background: "transparent", color: V3_CREAM, cursor: "pointer" };
const linkBtn: CSSProperties = { font: "inherit", fontSize: 12.5, color: V3_GOLD, background: "transparent", border: "none", cursor: "pointer", padding: 0 };
const input: CSSProperties = { flex: 1, font: "inherit", fontSize: 13, padding: "5px 8px", borderRadius: 8, border: `1px solid ${V3_EDGE}`, background: "rgba(245,239,230,0.05)", color: V3_CREAM, outline: "none" };
const selectStyle: CSSProperties = { font: "inherit", fontSize: 12.5, padding: "4px 8px", borderRadius: 8, border: `1px solid ${V3_EDGE}`, background: "#14213D", color: V3_CREAM };
