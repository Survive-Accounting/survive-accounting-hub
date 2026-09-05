// /send — send in your syllabus.
//
// Lee (2026-09-04): "For sending in syllabi. Maybe surviveaccounting.com/fullsend
// or something or /send? we'll set up a route just for syllabi collection."
// The ad slide says surviveaccounting.com/send, so this is /send.
//
// One page, one job. It rides the SAME intake the landing page's syllabus drawer
// uses (submitSyllabus: files to storage, a row in the intake table, the email
// Lee already gets) — no new table, no new pipeline. Email + up to five files;
// campus and a note are optional because a student typing this from a phone
// should not have to fill in a form to hand over a PDF.
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Upload } from "lucide-react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { SurviveWordmark } from "@/components/brand-cards/bolt-boil";
import { Footer } from "@/components/site/SiteFooter";
import { SiteHeader, useNavyDocument } from "@/components/site/SiteHeader";
import { submitSyllabus } from "@/lib/syllabus.functions";

export const Route = createFileRoute("/send")({
  component: SendPage,
  head: () => ({ meta: [
    { title: "Send in your syllabus — Survive Accounting" },
    { name: "description", content: "Send Lee your accounting syllabus and the cram sets get built from what your professor actually tests." },
  ] }),
});

const CREAM = "#F4EFE6";
const MUTED = "rgba(244,239,230,0.62)";
const GOLD = "#FCA311";
const MAX_FILES = 5;

function readAsDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error(`Could not read "${f.name}".`));
    r.readAsDataURL(f);
  });
}

function SendPage() {
  useNavyDocument();
  const [email, setEmail] = useState("");
  const [campus, setCampus] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const ready = emailOk && files.length > 0 && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true); setErr(null);
    try {
      const payload = await Promise.all(files.slice(0, MAX_FILES).map(async (f) => ({ name: f.name, type: f.type, dataUrl: await readAsDataUrl(f) })));
      await submitSyllabus({ data: { email: email.trim(), campusName: campus.trim() || null, note: note.trim() || null, files: payload } });
      setDone(true);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Something went wrong — try again, or email it to lee@surviveaccounting.com.");
    } finally { setBusy(false); }
  };

  const field: React.CSSProperties = { width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(244,239,230,0.18)", borderRadius: 10, padding: "12px 14px", color: CREAM, fontFamily: BRAND_SANS, fontSize: 16, outline: "none" };
  const label: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED, marginBottom: 6 };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: BRAND_SANS, color: CREAM }}>
      <SiteHeader />
      <main style={{ flex: 1, width: "100%", maxWidth: 640, margin: "0 auto", padding: "40px 20px 72px" }}>
        <div style={{ marginBottom: 18 }}><SurviveWordmark size={44} /></div>
        <h1 style={{ fontFamily: BRAND_DISPLAY, fontSize: "clamp(30px, 6vw, 44px)", lineHeight: 1.04, margin: "0 0 12px", textWrap: "balance" as never }}>Send me your syllabus + study guides.</h1>
        <p style={{ fontSize: 17, lineHeight: 1.5, color: MUTED, margin: "0 0 28px" }}>Any accounting class, any campus. Your syllabus, study guides and the weird questions help me cover what your professor actually tests — and bring Survive to more campuses. A screenshot is plenty.</p>

        {done ? (
          <div style={{ border: `1px solid ${GOLD}`, borderRadius: 14, padding: "22px 20px", background: "rgba(252,163,17,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: BRAND_DISPLAY, fontSize: 24 }}><Check size={22} color={GOLD} /> Got it.</div>
            <p style={{ margin: "8px 0 0", color: MUTED, fontSize: 15, lineHeight: 1.5 }}>Lee reads every one. If your class is not on the site yet, this is how it gets there — watch your inbox.</p>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <label style={label} htmlFor="send-files">Your syllabus — up to {MAX_FILES} files, 10MB each</label>
              <label htmlFor="send-files" style={{ ...field, display: "flex", alignItems: "center", gap: 12, cursor: "pointer", borderStyle: "dashed", padding: "18px 14px" }}>
                <Upload size={20} color={GOLD} />
                <span style={{ color: files.length ? CREAM : MUTED }}>{files.length ? files.map((f) => f.name).join(", ") : "PDF, a photo, a screenshot — tap to choose"}</span>
              </label>
              <input id="send-files" type="file" multiple accept=".pdf,image/*,.doc,.docx" style={{ display: "none" }}
                onChange={(e) => { const list = Array.from(e.target.files ?? []); if (list.length > MAX_FILES) setErr(`Up to ${MAX_FILES} files at a time.`); setFiles(list.slice(0, MAX_FILES)); }} />
            </div>
            <div>
              <label style={label} htmlFor="send-email">Your email — so I can tell you when it's up</label>
              <input id="send-email" style={field} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" />
            </div>
            <div>
              <label style={label} htmlFor="send-campus">Campus <span style={{ opacity: 0.6, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
              <input id="send-campus" style={field} value={campus} onChange={(e) => setCampus(e.target.value)} placeholder="e.g. Ole Miss" />
            </div>
            <div>
              <label style={label} htmlFor="send-note">Anything I should know <span style={{ opacity: 0.6, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
              <textarea id="send-note" style={{ ...field, minHeight: 84, resize: "vertical" }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Which exam is next, what the professor emphasises, the course code…" />
            </div>
            {err && <div style={{ color: "#F87171", fontSize: 14 }}>{err}</div>}
            <button type="submit" disabled={!ready} style={{ background: ready ? GOLD : "rgba(252,163,17,0.35)", color: "#111A32", border: "none", borderRadius: 12, padding: "14px 18px", fontFamily: BRAND_DISPLAY, fontSize: 20, fontWeight: 800, cursor: ready ? "pointer" : "default" }}>
              {busy ? "Sending…" : "Send it to Lee"}
            </button>
            <div style={{ fontSize: 12.5, color: MUTED }}>Your files go to Lee and nobody else. Nothing here signs you up for anything.</div>
          </form>
        )}
      </main>
      <Footer />
    </div>
  );
}
