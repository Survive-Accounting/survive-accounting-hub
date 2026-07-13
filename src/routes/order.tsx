// /order — Request a personalized exam prep video. A student sends what they're
// stuck on (free, no card); Lee reviews and replies with a gameplan/quote; the
// student pays only after they approve and receive the video. Scope-first: the
// student's problem comes first, context second, identity last. Submit saves
// SERVER-SIDE (service-role) via submitOrder. Nothing is charged here.
//
// Two surfaces: an INTRO screen (identity + Start Request + reviews) and the
// WIZARD (sticky nav + progress + one compact step at a time, tuned so mobile
// needs almost no scrolling). Copy is intentionally hardcoded.
import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Toaster, toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, Loader2, Paperclip, Pencil, UploadCloud, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import leeHeadshot from "@/assets/lee-headshot-original.png";
import Reviews from "@/components/landing/Reviews";
import ContactForm from "@/components/landing/ContactForm";
import {
  getOrderCampusContext,
  searchOrderProfessors,
  submitOrder,
  type FamilyKey,
  type OrderCampusContext,
  type ProfessorLite,
  type ExamTimeframe,
  type SubmitOrderResult,
} from "@/lib/orders.functions";

const NAVY = "#14213D";
const RED = "#CE1126";
const SERIF = "'DM Serif Display', serif";
const LOGO_URL = "https://lwfiles.mycourse.app/672bc379cd024d536f651ecc-public/1554d231f0e2bf121ac35937c4d438ca.png";
const WORK_PHONE_DISPLAY = "(662) 565-8818";
const WORK_PHONE_HREF = "+16625658818";

const FOOTER_PREFIX = "Questions? Text me anytime at";

// Student-uploaded supporting files live in the private student-syllabi bucket;
// we keep only their metadata on the order (admin signs the path to view).
const UPLOAD_BUCKET = "student-syllabi";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
// Lead with image/* so phones offer Camera + Photo Library first-class (no
// `capture`, so the student keeps the choice), then common docs.
const UPLOAD_ACCEPT = "image/*,.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.ppt,.pptx";
type Attachment = { name: string; path: string; size: number };

export const Route = createFileRoute("/order")({
  head: () => ({
    meta: [
      { title: "Exam prep built for your exact class — Survive Accounting" },
      { name: "description", content: "Free to request. I quote before I build. You only pay once you approve and receive your exam prep video — made for your exact course." },
      // NOTE: /order is currently noindex (pre-existing). It is therefore omitted from
      // sitemap.xml. Flip both together if you want /order indexed.
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Exam prep built for your exact class" },
      { property: "og:description", content: "Free to request. I quote before I build — you only pay once you approve your video." },
      { property: "og:url", content: "https://surviveaccounting.com/order" },
    ],
    links: [{ rel: "canonical", href: "https://surviveaccounting.com/order" }],
  }),
  component: OrderPage,
});

const FAMILY_LABELS: Record<FamilyKey, string> = {
  intro_1: "Intro to Financial Accounting",
  intro_2: "Intro to Managerial Accounting",
  intermediate_1: "Intermediate Accounting I",
  intermediate_2: "Intermediate Accounting II",
};
const FAMILY_ORDER: FamilyKey[] = ["intro_1", "intro_2", "intermediate_1", "intermediate_2"];

// Scope-first: the student's problem comes first.
// Fall 2026 waitlist: slimmed to 4 steps. The scope / exam-date / detail+upload /
// major steps are hidden (their components remain in this file for later restore).
const STEPS = ["School", "Course", "Professor", "Your info"] as const;

// Interest multi-select (no pricing — demand-testing launch).
type Interest = "one_on_one" | "group" | "videos_tools" | "something_else";
const INTEREST_LABEL: Record<Interest, string> = {
  one_on_one: "1-on-1 virtual tutoring",
  group: "Group virtual tutoring",
  videos_tools: "Exam prep videos + practice tools",
  something_else: "Something else",
};
const INTEREST_ORDER: Interest[] = ["one_on_one", "group", "videos_tools", "something_else"];
const interestsLabel = (ts: Interest[]): string => INTEREST_ORDER.filter((t) => ts.includes(t)).map((t) => INTEREST_LABEL[t]).join(", ") || "—";
// A representative `tier` derived from interests, still written for the deployed
// notify-order fn + admin (which key off `tier`).
type TierValue = "made_to_order" | "one_on_one" | "something_else";
const deriveTier = (ts: Interest[]): TierValue =>
  ts.includes("videos_tools") ? "made_to_order"
    : (ts.includes("one_on_one") || ts.includes("group")) ? "one_on_one"
    : "something_else";

const MAJOR_OPTIONS: { value: string; label: string }[] = [
  { value: "yes", label: "Yes" }, { value: "no", label: "No" },
  { value: "definitely_not", label: "Definitely not" }, { value: "not_sure", label: "Not sure yet" },
];
const REFERRAL_OPTIONS: { value: string; label: string }[] = [
  { value: "professor", label: "Professor" }, { value: "friend", label: "Friend/classmate" },
  { value: "greek", label: "Greek chapter" }, { value: "social", label: "Social media" },
  { value: "search", label: "Search" }, { value: "other", label: "Other" },
];

type RequestScope = "everything_exam" | "one_chapter" | "one_or_two_topics" | "homework_explained";
const SCOPES: { value: RequestScope; label: string }[] = [
  { value: "one_or_two_topics", label: "A few confusing topics or problems" },
  { value: "one_chapter", label: "One or more entire chapters" },
  { value: "everything_exam", label: "Every chapter on my next exam" },
];
const scopeLabel = (s: RequestScope | null) => SCOPES.find((x) => x.value === s)?.label ?? "—";

