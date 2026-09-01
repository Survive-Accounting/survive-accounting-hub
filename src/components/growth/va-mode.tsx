// VA enrichment mode — the stripped, mobile-first pieces a VA sees: a plain-language progress bar,
// a four-card getting-started walk-through, and a floating bolt that opens help + "report a problem".
// No schedule, batch, revenue, or strategy language anywhere here (that's the whole point).
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, HelpCircle, Mail, MessageSquare, Send, Upload, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { growthVaProblem } from "@/lib/growth-va.functions";
import type { ContactSlots } from "@/lib/growth-tranche.functions";
import { cn } from "@/lib/utils";

const LEE_PHONE = "(601) 201-8759";
const LEE_PHONE_TEL = "+16012018759";
const LEE_EMAIL = "lee@survivestudios.com";

// ── progress (item 4): plain language + a visible bar, each part with a one-line ? ──────────
export function VaProgress({ s }: { s: ContactSlots }) {
  const frats = s.chapters.filter((c) => c.orgType === "fraternity" && c.needed);
  const soros = s.chapters.filter((c) => c.orgType === "sorority" && c.needed);
  const fratDone = frats.filter((c) => c.contacts.length > 0).length;
  const soroDone = soros.filter((c) => c.contacts.length > 0).length;
  const councilCov = s.councils.filter((c) => c.contacts.length > 0).length;
  const clubCov = s.clubs.filter((c) => c.contacts.length > 0).length;
  const clubNeeded = s.clubTypes?.length ?? s.clubs.length;
  const needed = s.councils.length + frats.length + soros.length + clubNeeded;
  const covered = councilCov + fratDone + soroDone + clubCov;
  const pct = needed ? Math.round((covered / needed) * 100) : 0;

  const item = (label: string, done: boolean, count: string | null, tip: string) => (
    <span title={tip} className="inline-flex cursor-help items-center gap-1.5 text-[13px]">
      <span className={cn("font-medium", done ? "text-emerald-400" : "text-foreground")}>{label}</span>
      {done ? <Check className="size-3.5 text-emerald-400" /> : <span className="font-semibold tabular-nums text-muted-foreground">{count}</span>}
      <HelpCircle className="size-3 text-muted-foreground/50" />
    </span>
  );
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {item("Councils", s.readiness.councilOk, `${councilCov}`, "IFC, Panhellenic, NPHC and the Greek Life office. One contact each is enough.")}
        {item("Fraternities", fratDone >= frats.length && frats.length > 0, `${fratDone}/${frats.length}`, "The top 5 fraternities. One contact each — a name with a personal Instagram is best.")}
        {item("Sororities", soroDone >= soros.length && soros.length > 0, `${soroDone}/${soros.length}`, "The top 5 sororities. One contact each.")}
        {item("Club", s.readiness.clubOk, `${clubCov}/${clubNeeded}`, "One business club — Women in Business, Finance, or Investing.")}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full transition-all", s.readiness.ready ? "bg-emerald-500" : "bg-primary")} style={{ width: `${pct}%` }} />
        </div>
        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-muted-foreground">{covered} of {needed}</span>
      </div>
    </div>
  );
}

// ── getting started (item 3): four cards, shown first time, reopenable from help ────────────
const STEPS = [
  { n: 1, title: "Councils first", body: "IFC, Panhellenic, NPHC, and the Greek Life office. One contact each is enough to start." },
  { n: 2, title: "Then chapters", body: "The top 5 fraternities and top 5 sororities." },
  { n: 3, title: "Then one club", body: "Women in Business, Finance, or Investing." },
  { n: 4, title: "Personal Instagram", body: "The most valuable thing you can find. A person's own handle beats an organization account every time." },
];
const ONBOARD_KEY = "sa-va-onboarded";
export function hasOnboarded() { try { return localStorage.getItem(ONBOARD_KEY) === "yes"; } catch { return false; } }
export function OnboardingCards({ onClose }: { onClose: () => void }) {
  const done = () => { try { localStorage.setItem(ONBOARD_KEY, "yes"); } catch { /* ignore */ } onClose(); };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={done}>
      <div className="w-full max-w-md space-y-2.5 rounded-2xl border border-border bg-background p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <Zap className="size-5 text-primary" style={{ fill: "currentColor" }} />
          <h2 className="text-base font-semibold">How this works</h2>
          <button onClick={done} className="ml-auto grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
        </div>
        {STEPS.map((s) => (
          <div key={s.n} className="flex gap-3 rounded-xl border border-border bg-card p-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/15 text-[13px] font-bold text-primary">{s.n}</span>
            <div>
              <div className="text-[14px] font-semibold">{s.title}</div>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">{s.body}</p>
            </div>
          </div>
        ))}
        <button onClick={done} className="mt-1 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground">Got it — let's go</button>
      </div>
    </div>
  );
}

