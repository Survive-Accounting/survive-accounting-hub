// /order/$shortRef — student Help Video request tracker. Gated by an email
// magic-link → httpOnly session cookie (a shared URL alone can't view the data).
// A lightweight "pizza tracker": receipt + stage stepper + upload/notes.
import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Toaster, toast } from "sonner";
import { Check, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  requestOrderAccess, redeemOrderAccess, getOrderForStudent,
  updateStudentOrderDetails, uploadStudentSyllabus,
  type GetOrderForStudentResult, type StudentOrder, type StageEvent,
} from "@/lib/order-tracker.functions";

const NAVY = "#14213D";
const RED = "#CE1126";
const LOGO_URL = "https://lwfiles.mycourse.app/672bc379cd024d536f651ecc-public/1554d231f0e2bf121ac35937c4d438ca.png";
const WORK_PHONE = "(662) 565-8818";
const WORK_PHONE_HREF = "+16625658818";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

const SCOPE_LABELS: Record<string, string> = {
  topic: "One topic I’m stuck on",
  chapter: "One chapter",
  exam: "Everything on my next exam",
  not_sure: "Not sure — sending what I have",
};

// Main stepper stages (post_exam_check_in is shown separately below).
const STAGE_STEPS = [
  { key: "request_received", label: "Request received" },
  { key: "reviewing", label: "Reviewing your class" },
  { key: "preview_in_progress", label: "Preview in progress" },
  { key: "preview_ready", label: "Preview ready" },
  { key: "delivered", label: "Unlocked + delivered" },
] as const;
const STAGE_INDEX: Record<string, number> = {
  request_received: 0, reviewing: 1, preview_in_progress: 2, preview_ready: 3, unlocked: 4, delivered: 4,
};

const money = (c: number) => `$${Math.round(c / 100)}`;
const fmtDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const examLabel = (o: StudentOrder) =>
  o.exam_date ? fmtDate(o.exam_date)
    : o.exam_timeframe === "not_sure" ? "Not sure yet"
    : o.exam_timeframe === "this_week" ? "This week"
    : o.exam_timeframe === "next_week" ? "Next week" : "—";

