// /rep/onboarding — PRE-ONBOARDING, before approval (spec §3, 2026-09-06).
//
// Six short steps in the cram-short format, each with a response; progress saves so they can
// leave and come back. Done → optional résumé → ready for review → Lee's phone. This page is
// also where a pending applicant lands from the dashboard, and where they check their status
// (ready for review · interview · approved · denied).
//
// Mobile first: one column, one step on screen, the response control right under the video.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { MuxVideo } from "@/components/shipped/MuxVideo";
import { muxThumb } from "@/components/learn/cram-media";
import { BetaFeedback } from "@/components/reps/BetaFeedback";
import { AREA, CTA, LABEL, RepShell } from "@/components/reps/RepApply";
import { uploadRepResume } from "@/components/ideas/upload";
import { getPreOnboarding, savePreOnboardingStep, submitPreOnboarding, type JoinChapter, type PreOnboardingState } from "@/lib/rep-pre-onboarding.functions";
import {
  COMFORT_OPTIONS, INTERVIEW_COPY, READY_COPY, RESUME_PROMPT, STEPS, STEP_KEYS, stepProgress, type StepKey, type TargetChapter,
} from "@/lib/rep-pre-onboarding";
import { ACTIVE_THRESHOLD_LINE, CHAPTER_BONUS_GATE, DURATION_RULE, LEVEL_1_ROWS, LEVEL_1_TITLE, LEVEL_2_ROWS, LEVEL_2_TITLE } from "@/lib/rep-copy";