type Draft = {
  requestScope: RequestScope | null;
  requestNotes: string;
  interestedInGroup: boolean; groupSize: string;
  interests: Interest[];
  somethingElseNote: string;
  isAccountingMajor: string | null;
  referralSource: string | null; referralSourceDetail: string;
  examChoice: "date" | "not_sure" | null;
  examDate: string;
  campusId: string | null; campusName: string; campusOther: boolean;
  courseFamily: FamilyKey | null; courseCode: string; courseName: string; courseOther: boolean;
  professorName: string; professorLeadId: string | null;
  firstName: string; lastName: string; email: string; phone: string;
  specialInstructions: string;
  attachments: Attachment[];
};

const EMPTY: Draft = {
  requestScope: null,
  requestNotes: "",
  interestedInGroup: false, groupSize: "",
  interests: [],
  somethingElseNote: "",
  isAccountingMajor: null,
  referralSource: null, referralSourceDetail: "",
  examChoice: null, examDate: "",
  campusId: null, campusName: "", campusOther: false,
  courseFamily: null, courseCode: "", courseName: "", courseOther: false,
  professorName: "", professorLeadId: null,
  firstName: "", lastName: "", email: "", phone: "",
  specialInstructions: "",
  attachments: [],
};

// A concrete exam date wins; otherwise "Not sure" rides along as the timeframe.
function examTimeframeFor(d: Draft): ExamTimeframe | null {
  if (d.examDate) return null;
  if (d.examChoice === "not_sure") return "not_sure";
  return null;
}
function examDateFor(d: Draft): string | null {
  return d.examDate ? d.examDate : null;
}
function daysUntil(iso: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const ex = new Date(`${iso}T00:00:00`);
  return Math.round((ex.getTime() - today.getTime()) / 86_400_000);
}
function examDaysPhrase(iso: string): string {
  const d = daysUntil(iso);
  if (d <= 0) return "Your exam is today";
  if (d === 1) return "Your exam is in 1 day";
  return `Your exam is in ${d} days`;
}
function examSummary(d: Draft): string {
  if (d.examDate) {
    const n = daysUntil(d.examDate);
    if (n <= 0) return "Today";
    return n === 1 ? "1 day" : `${n} days`;
  }
  return "Not sure yet";
}
const humanSize = (b: number) => (b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const profDisplay = (p: ProfessorLite) => {
  const last = p.last.trim(), first = p.first.trim();
  if (last && first) return `${last}, ${first}`;
  return p.name;
};

// Friendly reference code: {CAMPUS}-{initials}-{4-char id tail}. Stateless —
// derivable anywhere from stored fields, always unique (id tail is unique).
function campusAbbr(name: string): string {
  const hit = SEC_CAMPUSES.find((c) => c.name === name);
  if (hit) return hit.abbr;
  const words = name.replace(/[^A-Za-z\s]/g, " ").split(/\s+/).filter(Boolean)
    .filter((w) => !/^(of|the|at|university|univ|college|state|and)$/i.test(w));
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return "SA";
}
function refCode(campusName: string, first: string, last: string, shortRef: string): string {
  const abbr = campusName.trim() ? campusAbbr(campusName.trim()) : "SA";
  const initials = ((first.trim()[0] ?? "") + (last.trim()[0] ?? "")).toUpperCase() || "XX";
  const tail = (shortRef || "").replace(/[^A-Za-z0-9]/g, "").slice(-4).toUpperCase() || "0000";
  return `${abbr}-${initials}-${tail}`;
}

// Per-step completion gate — drives the forward arrow.
function stepComplete(step: number, d: Draft): boolean {
  switch (step) {
    case 0: return !!d.campusId || (d.campusOther && d.campusName.trim().length > 0); // school
    case 1: return d.courseFamily != null || d.courseCode.trim().length > 0 || d.courseName.trim().length > 0; // course
    case 2: return true; // professor optional
    default: return false; // final step (interests + info) submits via its own button
  }
}

function OrderPage() {
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [result, setResult] = useState<SubmitOrderResult | null>(null);
  const update = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((p) => ({ ...p, [k]: v }));

  const [sessionId] = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const addAttachment = (a: Attachment) => setDraft((p) => ({ ...p, attachments: [...p.attachments, a] }));
  const removeAttachment = (path: string) => setDraft((p) => ({ ...p, attachments: p.attachments.filter((x) => x.path !== path) }));

  const ctxFn = useServerFn(getOrderCampusContext);
  const [ctx, setCtx] = useState<OrderCampusContext | null>(null);
  useEffect(() => {
    let off = false;
    if (!draft.campusId) { setCtx(null); return; }
    ctxFn({ data: { campusId: draft.campusId } }).then((c) => { if (!off) setCtx(c); }).catch(() => { if (!off) setCtx(null); });
    return () => { off = true; };
  }, [draft.campusId, ctxFn]);

  // Keep each step "locked in" at the top — no leftover scroll between steps.
  useEffect(() => { if (started) window.scrollTo({ top: 0 }); }, [step, started]);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const goBack = () => { if (step === 0) setStarted(false); else setStep((s) => Math.max(s - 1, 0)); };

  if (result) return <Confirmation draft={draft} result={result} />;
  if (!started) return <Intro onStart={() => { setStep(0); setStarted(true); }} />;

  const canForward = step < STEPS.length - 1 && stepComplete(step, draft);

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #E7ECF5 0%, #FAFAF7 420px)", fontFamily: "Inter, -apple-system, sans-serif" }}>
      <Toaster richColors position="top-center" />
      <Header />
      <div className="mx-auto w-full max-w-2xl px-4 pb-14 pt-5">
        <StepNav step={step} canForward={canForward} onBack={goBack} onForward={next} />
        <div className="mt-4 rounded-[28px] bg-white p-6 shadow-[0_30px_80px_-28px_rgba(20,33,61,0.45)] ring-1 ring-black/[0.04] sm:p-9">
          {step === 0 && <CampusStep draft={draft} update={update} onNext={next} />}
          {step === 1 && <CourseStep draft={draft} update={update} ctx={ctx} onNext={next} />}
          {step === 2 && <ProfessorStep draft={draft} update={update} onNext={next} />}
          {step === 3 && <InfoStep draft={draft} update={update} sessionId={sessionId} addAttachment={addAttachment} removeAttachment={removeAttachment} onSubmitted={setResult} />}
        </div>
        <StepFooter />
      </div>
    </div>
  );
}

