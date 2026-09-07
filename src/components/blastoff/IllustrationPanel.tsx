// THE ILLUSTRATOR (the right panel's face). Lee brainstorms out loud — the mic or the box —
// and ONE click does the rest (2026-09-07, Lee: "No more 'prep the prompt' just generate the
// illustration. Another way to speed up."): the AI writes the brief in the background and, the
// moment it parses, draws; the title and three bullets show AFTER, beside the picture, the full
// prompt still in a fold (2026-09-05: "I don't really need to read the full prompt, leave it in
// a toggle"). "Brief only" stays as a small secondary for the rare read-it-first, and "my words
// exactly" skips the AI rewrite. Says what to change → a new brief → drawn. A picture can
// reference another slide's (same cast, same props, same seed) so a set's pictures rhyme.
//
// THE THREE-REVISION CAP (Lee, 2026-09-07: "Max of 3 revisions for illustrations, to save on
// cost."): three draws per subject per frame, counted on the frame (`attempts`) and checked
// again on the server against the library. After three, Regenerate is off, the library is the
// offer, and "I know, draw anyway" sits behind a second click — Lee's money, his call.
//
// Below that, the same controls as before: the animation, Bank, Remove, and the three server
// states (not signed in · no key · key present + Test the key).
// Hoisted function declarations only — this file sits beside the canvas graph.
import { useEffect, useRef, useState } from "react";

import { getAdminWho } from "@/components/AdminGate";
import { uploadReferencePhoto } from "@/components/ideas/upload";
import { topicOfSet, useBank } from "@/components/v3/use-bank";
import { installPasscodeSession } from "@/lib/admin-session.functions";
import { logCostEvent } from "@/lib/cost-ledger.functions";
import { generateIllustration, illustrationStatus, listIllustrationLibrary, testIllustrationKey, type LibraryRow } from "@/lib/illustrate.functions";
import { runMicro } from "@/lib/talkthrough.functions";
import { useDictation } from "@/lib/use-dictation";

import { ANIMATION_LABEL, ANIMATION_PRESETS, ILLUSTRATION_REVISION_CAP, PROMPTING_TIPS, REVISION_CAP_MESSAGE, composeIllustrationPrompt, defaultStyleIdFor, emptyIllustration, illustrationStyle, isOffStyleIllustration, isStaleIllustration, revisionsLeft, type FrameIllustration } from "./illustration";
import { BRIEF_SYSTEM, buildBriefMessages, parseBrief, type IllustrationBrief } from "./illustration-brief";
import { FRAME_LABEL, insertStem, type BlastFrame } from "./plan";
import { useIllustrationRegistry } from "./use-illustration-registry";

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

