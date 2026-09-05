// THE ILLUSTRATOR (the right panel's face). Lee brainstorms out loud — the mic or the box —
// the AI preps the prompt, Lee sees a title and three bullets (the full prompt behind a
// toggle), confirms, generates; or says what to change and gets a new draft. A picture can
// reference another slide's (same cast, same props, same seed) so a set's pictures rhyme.
//
// Below that, the same controls as before: the animation, Generate / Regenerate, Bank,
// Remove, and the three server states (not signed in · no key · key present + Test the key).
// Hoisted function declarations only — this file sits beside the canvas graph.
import { useEffect, useRef, useState } from "react";

import { getAdminWho } from "@/components/AdminGate";
import { installPasscodeSession } from "@/lib/admin-session.functions";
import { generateIllustration, illustrationStatus, testIllustrationKey } from "@/lib/illustrate.functions";
import { runMicro } from "@/lib/talkthrough.functions";

import { ANIMATION_LABEL, ANIMATION_PRESETS, PROMPTING_TIPS, emptyIllustration, illustrationStyle, isStaleIllustration, type FrameIllustration } from "./illustration";
import { buildBriefMessages, parseBrief, type IllustrationBrief } from "./illustration-brief";
import { FRAME_LABEL, insertStem, type BlastFrame } from "./plan";

const GOLD = "#FCA311", CREAM = "#F4EFE6", MUTED = "#9AA3B8", EDGE = "rgba(244,239,230,0.16)", ORANGE = "#FF9F43", MINT = "#3BF5A0";
const chip = (on: boolean, color = GOLD): React.CSSProperties => ({
  border: `1px solid ${on ? color : EDGE}`, background: on ? `${color}22` : "transparent", color: on ? color : CREAM,
  borderRadius: 9, padding: "4px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
});
const field: React.CSSProperties = {
  width: "100%", background: "rgba(9,13,26,0.7)", border: `1px solid ${EDGE}`, borderRadius: 9, color: CREAM,
  padding: "7px 9px", fontSize: 13, lineHeight: 1.45, fontFamily: "inherit", boxSizing: "border-box",
};
const subhead: React.CSSProperties = { fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED, fontWeight: 800 };

type Avail = { signedIn: boolean; configured: boolean; provider: string; keyLength: number };

/** The browser's own dictation (Chrome). Live words land in the box as Lee talks. */
function useDictation(onWords: (final: string, interim: string) => void) {
  const recRef = useRef<{ stop: () => void } | null>(null);
  const [on, setOn] = useState(false);
  const supported = typeof window !== "undefined" && !!((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);
  function stop() { recRef.current?.stop(); recRef.current = null; setOn(false); }
  function start() {
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition; if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = true; rec.interimResults = true; rec.lang = "en-US";
    rec.onresult = (e) => {
      let final = "", interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) final += r[0].transcript + " "; else interim += r[0].transcript; }
      onWords(final, interim);
    };
    rec.onend = () => { if (recRef.current === rec) { recRef.current = null; setOn(false); } };
    rec.onerror = () => { recRef.current = null; setOn(false); };
    rec.start(); recRef.current = rec; setOn(true);
  }
  useEffect(() => () => { recRef.current?.stop(); }, []);
  return { supported, on, start, stop };
}
interface SpeechRec { continuous: boolean; interimResults: boolean; lang: string; start: () => void; stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null }