// ---------- Intro screen (identity + Start Request + reviews) ----------
function Intro({ onStart }: { onStart: () => void }) {
  const scrollToReviews = () => document.getElementById("reviews-section")?.scrollIntoView({ behavior: "smooth" });
  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #E7ECF5 0%, #FAFAF7 520px)", fontFamily: "Inter, -apple-system, sans-serif" }}>
      <Header />
      {/* Fill the viewport below the sticky header (all breakpoints) so the hero
          is vertically centered and the reviews slider sits just below the fold —
          reachable by scroll or the "Read reviews" link. */}
      <div className="mx-auto flex min-h-[calc(100svh-5rem)] w-full max-w-2xl flex-col justify-center px-4 pb-10 pt-14 text-center sm:pt-20">
        <span className="mx-auto block overflow-hidden rounded-full"
          style={{ width: 96, height: 96, border: "3px solid #FFFFFF", boxShadow: "0 14px 34px rgba(20,33,61,0.22)" }}>
          <img src={leeHeadshot} alt="Lee Ingram" className="h-full w-full object-cover" draggable={false} />
        </span>
        <h1 className="mt-6 text-[32px] leading-[1.1] sm:text-[44px]" style={{ color: NAVY, fontFamily: SERIF, fontWeight: 400 }}>
          Join the Fall 2026 waitlist
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[15px] text-gray-600">
          You&apos;re joining the Fall 2026 list. I&apos;ll text you before your semester starts —
          students on the list get early access and beta invites first.
        </p>
        <div className="mt-8">
          <button type="button" onClick={onStart}
            className="inline-flex h-14 items-center justify-center rounded-2xl px-10 text-lg font-bold text-white transition hover:brightness-110 hover:-translate-y-0.5"
            style={{ background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)`, boxShadow: "0 14px 34px rgba(206,17,38,0.30)" }}>
            Join the waitlist
          </button>
          <div className="mt-4">
            <button type="button" onClick={scrollToReviews} className="text-sm font-medium text-gray-500 underline underline-offset-2 hover:text-gray-700">
              Read reviews
            </button>
          </div>
        </div>
      </div>
      <Reviews />
      <ContactForm />
    </div>
  );
}

// ---------- chrome ----------
function Header() {
  return (
    <header className="sticky top-0 z-40 w-full border-b"
      style={{ background: "linear-gradient(180deg, rgba(20,33,61,0.98) 0%, rgba(16,26,49,0.98) 100%)", borderColor: "rgba(255,255,255,0.08)" }}>
      <div className="mx-auto flex h-20 w-full max-w-2xl items-center justify-center px-4">
        <a href="/" aria-label="Survive Accounting — home" className="inline-flex items-center">
          <img src={LOGO_URL} alt="Survive Accounting" className="h-10 w-auto select-none" draggable={false} />
        </a>
      </div>
    </header>
  );
}
function StepFooter() {
  return (
    <p className="mt-5 text-center text-xs text-gray-500">
      {FOOTER_PREFIX}{" "}
      <a href={`sms:${WORK_PHONE_HREF}`} className="font-semibold hover:underline" style={{ color: RED }}>{WORK_PHONE_DISPLAY}</a>
    </p>
  );
}
// Progress bar flanked by discreet back / forward arrows for quick step nav.
function StepNav({ step, canForward, onBack, onForward }: { step: number; canForward: boolean; onBack: () => void; onForward: () => void }) {
  const pct = Math.round(((step + 1) / STEPS.length) * 100);
  const arrow = "grid h-8 w-8 shrink-0 place-content-center rounded-full border text-gray-500 transition hover:text-gray-800 hover:border-gray-300 disabled:opacity-30 disabled:hover:text-gray-500";
  return (
    <div className="flex items-center gap-2.5">
      <button type="button" aria-label="Previous step" onClick={onBack} className={arrow}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${pct}%`, background: RED }} />
      </div>
      <button type="button" aria-label="Next step" onClick={onForward} disabled={!canForward} className={arrow}>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
