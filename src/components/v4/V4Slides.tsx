// STEP 2 · SLIDES (v4). Group by group: talk about how you teach it → the AI proposes teaching slides
// → keep, edit, drop, add your own or a placeholder → "Slides final".
//
// Lee, 2026-09-13: "I brainstorm by talking about how I teach each group (cheat codes, memorize-this,
// tricky questions, etc.). I don't pick slides from a menu … PLACEHOLDERS: … create a placeholder slide
// saying what it should be ('build this later: journal entry for ___'). Never get stuck or skip it.
// Placeholders should be easy to find later as a to-do list."
//
// The slides are the set's plan frames tagged with their group (frame.v4Group); the plan is read and
// saved through the same usePlan every v3 screen uses. Rich setup (a rubric's arrows, a picture, big
// format) stays in the Editor — each slide opens there.
import { useEffect, useMemo, useRef, useState } from "react";

import { getAdminWho } from "@/components/AdminGate";
import { usePlan } from "@/components/blastoff/BlastOffEditor";
import { FRAME_LABEL, newFrameId, patchFrame, type BlastFrame } from "@/components/blastoff/plan";
import { emptyRubric } from "@/components/blastoff/rubric";
import { V3_CREAM, V3_EDGE, V3_MUTED } from "@/components/v3/Shell";
import { blastOffPath } from "@/components/v3/use-bank";
import type { BoothSetInfo, BoothTopic } from "@/lib/talkthrough.functions";
import { useDictation } from "@/lib/use-dictation";
import { proposeV4Slides, v4EnsureProposal, v4LogEdit, v4MarkFinal } from "@/lib/v4.functions";

import type { V4SlideProposal } from "./slides-brief";
import { V4_AMBER, V4_MINT, V4_RED, v4Button, v4Field } from "./V4Chrome";
import type { V4TopicData } from "./V4TopicPage";
import { inferSlideGroups, isTeachingSlide, placeholderSlide } from "./v4-chain";
import type { V4Card } from "./v4-topic";

const ADD_KINDS: BlastFrame["kind"][] = ["cheat", "phrase", "tip", "tricky", "found", "ask", "rubric", "types", "teaser"];
const headingKey = (kind: BlastFrame["kind"]): "title" | "text" => (kind === "cheat" ? "title" : "text");
const wordsOf = (f: BlastFrame): string => (headingKey(f.kind) === "title" ? f.title : f.text) ?? "";

/** A proposed slide as a frame: a blank (or any slide with `needs` that isn't a rubric / types / teaser)
 *  is a placeholder; a rubric / types / teaser with `needs` is the real slide to set up; the rest carry
 *  their words. */
function frameFromProposal(p: V4SlideProposal, group: string): BlastFrame {
  const special = p.kind === "rubric" || p.kind === "types" || p.kind === "teaser";
  if (p.kind === "blank" || (p.needs && !special)) return placeholderSlide(newFrameId("blank"), p.needs ?? "", group);
  const base: BlastFrame = { id: newFrameId(p.kind), kind: p.kind, v4Group: group, ...(p.kind === "rubric" ? { rubric: emptyRubric() } : {}) };
  if (special) return p.needs ? { ...base, needs: p.needs } : base;
  return { ...base, ...(p.text ? { [headingKey(p.kind)]: p.text } : {}), ...(p.bullets?.length ? { bullets: p.bullets } : {}), ...(p.big ? { display: "big" as const } : {}) };
}