export function IllustrationPanel({ sel, setId, setName, frames, onPatch }: {
  sel: BlastFrame; setId: string; setName: string; frames: readonly BlastFrame[]; onPatch: (p: Partial<BlastFrame>) => void;
}) {
  const ill = sel.illustration ?? null;
  const style = illustrationStyle(ill?.stylePreset);
  const stale = isStaleIllustration(ill);
  const teaching = () => (ill?.teachingIntent ?? "").trim() || insertStem(sel) || (sel.bullets ?? []).join("; ") || "";

  // THE BRAINSTORM → THE BRIEF
  const [words, setWords] = useState(ill?.brief ?? "");
  const [interim, setInterim] = useState("");
  const [brief, setBrief] = useState<IllustrationBrief | null>(ill?.summary && ill.prompt ? { title: ill.summary.title, bullets: ill.summary.bullets, prompt: ill.prompt } : null);
  const [revision, setRevision] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [refId, setRefId] = useState<string>(ill?.referenceFrameId ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tips, setTips] = useState(false);
  useEffect(() => {
    setWords(ill?.brief ?? ""); setInterim(""); setRevision(""); setErr(null);
    setBrief(ill?.summary && ill.prompt ? { title: ill.summary.title, bullets: ill.summary.bullets, prompt: ill.prompt } : null);
    setRefId(ill?.referenceFrameId ?? "");
  }, [sel.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const dictation = useDictation((final, live) => { if (final) setWords((w) => (w ? w.replace(/\s+$/, "") + " " : "") + final.trim()); setInterim(live); });

  // Other slides' pictures — the ones this one can rhyme with.
  const references = frames.filter((f) => f.id !== sel.id && f.illustration?.prompt).map((f) => ({
    id: f.id, label: f.illustration?.summary?.title || (f.illustration?.prompt ?? "").slice(0, 40) || FRAME_LABEL[f.kind], prompt: f.illustration!.prompt!, seed: f.illustration?.seed ?? null, title: f.illustration?.summary?.title ?? FRAME_LABEL[f.kind],
  }));
  const ref = references.find((r) => r.id === refId) ?? null;

  const keep = (patch: Partial<FrameIllustration>) => onPatch({ illustration: { ...(ill ?? emptyIllustration()), requested: true, ...patch } });

  async function draft(revise: boolean) {
    const said = words.trim();
    if (!said) { setErr("Say it first — what's in the picture, in your own words."); return; }
    setDrafting(true); setErr(null);
    try {
      const m = buildBriefMessages({
        brainstorm: said, teachingIntent: teaching() || null, setName,
        reference: ref ? { title: ref.title, prompt: ref.prompt } : null,
        previous: revise && brief ? { title: brief.title, prompt: brief.prompt } : null,
        revision: revise ? revision.trim() || null : null,
      });
      const r = await runMicro({ data: { system: m.system, user: m.user, maxOutput: 500 } });
      const b = parseBrief(r.text);
      if (!b) throw new Error("The draft didn't come back clean — try once more, or say it a little differently.");
      setBrief(b); setRevision(""); setShowPrompt(false);
      keep({ brief: said, summary: { title: b.title, bullets: b.bullets }, prompt: b.prompt, teachingIntent: teaching() || null, referenceFrameId: refId || null });
    } catch (e) { setErr((e as Error).message); }
    finally { setDrafting(false); }
  }
  function useMyWords() {
    const said = words.trim(); if (!said) return;
    const b: IllustrationBrief = { title: said.split(/[,.]/)[0].slice(0, 40), bullets: [said.slice(0, 80), "as spoken — no AI prep", "no text unless you quoted it"], prompt: said };
    setBrief(b); keep({ brief: said, summary: { title: b.title, bullets: b.bullets }, prompt: said, teachingIntent: teaching() || null });
  }

  async function generate(reseed: boolean) {
    const subject = (brief?.prompt ?? "").trim();
    if (!subject) { setErr("Prep the prompt first."); return; }
    setBusy(true); setErr(null);
    try {
      // A referenced picture's seed makes the composition rhyme; otherwise the slide's own seed
      // unless Lee asked for a fresh roll.
      const seed = ref?.seed ?? (reseed || !ill?.seed ? undefined : ill.seed);
      const r = await generateIllustration({ data: { setId, frameId: sel.id, prompt: subject, teachingIntent: teaching() || null, stylePreset: style.id, ...(seed !== undefined ? { seed } : {}) } });
      keep({
        brief: words.trim() || ill?.brief || null, summary: brief ? { title: brief.title, bullets: brief.bullets } : ill?.summary ?? null, referenceFrameId: refId || null,
        prompt: subject, teachingIntent: teaching() || null,
        provider: r.provider, stylePreset: r.stylePreset, styleVersion: r.styleVersion, assetUrl: r.url, localAssetId: r.path,
        animationPreset: ill?.animationPreset ?? style.defaultAnimation, generatedAt: r.generatedAt, seed: r.seed,
      });
    } catch (e) { setErr((e as Error).message || "Couldn't generate. Your words are kept — try again."); }
    finally { setBusy(false); }
  }

  // THE SERVER: signed in? key? — named states, and a free test.
  const [avail, setAvail] = useState<Avail | null>(null);
  const [availErr, setAvailErr] = useState<string | null>(null);
  const [pass, setPass] = useState("");
  const [keyTest, setKeyTest] = useState<string | null>(null);
  const checkAvail = () => { illustrationStatus().then((s) => { setAvail(s); setAvailErr(null); }).catch((e) => { setAvail(null); setAvailErr((e as Error).message); }); };
  useEffect(() => { checkAvail(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const signIn = async () => {
    setKeyTest(null);
    try {
      const r = await installPasscodeSession({ data: { passcode: pass, who: getAdminWho() === "king" ? "king" : "lee" } });
      if (!r.ok) { setKeyTest(r.error ?? "Wrong passcode."); return; }
      setPass(""); checkAvail();
    } catch (e) { setKeyTest((e as Error).message); }
  };
  const testKey = async () => {
    setKeyTest("Asking Recraft…");
    try { const r = await testIllustrationKey(); setKeyTest(r.ok ? `✓ Key works — ${r.credits ?? "?"} API units left${r.email ? ` (${r.email})` : ""}.` : `✗ ${r.error ?? "rejected"}`); }
    catch (e) { setKeyTest(`✗ ${(e as Error).message}`); }
  };

  const ready = !!avail?.configured;
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ ...subhead, display: "flex", alignItems: "center", gap: 8 }}>
        🎨 Illustration
        <button type="button" onClick={() => setTips((v) => !v)} title="What makes a picture come out right the first time"
          style={{ marginLeft: "auto", width: 18, height: 18, borderRadius: 9, border: `1px solid ${GOLD}88`, background: tips ? GOLD : "transparent", color: tips ? "#17130A" : GOLD, fontSize: 11, fontWeight: 800, cursor: "pointer", lineHeight: 1 }}>?</button>
      </div>
      {tips && (
        <ul style={{ margin: "6px 0 0", padding: "8px 10px 8px 22px", border: `1px solid ${EDGE}`, borderRadius: 8, fontSize: 11, color: CREAM, lineHeight: 1.45 }}>
          {PROMPTING_TIPS.map((t, i) => <li key={i} style={{ margin: "2px 0" }}>{t}</li>)}
        </ul>
      )}

      {/* 1. SAY IT */}
      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: MUTED }}>Say it — what's in the picture, in your words</span>
        <span style={{ flex: 1 }} />
        {dictation.supported && (
          <button type="button" onClick={() => (dictation.on ? dictation.stop() : dictation.start())} style={chip(dictation.on, ORANGE)} title={dictation.on ? "Stop listening" : "Talk — the words land here as you speak (Chrome)"}>
            {dictation.on ? "■ listening…" : "🎙 Speak"}
          </button>
        )}
      </div>
      <textarea rows={3} style={{ ...field, marginTop: 4, resize: "vertical" }} value={words + (interim ? (words ? " " : "") + interim : "")}
        onChange={(e) => { setInterim(""); setWords(e.target.value); }}
        placeholder="e.g. a suited guy at his desk with a magnifying glass over the financials, the report says OUR COMPANY, and outside the window an investor is peering in at the same report" />
      <div className="flex" style={{ gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" disabled={drafting || !words.trim()} onClick={() => void draft(false)} style={{ ...chip(true, GOLD), opacity: drafting || !words.trim() ? 0.5 : 1 }}>
          {drafting ? "Prepping…" : brief ? "Prep again from my words" : "Prep the prompt"}
        </button>
        <button type="button" disabled={!words.trim()} onClick={useMyWords} style={{ ...chip(false, GOLD), opacity: words.trim() ? 1 : 0.5 }} title="Skip the prep — my words are the prompt">Use my words as-is</button>
        {references.length > 0 && (
          <select value={refId} onChange={(e) => { setRefId(e.target.value); keep({ referenceFrameId: e.target.value || null }); }} title="Rhyme with another slide's picture — same cast, same props, same seed"
            style={{ ...field, width: "auto", padding: "3px 6px", fontSize: 11 }}>
            <option value="">no reference</option>
            {references.map((r) => <option key={r.id} value={r.id}>rhymes with: {r.label}</option>)}
          </select>
        )}
      </div>

      {/* 2. THE BRIEF — a title, three bullets, the prompt behind a toggle */}
      {brief && (
        <div style={{ marginTop: 10, border: `1px solid ${GOLD}55`, borderRadius: 10, padding: "8px 10px" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: CREAM }}>{brief.title}</div>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12, color: CREAM, lineHeight: 1.45, opacity: 0.92 }}>
            {brief.bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
          {ref && <div style={{ marginTop: 4, fontSize: 10.5, color: MUTED }}>rhymes with “{ref.label}” — same cast, same seed</div>}
          <details open={showPrompt} onToggle={(e) => setShowPrompt((e.currentTarget as HTMLDetailsElement).open)} style={{ marginTop: 6 }}>
            <summary style={{ fontSize: 10.5, color: MUTED, cursor: "pointer" }}>the full prompt (edit if you must)</summary>
            <textarea rows={3} style={{ ...field, marginTop: 4, resize: "vertical", fontSize: 12 }} value={brief.prompt}
              onChange={(e) => { const b = { ...brief, prompt: e.target.value }; setBrief(b); keep({ prompt: e.target.value }); }} />
            <div style={{ fontSize: 10.5, color: MUTED, marginTop: 2 }}>The preset adds the style, the black ground and the palette around this.</div>
          </details>
          <div className="flex" style={{ gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" disabled={busy || !ready} onClick={() => void generate(!!ill?.assetUrl)} style={{ ...chip(true, MINT), opacity: busy || !ready ? 0.5 : 1, cursor: busy ? "wait" : "pointer" }} title={ready ? "Spend one generation on this brief" : "Sign in / add the key below first"}>
              {busy ? "Generating…" : ill?.assetUrl ? "✓ Looks good — regenerate" : "✓ Looks good — generate"}
            </button>
            <input value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="or: what to change…" onKeyDown={(e) => { if (e.key === "Enter" && revision.trim()) void draft(true); }}
              style={{ ...field, flex: 1, minWidth: 140, padding: "4px 8px", fontSize: 12 }} />
            <button type="button" disabled={drafting || !revision.trim()} onClick={() => void draft(true)} style={{ ...chip(false, GOLD), opacity: drafting || !revision.trim() ? 0.5 : 1 }}>Revise</button>
          </div>
        </div>
      )}
      {err && <div style={{ marginTop: 6, fontSize: 11, color: ORANGE }}>{err}</div>}

      {/* 3. THE PICTURE'S CONTROLS */}
      <div className="flex" style={{ gap: 5, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
        <span style={{ fontSize: 10.5, color: MUTED }}>{style.label} · v{style.version}{stale ? " · " : ""}{stale && <span style={{ color: ORANGE, fontWeight: 800 }}>stale — regenerate</span>}</span>
        <span style={{ flex: 1 }} />
        {ANIMATION_PRESETS.map((a) => (
          <button key={a} style={chip((ill?.animationPreset ?? style.defaultAnimation) === a, ORANGE)} title={ANIMATION_LABEL[a]} disabled={!ill?.assetUrl}
            onClick={() => ill && onPatch({ illustration: { ...ill, animationPreset: a } })}>{ANIMATION_LABEL[a]}</button>
        ))}
      </div>
      <div className="flex" style={{ gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
        {!ill?.assetUrl && words.trim() && !brief && <button type="button" onClick={() => keep({ brief: words.trim(), prompt: ill?.prompt ?? null, teachingIntent: teaching() || null })} style={chip(false, GOLD)} title="Keep the idea on the slide without spending a generation">Bank the idea</button>}
        {ill && <button type="button" onClick={() => onPatch({ illustration: null })} style={chip(false, ORANGE)} title="Clear the picture and the idea from this slide">Remove</button>}
        {ill?.assetUrl && <span style={{ fontSize: 10.5, color: MUTED }}>seed {ill.seed} · {ill.generatedAt ? new Date(ill.generatedAt).toLocaleDateString() : ""}</span>}
      </div>
      {ill?.assetUrl && <div style={{ marginTop: 6, fontSize: 10.5, color: MUTED }}>It's on the slide to the left — drag it to move, the corner grip resizes{ill.placement ? "" : " (a blank slide's sits dead centre)"}. Regenerate keeps the brief and rolls a new seed; revise the brief when the subject is wrong.</div>}
      {ill?.placement && <button type="button" onClick={() => onPatch({ illustration: { ...ill, placement: null } })} style={{ ...chip(false, GOLD), marginTop: 6 }} title="Back to the band under the card">Snap back under the card</button>}

      {/* 4. THE SERVER — named states */}
      <div style={{ marginTop: 10, borderTop: `1px solid ${EDGE}`, paddingTop: 8 }}>
        {availErr && <div style={{ fontSize: 11, color: ORANGE }}>Couldn't check the server: {availErr}</div>}
        {avail && !avail.signedIn && (
          <div style={{ padding: "8px 10px", border: `1px solid ${ORANGE}88`, borderRadius: 8, fontSize: 11, color: CREAM, lineHeight: 1.45 }}>
            <b style={{ color: ORANGE }}>Not signed in on the server.</b> Generating costs money, so it needs the team passcode exchanged for a server session — once per browser, per month.
            <div className="flex" style={{ gap: 6, marginTop: 6 }}>
              <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void signIn(); }} placeholder="team passcode" style={{ ...field, flex: 1, minHeight: 0, padding: "4px 8px" }} />
              <button type="button" onClick={() => void signIn()} style={chip(true, GOLD)}>Sign in</button>
            </div>
          </div>
        )}
        {avail && avail.signedIn && !avail.configured && (
          <div style={{ fontSize: 11, color: ORANGE }}>Signed in, but the server has no {avail.provider} key: RECRAFT_API_KEY is empty on this deployment. Add it in Vercel (Production ticked), redeploy, reload.</div>
        )}
        {avail && avail.configured && (
          <div className="flex" style={{ gap: 8, alignItems: "center", fontSize: 10.5, color: MUTED }}>
            <span>Key present on the server ({avail.keyLength} chars).</span>
            <button type="button" onClick={() => void testKey()} style={chip(false, GOLD)} title="One free call to Recraft — proves the key and shows the balance">Test the key</button>
          </div>
        )}
        {keyTest && <div style={{ marginTop: 4, fontSize: 11, color: keyTest.startsWith("✓") ? MINT : ORANGE }}>{keyTest}</div>}
      </div>
    </div>
  );
}