export function IllustrationPanel({ sel, setId, setName, frames, onPatch }: {
  sel: BlastFrame; setId: string; setName: string; frames: readonly BlastFrame[]; onPatch: (p: Partial<BlastFrame>) => void;
}) {
  const ill = sel.illustration ?? null;
  // WHICH HOUSE STYLE (2026-09-06, v5): riso for exam content, watercolor for the strategy
  // shorts — decided by the set's topic kind from the bank (BoothTopic.kind === "strategy").
  // Until the bank loads, kind is undefined and the exam default applies; a frame that already
  // carries a preset keeps it either way (never rewritten silently — the switch below is the
  // only way it changes).
  const { topics } = useBank();
  const kind = topics ? topicOfSet(topics, setId)?.kind : undefined;
  // THE REGISTRY (2026-09-06, v6): the DB-backed styles and settings from
  // /admin/illustrations/styles — the code registry until it arrives, so nothing here waits.
  const { registry: reg } = useIllustrationRegistry();
  const houseId = defaultStyleIdFor(kind, reg);
  const style = illustrationStyle(ill?.stylePreset ?? houseId, reg);
  const stale = isStaleIllustration(ill, reg);
  const offStyle = isOffStyleIllustration(ill, kind, reg);
  const teaching = () => (ill?.teachingIntent ?? "").trim() || insertStem(sel) || (sel.bullets ?? []).join("; ") || "";

  // THE BRAINSTORM → THE BRIEF
  const [words, setWords] = useState(ill?.brief ?? "");
  const [interim, setInterim] = useState("");
  const [brief, setBrief] = useState<IllustrationBrief | null>(ill?.summary && ill.prompt ? { title: ill.summary.title, bullets: ill.summary.bullets, prompt: ill.prompt } : null);
  const [revision, setRevision] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const [refId, setRefId] = useState<string>(ill?.referenceFrameId ?? "");
  // THE ONE CLICK'S PROGRESS (2026-09-07): "writing the brief…" then "drawing…" — one line.
  const [stage, setStage] = useState<"brief" | "draw" | null>(null);
  const busy = stage !== null;
  const [err, setErr] = useState<string | null>(null);
  // THE CAP (2026-09-07): `left` from the frame's own count; `capHit` when the SERVER refused
  // (an old frame with no count but three library rows); `overrideArmed` = the first of the two
  // clicks behind "I know, draw anyway".
  const left = revisionsLeft(ill);
  const [capHit, setCapHit] = useState(false);
  const [overrideArmed, setOverrideArmed] = useState(false);
  const [tips, setTips] = useState(false);
  // THE COST OF THIS ONE (2026-09-05: "show the cost of the generations I'm doing") — set the
  // moment a generation finishes, so the number is right there without hunting the library.
  const [lastCost, setLastCost] = useState<number | null>(null);
  // A REFERENCE PHOTO (2026-09-05: "make sure I can just ctrl+v right into it... and upload
  // file, but paste is my preferred mode"). Lives on the frame itself (ill.referencePhoto), not
  // local state, so it survives switching slides and away/back like everything else here.
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoFileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setWords(ill?.brief ?? ""); setInterim(""); setRevision(""); setErr(null); setLastCost(null); setCapHit(false); setOverrideArmed(false);
    setBrief(ill?.summary && ill.prompt ? { title: ill.summary.title, bullets: ill.summary.bullets, prompt: ill.prompt } : null);
    setRefId(ill?.referenceFrameId ?? "");
  }, [sel.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const dictation = useDictation((final, live) => { if (final) setWords((w) => (w ? w.replace(/\s+$/, "") + " " : "") + final.trim()); setInterim(live); });

  const addPhoto = async (file: File) => {
    setPhotoUploading(true); setErr(null);
    try { const a = await uploadReferencePhoto(file); keep({ referencePhoto: a }); }
    catch (e) { setErr((e as Error).message); }
    finally { setPhotoUploading(false); }
  };
  /** Ctrl+V straight into the "say it" box — a plain text paste still lands as words. */
  const onWordsPaste = (e: React.ClipboardEvent) => {
    const img = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
    if (!img) return;
    e.preventDefault();
    const f = img.getAsFile();
    if (f) void addPhoto(f);
  };

  // THE LIBRARY (2026-09-05: "catalog these illustrations as we build them... a library we're
  // building versus one-offs") — every picture ever generated for THIS set, free to reuse: "use
  // this" copies a row straight onto the current frame, no Recraft call, no cost. Refetched
  // after each successful generate so the newest one is there to reuse right away.
  const [library, setLibrary] = useState<LibraryRow[] | null>(null);
  const refreshLibrary = () => { listIllustrationLibrary({ data: { setId } }).then((r) => setLibrary(r.rows)).catch(() => setLibrary([])); };
  useEffect(refreshLibrary, [setId]);   // eslint-disable-line react-hooks/exhaustive-deps
  const useLibraryRow = (row: LibraryRow) => {
    keep({
      stylePreset: row.stylePreset, styleVersion: row.styleVersion, assetUrl: row.assetUrl, localAssetId: null,
      prompt: row.prompt, brief: ill?.brief ?? row.prompt, summary: row.title ? { title: row.title, bullets: [] } : (ill?.summary ?? null),
      seed: row.seed, generatedAt: row.generatedAt, teachingIntent: ill?.teachingIntent ?? (teaching() || null),
      animationPreset: ill?.animationPreset ?? illustrationStyle(row.stylePreset, reg).defaultAnimation,
      attempts: 0,   // a picture from the library is free and a different subject — its three start fresh
    });
    setCapHit(false); setOverrideArmed(false);
  };
  /** BLANK SLIDES ONLY (2026-09-05: "could I add that internal one and show them side by
   *  side... set up a blank slide and add them") — a second, already-made picture from the
   *  library, shown beside this frame's own. A snapshot, not a live link: pairing never changes
   *  again even if that other picture is later regenerated. */
  const pairLibraryRow = (row: LibraryRow | null) => keep({ pairedAssetUrl: row?.assetUrl ?? null, pairedTitle: row?.title ?? null });

  // Other slides' pictures — the ones this one can rhyme with.
  const references = frames.filter((f) => f.id !== sel.id && f.illustration?.prompt).map((f) => ({
    id: f.id, label: f.illustration?.summary?.title || (f.illustration?.prompt ?? "").slice(0, 40) || FRAME_LABEL[f.kind], prompt: f.illustration!.prompt!, seed: f.illustration?.seed ?? null, title: f.illustration?.summary?.title ?? FRAME_LABEL[f.kind],
  }));
  const ref = references.find((r) => r.id === refId) ?? null;

  const keep = (patch: Partial<FrameIllustration>) => onPatch({ illustration: { ...(ill ?? emptyIllustration({}, kind, reg)), requested: true, ...patch } });

  /** THE BRIEF: Lee's words → runMicro → a title, three bullets and the subject. Kept on the
   *  frame with `attempts` reset (a new subject starts its three) and returned to whoever asked
   *  — the one click draws it straight away, "brief only" stops here. Null on failure with the
   *  message already shown: the brief's failure still stops before Recraft. */
  async function writeBrief(revise: boolean): Promise<IllustrationBrief | null> {
    const said = words.trim();
    if (!said) { setErr("Say it first — what's in the picture, in your own words."); return null; }
    setErr(null);
    try {
      const m = buildBriefMessages({
        brainstorm: said, teachingIntent: teaching() || null, setName,
        reference: ref ? { title: ref.title, prompt: ref.prompt } : null,
        previous: revise && brief ? { title: brief.title, prompt: brief.prompt } : null,
        revision: revise ? revision.trim() || null : null,
      }, reg.briefSystem ?? BRIEF_SYSTEM);   // the one Lee edited on /admin/illustrations/styles, else the code's
      const r = await runMicro({ data: { system: m.system, user: m.user, maxOutput: 500 } });
      // THE COST LEDGER (2026-09-07): the brief is a paid AI call too — logged, never waited on.
      void logCostEvent({ data: { setId, kind: "ai", usd: r.usage.costUsd, model: r.model, label: "illustration brief", who: getAdminWho() } }).catch(() => {});
      const b = parseBrief(r.text);
      if (!b) throw new Error("The draft didn't come back clean — try once more, or say it a little differently.");
      setBrief(b); setRevision(""); setShowPrompt(false); setCapHit(false); setOverrideArmed(false);
      keep({ brief: said, summary: { title: b.title, bullets: b.bullets }, prompt: b.prompt, teachingIntent: teaching() || null, referenceFrameId: refId || null, attempts: 0 });
      return b;
    } catch (e) { setErr((e as Error).message); return null; }
  }
  /** "Use my words exactly" — no AI rewrite; the words ARE the subject. */
  function myWordsBrief(): IllustrationBrief | null {
    const said = words.trim(); if (!said) return null;
    const b: IllustrationBrief = { title: said.split(/[,.]/)[0].slice(0, 40), bullets: [said.slice(0, 80), "sent exactly as written — no AI rewrite", "no text unless you quoted it"], prompt: said };
    setBrief(b); setCapHit(false); setOverrideArmed(false);
    keep({ brief: said, summary: { title: b.title, bullets: b.bullets }, prompt: said, teachingIntent: teaching() || null, attempts: 0 });
    return b;
  }

  /** THE ONE CLICK (2026-09-07): brief, then draw the moment it parses. `revise` = from the
   *  "what to change" note against the current brief. */
  async function sayItAndDraw(revise: boolean) {
    setStage("brief");
    try {
      const b = await writeBrief(revise);
      if (b) await draw(b);
    } finally { setStage(null); }
  }
  /** The rare read-it-first — the brief lands in the card below, nothing is drawn. */
  async function briefOnly() { setStage("brief"); try { await writeBrief(false); } finally { setStage(null); } }
  async function myWordsAndDraw() { const b = myWordsBrief(); if (b) await draw(b); }

  /** THE DRAW — one Recraft call for a brief's subject. Counts against the cap when the subject
   *  is the one already on the frame (Regenerate); a different subject starts at 0. Refused
   *  here at three, and again by the server against the library, unless `override`. */
  async function draw(b: IllustrationBrief, opts: { override?: boolean } = {}) {
    const subject = b.prompt.trim();
    if (!subject) { setErr("Say it first — what's in the picture, in your own words."); return; }
    const same = (ill?.prompt ?? "").trim() === subject;
    const used = same ? Math.max(0, ill?.attempts ?? 0) : 0;
    if (!opts.override && used >= ILLUSTRATION_REVISION_CAP) { setCapHit(true); setErr(REVISION_CAP_MESSAGE); return; }
    setStage("draw"); setErr(null);
    try {
      // A referenced picture's seed makes the composition rhyme; otherwise the slide's own seed
      // (a library row's, say) — a fresh roll once a picture exists, which is what Regenerate is.
      const seed = ref?.seed ?? (ill?.assetUrl || !ill?.seed ? undefined : ill.seed);
      const r = await generateIllustration({
        data: {
          setId, frameId: sel.id, prompt: subject, teachingIntent: teaching() || null, stylePreset: style.id,
          ...(seed !== undefined ? { seed } : {}), referenceImageUrl: ill?.referencePhoto?.url ?? null,
          title: b.title, who: getAdminWho(), attempts: used, override: !!opts.override,
        },
      });
      keep({
        brief: words.trim() || ill?.brief || null, summary: { title: b.title, bullets: b.bullets }, referenceFrameId: refId || null,
        prompt: subject, teachingIntent: teaching() || null,
        provider: r.provider, stylePreset: r.stylePreset, styleVersion: r.styleVersion, assetUrl: r.url, localAssetId: r.path,
        animationPreset: ill?.animationPreset ?? style.defaultAnimation, generatedAt: r.generatedAt, seed: r.seed,
        attempts: used + 1,
      });
      setCapHit(false); setOverrideArmed(false);
      setLastCost(r.credits === null ? null : r.credits / 1000);
      if (credits !== null && r.credits !== null) setCredits(credits - r.credits);   // don't wait on a refresh to reflect the spend
      refreshLibrary();
    } catch (e) {
      const msg = (e as Error).message || "Couldn't generate. Your words are kept — try again.";
      if (msg === REVISION_CAP_MESSAGE) setCapHit(true);
      setErr(msg);
    } finally { setStage(null); }
  }
  /** Regenerate: the same brief, a new seed — the button in the card below. */
  const regenerate = (override = false) => { if (brief) void draw(brief, { override }); };

  // THE SERVER: signed in? key? — named states, and a free test.
  const [avail, setAvail] = useState<Avail | null>(null);
  const [availErr, setAvailErr] = useState<string | null>(null);
  const [pass, setPass] = useState("");
  const [keyTest, setKeyTest] = useState<string | null>(null);
  // THE BALANCE (2026-09-05: "add a balance of recraft API credits... I want to keep track of
  // how much it's going down"). Recraft's own /users/me check is free, so it's fine to run it
  // automatically rather than wait for a manual "Test the key" click — that button still exists
  // to refresh it on demand. credits is Recraft's own unit; 1000 = $1.
  const [credits, setCredits] = useState<number | null>(null);
  const checkAvail = () => { illustrationStatus().then((s) => { setAvail(s); setAvailErr(null); if (s.configured) void testKey(true); }).catch((e) => { setAvail(null); setAvailErr((e as Error).message); }); };
  useEffect(() => { checkAvail(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const signIn = async () => {
    setKeyTest(null);
    try {
      const r = await installPasscodeSession({ data: { passcode: pass, who: getAdminWho() === "king" ? "king" : "lee" } });
      if (!r.ok) { setKeyTest(r.error ?? "Wrong passcode."); return; }
      setPass(""); checkAvail();
    } catch (e) { setKeyTest((e as Error).message); }
  };
  const testKey = async (silent = false) => {
    if (!silent) setKeyTest("Asking Recraft…");
    try {
      const r = await testIllustrationKey();
      setCredits(r.ok ? r.credits ?? null : null);
      if (!silent) setKeyTest(r.ok ? `✓ Key works${r.email ? ` (${r.email})` : ""}.` : `✗ ${r.error ?? "rejected"}`);
    } catch (e) { if (!silent) setKeyTest(`✗ ${(e as Error).message}`); }
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
        onChange={(e) => { setInterim(""); setWords(e.target.value); }} onPaste={onWordsPaste}
        placeholder="e.g. a suited guy at his desk with a magnifying glass over the financials, the report says OUR COMPANY, and outside the window an investor is peering in at the same report — or paste a reference photo (Ctrl+V)" />
      {/* THE ONE CLICK (2026-09-07: "No more 'prep the prompt' just generate the illustration") */}
      <div className="flex" style={{ gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" disabled={busy || !ready || !words.trim()} onClick={() => void sayItAndDraw(false)}
          style={{ ...chip(true, MINT), opacity: busy || !ready || !words.trim() ? 0.5 : 1, cursor: busy ? "wait" : "pointer" }}
          title={ready ? "One click: the brief is written for you, then the picture is drawn — the title and bullets show beside it after" : "Sign in / add the key below first"}>
          {busy ? "Generating…" : words.trim() ? "Generate" : "🎙 Say it → Generate"}
        </button>
        <button type="button" disabled={busy || !words.trim()} onClick={() => void briefOnly()} style={{ ...chip(false, GOLD), opacity: busy || !words.trim() ? 0.5 : 1, fontSize: 10.5 }} title="Just the brief, nothing drawn — read it first, then Generate from the card below">brief only</button>
        <button type="button" disabled={busy || !ready || !words.trim()} onClick={() => void myWordsAndDraw()} style={{ ...chip(false, GOLD), opacity: busy || !ready || !words.trim() ? 0.5 : 1, fontSize: 10.5 }} title="Skip the AI rewrite — my words are the subject, drawn exactly as written">my words exactly → Generate</button>
        {references.length > 0 && (
          <select value={refId} onChange={(e) => { setRefId(e.target.value); keep({ referenceFrameId: e.target.value || null }); }} title="Rhyme with another slide's picture — same cast, same props, same seed"
            style={{ ...field, width: "auto", padding: "3px 6px", fontSize: 11 }}>
            <option value="">no reference</option>
            {references.map((r) => <option key={r.id} value={r.id}>rhymes with: {r.label}</option>)}
          </select>
        )}
      </div>
      {busy && (
        <div style={{ marginTop: 5, fontSize: 11, color: MINT }}>
          <span style={{ opacity: stage === "brief" ? 1 : 0.6 }}>writing the brief…</span>{stage === "draw" && <span> ✓ drawing…</span>}
        </div>
      )}

      {/* A REFERENCE PHOTO — Ctrl+V into the box above is the preferred way in; this is the
          fallback and the "what's attached" readout. Loose guidance for Recraft, not a lock —
          best for a specific real landmark or prop a plain sentence won't nail on its own. */}
      <div className="flex" style={{ gap: 8, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
        <input ref={photoFileRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void addPhoto(f); e.target.value = ""; }} />
        {ill?.referencePhoto ? (
          <>
            <img src={ill.referencePhoto.url} alt={ill.referencePhoto.name} style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6, border: `1px solid ${EDGE}` }} />
            <span style={{ fontSize: 10.5, color: MUTED }}>reference photo attached</span>
            <button type="button" onClick={() => keep({ referencePhoto: null })} style={chip(false, ORANGE)} title="Remove the reference photo — words alone drive the next generation">remove photo</button>
          </>
        ) : (
          <button type="button" disabled={photoUploading} onClick={() => photoFileRef.current?.click()} style={{ ...chip(false, GOLD), opacity: photoUploading ? 0.6 : 1 }} title="Or paste one straight into the box above (Ctrl+V)">
            {photoUploading ? "Uploading…" : "📷 Add a reference photo"}
          </button>
        )}
      </div>

      {/* 2. THE BRIEF — shown AFTER the draw, beside the picture: a title, three bullets, the
          prompt behind a toggle. (Or before it, on "brief only".) */}
      {brief && (() => {
        // The cap, for THIS subject: the frame's count only applies while the card's subject is
        // the one the frame was drawn from; a new brief starts at 0.
        const sameSubject = (ill?.prompt ?? "").trim() === brief.prompt.trim();
        const used = sameSubject ? Math.max(0, ill?.attempts ?? 0) : 0;
        const drawnThis = sameSubject && !!ill?.assetUrl;
        const atCap = sameSubject && (left === 0 || capHit);
        return (
        <div style={{ marginTop: 10, border: `1px solid ${GOLD}55`, borderRadius: 10, padding: "8px 10px" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: CREAM }}>{brief.title}</div>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12, color: CREAM, lineHeight: 1.45, opacity: 0.92 }}>
            {brief.bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
          {ref && <div style={{ marginTop: 4, fontSize: 10.5, color: MUTED }}>rhymes with “{ref.label}” — same cast, same seed</div>}
          <details open={showPrompt} onToggle={(e) => setShowPrompt((e.currentTarget as HTMLDetailsElement).open)} style={{ marginTop: 6 }}>
            <summary style={{ fontSize: 10.5, color: MUTED, cursor: "pointer" }}>the subject (edit if you must)</summary>
            <textarea rows={3} style={{ ...field, marginTop: 4, resize: "vertical", fontSize: 12 }} value={brief.prompt}
              onChange={(e) => { const b = { ...brief, prompt: e.target.value }; setBrief(b); setCapHit(false); setOverrideArmed(false); keep({ prompt: e.target.value, attempts: 0 }); }} />
            <div style={{ fontSize: 10.5, color: MUTED, marginTop: 2 }}>Just what the picture shows — the style, the black ground and the palette get added below, at generation. An edited subject starts its three draws over.</div>
          </details>
          {/* THE ACTUAL PROMPT — this is what Recraft receives, subject wrapped in the whole
              Survive Dreamstate preset (Lee, 2026-09-05: "I didn't know if it actually did much
              to change the prompt... what I saw was basically the same as what I wrote in" — that
              was the subject only; this is everything, always computed live off it, never stale). */}
          <details style={{ marginTop: 4 }}>
            <summary style={{ fontSize: 10.5, color: MUTED, cursor: "pointer" }}>the exact instruction sent to Recraft</summary>
            <div style={{ marginTop: 4, fontSize: 11, color: CREAM, opacity: 0.75, lineHeight: 1.4, whiteSpace: "pre-wrap", border: `1px solid ${EDGE}`, borderRadius: 8, padding: "6px 8px" }}>
              {composeIllustrationPrompt(style, brief.prompt, teaching() || null)}
            </div>
          </details>
          {/* THE THREE-REVISION CAP (2026-09-07): Regenerate counts down; at three it's off,
              the library is the offer, and "draw anyway" needs two clicks. */}
          <div className="flex" style={{ gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            {atCap ? (
              <>
                <span style={{ fontSize: 11.5, color: ORANGE, fontWeight: 800 }}>{REVISION_CAP_MESSAGE}</span>
                <span style={{ fontSize: 10.5, color: MUTED }}>— or pick one from the Library below, free.</span>
                <button type="button" disabled={busy || !ready} onClick={() => { if (overrideArmed) { setOverrideArmed(false); regenerate(true); } else setOverrideArmed(true); }}
                  style={{ ...chip(overrideArmed, ORANGE), opacity: busy || !ready ? 0.5 : 1 }}
                  title={overrideArmed ? "Second click — this one spends a fourth generation on the same subject" : "Your money, your call — it takes a second click"}>
                  {overrideArmed ? "Sure? click again — draw anyway" : "I know, draw anyway"}
                </button>
              </>
            ) : (
              <button type="button" disabled={busy || !ready} onClick={() => regenerate()} style={{ ...chip(true, MINT), opacity: busy || !ready ? 0.5 : 1, cursor: busy ? "wait" : "pointer" }}
                title={ready ? (drawnThis ? `Same brief, a new roll — ${left} of ${ILLUSTRATION_REVISION_CAP} left for this subject` : "Spend one generation on this brief") : "Sign in / add the key below first"}>
                {busy ? "Generating…" : drawnThis ? `Regenerate · ${used} of ${ILLUSTRATION_REVISION_CAP}` : "✓ Looks good — generate"}
              </button>
            )}
            <input value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="or: what to change…" onKeyDown={(e) => { if (e.key === "Enter" && revision.trim() && !busy) void sayItAndDraw(true); }}
              style={{ ...field, flex: 1, minWidth: 140, padding: "4px 8px", fontSize: 12 }} />
            <button type="button" disabled={busy || !ready || !revision.trim()} onClick={() => void sayItAndDraw(true)} style={{ ...chip(false, GOLD), opacity: busy || !ready || !revision.trim() ? 0.5 : 1 }} title="A new brief with that change, drawn straight away — a new subject, so its three start over">Revise → draw</button>
          </div>
        </div>
        );
      })()}
      {err && <div style={{ marginTop: 6, fontSize: 11, color: ORANGE }}>{err}</div>}

      {/* 3. THE PICTURE'S CONTROLS */}
      {/* A frame keeps whichever preset it was generated with on purpose (never rewritten
          silently) — but that means a frame started before Survive Watercolor existed is stuck
          on the retired look until told otherwise. This is that "otherwise" (Lee, 2026-09-05,
          on a "second round" picture that was still the old monoline-on-black style despite the
          new default already being live: it never switched because this frame's own stylePreset
          was already pinned). Free — it only clears the picture, the brief and words are kept.
          Since v5 (2026-09-06) "the default" is per kind — riso for exam content, watercolor
          stays for the strategy shorts — so a watercolor picture on an Easy Points set is
          off-style too, not only the retired dreamstate (isOffStyleIllustration). */}
      {offStyle && (
        <div style={{ marginTop: 8, padding: "6px 10px", border: `1px solid ${ORANGE}88`, borderRadius: 8, fontSize: 11.5, color: CREAM, lineHeight: 1.4 }}>
          This picture is in {style.label}, not this set's house style ({illustrationStyle(houseId, reg).label} — set on /admin/illustrations/styles).
          <button type="button" onClick={() => keep({ stylePreset: houseId, assetUrl: null, localAssetId: null, styleVersion: null, seed: null, generatedAt: null })}
            style={{ ...chip(false, ORANGE), marginLeft: 8 }} title="Keeps your words and brief; clears the picture so Generate makes a fresh one in this set's style">
            switch to {illustrationStyle(houseId, reg).label}
          </button>
        </div>
      )}
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
        {ill?.assetUrl && (() => {
          // This session's own figure first; otherwise whatever the library has for this exact
          // asset (a picture generated earlier, or on a reload) — never a guess, just "unknown".
          const cost = lastCost ?? library?.find((r) => r.assetUrl === ill.assetUrl)?.costUsd ?? null;
          const drawn = Math.max(0, ill.attempts ?? 0);
          return <span style={{ fontSize: 10.5, color: MUTED }}>seed {ill.seed} · {ill.generatedAt ? new Date(ill.generatedAt).toLocaleDateString() : ""}{cost !== null ? ` · $${cost.toFixed(2)}` : ""}{drawn ? ` · draw ${drawn} of ${ILLUSTRATION_REVISION_CAP}` : ""}</span>;
        })()}
      </div>
      {ill?.assetUrl && <div style={{ marginTop: 6, fontSize: 10.5, color: MUTED }}>It's on the slide to the left — drag it to move, the corner grip resizes{ill.placement ? "" : " (a blank slide's sits dead centre)"}. Regenerate keeps the brief and rolls a new seed — three per subject; revise or say it again when the subject is wrong.</div>}
      {ill?.placement && <button type="button" onClick={() => onPatch({ illustration: { ...ill, placement: null } })} style={{ ...chip(false, GOLD), marginTop: 6 }} title="Back to the band under the card">Snap back under the card</button>}

      {/* SIDE BY SIDE — blank slides only (2026-09-05: "could I add that internal one and show
          them side by side... set up a blank slide and add them"). A second, already-made
          picture from the library, never a fresh generation — pick one below. */}
      {sel.kind === "blank" && (
        <div style={{ marginTop: 8, padding: "6px 10px", border: `1px solid ${EDGE}`, borderRadius: 8, fontSize: 11, color: CREAM }}>
          {ill?.pairedAssetUrl ? (
            <div className="flex" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <img src={ill.pairedAssetUrl} alt={ill.pairedTitle ?? ""} style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 6, border: `1px solid ${EDGE}` }} />
              <span style={{ color: MUTED }}>beside it: {ill.pairedTitle || "a library picture"}</span>
              <button type="button" onClick={() => pairLibraryRow(null)} style={chip(false, ORANGE)}>un-pair</button>
            </div>
          ) : (
            <span style={{ color: MUTED }}>This slide can show a second, already-made picture beside its own — pick one from the library below (📎 next to it).</span>
          )}
        </div>
      )}

      {/* THE LIBRARY (2026-09-05: "catalog these illustrations as we build them... a library
          we're building versus one-offs") — every picture ever generated for this set, free to
          reuse: "use this" attaches a row to THIS frame with no Recraft call. */}
      {library && library.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ ...subhead, cursor: "pointer" }}>📚 Library · {library.length} for this set</summary>
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
            {library.map((row) => (
              <div key={row.id} style={{ display: "flex", gap: 8, alignItems: "center", border: `1px solid ${EDGE}`, borderRadius: 8, padding: "5px 7px" }}>
                <img src={row.assetUrl} alt={row.title ?? row.prompt} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: CREAM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title || row.prompt}</div>
                  <div style={{ fontSize: 10, color: MUTED }}>{new Date(row.generatedAt).toLocaleDateString()}{row.createdBy ? ` · ${row.createdBy}` : ""}{row.costUsd !== null ? ` · $${row.costUsd.toFixed(2)}` : ""}</div>
                </div>
                <button type="button" onClick={() => useLibraryRow(row)} style={chip(false, MINT)} title="Attach this picture to the current slide — free, no generation">use this</button>
                {sel.kind === "blank" && <button type="button" onClick={() => pairLibraryRow(row)} style={chip(ill?.pairedAssetUrl === row.assetUrl, GOLD)} title="Show this beside the slide's own picture">📎 beside</button>}
              </div>
            ))}
          </div>
        </details>
      )}

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
          <div className="flex" style={{ gap: 8, alignItems: "center", fontSize: 10.5, color: MUTED, flexWrap: "wrap" }}>
            <span>Key present on the server ({avail.keyLength} chars).</span>
            {credits !== null && (
              <span title="Recraft's own balance — 1000 credits = $1" style={{ color: credits < 500 ? ORANGE : MUTED, fontWeight: credits < 500 ? 800 : 400 }}>
                {credits < 500 ? "⚠ " : ""}${(credits / 1000).toFixed(2)} in Recraft credits left
              </span>
            )}
            <button type="button" onClick={() => void testKey()} style={chip(false, GOLD)} title="One free call to Recraft — refreshes the balance">↻ refresh balance</button>
          </div>
        )}
        {keyTest && <div style={{ marginTop: 4, fontSize: 11, color: keyTest.startsWith("✓") ? MINT : ORANGE }}>{keyTest}</div>}
      </div>
    </div>
  );
}