// ── the bolt is help (item 5): floating bolt → menu → report a problem ──────────────────────
export function VaHelp({ campusId, onHowItWorks, preview }: { campusId: string | null; onHowItWorks: () => void; preview?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Help" className="fixed bottom-4 right-4 z-40 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95">
        <Zap className="size-7 animate-pulse" style={{ fill: "currentColor" }} />
      </button>
      {open && !reporting && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-background" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Zap className="size-5 text-primary" style={{ fill: "currentColor" }} /><span className="font-semibold">Help</span>
              <button onClick={() => setOpen(false)} className="ml-auto grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
            </div>
            <button onClick={() => { setOpen(false); onHowItWorks(); }} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-muted"><HelpCircle className="size-5 text-muted-foreground" /><span className="text-sm font-medium">How this works</span></button>
            <a href={`sms:${LEE_PHONE_TEL}`} className="flex w-full items-center gap-3 border-t border-border px-4 py-3.5 hover:bg-muted"><MessageSquare className="size-5 text-muted-foreground" /><span className="text-sm"><span className="font-medium">Text Lee</span> <span className="text-muted-foreground">{LEE_PHONE}</span></span></a>
            <a href={`mailto:${LEE_EMAIL}`} className="flex w-full items-center gap-3 border-t border-border px-4 py-3.5 hover:bg-muted"><Mail className="size-5 text-muted-foreground" /><span className="text-sm"><span className="font-medium">Email Lee</span> <span className="text-muted-foreground">{LEE_EMAIL}</span></span></a>
            <button onClick={() => { if (preview) { toast.message("Report a problem sends from the VA's own link."); setOpen(false); } else setReporting(true); }} className="flex w-full items-center gap-3 border-t border-border px-4 py-3.5 text-left hover:bg-muted"><Send className="size-5 text-amber-400" /><span className="text-sm font-medium">Report a problem →</span></button>
          </div>
        </div>
      )}
      {open && reporting && <ReportProblem campusId={campusId} onClose={() => { setReporting(false); setOpen(false); }} onBack={() => setReporting(false)} />}
    </>
  );
}

function ReportProblem({ campusId, onClose, onBack }: { campusId: string | null; onClose: () => void; onBack: () => void }) {
  const [note, setNote] = useState("");
  const [shots, setShots] = useState<{ name: string; dataUrl: string }[]>([]);
  const addFiles = (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files).slice(0, 4)) {
      if (!f.type.startsWith("image/")) continue;
      const reader = new FileReader();
      reader.onload = () => setShots((s) => (s.length >= 4 ? s : [...s, { name: f.name, dataUrl: String(reader.result) }]));
      reader.readAsDataURL(f);
    }
  };
  const m = useMutation({
    mutationFn: () => growthVaProblem({ data: {
      note: note.trim(), campusId: campusId ?? null,
      page: typeof window !== "undefined" ? window.location.href.slice(0, 300) : undefined,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : undefined,
      screenshots: shots.length ? shots : undefined,
    } }),
    onSuccess: (r) => { if (r.ok) { toast.success("Got it — Lee will see this."); onClose(); } else toast.error(r.error ?? "Couldn't send"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't send"),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-sm space-y-3 rounded-2xl border border-border bg-background p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground">← Back</button>
          <span className="ml-1 font-semibold">Report a problem</span>
          <button onClick={onClose} className="ml-auto grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-medium text-muted-foreground">What happened?</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} autoFocus placeholder="Tell Lee what went wrong — a stuck button, a confusing step, anything." className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] font-medium hover:bg-muted">
              <Upload className="size-3.5" /> Add screenshot
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </label>
            <span className="text-[11px] text-muted-foreground">optional{shots.length ? ` · ${shots.length}/4` : ""}</span>
          </div>
          {shots.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {shots.map((s, i) => (
                <span key={i} className="relative">
                  <img src={s.dataUrl} alt="" className="size-14 rounded-lg border border-border object-cover" />
                  <button onClick={() => setShots((arr) => arr.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background"><X className="size-3" /></button>
                </span>
              ))}
            </div>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">The campus, your name, this page and your browser are attached automatically.</p>
        <button onClick={() => note.trim() && m.mutate()} disabled={!note.trim() || m.isPending} className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40">{m.isPending ? "Sending…" : "Send"}</button>
      </div>
    </div>
  );
}
