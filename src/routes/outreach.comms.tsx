// /outreach/comms — the COMMS CONSOLE (spec §6 + §8): the test harness ("send me one of each",
// per-template re-send, in-browser preview with SMS segment count), the "Exam N videos are live"
// broadcast (preview → count → confirm → send, double-send-proof), and a manual run of the daily
// follow-up sequences. Admin-only: every server fn re-checks the caller's token.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { supabase } from "@/integrations/supabase/client";
import { previewBroadcast, runSequencesNow, sendBroadcast, sendTestMessages } from "@/lib/comms.functions";
import { ALL_TEMPLATES, renderTemplate, SAMPLE_CTX, type TemplateKey } from "@/lib/comms/templates";

export const Route = createFileRoute("/outreach/comms")({
  head: () => ({ meta: [{ title: "Comms console — outreach" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: CommsConsole,
});

// The outreach shell's content area is LIGHT — these are its tokens, not the navy player's.
const INK = "#0B1220", MUTED = "#6B7280", LINE = "#E5E7EB", PANEL = "#F8FAFC";
const CARD: React.CSSProperties = { background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 16, padding: 18 };
const FIELD: React.CSSProperties = { minHeight: 40, background: "#FFFFFF", border: `1px solid #CBD5E1`, color: INK, fontSize: 14 };
const BTN: React.CSSProperties = { minHeight: 38, background: "#FCA311", color: INK, fontWeight: 800, borderRadius: 10, padding: "0 14px", fontSize: 13 };
const GHOST: React.CSSProperties = { ...BTN, background: "#EEF2F7", color: INK, fontWeight: 700 };
const SUB: React.CSSProperties = { background: PANEL, border: `1px solid ${LINE}` };

/** GSM-7 vs UCS-2 segment math — the thing that decides whether a "one-liner" is one segment. */
const GSM = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]*$/;
export function smsSegments(body: string): { segments: number; encoding: "GSM-7" | "UCS-2"; chars: number } {
  const gsm = GSM.test(body);
  const ext = gsm ? (body.match(/[\^{}\\[~\]|€]/g)?.length ?? 0) : 0;
  const chars = body.length + ext;
  const single = gsm ? 160 : 70, multi = gsm ? 153 : 67;
  return { segments: chars <= single ? 1 : Math.ceil(chars / multi), encoding: gsm ? "GSM-7" : "UCS-2", chars };
}

function CommsConsole() {
  const [token, setToken] = useState<string | null>(null);
  const [toEmail, setToEmail] = useState("lee@survivestudios.com");
  const [toPhone, setToPhone] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { email?: string; sms?: string }>>({});
  const [previewKey, setPreviewKey] = useState<TemplateKey | null>(null);
  const [preview, setPreview] = useState<{ subject: string; text: string; html: string; sms?: string } | null>(null);
  const [previewMobile, setPreviewMobile] = useState(false);
  // broadcast
  const [exam, setExam] = useState(1);
  const [topic, setTopic] = useState("");
  const [includeUnspecified, setIncludeUnspecified] = useState(true);
  const [bPreview, setBPreview] = useState<Awaited<ReturnType<typeof previewBroadcast>> | null>(null);
  const [bResult, setBResult] = useState<string | null>(null);
  // sequences
  const [seqReport, setSeqReport] = useState<string | null>(null);

  useEffect(() => { void supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null)); }, []);
  const groups = useMemo(() => ["Confirmations", "Sequences", "Broadcast", "Founder alerts"] as const, []);

  const send = async (keys: TemplateKey[]) => {
    if (!token) return;
    setBusy(keys.length > 1 ? "all" : keys[0]);
    try {
      const r = await sendTestMessages({ data: { accessToken: token, keys, toEmail, toPhone: toPhone || null } });
      if (!r) { setResults({ _: { email: "not an admin" } }); return; }
      setResults((prev) => { const n = { ...prev }; for (const x of r.results) n[x.key] = { email: x.email, sms: x.sms }; return n; });
    } finally { setBusy(null); }
  };
  // Previews render IN the browser from the shared template module — sample data only, no
  // secrets, so copy can be iterated without a round-trip (or a sign-in).
  const openPreview = (key: TemplateKey) => { setPreviewKey(key); setPreview(renderTemplate(key, { ...SAMPLE_CTX, isTest: true })); };
  const doPreviewBroadcast = async () => {
    if (!token) return;
    setBusy("bpreview"); setBResult(null);
    try { setBPreview(await previewBroadcast({ data: { accessToken: token, exam, topic: topic || null, includeUnspecified } })); } finally { setBusy(null); }
  };
  const doSendBroadcast = async () => {
    if (!token || !bPreview) return;
    if (!window.confirm(`Send "${bPreview.sample.subject}" to ${bPreview.count} ${bPreview.count === 1 ? "person" : "people"}? This can't be undone.`)) return;
    setBusy("bsend");
    try {
      const r = await sendBroadcast({ data: { accessToken: token, exam, topic: topic || null, includeUnspecified, confirmCount: bPreview.count } });
      setBResult(!r ? "not an admin" : r.ok ? `Sent ${r.sent}, skipped ${r.skipped} (suppressed / cap / already sent).` : r.error ?? "failed");
      if (r?.ok) setBPreview(null);
    } finally { setBusy(null); }
  };
  const runSeq = async (dryRun: boolean) => {
    if (!token) return;
    setBusy(dryRun ? "seqdry" : "seq");
    try { const r = await runSequencesNow({ data: { accessToken: token, dryRun } }); setSeqReport(r ? JSON.stringify(r, null, 2) : "not an admin"); } finally { setBusy(null); }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8" style={{ color: INK, fontFamily: BRAND_SANS }}>
      <div className="mb-6 flex flex-wrap items-baseline gap-3">
        <h1 className="text-[24px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>Comms console</h1>
        <span className="text-[12px]" style={{ color: MUTED }}>Everything a student can receive, sent to you first.</span>
        <Link to="/outreach/demand" className="ml-auto text-[12.5px] underline" style={{ color: "#B45309" }}>Demand list →</Link>
      </div>
      {!token && <p className="text-[13px]" style={{ color: "#B91C1C" }}>Sign in with an admin account first — previews work without it, sends don't.</p>}

      {/* ---- TEST HARNESS ---- */}
      <section style={CARD}>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <h2 className="text-[15px] font-black">Send me one of each</h2>
            <p className="text-[12px]" style={{ color: MUTED }}>Every message, [TEST]-prefixed, realistic sample data ({SAMPLE_CTX.name} · {SAMPLE_CTX.school} · {SAMPLE_CTX.courseCode} · Prof. {SAMPLE_CTX.professor}).</p>
          </div>
          <label className="text-[11px]" style={{ color: MUTED }}>To email<br /><input value={toEmail} onChange={(e) => setToEmail(e.target.value)} className="mt-1 w-[240px] rounded-lg px-3 outline-none" style={FIELD} /></label>
          <label className="text-[11px]" style={{ color: MUTED }}>To phone (E.164)<br /><input value={toPhone} onChange={(e) => setToPhone(e.target.value)} placeholder="+1…" className="mt-1 w-[170px] rounded-lg px-3 outline-none" style={FIELD} /></label>
          <button disabled={!token || !!busy} onClick={() => void send(ALL_TEMPLATES.map((t) => t.key))} style={BTN} className="disabled:opacity-50">{busy === "all" ? "Sending…" : "Send me one of each"}</button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {groups.map((g) => (
            <div key={g}>
              <div className="mb-1 text-[10.5px] font-black uppercase tracking-[0.14em]" style={{ color: "#B45309" }}>{g}</div>
              <div className="divide-y" style={{ borderColor: LINE }}>
                {ALL_TEMPLATES.filter((t) => t.group === g).map((t) => {
                  const r = results[t.key];
                  return (
                    <div key={t.key} className="flex flex-wrap items-center gap-2 py-1.5 text-[12.5px]">
                      <span className="min-w-0 flex-1 truncate">{t.label}</span>
                      {r?.email && <span className="text-[10.5px]" style={{ color: r.email.startsWith("sent") ? "#15803D" : "#B91C1C" }}>✉ {r.email}</span>}
                      {r?.sms && <span className="text-[10.5px]" style={{ color: r.sms.startsWith("sent") || r.sms.startsWith("queued") ? "#15803D" : "#B91C1C" }}>📱 {r.sms}</span>}
                      <button onClick={() => openPreview(t.key)} style={{ ...GHOST, minHeight: 28, padding: "0 10px", fontSize: 11.5 }}>Preview</button>
                      <button disabled={!token || !!busy} onClick={() => void send([t.key])} style={{ ...GHOST, minHeight: 28, padding: "0 10px", fontSize: 11.5 }} className="disabled:opacity-50">{busy === t.key ? "…" : "Re-send"}</button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---- PREVIEW ---- */}
      {previewKey && (
        <section className="mt-5" style={CARD}>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-[15px] font-black">Preview · {ALL_TEMPLATES.find((t) => t.key === previewKey)?.label}</h2>
            <label className="text-[12px]"><input type="checkbox" checked={previewMobile} onChange={(e) => setPreviewMobile(e.target.checked)} /> phone width</label>
            <button onClick={() => { setPreviewKey(null); setPreview(null); }} style={{ ...GHOST, minHeight: 28, padding: "0 10px", fontSize: 11.5, marginLeft: "auto" }}>Close</button>
          </div>
          {!preview ? <p className="mt-3 text-[12px]" style={{ color: MUTED }}>Rendering…</p> : (
            <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_320px]">
              <div>
                <div className="mb-1 text-[12px]" style={{ color: MUTED }}>Subject: <b style={{ color: INK }}>{preview.subject}</b></div>
                <iframe title="email preview" srcDoc={preview.html} className="rounded-lg bg-white" style={{ width: previewMobile ? 390 : "100%", height: 560, border: `1px solid ${LINE}` }} />
              </div>
              <div className="flex flex-col gap-3">
                {preview.sms && (() => { const s = smsSegments(preview.sms); return (
                  <div className="rounded-xl p-3" style={SUB}>
                    <div className="mb-1 text-[10.5px] font-black uppercase tracking-[0.12em]" style={{ color: "#B45309" }}>SMS · {s.chars} chars · {s.encoding} · {s.segments} segment{s.segments === 1 ? "" : "s"}</div>
                    <div className="whitespace-pre-wrap text-[13px]">{preview.sms}</div>
                  </div>
                ); })()}
                <div className="rounded-xl p-3" style={SUB}>
                  <div className="mb-1 text-[10.5px] font-black uppercase tracking-[0.12em]" style={{ color: "#B45309" }}>Plain text</div>
                  <pre className="whitespace-pre-wrap text-[11.5px] leading-relaxed" style={{ fontFamily: BRAND_SANS }}>{preview.text}</pre>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ---- BROADCAST ---- */}
      <section className="mt-5" style={CARD}>
        <h2 className="text-[15px] font-black">Broadcast · “Exam N videos are live”</h2>
        <p className="text-[12px]" style={{ color: MUTED }}>Everyone who asked to be notified for that exam. Preview shows the count; suppressed, capped and already-sent people are excluded automatically, and each lead can only ever get it once.</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-[11px]" style={{ color: MUTED }}>Exam<br />
            <select value={exam} onChange={(e) => { setExam(Number(e.target.value)); setBPreview(null); }} className="mt-1 rounded-lg px-3 outline-none" style={FIELD}>
              <option value={1}>Exam 1</option><option value={2}>Exam 2</option><option value={3}>Exam 3</option><option value={99}>Final</option>
            </select></label>
          <label className="text-[11px]" style={{ color: MUTED }}>Topic (optional)<br /><input value={topic} onChange={(e) => { setTopic(e.target.value); setBPreview(null); }} placeholder="e.g. Merchandising" className="mt-1 w-[200px] rounded-lg px-3 outline-none" style={FIELD} /></label>
          <label className="text-[12px]"><input type="checkbox" checked={includeUnspecified} onChange={(e) => { setIncludeUnspecified(e.target.checked); setBPreview(null); }} /> include signups that didn't name an exam</label>
          <button disabled={!token || !!busy} onClick={() => void doPreviewBroadcast()} style={GHOST} className="disabled:opacity-50">{busy === "bpreview" ? "Counting…" : "Preview"}</button>
          {bPreview && <button disabled={!!busy || bPreview.count === 0} onClick={() => void doSendBroadcast()} style={BTN} className="disabled:opacity-50">{busy === "bsend" ? "Sending…" : `Send to ${bPreview.count}`}</button>}
        </div>
        {bPreview && (
          <div className="mt-3 grid gap-3 lg:grid-cols-[280px_1fr]">
            <div className="rounded-xl p-3 text-[12.5px]" style={SUB}>
              <div className="text-[22px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>{bPreview.count} <span className="text-[12px] font-bold" style={{ color: MUTED }}>recipients</span></div>
              <div style={{ color: MUTED }}>{bPreview.suppressed} suppressed · {bPreview.alreadySent} already sent · {bPreview.duplicates} duplicate emails</div>
              {bPreview.campuses.length > 0 && <div className="mt-2" style={{ color: MUTED }}>Campuses: {bPreview.campuses.join(", ")}</div>}
              <div className="mt-2">Subject: <b>{bPreview.sample.subject}</b></div>
            </div>
            <iframe title="broadcast preview" srcDoc={bPreview.sample.html} className="rounded-lg bg-white" style={{ width: "100%", height: 360, border: `1px solid ${LINE}` }} />
          </div>
        )}
        {bResult && <p className="mt-3 text-[13px] font-bold" style={{ color: "#15803D" }}>{bResult}</p>}
      </section>

      {/* ---- SEQUENCES ---- */}
      <section className="mt-5" style={CARD}>
        <h2 className="text-[15px] font-black">Follow-up sequences</h2>
        <p className="text-[12px]" style={{ color: MUTED }}>Runs daily at 9am CT. A (exam dates) → B (post-Exam-1) → C (meet Lee); 2 emails per 7 days max, exam-date messages first. Dry run shows what would go out today.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button disabled={!token || !!busy} onClick={() => void runSeq(true)} style={GHOST} className="disabled:opacity-50">{busy === "seqdry" ? "…" : "Dry run"}</button>
          <button disabled={!token || !!busy} onClick={() => { if (window.confirm("Run the sequences for real right now?")) void runSeq(false); }} style={BTN} className="disabled:opacity-50">{busy === "seq" ? "Running…" : "Run now"}</button>
        </div>
        {seqReport && <pre className="mt-3 whitespace-pre-wrap rounded-xl p-3 text-[11.5px]" style={SUB}>{seqReport}</pre>}
      </section>
    </div>
  );
}