function Title({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-bold leading-tight sm:text-2xl" style={{ color: NAVY }}>{children}</h2>
      {subtitle && <p className="mt-1.5 text-sm text-gray-600">{subtitle}</p>}
    </div>
  );
}
function PrimaryBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <Button onClick={onClick} disabled={disabled} className="h-12 w-full text-base font-bold text-white"
      style={{ background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)` }}>
      {children}
    </Button>
  );
}

// ---------- Shared: "Provide more detail" + file uploads ----------
function DetailBox({ draft, update, sessionId, addAttachment, removeAttachment }: {
  draft: Draft;
  update: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  sessionId: string;
  addAttachment: (a: Attachment) => void;
  removeAttachment: (path: string) => void;
}) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_BYTES) { toast.error(`${file.name} is over 10MB`); continue; }
      setUploading((n) => n + 1);
      try {
        const safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80) || "file";
        const path = `order-requests/${sessionId}/${Date.now()}-${safe}`;
        const { error } = await supabase.storage.from(UPLOAD_BUCKET).upload(path, file, {
          upsert: false, contentType: file.type || undefined,
        });
        if (error) throw error;
        addAttachment({ name: file.name, path, size: file.size });
      } catch {
        toast.error(`Couldn't upload ${file.name}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold" style={{ color: NAVY }}>
        Provide more detail <span className="font-normal text-gray-400">(optional)</span>
      </label>
      <textarea
        value={draft.specialInstructions}
        onChange={(e) => update("specialInstructions", e.target.value)}
        maxLength={2000} rows={3}
        placeholder="What are you stuck on? Topics, textbook problems, chapters, questions — anything that helps me help you."
        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-[16px] focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200"
      />

      <input ref={inputRef} type="file" multiple className="hidden" accept={UPLOAD_ACCEPT}
        onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }} />

      {/* Mobile: a simple button (no drag-drop on phones). */}
      <button type="button" onClick={() => inputRef.current?.click()}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 transition hover:border-red-300 hover:bg-red-50/40 sm:hidden">
        <UploadCloud className="h-5 w-5 text-gray-400" /> Add files or photos
      </button>

      {/* Desktop: drag & drop / click, with an animated affordance. */}
      <div
        role="button" tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
        onDrop={(e) => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files); }}
        className={cn(
          "group mt-2 hidden cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-200 sm:flex",
          dragActive
            ? "scale-[1.01] border-red-400 bg-red-50 shadow-sm"
            : "border-gray-300 bg-gray-50 hover:-translate-y-0.5 hover:border-red-300 hover:bg-red-50/40 hover:shadow-sm",
        )}
      >
        <UploadCloud className={cn("h-6 w-6 transition-transform duration-200", dragActive ? "-translate-y-0.5 text-red-500" : "text-gray-400 group-hover:-translate-y-0.5 group-hover:text-red-400")} />
        <p className="text-sm font-medium text-gray-700"><span style={{ color: RED }}>Upload files</span> or drag &amp; drop</p>
        <p className="text-xs text-gray-400">Syllabus, homework, screenshots — PDF or images, up to 10MB each</p>
      </div>

      {(draft.attachments.length > 0 || uploading > 0) && (
        <ul className="mt-2 space-y-1.5">
          {draft.attachments.map((a) => (
            <li key={a.path} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="flex-1 truncate text-gray-700">{a.name}</span>
              <span className="shrink-0 text-[11px] text-gray-400">{humanSize(a.size)}</span>
              <button type="button" onClick={() => removeAttachment(a.path)} aria-label={`Remove ${a.name}`}
                className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
          {uploading > 0 && (
            <li className="flex items-center gap-2 px-1 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</li>
          )}
        </ul>
      )}
    </div>
  );
}

// Confirm-step: collapse the detail box into two compact chips that expand.
function ConfirmDetail(props: {
  draft: Draft;
  update: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  sessionId: string;
  addAttachment: (a: Attachment) => void;
  removeAttachment: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasDetail = props.draft.specialInstructions.trim().length > 0;
  const nFiles = props.draft.attachments.length;

  if (open) {
    return (
      <div className="rounded-2xl border border-gray-200 p-4">
        <DetailBox {...props} />
        <button type="button" onClick={() => setOpen(false)} className="mt-3 text-xs font-medium text-gray-500 underline hover:text-gray-700">Done</button>
      </div>
    );
  }
  const chip = "flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition hover:border-gray-300";
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => setOpen(true)}
        className={cn(chip, hasDetail ? "border-transparent text-white" : "bg-white text-gray-700")}
        style={hasDetail ? { background: NAVY } : undefined}>
        <Pencil className="h-4 w-4 shrink-0" /> {hasDetail ? "Detail added" : "Add detail"}
      </button>
      <button type="button" onClick={() => setOpen(true)}
        className={cn(chip, nFiles > 0 ? "border-transparent text-white" : "bg-white text-gray-700")}
        style={nFiles > 0 ? { background: NAVY } : undefined}>
        <Paperclip className="h-4 w-4 shrink-0" /> {nFiles > 0 ? `${nFiles} file${nFiles > 1 ? "s" : ""}` : "Attach files"}
      </button>
    </div>
  );
}

// ---------- Step 1: Scope ----------
function ScopeStep({ draft, update, sessionId, addAttachment, removeAttachment, onNext }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  sessionId: string; addAttachment: (a: Attachment) => void; removeAttachment: (path: string) => void; onNext: () => void;
}) {
  return (
    <div>
      <Title>What can I clear up on your next exam?</Title>
      <div className="space-y-2">
        {SCOPES.map((s) => {
          const active = draft.requestScope === s.value;
          return (
            <button key={s.value} type="button" onClick={() => update("requestScope", s.value)}
              className={cn("flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-4 text-left transition", active ? "border-transparent text-white" : "bg-white hover:border-gray-300")}
              style={active ? { background: NAVY } : undefined}>
              <span className="text-[15px] font-semibold">{s.label}</span>
              {active && <Check className="h-4 w-4 shrink-0" />}
            </button>
          );
        })}
      </div>

      {draft.requestScope && (
        <div className="mt-5 border-t border-gray-100 pt-5">
          <DetailBox draft={draft} update={update} sessionId={sessionId} addAttachment={addAttachment} removeAttachment={removeAttachment} />
        </div>
      )}

      <div className="mt-6"><PrimaryBtn onClick={onNext} disabled={!draft.requestScope}>Continue</PrimaryBtn></div>
    </div>
  );
}