export function V4Slides({ data, onData, set, topic }: { data: V4TopicData; onData: (d: V4TopicData) => void; set: BoothSetInfo; topic: BoothTopic }) {
  const state = data.state!;
  const cards = data.cards as V4Card[];
  const { plan, commit, saving } = usePlan(set);
  const frames = plan?.frames ?? [];
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cardGroup = useMemo(() => { const m = new Map(cards.map((c) => [c.id, c.group])); return (id: string) => m.get(id) ?? null; }, [cards]);
  const who = getAdminWho();

  // Migrated slides get their group once, and the step's starting point is recorded once.
  const primed = useRef(false);
  useEffect(() => {
    if (!plan || primed.current) return;
    primed.current = true;
    const tagged = inferSlideGroups(plan.frames, cardGroup);
    const working = tagged ?? plan.frames;
    if (tagged) commit(tagged);
    const snapshot = state.groups.map((g) => ({ group: g.id, name: g.name, slides: working.filter((f) => isTeachingSlide(f) && f.v4Group === g.id).map((f) => ({ id: f.id, kind: f.kind, words: wordsOf(f), bullets: f.bullets ?? [], needs: f.needs ?? null })) }));
    void v4EnsureProposal({ data: { setId: data.setId, step: "slides", source: "migrated", snapshot } }).then((r) => { if (!r.ok) setWarn(r.error ?? null); });
  }, [plan, commit, cardGroup, state.groups, data.setId]);

  const log = (target: string, action: string, before: unknown, after: unknown) => {
    void v4LogEdit({ data: { setId: data.setId, step: "slides", target, action, before, after, who } }).then((r) => { if (!r.ok) setWarn(r.error ?? null); });
  };
  const addFrame = (f: BlastFrame, action: string, before: unknown = null) => {
    // After the group's last teaching slide (or at the end) — the Chain step orders everything anyway.
    const lastIdx = frames.map((x, i) => (isTeachingSlide(x) && x.v4Group === f.v4Group ? i : -1)).filter((i) => i >= 0).pop();
    const next = [...frames];
    next.splice(lastIdx === undefined ? next.length : lastIdx + 1, 0, f);
    commit(next);
    log(f.id, action, before, { kind: f.kind, words: wordsOf(f), bullets: f.bullets ?? [], needs: f.needs ?? null });
  };

  const finalize = async () => {
    setBusy(true); setErr(null);
    try {
      const snapshot = state.groups.map((g) => ({ group: g.id, name: g.name, slides: frames.filter((f) => isTeachingSlide(f) && f.v4Group === g.id).map((f) => ({ id: f.id, kind: f.kind, words: wordsOf(f), bullets: f.bullets ?? [], needs: f.needs ?? null })) }));
      const r = await v4MarkFinal({ data: { setId: data.setId, step: "slides", snapshot } });
      onData({ ...data, state: r.state });
      setWarn(r.logWarning);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const placeholders = frames.filter((f) => isTeachingSlide(f) && f.needs).length;
  const untagged = frames.filter((f) => isTeachingSlide(f) && (!f.v4Group || !state.groups.some((g) => g.id === f.v4Group)));
  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 14px", border: `1px solid ${V3_EDGE}`, borderRadius: 12 }}>
        <span style={{ fontSize: 13.5, color: V3_CREAM }}>
          <b>{frames.filter(isTeachingSlide).length}</b> teaching slides · <span style={{ color: placeholders ? V4_AMBER : V3_MUTED }}>{placeholders} placeholder{placeholders === 1 ? "" : "s"}</span>
        </span>
        <span style={{ fontSize: 12, color: V3_MUTED }}>{saving ?? ""}</span>
        <span style={{ flex: 1 }} />
        {state.final.slides && <span style={{ fontSize: 12.5, color: V4_MINT, fontWeight: 700 }}>✓ Final</span>}
        <button type="button" onClick={() => void finalize()} disabled={busy || !plan} style={{ ...v4Button("gold"), fontSize: 13.5, padding: "8px 16px" }}>{state.final.slides ? "Mark final again" : "Slides final"}</button>
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: V3_MUTED }}>Don't edit this set in the v3 Editor in another tab at the same time — the last save wins.</div>
      {err && <div style={{ marginTop: 8, fontSize: 13, color: V4_RED }}>{err}</div>}
      {warn && <div style={{ marginTop: 8, fontSize: 12.5, color: V4_AMBER }}>Saved, but not recorded for learning — {warn}</div>}
      {!plan && <div style={{ marginTop: 12, fontSize: 13, color: V3_MUTED }}>Loading the slides…</div>}

      {plan && state.groups.map((g) => (
        <GroupSlides key={g.id} group={g} topicName={topic.name} setId={data.setId}
          questions={cards.filter((c) => c.group === g.id && !c.rejected && !c.noteOnly)}
          slides={frames.filter((f) => isTeachingSlide(f) && f.v4Group === g.id)}
          editorHref={(id) => `${blastOffPath(topic, set, "results")}?frame=${encodeURIComponent(id)}`}
          onPatch={(f, p) => { commit(patchFrame(frames, f.id, p)); log(f.id, "edit", { kind: f.kind, words: wordsOf(f), bullets: f.bullets ?? [], needs: f.needs ?? null }, { kind: p.kind ?? f.kind, words: p[headingKey(p.kind ?? f.kind)] ?? wordsOf(f), bullets: p.bullets ?? f.bullets ?? [], needs: "needs" in p ? p.needs ?? null : f.needs ?? null }); }}
          onRemove={(f) => { commit(frames.filter((x) => x.id !== f.id)); log(f.id, "remove", { kind: f.kind, words: wordsOf(f), needs: f.needs ?? null }, null); }}
          onMove={(f, dir) => {
            const mine = frames.map((x, i) => ({ x, i })).filter(({ x }) => isTeachingSlide(x) && x.v4Group === g.id);
            const k = mine.findIndex(({ x }) => x.id === f.id);
            const other = mine[k + dir];
            if (!other) return;
            const next = [...frames];
            [next[mine[k].i], next[other.i]] = [next[other.i], next[mine[k].i]];
            commit(next);
          }}
          onAdd={(f, action, before) => addFrame(f, action, before)}
          setWarn={setWarn} />
      ))}

      {plan && untagged.length > 0 && (
        <section style={{ marginTop: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: V3_MUTED }}>Slides not in a group · {untagged.length}</div>
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
            {untagged.map((f) => (
              <div key={f.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: V3_CREAM }}>
                <span style={{ minWidth: 110, color: V3_MUTED }}>{FRAME_LABEL[f.kind]}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wordsOf(f) || f.needs || "(no words)"}</span>
                <select defaultValue="" onChange={(e) => { if (e.target.value) { commit(patchFrame(frames, f.id, { v4Group: e.target.value })); log(f.id, "group", null, e.target.value); } }} style={{ ...v4Field, width: 200, padding: "4px 8px", colorScheme: "dark" }}>
                  <option value="">Put in a group…</option>
                  {state.groups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function GroupSlides({ group, topicName, setId, questions, slides, editorHref, onPatch, onRemove, onMove, onAdd, setWarn }: {
  group: { id: string; name: string }; topicName: string; setId: string; questions: V4Card[]; slides: BlastFrame[];
  editorHref: (frameId: string) => string;
  onPatch: (f: BlastFrame, p: Partial<BlastFrame>) => void; onRemove: (f: BlastFrame) => void; onMove: (f: BlastFrame, dir: -1 | 1) => void;
  onAdd: (f: BlastFrame, action: string, before?: unknown) => void; setWarn: (w: string | null) => void;
}) {
  const [talk, setTalk] = useState("");
  const [interim, setInterim] = useState("");
  const mic = useDictation((final, live) => { setInterim(live); if (final.trim()) setTalk((t) => `${t} ${final}`.trim()); });
  const [proposing, setProposing] = useState(false);
  const [proposal, setProposal] = useState<V4SlideProposal[] | null>(null);
  const [perr, setPerr] = useState<string | null>(null);
  const [showQs, setShowQs] = useState(false);

  const propose = async () => {
    if (mic.on) { mic.stop(); setInterim(""); }
    setProposing(true); setPerr(null);
    try {
      const r = await proposeV4Slides({ data: { setId, topicName, groupId: group.id, talk: `${talk} ${interim}`.trim() } });
      setProposal(r.slides);
      if (r.logWarning) setWarn(r.logWarning);
      if (!r.slides.length) setPerr("It didn't propose anything — say a bit more about how you teach this group.");
    } catch (e) { setPerr(e instanceof Error ? e.message : String(e)); }
    finally { setProposing(false); }
  };

  return (
    <section style={{ marginTop: 20, border: `1px solid ${V3_EDGE}`, borderRadius: 14, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 16, fontWeight: 900, color: V3_CREAM }}>{group.name}</span>
        <button type="button" onClick={() => setShowQs((v) => !v)} style={{ all: "unset", cursor: "pointer", fontSize: 12, color: V3_MUTED }}>{questions.length} question{questions.length === 1 ? "" : "s"} {showQs ? "▾" : "▸"}</button>
      </div>
      {showQs && (
        <ol style={{ margin: "6px 0 0", paddingLeft: 20, fontSize: 12.5, color: V3_MUTED, lineHeight: 1.5 }}>
          {questions.map((q) => <li key={q.id}>{q.stem}{q.placeholder ? " (placeholder)" : ""}</li>)}
        </ol>
      )}

      {/* TALK → PROPOSE */}
      <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "flex-start" }}>
        <textarea value={mic.on && interim ? `${talk} ${interim}`.trim() : talk} onChange={(e) => { setInterim(""); setTalk(e.target.value); }} rows={2}
          placeholder="Talk (or type) how you teach this group — the cheat code, what to memorize, the trap on the exam…" style={{ ...v4Field, resize: "vertical" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {mic.supported && <button type="button" onClick={() => { if (mic.on) { mic.stop(); setInterim(""); } else mic.start(); }} style={{ ...v4Button(), color: mic.on ? V4_RED : V3_CREAM, borderColor: mic.on ? V4_RED : V3_EDGE }}>{mic.on ? "● stop" : "🎙 Talk"}</button>}
          <button type="button" onClick={() => void propose()} disabled={proposing} style={{ ...v4Button("gold"), opacity: proposing ? 0.6 : 1 }}>{proposing ? "Thinking…" : "Propose slides"}</button>
        </div>
      </div>
      {perr && <div style={{ marginTop: 6, fontSize: 12.5, color: V4_RED }}>{perr}</div>}
      {proposal && proposal.length > 0 && (
        <div style={{ marginTop: 10, border: `1px dashed ${V3_EDGE}`, borderRadius: 10, padding: "8px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: V3_MUTED, letterSpacing: "0.1em", textTransform: "uppercase" }}>Proposed</span>
            <span style={{ flex: 1 }} />
            <button type="button" style={v4Button("gold")} onClick={() => { for (const p of proposal) onAdd(frameFromProposal(p, group.id), "keep", p); setProposal(null); }}>Add all</button>
            <button type="button" style={{ ...v4Button(), color: V3_MUTED }} onClick={() => setProposal(null)}>Dismiss</button>
          </div>
          {proposal.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, fontSize: 13, color: V3_CREAM }}>
              <span style={{ minWidth: 110, color: p.kind === "blank" || p.needs ? V4_AMBER : V3_MUTED }}>{p.kind === "blank" || p.needs ? `${p.kind === "blank" ? "Placeholder" : FRAME_LABEL[p.kind]} · to build` : FRAME_LABEL[p.kind]}{p.big ? " · big" : ""}</span>
              <span style={{ flex: 1 }}>{p.needs ?? [p.text, ...(p.bullets ?? [])].filter(Boolean).join(" · ")}</span>
              <button type="button" style={v4Button()} onClick={() => { onAdd(frameFromProposal(p, group.id), "keep", p); setProposal((ps) => (ps ? ps.filter((_, k) => k !== i) : ps)); }}>Add</button>
              <button type="button" style={{ ...v4Button(), color: V3_MUTED }} onClick={() => setProposal((ps) => (ps ? ps.filter((_, k) => k !== i) : ps))}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* THE GROUP'S SLIDES */}
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {slides.length === 0 && <div style={{ fontSize: 12.5, color: V3_MUTED }}>No teaching slides yet.</div>}
        {slides.map((f, i) => <SlideRow key={f.id} f={f} first={i === 0} last={i === slides.length - 1} editorHref={editorHref(f.id)} onPatch={(p) => onPatch(f, p)} onRemove={() => onRemove(f)} onMove={(d) => onMove(f, d)} />)}
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select defaultValue="" onChange={(e) => { const k = e.target.value as BlastFrame["kind"]; e.target.value = ""; if (k) onAdd({ id: newFrameId(k), kind: k, v4Group: group.id, ...(k === "rubric" ? { rubric: emptyRubric() } : {}) }, "add"); }} style={{ ...v4Field, width: 190, padding: "5px 8px", colorScheme: "dark" }}>
          <option value="">+ Add a slide…</option>
          {ADD_KINDS.map((k) => <option key={k} value={k}>{FRAME_LABEL[k]}</option>)}
        </select>
        <button type="button" style={{ ...v4Button(), color: V4_AMBER, borderColor: `${V4_AMBER}88` }} onClick={() => { const needs = window.prompt("What should this slide be? (e.g. journal entry for prepaid rent)"); if (needs?.trim()) onAdd(placeholderSlide(newFrameId("blank"), needs.trim(), group.id), "add-placeholder"); }}>+ Placeholder</button>
      </div>
    </section>
  );
}

function SlideRow({ f, first, last, editorHref, onPatch, onRemove, onMove }: { f: BlastFrame; first: boolean; last: boolean; editorHref: string; onPatch: (p: Partial<BlastFrame>) => void; onRemove: () => void; onMove: (d: -1 | 1) => void }) {
  const key = headingKey(f.kind);
  const [words, setWords] = useState(wordsOf(f));
  const [bullets, setBullets] = useState((f.bullets ?? []).join("\n"));
  const [needs, setNeeds] = useState(f.needs ?? "");
  const placeholder = !!f.needs;
  const textKind = !["rubric", "types", "teaser", "cycle"].includes(f.kind) && f.kind !== "blank";
  return (
    <div style={{ border: `1px solid ${placeholder ? `${V4_AMBER}88` : V3_EDGE}`, borderRadius: 10, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: placeholder ? V4_AMBER : V3_MUTED, minWidth: 110 }}>{f.kind === "blank" ? "Placeholder" : FRAME_LABEL[f.kind]}{placeholder && f.kind !== "blank" ? " · to set up" : ""}{f.display === "big" ? " · big" : ""}</span>
        <span style={{ flex: 1 }} />
        <button type="button" disabled={first} onClick={() => onMove(-1)} style={{ ...v4Button(), padding: "2px 8px" }}>↑</button>
        <button type="button" disabled={last} onClick={() => onMove(1)} style={{ ...v4Button(), padding: "2px 8px" }}>↓</button>
        <a href={editorHref} target="_blank" rel="noreferrer" style={{ ...v4Button(), padding: "2px 8px", textDecoration: "none" }} title="Open this slide in the Editor — pictures, big format, rubric arrows, space walk">✨ Editor</a>
        <button type="button" onClick={onRemove} style={{ ...v4Button("red"), padding: "2px 8px" }}>✕</button>
      </div>
      {textKind && (
        <>
          <input value={words} onChange={(e) => setWords(e.target.value)} onBlur={() => { if (words !== wordsOf(f)) onPatch({ [key]: words } as Partial<BlastFrame>); }} placeholder="The heading" style={{ ...v4Field, fontWeight: 700 }} />
          <textarea value={bullets} onChange={(e) => setBullets(e.target.value)} onBlur={() => { const next = bullets.split("\n").map((b) => b.trimEnd()).filter((b) => b.trim()); if (JSON.stringify(next) !== JSON.stringify(f.bullets ?? [])) onPatch({ bullets: next }); }} rows={Math.max(1, Math.min(5, bullets.split("\n").length))} placeholder="Lines under it — one per line (optional)" style={{ ...v4Field, fontSize: 12.5, resize: "vertical" }} />
        </>
      )}
      {placeholder ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input value={needs} onChange={(e) => setNeeds(e.target.value)} onBlur={() => { if (needs.trim() && needs !== f.needs) onPatch({ needs: needs.trim(), ...(f.kind === "blank" ? { text: `⚠ BUILD THIS LATER — ${needs.trim()}` } : {}) }); }} style={{ ...v4Field, fontSize: 12.5, borderColor: `${V4_AMBER}88` }} />
          <button type="button" onClick={() => onPatch({ needs: undefined })} style={{ ...v4Button(), color: V4_MINT, borderColor: `${V4_MINT}88` }} title={f.kind === "blank" ? "Mark it built — replace the blank with the real slide in the Editor first" : "It's set up now"}>Resolve</button>
        </div>
      ) : !textKind && <div style={{ fontSize: 12, color: V3_MUTED }}>Set this one up in the Editor.</div>}
    </div>
  );
}