export const Route = createFileRoute("/rep_/onboarding")({
  validateSearch: (s: Record<string, unknown>): { k?: string } => (typeof s.k === "string" ? { k: s.k } : {}),
  head: () => ({ meta: [{ title: "Rep onboarding — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
  component: RepOnboardingPage,
});

type State = { s: "loading" } | { s: "signin"; note: string } | { s: "error"; note: string } | { s: "ready"; d: PreOnboardingState };

function RepOnboardingPage() {
  const { k } = Route.useSearch();
  const nav = useNavigate();
  const [st, setSt] = useState<State>({ s: "loading" });
  const [stepKey, setStepKey] = useState<StepKey | "resume" | null>(null);

  const load = useCallback(() => {
    void getPreOnboarding({ data: { legacyToken: k ?? null } })
      .then((r) => {
        if (r.ok) setSt({ s: "ready", d: r });
        else if (r.state === "migration") setSt({ s: "error", note: r.error });
        else setSt({ s: "signin", note: r.error });
      })
      .catch(() => setSt({ s: "error", note: "Couldn't reach the server — try again." }));
  }, [k]);
  useEffect(load, [load]);

  // Land on the first unfinished step; after the sixth, on the résumé/submit screen.
  useEffect(() => {
    if (st.s !== "ready" || stepKey !== null) return;
    const p = stepProgress(st.d.profile);
    setStepKey(p.complete ? "resume" : p.next);
  }, [st, stepKey]);

  const sans: React.CSSProperties = { fontFamily: BRAND_SANS };

  return (
    <RepShell>
      {st.s === "loading" && <p className="pt-16 text-center text-[14px]" style={{ ...sans, color: "var(--text-muted)" }}>Loading…</p>}
      {st.s === "signin" && (
        <section className="mx-auto max-w-sm pt-16 text-center" style={sans}>
          <h1 className="text-[22px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>Sign in to continue your onboarding.</h1>
          <p className="mt-2 text-[14px]" style={{ color: "var(--text-muted)" }}>{st.note}</p>
          <a href="/rep/dashboard" className="mt-5 inline-flex items-center rounded-xl px-6 text-[15px] font-black" style={CTA}>Sign in with your phone →</a>
          <p className="mt-4 text-[12.5px]" style={{ color: "var(--text-muted)" }}>Haven't applied yet? <a href="/rep/join" className="font-bold underline underline-offset-4" style={{ color: "var(--accent)" }}>Apply →</a></p>
        </section>
      )}
      {st.s === "error" && (
        <section className="mx-auto max-w-sm pt-16 text-center" style={sans}>
          <h1 className="text-[20px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>Something's off on our side.</h1>
          <p className="mt-2 text-[13px]" style={{ color: "#F3C6CC" }}>{st.note}</p>
          <button type="button" onClick={load} className="mt-4 rounded-xl px-4 text-[13.5px] font-black" style={{ minHeight: 44, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}>Try again</button>
        </section>
      )}

      {st.s === "ready" && st.d.flow === "approved" && (
        <Status eyebrow="Approved" title={`You're in${st.d.repNumber ? ` — rep #${st.d.repNumber}` : ""}.`} body="Your dashboard is open." cta={{ label: "Open my dashboard →", onClick: () => void nav({ to: "/rep/dashboard" }) }} />
      )}
      {st.s === "ready" && st.d.flow === "denied" && (
        <Status eyebrow="Closed" title="This one didn't work out." body="Lee texted you about it. He's holding your application for future semesters — and if you'd like feedback on your resume or your pitch, just reply to his text." />
      )}
      {st.s === "ready" && st.d.flow === "waitlisted" && (
        <Status eyebrow="Waitlist" title="You're on the waitlist." body="Your campus has rep coverage right now. Lee keeps this list — you'll hear from him the moment a spot opens." />
      )}
      {st.s === "ready" && st.d.flow === "interview" && (
        <Status eyebrow={INTERVIEW_COPY.eyebrow} title={INTERVIEW_COPY.title} body={INTERVIEW_COPY.body} preview={st.d.isTest ? st.d.profile.interview?.preview ?? null : null} />
      )}
      {st.s === "ready" && st.d.flow === "ready_for_review" && (
        <Status eyebrow={READY_COPY.eyebrow} title={READY_COPY.title} body={READY_COPY.body} preview={st.d.reviewPreview ?? null}>
          {st.d.beta && <BetaFeedback screen="Ready for review" legacyToken={k ?? null} isTest={st.d.isTest} />}
        </Status>
      )}
      {st.s === "ready" && (st.d.flow === "applied" || st.d.flow === "pre_onboarding") && stepKey && (
        <Flow d={st.d} stepKey={stepKey} legacyToken={k ?? null} onStep={setStepKey} onSaved={load} />
      )}
    </RepShell>
  );
}

function Status({ eyebrow, title, body, cta, preview, children }: { eyebrow: string; title: string; body: string; cta?: { label: string; onClick: () => void }; preview?: string | null; children?: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-sm pt-14" style={{ fontFamily: BRAND_SANS }}>
      <p className="text-center text-[12px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.16em" }}>{eyebrow}</p>
      <h1 className="mt-2 text-center text-[26px] font-black leading-[1.1]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>{title}</h1>
      <p className="mt-3 text-center text-[14.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{body}</p>
      {cta && <button type="button" onClick={cta.onClick} className="mt-6 w-full rounded-xl text-[15px] font-black" style={CTA}>{cta.label}</button>}
      {preview && (
        <div className="mt-6 rounded-xl p-3 text-[12px]" style={{ background: "rgba(122,46,18,0.18)", border: "1px solid #C2571F", color: "#FFC9A3", whiteSpace: "pre-wrap" }}>
          <b>Test Mode — the text that would have gone out:</b>{"\n"}{preview}
        </div>
      )}
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- the six steps + résumé

function Flow({ d, stepKey, legacyToken, onStep, onSaved }: { d: PreOnboardingState; stepKey: StepKey | "resume"; legacyToken: string | null; onStep: (k: StepKey | "resume") => void; onSaved: () => void }) {
  const prog = stepProgress(d.profile);
  const idx = stepKey === "resume" ? STEP_KEYS.length : STEP_KEYS.indexOf(stepKey);
  const def = stepKey === "resume" ? null : STEPS[idx];
  const rec = def ? d.profile.steps?.[def.key] : undefined;
  const [answer, setAnswer] = useState(rec?.answer ?? "");
  const [comfort, setComfort] = useState<string[]>(rec?.comfort ?? d.profile.comfort ?? []);
  const [more, setMore] = useState<string | null>(null);
  const [targets, setTargets] = useState<Record<string, TargetChapter>>(() => Object.fromEntries(((rec?.targets ?? d.profile.targets ?? []) as TargetChapter[]).map((t) => [t.id, t])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resume, setResume] = useState<{ url: string; name: string } | null>(d.profile.resume ? { url: d.profile.resume.url, name: d.profile.resume.name } : null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    // A different step: reload its saved answer.
    const r = def ? d.profile.steps?.[def.key] : undefined;
    setAnswer(r?.answer ?? ""); setErr(null);
    if (r?.comfort) setComfort(r.comfort);
    if (r?.targets) setTargets(Object.fromEntries(r.targets.map((t) => [t.id, t])));
  }, [stepKey, d.profile.steps, def]);

  const next = async () => {
    if (!def || busy) return;
    setBusy(true); setErr(null);
    try {
      const payload = def.response === "sentence" ? { answer } : def.response === "ack" ? { ack: true } : def.response === "comfort" ? { comfort } : { targets: Object.values(targets) };
      const r = await savePreOnboardingStep({ data: { legacyToken, step: def.key, ...payload } });
      if (!r.ok) { setErr(r.error ?? "Couldn't save that."); return; }
      onSaved();
      const n = STEP_KEYS[idx + 1];
      onStep(n ?? "resume");
      window.scrollTo({ top: 0 });
    } catch { setErr("Couldn't reach the server — try again."); }
    finally { setBusy(false); }
  };

  const pickResume = async (f: File | undefined) => {
    if (!f) return;
    setUploading(true); setErr(null);
    try { const a = await uploadRepResume(f); setResume({ url: a.url, name: a.name }); }
    catch (e) { setErr(e instanceof Error ? e.message : "Upload failed."); }
    finally { setUploading(false); }
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await submitPreOnboarding({ data: { legacyToken, resume } });
      if (!r.ok) { setErr(r.error ?? "Couldn't submit."); return; }
      if (r.preview) setPreview(r.preview);
      onSaved();
      window.scrollTo({ top: 0 });
    } catch { setErr("Couldn't reach the server — try again."); }
    finally { setBusy(false); }
  };

  const videoId = def?.videoKey ? d.videos[def.videoKey] : undefined;
  const grouped = useMemo(() => {
    const m = new Map<string, JoinChapter[]>();
    for (const c of d.chapters) { const key = c.council === "ifc" ? "Fraternities (IFC)" : c.council === "panhellenic" ? "Sororities (Panhellenic)" : "Other councils"; m.set(key, [...(m.get(key) ?? []), c]); }
    return [...m.entries()];
  }, [d.chapters]);
  const pickedCount = Object.keys(targets).length;

  return (
    <section className="pt-8" style={{ fontFamily: BRAND_SANS }}>
      {/* progress: six dots + the résumé */}
      <div className="flex items-center gap-2">
        <p className="text-[12px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.16em" }}>{def ? `Step ${idx + 1} of ${STEP_KEYS.length}` : "Last thing"}</p>
        <span className="ml-auto flex items-center gap-1.5" aria-label={`${prog.done.length} of ${STEP_KEYS.length} done`}>
          {STEP_KEYS.map((key, i) => (
            <button key={key} type="button" title={STEPS[i].title} onClick={() => (prog.done.includes(key) || key === prog.next) && onStep(key)}
              style={{ width: 22, height: 6, borderRadius: 999, background: prog.done.includes(key) ? "var(--accent)" : key === stepKey ? "var(--brand-cream)" : "var(--border-default)", border: "none", padding: 0, cursor: "pointer" }} />
          ))}
        </span>
      </div>
      <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>{d.campusName} · {d.name}{prog.done.length > 0 && !prog.complete ? " · progress saves, come back any time" : ""}</p>

      {def && (
        <>
          <h1 className="mt-3 text-[28px] font-black leading-[1.08]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>{def.title}</h1>

          {/* THE SHORT — the same vertical format as the cram shorts; a placeholder card with the
              gist until Lee films this one (strategy board → /v3/strategy). */}
          {videoId ? (
            <MuxVideo playbackId={videoId} poster={muxThumb(videoId, 720)} style={{ width: "100%", maxWidth: 360, aspectRatio: "9 / 16", borderRadius: 16, marginTop: 14, background: "#000" }} />
          ) : (
            <div className="mt-4 rounded-2xl p-4" style={{ background: "#0B1220", border: "1px solid var(--border-default)", maxWidth: 360 }} data-video-placeholder={def.key}>
              <p className="text-[11px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.12em" }}>Lee, in two minutes</p>
              <ul className="mt-2 grid gap-2 text-[14.5px] leading-snug" style={{ color: "var(--brand-cream)" }}>
                {def.gist.map((g, i) => <li key={i} className="flex gap-2"><span aria-hidden style={{ color: "var(--accent)" }}>•</span><span>{g}</span></li>)}
              </ul>
              <p className="mt-3 text-[11.5px]" style={{ color: "var(--text-muted)" }}>The short for this step is being filmed — the gist is above.</p>
            </div>
          )}

          {def.key === "4" && (
            <div className="mt-4 grid gap-3">
              <PayTable title={LEVEL_1_TITLE} rows={LEVEL_1_ROWS} />
              <PayTable title={LEVEL_2_TITLE} rows={LEVEL_2_ROWS} locked />
              <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}><b style={{ color: "var(--brand-cream)" }}>{CHAPTER_BONUS_GATE}</b> {DURATION_RULE} {ACTIVE_THRESHOLD_LINE}</p>
            </div>
          )}

          <div className="mt-5">
            <label style={LABEL}>{def.prompt}</label>
            {def.response === "sentence" && (
              <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} placeholder="One sentence, your words." className="sa-field" style={AREA} />
            )}
            {def.response === "comfort" && (
              <div className="grid gap-2">
                {COMFORT_OPTIONS.map((o) => {
                  const on = comfort.includes(o.key);
                  return (
                    <div key={o.key} className="rounded-xl" style={{ background: on ? "rgba(252,163,17,0.10)" : "var(--bg-surface)", border: `1px solid ${on ? "var(--accent)" : "var(--border-default)"}` }}>
                      <div className="flex items-start gap-2 px-3 py-2.5">
                        <button type="button" aria-pressed={on} onClick={() => setComfort((v) => o.key === "none_yet" ? (on ? [] : ["none_yet"]) : (on ? v.filter((x) => x !== o.key) : [...v.filter((x) => x !== "none_yet"), o.key]))}
                          className="flex min-w-0 flex-1 items-start gap-2.5 text-left" style={{ background: "transparent", border: "none", padding: 0, color: "var(--brand-cream)" }}>
                          <span aria-hidden className="mt-0.5 flex shrink-0 items-center justify-center rounded-md text-[12px] font-black" style={{ width: 22, height: 22, background: on ? "var(--accent)" : "transparent", border: `1.5px solid ${on ? "var(--accent)" : "var(--border-default)"}`, color: "#0B1220" }}>{on ? "✓" : ""}</span>
                          <span className="text-[14px] font-bold leading-snug">{o.label}</span>
                        </button>
                        {o.more && <button type="button" onClick={() => setMore(more === o.key ? null : o.key)} className="shrink-0 text-[12px] font-bold underline underline-offset-4" style={{ color: "var(--text-muted)", minHeight: 24 }}>{more === o.key ? "Less" : "More info"}</button>}
                      </div>
                      {more === o.key && o.more && <p className="px-3 pb-3 text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{o.more}</p>}
                    </div>
                  );
                })}
              </div>
            )}
            {def.response === "chapters" && (
              <div className="grid gap-3">
                {d.chapters.length === 0 && <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>We don't have {d.campusName}'s chapter list loaded yet — Lee will set your targets on the call. Tap Next.</p>}
                {grouped.map(([label, list]) => (
                  <div key={label}>
                    <p className="mb-1.5 text-[11.5px] font-black uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.1em" }}>{label} · {list.length}</p>
                    <div className="grid gap-1.5">
                      {list.map((c) => {
                        const t = targets[c.id];
                        return (
                          <div key={c.id} className="flex items-center gap-2 rounded-xl px-3" style={{ minHeight: 46, background: t ? "rgba(252,163,17,0.10)" : "var(--bg-surface)", border: `1px solid ${t ? "var(--accent)" : "var(--border-default)"}` }}>
                            <button type="button" aria-pressed={!!t} onClick={() => setTargets((v) => { const n = { ...v }; if (n[c.id]) delete n[c.id]; else n[c.id] = { id: c.id, name: c.name, connection: false }; return n; })}
                              className="flex min-w-0 flex-1 items-center gap-2.5 text-left" style={{ background: "transparent", border: "none", padding: 0, color: "var(--brand-cream)", minHeight: 44 }}>
                              <span aria-hidden className="flex shrink-0 items-center justify-center rounded-md text-[12px] font-black" style={{ width: 22, height: 22, background: t ? "var(--accent)" : "transparent", border: `1.5px solid ${t ? "var(--accent)" : "var(--border-default)"}`, color: "#0B1220" }}>{t ? "✓" : ""}</span>
                              <span className="truncate text-[14px] font-bold">{c.letters && <span style={{ color: "var(--accent)", marginRight: 6 }}>{c.letters}</span>}{c.name}</span>
                            </button>
                            <button type="button" title="I know someone here" aria-pressed={!!t?.connection} disabled={!t}
                              onClick={() => setTargets((v) => ({ ...v, [c.id]: { ...v[c.id], connection: !v[c.id].connection } }))}
                              className="shrink-0 rounded-lg px-2 text-[12px] font-black disabled:opacity-30" style={{ minHeight: 34, background: t?.connection ? "var(--accent)" : "transparent", border: "1px solid var(--border-default)", color: t?.connection ? "#0B1220" : "var(--text-muted)" }}>
                              {t?.connection ? "👤 know someone" : "👤"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {pickedCount > 0 && <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>{pickedCount} picked · {Object.values(targets).filter((t) => t.connection).length} where you know someone</p>}
              </div>
            )}
          </div>

          {err && <p className="mt-3 text-[12.5px]" role="alert" style={{ color: "#F3C6CC" }}>{err}</p>}
          <div className="mt-4 flex items-center gap-3">
            {idx > 0 && <button type="button" onClick={() => onStep(STEP_KEYS[idx - 1])} className="rounded-xl px-4 text-[13.5px] font-black" style={{ minHeight: 52, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}>Back</button>}
            <button type="button" onClick={() => void next()} disabled={busy || (def.response === "sentence" && answer.trim().length < 8) || (def.response === "comfort" && comfort.length === 0) || (def.response === "chapters" && d.chapters.length > 0 && pickedCount === 0)}
              aria-busy={busy} className="flex-1 rounded-xl text-[15px] font-black transition-opacity disabled:opacity-40" style={CTA}>
              {busy ? "Saving…" : def.response === "ack" ? `${def.prompt.split(" — ")[0]} →` : idx === STEP_KEYS.length - 1 ? "Save my chapters →" : "Next →"}
            </button>
          </div>
          {d.beta && <BetaFeedback screen={`Onboarding step ${def.key}`} legacyToken={legacyToken} isTest={d.isTest} />}
        </>
      )}

      {stepKey === "resume" && (
        <>
          <h1 className="mt-3 text-[28px] font-black leading-[1.08]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Send it to Lee.</h1>
          <p className="mt-2 text-[14.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>All six steps are in. One optional thing, then it goes to his phone.</p>
          <div className="mt-5 rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
            <label style={LABEL}>Resume (optional)</label>
            <p className="text-[13.5px]" style={{ color: "var(--brand-cream)" }}>{RESUME_PROMPT}</p>
            <input id="rep-resume" type="file" accept=".pdf,.doc,.docx,image/*" className="hidden" onChange={(e) => void pickResume(e.target.files?.[0])} />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label htmlFor="rep-resume" className="inline-flex cursor-pointer items-center rounded-xl px-4 text-[13.5px] font-black" style={{ minHeight: 44, background: "var(--bg-overlay)", border: "1px dashed var(--border-default)", color: "var(--brand-cream)" }}>{uploading ? "Uploading…" : resume ? "Replace" : "Attach a file"}</label>
              {resume && <span className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>📎 {resume.name} <button type="button" onClick={() => setResume(null)} className="ml-1 underline underline-offset-4">remove</button></span>}
            </div>
          </div>
          {err && <p className="mt-3 text-[12.5px]" role="alert" style={{ color: "#F3C6CC" }}>{err}</p>}
          <div className="mt-4 flex items-center gap-3">
            <button type="button" onClick={() => onStep("6")} className="rounded-xl px-4 text-[13.5px] font-black" style={{ minHeight: 52, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}>Back</button>
            <button type="button" onClick={() => void submit()} disabled={busy || uploading} aria-busy={busy} className="flex-1 rounded-xl text-[15px] font-black disabled:opacity-40" style={CTA}>{busy ? "Sending…" : "Send to Lee →"}</button>
          </div>
          {preview && <div className="mt-4 rounded-xl p-3 text-[12px]" style={{ background: "rgba(122,46,18,0.18)", border: "1px solid #C2571F", color: "#FFC9A3", whiteSpace: "pre-wrap" }}><b>Test Mode — Lee's text:</b>{"\n"}{preview}</div>}
          {d.beta && <BetaFeedback screen="Resume + submit" legacyToken={legacyToken} isTest={d.isTest} />}
        </>
      )}
    </section>
  );
}

function PayTable({ title, rows, locked }: { title: string; rows: readonly { what: string; amount: string; note?: string }[]; locked?: boolean }) {
  return (
    <div className="rounded-xl px-4 py-3" style={{ background: "var(--bg-surface)", border: `1px ${locked ? "dashed" : "solid"} var(--border-default)`, opacity: locked ? 0.85 : 1 }}>
      <p className="text-[11.5px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.12em" }}>{locked ? "🔒 " : ""}{title}</p>
      <div className="mt-1.5 grid gap-1">
        {rows.map((r) => (
          <div key={r.what} className="flex items-baseline justify-between gap-3 text-[13px]">
            <span style={{ color: "var(--brand-cream)" }}>{r.what}{r.note ? <span style={{ color: "var(--text-muted)" }}> · {r.note}</span> : null}</span>
            <b className="shrink-0" style={{ color: "var(--accent)" }}>{r.amount}</b>
          </div>
        ))}
      </div>
      {locked && <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>Not offered at signup — you graduate into it. Something to work toward.</p>}
    </div>
  );
}