// ---------- Step 2: Exam ----------
function ExamStep({ draft, update, onNext }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void; onNext: () => void;
}) {
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const selected = draft.examDate ? new Date(`${draft.examDate}T00:00:00`) : undefined;
  const canContinue = !!draft.examDate || draft.examChoice === "not_sure";
  return (
    <div>
      <Title>When&apos;s your next exam?</Title>
      <div className="flex justify-center rounded-2xl border bg-white p-2">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            if (!d) return;
            const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            update("examChoice", "date");
            update("examDate", iso);
          }}
          disabled={{ before: startOfToday }}
          className="mx-auto"
        />
      </div>
      <div className="mt-3 flex flex-col items-center gap-1.5 text-center">
        {draft.examDate ? (
          <p className="text-sm font-semibold" style={{ color: NAVY }}>{examDaysPhrase(draft.examDate)}</p>
        ) : (
          <button type="button"
            onClick={() => { update("examChoice", "not_sure"); update("examDate", ""); }}
            className={cn("text-xs underline transition hover:text-gray-700", draft.examChoice === "not_sure" ? "font-semibold" : "text-gray-500")}
            style={draft.examChoice === "not_sure" ? { color: NAVY } : undefined}>
            Not sure right now
          </button>
        )}
      </div>
      <div className="mt-6"><PrimaryBtn onClick={onNext} disabled={!canContinue}>Continue</PrimaryBtn></div>
    </div>
  );
}

// Student-facing SEC campus list for the /order School step — Ole Miss pinned
// first, then alphabetical. `abbr` feeds the friendly reference code.
const SEC_CAMPUSES: { id: string; name: string; city: string; abbr: string }[] = [
  { id: "7b92a320-b196-43f2-a241-77a0805816fe", name: "University of Mississippi / Ole Miss", city: "Oxford, MS", abbr: "UM" },
  { id: "e330e87c-5467-4c05-9d3d-6cd2398de036", name: "Auburn University", city: "Auburn, AL", abbr: "AUB" },
  { id: "698dd98f-dd92-46c1-8f28-e930568cb15d", name: "Louisiana State University", city: "Baton Rouge, LA", abbr: "LSU" },
  { id: "95246fc8-1ce6-409e-b454-d03c82766719", name: "Mississippi State University", city: "Starkville, MS", abbr: "MSST" },
  { id: "92e4a5d9-eeb3-4065-ac8a-5a4390fbc584", name: "Texas A&M University", city: "College Station, TX", abbr: "TAMU" },
  { id: "b3af67c6-99a5-4677-83d5-aa7d11a89c17", name: "University of Alabama", city: "Tuscaloosa, AL", abbr: "ALA" },
  { id: "e631c8de-37a3-4aae-a948-a64bd20ea4c5", name: "University of Arkansas", city: "Fayetteville, AR", abbr: "ARK" },
  { id: "4c5126b1-3fe0-48fe-a1db-1e41d06e4642", name: "University of Florida", city: "Gainesville, FL", abbr: "UF" },
  { id: "3f570e37-5394-4058-baab-508948befedb", name: "University of Georgia", city: "Athens, GA", abbr: "UGA" },
  { id: "ae339230-577e-4569-a7d1-d1e45d1cfe91", name: "University of Kentucky", city: "Lexington, KY", abbr: "UK" },
  { id: "f16686c2-edc6-43f8-9638-6890f52c829a", name: "University of Missouri", city: "Columbia, MO", abbr: "MIZ" },
  { id: "91e62f9c-43b0-41f3-a84d-002824754da6", name: "University of Oklahoma", city: "Norman, OK", abbr: "OU" },
  { id: "5f5bd18d-b92f-4d56-aced-23bce4c983d5", name: "University of South Carolina", city: "Columbia, SC", abbr: "SC" },
  { id: "9c4775be-7d82-4a3e-840c-349c5e15d8e8", name: "University of Tennessee", city: "Knoxville, TN", abbr: "TENN" },
  { id: "faad6039-be72-4f5c-8ad5-ca7b95e2889f", name: "University of Texas", city: "Austin, TX", abbr: "UT" },
  { id: "972451c3-bc5e-48d7-9f88-868a55378efa", name: "Vanderbilt University", city: "Nashville, TN", abbr: "VAN" },
];