export const Route = createFileRoute("/order/$shortRef")({
  head: () => ({
    meta: [
      { title: "Track your Help Video — Survive Accounting" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TrackerPage,
});

type Phase = "loading" | "auth" | "expired" | "tracker";

function TrackerPage() {
  const { shortRef } = Route.useParams();
  const redeemFn = useServerFn(redeemOrderAccess);
  const getFn = useServerFn(getOrderForStudent);

  const [phase, setPhase] = useState<Phase>("loading");
  const [data, setData] = useState<Extract<GetOrderForStudentResult, { ok: true }> | null>(null);

  const load = async () => {
    const res = await getFn({ data: { short_ref: shortRef } });
    if (res.ok) { setData(res); setPhase("tracker"); } else { setPhase("auth"); }
  };

  useEffect(() => {
    let off = false;
    (async () => {
      const t = new URLSearchParams(window.location.search).get("t");
      if (t) {
        try {
          const r = await redeemFn({ data: { short_ref: shortRef, token: t } });
          window.history.replaceState({}, "", `/order/${shortRef}`);
          if (!r.ok) { if (!off) setPhase("expired"); return; }
        } catch { window.history.replaceState({}, "", `/order/${shortRef}`); }
      }
      if (!off) await load();
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortRef]);

  return (
    <div className="min-h-screen" style={{ background: "#FAFAF7", fontFamily: "Inter, -apple-system, sans-serif" }}>
      <Toaster richColors position="top-center" />
      <Header />
      <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8">
        {phase === "loading" && <div className="py-20 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-gray-400" /></div>}
        {(phase === "auth" || phase === "expired") && <AuthCard shortRef={shortRef} expired={phase === "expired"} />}
        {phase === "tracker" && data && <Tracker shortRef={shortRef} data={data} onReload={load} />}
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 w-full border-b"
      style={{ background: "linear-gradient(180deg, rgba(20,33,61,0.98) 0%, rgba(16,26,49,0.98) 100%)", borderColor: "rgba(255,255,255,0.08)" }}>
      <div className="mx-auto flex h-14 w-full max-w-2xl items-center px-4">
        <a href="/" aria-label="Survive Accounting — home" className="inline-flex items-center">
          <img src={LOGO_URL} alt="Survive Accounting" className="h-5 w-auto select-none" draggable={false} />
        </a>
      </div>
    </header>
  );
}

// ---------- Auth card ----------
function AuthCard({ shortRef, expired }: { shortRef: string; expired: boolean }) {
  const reqFn = useServerFn(requestOrderAccess);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { toast.error("Enter a valid email."); return; }
    setBusy(true);
    try { await reqFn({ data: { short_ref: shortRef, email: email.trim() } }); setSent(true); }
    catch { setSent(true); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-3xl bg-white p-6 shadow-[0_10px_40px_-15px_rgba(20,33,61,0.15)] sm:p-9">
      {sent ? (
        <div className="text-center">
          <div className="mx-auto grid h-14 w-14 place-content-center rounded-full bg-emerald-50"><Check className="h-8 w-8 text-emerald-600" /></div>
          <h1 className="mt-5 text-xl font-bold" style={{ color: NAVY }}>Check your email</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
            If that email matches this request, I sent a secure link that works for 30 days.
          </p>
        </div>
      ) : (
        <>
          <h1 className="text-xl font-bold sm:text-2xl" style={{ color: NAVY }}>Track your Help Video</h1>
          {expired && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">This link expired or is invalid. Request a new secure link.</p>
          )}
          <p className="mt-2 text-sm text-gray-600">
            Enter the email you used when you submitted your request. I’ll send you a secure link to view your tracker.
          </p>
          <div className="mt-5">
            <Label className="mb-1.5 block text-sm font-medium text-gray-800">Email</Label>
            <Input type="email" value={email} autoFocus placeholder="you@school.edu"
              onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
          </div>
          <Button onClick={submit} disabled={busy} className="mt-5 h-12 w-full text-base font-bold text-white"
            style={{ background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)` }}>
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</> : "Send my secure link"}
          </Button>
        </>
      )}
      <p className="mt-6 text-center text-xs text-gray-500">
        Questions? Text me at{" "}
        <a href={`sms:${WORK_PHONE_HREF}`} className="font-semibold hover:underline" style={{ color: RED }}>{WORK_PHONE}</a>
      </p>
    </div>
  );
}

// ---------- Tracker ----------
function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5" style={{ fontFamily: MONO, fontSize: "12.5px", color: strong ? NAVY : "#374151" }}>
      <span className={strong ? "font-bold" : ""}>{label}</span>
      <span className="mb-[3px] flex-1 border-b border-dotted border-gray-400" />
      <span className={cn("text-right", strong && "font-bold")}>{value}</span>
    </div>
  );
}

function Tracker({ shortRef, data, onReload }: {
  shortRef: string; data: Extract<GetOrderForStudentResult, { ok: true }>; onReload: () => void;
}) {
  const o = data.order;
  const events = data.stage_events;
  const reached = events.reduce((mx, e) => Math.max(mx, STAGE_INDEX[e.stage] ?? -1), 0);
  const latestFor = (stageKeys: string[]): StageEvent | undefined =>
    [...events].reverse().find((e) => stageKeys.includes(e.stage));
  const checkIn = latestFor(["post_exam_check_in"]);

  const course = [o.course_code, o.course_name].filter(Boolean).join(" · ") || "—";
  const requestType = o.request_scope ? (SCOPE_LABELS[o.request_scope] ?? o.request_scope) : (o.chapters[0] ?? "—");

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white p-6 shadow-[0_10px_40px_-15px_rgba(20,33,61,0.15)] sm:p-8">
        <h1 className="text-xl font-bold sm:text-2xl" style={{ color: NAVY }}>Help Video #{o.short_ref}</h1>
        <p className="mt-1.5 text-sm text-gray-600">Track your request, upload anything I need, and see when your preview is ready.</p>

        {/* Receipt */}
        <div className="mt-5 rounded-2xl border bg-gray-50 p-4">
          <div className="space-y-1.5">
            <Row label="SCHOOL" value={o.campus_name || o.campus_text || "—"} />
            <Row label="COURSE" value={course} />
            <Row label="PROFESSOR" value={o.professor_name || "—"} />
            <Row label="REQUEST TYPE" value={requestType} />
            <Row label="EXAM" value={examLabel(o)} />
            <Row label="PREVIEW TARGET" value={o.delivery_target_date ? `by ${fmtDate(o.delivery_target_date)}` : "I’ll confirm by text"} />
          </div>
          {o.request_notes && (
            <div className="mt-3 border-t border-dashed border-gray-300 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500" style={{ fontFamily: MONO }}>Topics / notes</p>
              <p className="mt-1 text-sm text-gray-700">{o.request_notes}</p>
            </div>
          )}
          <div className="mt-3 border-t border-dashed border-gray-300 pt-3 space-y-1.5">
            <Row label="DUE TODAY" value="$0" strong />
            <Row label="PAYMENT" value="Pay only if you unlock the full Help Video" />
            <Row label="ESTIMATED PRICE" value="Usually $30–$100 depending on scope" />
            {o.unlock_price_cents != null && <Row label="UNLOCK PRICE" value={money(o.unlock_price_cents)} strong />}
            {o.preview_url && <Row label="PREVIEW" value={<a href={o.preview_url} target="_blank" rel="noreferrer" className="underline" style={{ color: RED }}>Watch →</a>} />}
          </div>
        </div>
      </div>

      {/* Stepper */}
      <div className="rounded-3xl bg-white p-6 shadow-[0_10px_40px_-15px_rgba(20,33,61,0.15)] sm:p-8">
        <ol className="space-y-0">
          {STAGE_STEPS.map((s, i) => {
            const state = i < reached ? "done" : i === reached ? "current" : "future";
            const ev = latestFor(s.key === "delivered" ? ["unlocked", "delivered"] : [s.key]);
            const isLast = i === STAGE_STEPS.length - 1;
            return (
              <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
                {!isLast && <span className="absolute left-[11px] top-6 h-[calc(100%-12px)] w-px" style={{ background: state === "done" ? RED : "#E5E7EB" }} />}
                <span className={cn("z-10 mt-0.5 grid h-6 w-6 shrink-0 place-content-center rounded-full border-2",
                  state === "done" ? "border-transparent text-white" : state === "current" ? "bg-white" : "border-gray-300 bg-white")}
                  style={state === "done" ? { background: RED } : state === "current" ? { borderColor: RED } : undefined}>
                  {state === "done" ? <Check className="h-3.5 w-3.5" /> : <span className="h-2 w-2 rounded-full" style={{ background: state === "current" ? RED : "#D1D5DB" }} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-semibold", state === "future" ? "text-gray-400" : "")} style={state !== "future" ? { color: NAVY } : undefined}>{s.label}</p>
                  {ev?.student_visible_message && <p className="mt-0.5 text-sm text-gray-600">{ev.student_visible_message}</p>}
                  {s.key === "preview_ready" && (o.preview_url || ev?.preview_url) && (
                    <a href={(ev?.preview_url || o.preview_url)!} target="_blank" rel="noreferrer"
                      className="mt-1 inline-block text-sm font-semibold underline" style={{ color: RED }}>View preview</a>
                  )}
                  {s.key === "preview_ready" && o.unlock_price_cents != null && (
                    <div className="mt-2">
                      {latestFor(["unlocked", "preview_ready"])?.unlock_url ? (
                        <a href={latestFor(["unlocked", "preview_ready"])!.unlock_url!} className="inline-block rounded-lg px-4 py-2 text-sm font-bold text-white" style={{ background: RED }}>
                          Unlock full Help Video — {money(o.unlock_price_cents)}
                        </a>
                      ) : (
                        <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">Want to unlock the full Help Video? Text Lee at {WORK_PHONE}.</p>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        {checkIn?.student_visible_message && (
          <div className="mt-4 rounded-xl bg-gray-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Post-exam check-in</p>
            <p className="mt-1 text-sm text-gray-700">{checkIn.student_visible_message}</p>
          </div>
        )}
      </div>

      {/* Help me build the right pack */}
      <HelpSection shortRef={shortRef} order={o} onReload={onReload} />

      {/* Questions */}
      <div className="rounded-2xl border-2 p-5 text-center" style={{ borderColor: RED }}>
        <p className="text-sm font-semibold" style={{ color: NAVY }}>Questions? Text me at{" "}
          <a href={`sms:${WORK_PHONE_HREF}`} className="hover:underline" style={{ color: RED }}>{WORK_PHONE}</a></p>
      </div>

      <p className="px-2 text-center text-xs text-gray-500">
        Help Videos are designed to supplement your studying, not replace your class notes, homework, textbook, or professor’s materials.
      </p>
    </div>
  );
}

function HelpSection({ shortRef, order, onReload }: { shortRef: string; order: StudentOrder; onReload: () => void }) {
  const uploadFn = useServerFn(uploadStudentSyllabus);
  const updateFn = useServerFn(updateStudentOrderDetails);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [notes, setNotes] = useState(order.special_requests ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [priority, setPriority] = useState<string[]>(order.chapter_priority ?? order.chapters);

  const needsSyllabus = order.awaiting_syllabus || !order.has_syllabus;

  const onFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) { toast.error("Max 10MB."); return; }
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = ""; const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      const base64 = btoa(binary);
      const r = await uploadFn({ data: { short_ref: shortRef, fileName: file.name, contentType: file.type || "application/octet-stream", base64 } });
      if ("ok" in r && r.ok) { toast.success("Uploaded — thank you!"); onReload(); }
      else toast.error("Upload failed. Try again or text me.");
    } catch (e) { toast.error((e as Error).message); }
    finally { setUploading(false); }
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try { await updateFn({ data: { short_ref: shortRef, special_requests: notes.trim() || null } }); toast.success("Saved."); }
    catch (e) { toast.error((e as Error).message); } finally { setSavingNotes(false); }
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= priority.length) return;
    const next = [...priority]; [next[i], next[j]] = [next[j], next[i]];
    setPriority(next);
    updateFn({ data: { short_ref: shortRef, chapter_priority_json: next } }).catch(() => {});
  };

  return (
    <div className="rounded-3xl bg-white p-6 shadow-[0_10px_40px_-15px_rgba(20,33,61,0.15)] sm:p-8">
      <h2 className="text-lg font-bold" style={{ color: NAVY }}>Help me build the right Help Video</h2>

      <div className="mt-4">
        <p className="text-sm text-gray-700">
          {needsSyllabus
            ? "I still need your syllabus, review sheet, or topic list to make this match your class. Upload it here or reply to my text."
            : "Got your syllabus — thank you! Upload another file anytime."}
        </p>
        <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
        <Button variant="outline" className="mt-3 gap-2" disabled={uploading} onClick={() => fileRef.current?.click()}
          style={{ color: NAVY, borderColor: NAVY }}>
          {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</> : <><Upload className="h-4 w-4" /> Upload syllabus / review sheet</>}
        </Button>
        <p className="mt-1.5 text-[11px] text-gray-400">PDF, PNG, or JPG · up to 10MB</p>
      </div>

      <div className="mt-6">
        <Label className="mb-1.5 block text-sm font-medium text-gray-800">Anything specific I should focus on? <span className="text-gray-400">Optional.</span></Label>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Example: I keep missing adjusting entries, my professor gave us this review sheet, or I need more practice with bonds."
          className="w-full rounded-xl border border-input bg-background p-3 text-sm" />
        <Button className="mt-3 text-white" disabled={savingNotes} onClick={saveNotes}
          style={{ background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)` }}>
          {savingNotes ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : "Save notes"}
        </Button>
      </div>

      {(order.chapter_count_only ?? 0) >= 2 || priority.length >= 2 ? (
        <div className="mt-6">
          <p className="text-sm font-semibold text-gray-800">What should I make first?</p>
          <ol className="mt-2 space-y-1.5">
            {priority.map((label, i) => (
              <li key={`${label}-${i}`} className="flex items-center gap-2 rounded-lg border bg-gray-50 px-3 py-2 text-sm">
                <span className="grid h-5 w-5 place-content-center rounded-full text-[11px] font-bold text-white" style={{ background: NAVY }}>{i + 1}</span>
                <span className="flex-1">{label}</span>
                <button className="px-1 text-gray-400 hover:text-foreground disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button className="px-1 text-gray-400 hover:text-foreground disabled:opacity-30" disabled={i === priority.length - 1} onClick={() => move(i, 1)}>↓</button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