// ---------- Step 3: School ----------
function CampusStep({ draft, update, onNext }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void; onNext: () => void;
}) {
  const picked = !!draft.campusId || (draft.campusOther && draft.campusName.trim().length > 0);
  return (
    <div>
      <Title subtitle="I make exam prep videos for students at all SEC campuses.">Where are you taking accounting?</Title>
      {draft.campusOther ? (
        <div className="space-y-2">
          <Input placeholder="Type your school name" value={draft.campusName} autoFocus onChange={(e) => update("campusName", e.target.value)} />
          <button type="button" className="text-xs text-gray-600 underline" onClick={() => { update("campusOther", false); update("campusName", ""); }}>Choose from the list instead</button>
        </div>
      ) : (
        <>
          <div className="max-h-80 space-y-2 overflow-auto pr-1">
            {SEC_CAMPUSES.map((c) => {
              const active = draft.campusId === c.id;
              return (
                <button key={c.id} type="button"
                  onClick={() => { update("campusId", c.id); update("campusName", c.name); update("campusOther", false); }}
                  className={cn("flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition", active ? "border-transparent text-white" : "bg-white hover:border-gray-300")}
                  style={active ? { background: NAVY } : undefined}>
                  <span>
                    <span className="block text-[15px] font-semibold">{c.name}</span>
                    <span className={cn("text-xs", active ? "text-white/70" : "text-gray-500")}>{c.city}</span>
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </div>
          <button type="button" className="mt-3 text-xs text-gray-600 underline" onClick={() => { update("campusOther", true); update("campusId", null); update("campusName", ""); }}>My school isn&apos;t listed</button>
        </>
      )}
      <div className="mt-6"><PrimaryBtn onClick={onNext} disabled={!picked}>Continue</PrimaryBtn></div>
    </div>
  );
}

// ---------- Step 4: Course ----------
function CourseStep({ draft, update, ctx, onNext }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void; ctx: OrderCampusContext | null; onNext: () => void;
}) {
  const hasCodes = !!ctx && FAMILY_ORDER.some((f) => ctx.codes[f] || ctx.titles[f]);
  const forceOther = draft.campusOther || (!!draft.campusId && ctx !== null && !hasCodes);
  const otherMode = draft.courseOther || forceOther;

  const pickFamily = (f: FamilyKey) => {
    update("courseFamily", f); update("courseCode", ctx?.codes[f] ?? "");
    update("courseName", ctx?.titles[f] ?? FAMILY_LABELS[f]); update("courseOther", false);
  };
  const canContinue = otherMode ? (draft.courseName.trim().length > 0 || draft.courseCode.trim().length > 0) : !!draft.courseFamily;

  return (
    <div>
      <Title>Which accounting course is this for?</Title>
      {!otherMode ? (
        <>
          <div className="space-y-2">
            {FAMILY_ORDER.map((f) => {
              const code = ctx?.codes[f] ?? null; const title = ctx?.titles[f] ?? FAMILY_LABELS[f];
              const active = draft.courseFamily === f;
              return (
                <button key={f} type="button" onClick={() => pickFamily(f)}
                  className={cn("flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition", active ? "border-transparent text-white" : "bg-white hover:border-gray-300")}
                  style={active ? { background: NAVY } : undefined}>
                  <span>{code && <span className="font-semibold">{code} · </span>}<span className={active ? "" : "text-gray-800"}>{title}</span></span>
                  {active && <Check className="h-4 w-4" />}
                </button>
              );
            })}
          </div>
          <button type="button" className="mt-3 text-xs text-gray-600 underline" onClick={() => update("courseOther", true)}>My course isn&apos;t listed</button>
        </>
      ) : (
        <div className="space-y-3">
          <div><Label className="mb-1.5 block text-sm">Course code <span className="text-gray-400">(optional)</span></Label>
            <Input placeholder="e.g. ACCT 2101" value={draft.courseCode} onChange={(e) => update("courseCode", e.target.value)} /></div>
          <div><Label className="mb-1.5 block text-sm">Course name</Label>
            <Input placeholder="e.g. Principles of Financial Accounting" value={draft.courseName} onChange={(e) => update("courseName", e.target.value)} /></div>
          {!forceOther && <button type="button" className="text-xs text-gray-600 underline" onClick={() => update("courseOther", false)}>Pick from the list instead</button>}
        </div>
      )}
      <div className="mt-6"><PrimaryBtn onClick={onNext} disabled={!canContinue}>Continue</PrimaryBtn></div>
    </div>
  );
}

// ---------- Step 5: Professor (RMP-matched roster; last, first A→Z) ----------
function ProfessorStep({ draft, update, onNext }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void; onNext: () => void;
}) {
  const searchFn = useServerFn(searchOrderProfessors);
  const [all, setAll] = useState<ProfessorLite[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!draft.campusId) return;
    let off = false;
    searchFn({ data: { campusId: draft.campusId } }).then((r) => { if (!off) setAll(r); }).catch(() => {});
    return () => { off = true; };
  }, [draft.campusId, searchFn]);

  const q = draft.professorName.trim().toLowerCase();
  const filtered = q && !draft.professorLeadId ? all.filter((p) => p.name.toLowerCase().includes(q)) : all;
  const shown = showAll ? filtered : filtered.slice(0, 20);

  return (
    <div>
      <Title>Who&apos;s your professor?</Title>
      <Input placeholder="Type your professor's name" value={draft.professorName} autoFocus
        onChange={(e) => { update("professorName", e.target.value); update("professorLeadId", null); setShowAll(false); }} />

      {!draft.professorLeadId && shown.length > 0 && (
        <div className="mt-2 max-h-56 overflow-auto rounded-xl border bg-white">
          {shown.map((p) => (
            <button key={p.id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
              onClick={() => { update("professorName", p.name); update("professorLeadId", p.id); }}>
              {profDisplay(p)}
            </button>
          ))}
          {!showAll && filtered.length > 20 && (
            <button type="button" className="block w-full px-3 py-2 text-center text-xs font-medium text-gray-600 hover:bg-gray-50" onClick={() => setShowAll(true)}>
              Show more ({filtered.length - 20})
            </button>
          )}
        </div>
      )}

      <div className="mt-6">
        <PrimaryBtn onClick={onNext}>Continue</PrimaryBtn>
        <div className="mt-3 text-right">
          <button type="button" onClick={() => { update("professorName", ""); update("professorLeadId", null); onNext(); }} className="text-sm text-gray-500 underline hover:text-gray-700">My professor isn&apos;t listed</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Step 6: Choose your preferred option(s) — multi-select ----------
function HelpOptionsStep({ draft, update, onNext }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void; onNext: () => void;
}) {
  const toggle = (v: Interest) =>
    update("interests", draft.interests.includes(v) ? draft.interests.filter((x) => x !== v) : [...draft.interests, v]);

  return (
    <div>
      <Title>What are you interested in? <span className="font-normal text-gray-500">(pick any)</span></Title>
      <div className="space-y-2.5">
        {INTEREST_ORDER.map((v) => {
          const active = draft.interests.includes(v);
          return (
            <div key={v}>
              <button type="button" onClick={() => toggle(v)}
                className={cn("flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-4 text-left transition", active ? "border-transparent text-white" : "bg-white hover:border-gray-300")}
                style={active ? { background: NAVY } : undefined}>
                <span className="text-[15px] font-semibold">
                  {INTEREST_LABEL[v]}
                  {v === "group" && <span className={cn("font-normal", active ? "text-white/70" : "text-gray-500")}> (bring friends)</span>}
                </span>
                <span className={cn("grid h-5 w-5 shrink-0 place-content-center rounded-md border", active ? "border-white bg-white/15" : "border-gray-300")}>
                  {active && <Check className="h-3.5 w-3.5" />}
                </span>
              </button>
              {v === "something_else" && active && (
                <textarea value={draft.somethingElseNote} onChange={(e) => update("somethingElseNote", e.target.value)}
                  maxLength={1000} rows={3} autoFocus
                  placeholder="What do you have in mind? Tell me what you're looking for."
                  className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-[16px] focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200" />
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-sm text-gray-600">I&apos;ll reply within 1 business day with options and exact pricing — no obligation.</p>
      <div className="mt-6"><PrimaryBtn onClick={onNext} disabled={draft.interests.length === 0}>Continue</PrimaryBtn></div>
    </div>
  );
}

// ---------- Consolidated request summary ----------
// Single-select optional pills (tap the active pill again to clear).
function PillGroup({ label, options, value, onChange, note }: {
  label: string; options: { value: string; label: string }[]; value: string | null; onChange: (v: string | null) => void; note?: string;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold" style={{ color: NAVY }}>{label}{note && <span className="ml-1 font-normal text-gray-400">{note}</span>}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button key={o.value} type="button" onClick={() => onChange(active ? null : o.value)}
              className={cn("rounded-full border px-3.5 py-2 text-sm font-medium transition", active ? "border-transparent text-white" : "bg-white text-gray-700 hover:border-gray-300")}
              style={active ? { background: NAVY } : undefined}>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium" style={{ color: NAVY }}>{value}</span>
    </div>
  );
}
function RequestSummary({ draft, hideChosenOption }: { draft: Draft; hideChosenOption?: boolean }) {
  const code = draft.courseCode.trim() || draft.courseName.trim();
  const prof = draft.professorName.trim();
  const courseLine = [code, prof].filter(Boolean).join(" · ");
  return (
    <div className="rounded-2xl border bg-gray-50 px-5 py-5 sm:px-6">
      {draft.campusName.trim() && <p className="text-[15px] font-bold" style={{ color: NAVY }}>{draft.campusName.trim()}</p>}
      {courseLine && <p className="mt-0.5 text-sm text-gray-600">{courseLine}</p>}
      <div className="mt-3 space-y-1.5 border-t border-gray-200 pt-3">
        <SummaryRow label="Days to next exam" value={examSummary(draft)} />
        {!hideChosenOption && (
          <SummaryRow label="Interested in" value={interestsLabel(draft.interests)} />
        )}
      </div>
    </div>
  );
}

// ---------- Step 7: Your info + submit ----------
function InfoStep({ draft, update, sessionId, addAttachment, removeAttachment, onSubmitted }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  sessionId: string; addAttachment: (a: Attachment) => void; removeAttachment: (path: string) => void;
  onSubmitted: (r: SubmitOrderResult) => void;
}) {
  const submitFn = useServerFn(submitOrder);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const toggle = (v: Interest) =>
    update("interests", draft.interests.includes(v) ? draft.interests.filter((x) => x !== v) : [...draft.interests, v]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!draft.firstName.trim()) e.firstName = "Required";
    if (!draft.lastName.trim()) e.lastName = "Required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) e.email = "Valid email required";
    if (draft.phone.trim().length < 7) e.phone = "Phone required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      // The scope rides along as one order_chapters row; the free-text detail +
      // any "something else" ask live in special_requests; files in attachments.
      const parts = [
        draft.specialInstructions.trim(),
        draft.interests.includes("something_else") && draft.somethingElseNote.trim()
          ? `Something else: ${draft.somethingElseNote.trim()}`
          : "",
      ].filter(Boolean);
      const detail = parts.join("\n\n");
      const chapters = draft.requestScope
        ? [{ chapterLabel: scopeLabel(draft.requestScope), chapterNumber: null, struggleNote: null }]
        : [];
      const r = await submitFn({
        data: {
          firstName: draft.firstName.trim(), lastName: draft.lastName.trim(), email: draft.email.trim(), phone: draft.phone.trim(),
          campusId: draft.campusId, campusText: draft.campusId ? null : (draft.campusName.trim() || null),
          courseFamily: draft.courseFamily, courseCode: draft.courseCode.trim() || null, courseName: draft.courseName.trim() || null,
          professorName: draft.professorName.trim() || null, professorLeadId: draft.professorLeadId,
          examDate: examDateFor(draft), examTimeframe: examTimeframeFor(draft),
          tier: deriveTier(draft.interests),
          interests: draft.interests,
          isAccountingMajor: (draft.isAccountingMajor as "yes" | "no" | "definitely_not" | "not_sure" | null) ?? null,
          referralSource: (draft.referralSource as "professor" | "friend" | "greek" | "social" | "search" | "other" | null) ?? null,
          referralSourceDetail: draft.referralSource === "other" ? (draft.referralSourceDetail.trim() || null) : null,
          chapterCountOnly: null,
          requestScope: draft.requestScope,
          requestNotes: null,
          specialInstructions: detail || null,
          attachments: draft.attachments,
          interestedInGroup: draft.interests.includes("group"),
          groupSize: null,
          chapters,
        },
      });
      onSubmitted(r);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div>
      <Title>What are you interested in? <span className="font-normal text-gray-500">(pick any)</span></Title>
      <div className="space-y-2.5">
        {INTEREST_ORDER.map((v) => {
          const active = draft.interests.includes(v);
          return (
            <div key={v}>
              <button type="button" onClick={() => toggle(v)}
                className={cn("flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-4 text-left transition", active ? "border-transparent text-white" : "bg-white hover:border-gray-300")}
                style={active ? { background: NAVY } : undefined}>
                <span className="text-[15px] font-semibold">
                  {INTEREST_LABEL[v]}
                  {v === "group" && <span className={cn("font-normal", active ? "text-white/70" : "text-gray-500")}> (bring friends)</span>}
                </span>
                <span className={cn("grid h-5 w-5 shrink-0 place-content-center rounded-md border", active ? "border-white bg-white/15" : "border-gray-300")}>
                  {active && <Check className="h-3.5 w-3.5" />}
                </span>
              </button>
              {v === "something_else" && active && (
                <textarea value={draft.somethingElseNote} onChange={(e) => update("somethingElseNote", e.target.value)}
                  maxLength={1000} rows={3} autoFocus
                  placeholder="What do you have in mind? Tell me what you're looking for."
                  className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-[16px] focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200" />
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-sm text-gray-600">I&apos;ll be in touch before Fall with your options — no obligation.</p>

      <div className="mt-8">
        <PillGroup label="How did you find me?" note="(optional)"
          options={REFERRAL_OPTIONS} value={draft.referralSource} onChange={(v) => update("referralSource", v)} />
        {draft.referralSource === "other" && (
          <Input className="mt-2" value={draft.referralSourceDetail} placeholder="Tell me how"
            onChange={(e) => update("referralSourceDetail", e.target.value)} />
        )}
      </div>

      <p className="mt-6 text-sm font-bold" style={{ color: NAVY }}>Add your info</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="First name" error={errors.firstName}><Input value={draft.firstName} onChange={(e) => update("firstName", e.target.value)} autoComplete="given-name" /></Field>
        <Field label="Last name" error={errors.lastName}><Input value={draft.lastName} onChange={(e) => update("lastName", e.target.value)} autoComplete="family-name" /></Field>
        <Field label="Email" error={errors.email}><Input type="email" value={draft.email} onChange={(e) => update("email", e.target.value)} autoComplete="email" /></Field>
        <Field label="Phone" error={errors.phone}><Input type="tel" value={draft.phone} placeholder="(555) 555-5555" onChange={(e) => update("phone", e.target.value)} autoComplete="tel" /></Field>
      </div>

      <p className="mt-7 text-center text-sm text-gray-600">You&apos;ll be on the Fall 2026 list — I&apos;ll text you before your semester starts.</p>

      <div className="mt-6">
        <PrimaryBtn onClick={submit} disabled={busy || draft.interests.length === 0}>
          {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Joining…</> : "Join the waitlist"}
        </PrimaryBtn>
      </div>
    </div>
  );
}
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block text-sm font-medium text-gray-800">{label}<span className="ml-0.5 text-red-600">*</span></Label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ---------- Confirmation ----------
function Confirmation({ draft, result }: { draft: Draft; result: SubmitOrderResult }) {
  const ref = refCode(draft.campusName, draft.firstName, draft.lastName, result.shortRef);
  const hideChosen = draft.interests.includes("something_else");
  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #EAEEF6 0%, #FAFAF7 360px)", fontFamily: "Inter, -apple-system, sans-serif" }}>
      <Header />
      <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8">
        <div className="rounded-3xl bg-white p-6 shadow-[0_10px_40px_-15px_rgba(20,33,61,0.15)] sm:p-9">
          <div className="mx-auto grid h-14 w-14 place-content-center rounded-full bg-emerald-50"><Check className="h-8 w-8 text-emerald-600" /></div>
          <h1 className="mt-5 text-center text-2xl font-bold sm:text-3xl" style={{ color: NAVY }}>You&apos;re on the list!</h1>
          <p className="mt-1 text-center text-sm text-gray-500">Reference <span className="font-mono">#{ref}</span></p>

          <div className="mt-6"><RequestSummary draft={draft} hideChosenOption={hideChosen} /></div>

          <div className="mt-6">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">What happens next</p>
            <ol className="mt-3 space-y-3 text-sm text-gray-800">
              <li className="flex gap-3"><Num n={1} /> You&apos;re on the Fall 2026 list. I&apos;ll text you before your semester starts — students on the list get early access and beta invites first.</li>
              <li className="flex gap-3"><Num n={2} /> Want me ready for your exact course? Text me your syllabus or schedule anytime and I&apos;ll have your class dialed in.</li>
            </ol>
          </div>

          <p className="mt-6 text-center text-sm text-gray-600">
            Questions?{" "}
            <a href={`sms:${WORK_PHONE_HREF}`} className="font-semibold hover:underline" style={{ color: RED }}>Text Lee</a>
            {" "}at {WORK_PHONE_DISPLAY}
          </p>
        </div>
      </div>
    </div>
  );
}
function Num({ n }: { n: number }) {
  return <span className="grid h-6 w-6 shrink-0 place-content-center rounded-full text-xs font-bold text-white" style={{ background: NAVY }}>{n}</span>;
}
