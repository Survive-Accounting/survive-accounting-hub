// /order — Request a personalized exam prep video. A student sends what they're
// stuck on (free, no card); Lee reviews and replies with a gameplan/quote; the
// student pays only after they approve and receive the video. Scope-first: the
// student's problem comes first, context second, identity last. Submit saves
// SERVER-SIDE (service-role) via submitOrder. Nothing is charged here.
//
// NOTE: copy here is intentionally hardcoded (Help Video positioning). The old
// editable copy store + "Edit Student Flow" editor were retired.
import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Toaster, toast } from "sonner";
import { Check, Loader2, Paperclip, UploadCloud, X } from "lucide-react";

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
type Attachment = { name: string; path: string; size: number };

export const Route = createFileRoute("/order")({
  head: () => ({
    meta: [
      { title: "Request a personalized exam prep video — Survive Accounting" },
      { name: "description", content: "Free to request. I quote before I build. You only pay once you approve and receive your exam prep video — made for your exact course." },
      { name: "robots", content: "noindex" },
    ],
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
const STEPS = ["What you need", "Exam", "School", "Course", "Professor", "Preferred option", "Your info"] as const;

type HelpType = "made_to_order" | "one_on_one" | "something_else";

type RequestScope = "everything_exam" | "one_chapter" | "one_or_two_topics" | "homework_explained";
const SCOPES: { value: RequestScope; label: string }[] = [
  { value: "one_or_two_topics", label: "A few confusing topics or problems" },
  { value: "one_chapter", label: "One or more entire chapters" },
  { value: "everything_exam", label: "All chapters on my exam" },
];
const scopeLabel = (s: RequestScope | null) => SCOPES.find((x) => x.value === s)?.label ?? "—";

type Draft = {
  requestScope: RequestScope | null;
  requestNotes: string;
  interestedInGroup: boolean; groupSize: string;
  helpType: HelpType;
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
  helpType: "made_to_order",
  examChoice: null, examDate: "",
  campusId: null, campusName: "", campusOther: false,
  courseFamily: null, courseCode: "", courseName: "", courseOther: false,
  professorName: "", professorLeadId: null,
  firstName: "", lastName: "", email: "", phone: "",
  specialInstructions: "",
  attachments: [],
};

// A concrete exam date wins; otherwise "Not sure" rides along as the timeframe so
// Lee still sees the urgency. (Delivery math is never shown here.)
function examTimeframeFor(d: Draft): ExamTimeframe | null {
  if (d.examDate) return null;
  if (d.examChoice === "not_sure") return "not_sure";
  return null;
}
function examDateFor(d: Draft): string | null {
  return d.examDate ? d.examDate : null;
}
// Whole days from today until the exam (0 = today).
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
// Compact value for the confirmation summary.
function examSummary(d: Draft): string {
  if (d.examDate) {
    const n = daysUntil(d.examDate);
    if (n <= 0) return "Today";
    return n === 1 ? "1 day" : `${n} days`;
  }
  return "Not sure yet";
}
function chosenOptionLabel(t: HelpType): string {
  if (t === "one_on_one") return "1-on-1 tutoring";
  if (t === "something_else") return "Something else";
  return "Exam prep video";
}
const humanSize = (b: number) => (b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const profDisplay = (p: ProfessorLite) => {
  const last = p.last.trim(), first = p.first.trim();
  if (last && first) return `${last}, ${first}`;
  return p.name;
};

function OrderPage() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [result, setResult] = useState<SubmitOrderResult | null>(null);
  const update = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((p) => ({ ...p, [k]: v }));

  // Stable per-visit id for grouping this student's uploads. SSR-safe.
  const [sessionId] = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  // Functional updates so concurrent uploads don't clobber each other.
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

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  if (result) return <Confirmation draft={draft} result={result} />;

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #E7ECF5 0%, #FAFAF7 560px)", fontFamily: "Inter, -apple-system, sans-serif" }}>
      <Toaster richColors position="top-center" />
      <Header />
      <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-14 sm:pt-20">
        {/* Header — page identity, then the form. */}
        <div className="text-center">
          <h1 className="text-[30px] leading-[1.12] sm:text-[40px]" style={{ color: NAVY, fontFamily: SERIF, fontWeight: 400 }}>
            Get a personalized exam prep video
          </h1>
          <div className="mx-auto mt-5 flex flex-col items-center">
            <span className="relative block overflow-hidden rounded-full"
              style={{ width: 84, height: 84, border: "3px solid #FFFFFF", boxShadow: "0 12px 30px rgba(20,33,61,0.20)" }}>
              <img src={leeHeadshot} alt="Lee Ingram" className="h-full w-full object-cover" draggable={false} />
            </span>
            <p className="mt-3 text-[13px] text-gray-600">All videos created by virtual tutor Lee Ingram.</p>
          </div>
        </div>
        <div className="mt-7"><Progress step={step} /></div>
        <div className="mt-5 rounded-[28px] bg-white p-6 shadow-[0_30px_80px_-28px_rgba(20,33,61,0.45)] ring-1 ring-black/[0.04] sm:p-9">
          {step === 0 && <ScopeStep draft={draft} update={update} sessionId={sessionId} addAttachment={addAttachment} removeAttachment={removeAttachment} onNext={next} />}
          {step === 1 && <ExamStep draft={draft} update={update} onNext={next} onBack={back} />}
          {step === 2 && <CampusStep draft={draft} update={update} onNext={next} onBack={back} />}
          {step === 3 && <CourseStep draft={draft} update={update} ctx={ctx} onNext={next} onBack={back} />}
          {step === 4 && <ProfessorStep draft={draft} update={update} onNext={next} onBack={back} />}
          {step === 5 && <HelpOptionsStep draft={draft} update={update} onNext={next} onBack={back} />}
          {step === 6 && <InfoStep draft={draft} update={update} sessionId={sessionId} addAttachment={addAttachment} removeAttachment={removeAttachment} onBack={back} onSubmitted={setResult} />}
        </div>
        <StepFooter />
      </div>

      {/* Social proof + contact, below the form. */}
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
function Progress({ step }: { step: number }) {
  const pct = Math.round(((step + 1) / STEPS.length) * 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
      <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${pct}%`, background: RED }} />
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
function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <div className="mt-3 text-center">
      <button type="button" onClick={onBack} className="text-sm text-gray-500 underline hover:text-gray-700">Back</button>
    </div>
  );
}

// ---------- Shared: "Provide more detail" + file uploads (start + confirm) ----------
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
        placeholder="What are you stuck on? Topics, problems, questions — anything that helps me help you."
        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200"
      />

      {/* Drag & drop / click-to-browse — silent, animated affordance. */}
      <div
        role="button" tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
        onDrop={(e) => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files); }}
        className={cn(
          "group mt-2 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-200",
          dragActive
            ? "scale-[1.01] border-red-400 bg-red-50 shadow-sm"
            : "border-gray-300 bg-gray-50 hover:-translate-y-0.5 hover:border-red-300 hover:bg-red-50/40 hover:shadow-sm",
        )}
      >
        <UploadCloud className={cn("h-6 w-6 transition-transform duration-200", dragActive ? "-translate-y-0.5 text-red-500" : "text-gray-400 group-hover:-translate-y-0.5 group-hover:text-red-400")} />
        <p className="text-sm font-medium text-gray-700">
          <span style={{ color: RED }}>Upload files</span> or drag &amp; drop
        </p>
        <p className="text-xs text-gray-400">Syllabus, homework, screenshots — PDF or images, up to 10MB each</p>
        <input ref={inputRef} type="file" multiple className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.heic,.doc,.docx,.txt,.csv,.xls,.xlsx,.ppt,.pptx"
          onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }} />
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
            <li className="flex items-center gap-2 px-1 text-xs text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

// ---------- Step 1: Scope (what do you need help with?) ----------
function ScopeStep({ draft, update, sessionId, addAttachment, removeAttachment, onNext }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  sessionId: string; addAttachment: (a: Attachment) => void; removeAttachment: (path: string) => void;
  onNext: () => void;
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

// ---------- Step 2: Exam (calendar-first, no delivery math) ----------
function ExamStep({ draft, update, onNext, onBack }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void; onNext: () => void; onBack: () => void;
}) {
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const selected = draft.examDate ? new Date(`${draft.examDate}T00:00:00`) : undefined;
  const canContinue = !!draft.examDate || draft.examChoice === "not_sure";
  const notSure = draft.examChoice === "not_sure";
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
        {draft.examDate && (
          <p className="text-sm font-semibold" style={{ color: NAVY }}>{examDaysPhrase(draft.examDate)}</p>
        )}
        <button type="button"
          onClick={() => { update("examChoice", "not_sure"); update("examDate", ""); }}
          className={cn("text-xs underline transition hover:text-gray-700", notSure ? "font-semibold" : "text-gray-500")}
          style={notSure ? { color: NAVY } : undefined}>
          Not sure right now
        </button>
      </div>
      <div className="mt-6"><PrimaryBtn onClick={onNext} disabled={!canContinue}>Continue</PrimaryBtn><BackLink onBack={onBack} /></div>
    </div>
  );
}

// Student-facing SEC campus list for the /order School step — Ole Miss pinned
// first, then alphabetical. IDs are the live `campuses` rows (Auburn has no
// active roster yet, so its professor picker falls back to free text).
const SEC_CAMPUSES: { id: string; name: string; city: string }[] = [
  { id: "7b92a320-b196-43f2-a241-77a0805816fe", name: "University of Mississippi / Ole Miss", city: "Oxford, MS" },
  { id: "e330e87c-5467-4c05-9d3d-6cd2398de036", name: "Auburn University", city: "Auburn, AL" },
  { id: "698dd98f-dd92-46c1-8f28-e930568cb15d", name: "Louisiana State University", city: "Baton Rouge, LA" },
  { id: "95246fc8-1ce6-409e-b454-d03c82766719", name: "Mississippi State University", city: "Starkville, MS" },
  { id: "92e4a5d9-eeb3-4065-ac8a-5a4390fbc584", name: "Texas A&M University", city: "College Station, TX" },
  { id: "b3af67c6-99a5-4677-83d5-aa7d11a89c17", name: "University of Alabama", city: "Tuscaloosa, AL" },
  { id: "e631c8de-37a3-4aae-a948-a64bd20ea4c5", name: "University of Arkansas", city: "Fayetteville, AR" },
  { id: "4c5126b1-3fe0-48fe-a1db-1e41d06e4642", name: "University of Florida", city: "Gainesville, FL" },
  { id: "3f570e37-5394-4058-baab-508948befedb", name: "University of Georgia", city: "Athens, GA" },
  { id: "ae339230-577e-4569-a7d1-d1e45d1cfe91", name: "University of Kentucky", city: "Lexington, KY" },
  { id: "f16686c2-edc6-43f8-9638-6890f52c829a", name: "University of Missouri", city: "Columbia, MO" },
  { id: "91e62f9c-43b0-41f3-a84d-002824754da6", name: "University of Oklahoma", city: "Norman, OK" },
  { id: "5f5bd18d-b92f-4d56-aced-23bce4c983d5", name: "University of South Carolina", city: "Columbia, SC" },
  { id: "9c4775be-7d82-4a3e-840c-349c5e15d8e8", name: "University of Tennessee", city: "Knoxville, TN" },
  { id: "faad6039-be72-4f5c-8ad5-ca7b95e2889f", name: "University of Texas", city: "Austin, TX" },
  { id: "972451c3-bc5e-48d7-9f88-868a55378efa", name: "Vanderbilt University", city: "Nashville, TN" },
];

// ---------- Step 3: School (SEC campuses only) ----------
function CampusStep({ draft, update, onNext, onBack }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void; onNext: () => void; onBack: () => void;
}) {
  const picked = !!draft.campusId || (draft.campusOther && draft.campusName.trim().length > 0);
  return (
    <div>
      <Title subtitle="I make exam prep for students at all SEC campuses.">Where are you taking accounting?</Title>
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
      <div className="mt-6"><PrimaryBtn onClick={onNext} disabled={!picked}>Continue</PrimaryBtn><BackLink onBack={onBack} /></div>
    </div>
  );
}

// ---------- Step 4: Course ----------
function CourseStep({ draft, update, ctx, onNext, onBack }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void; ctx: OrderCampusContext | null; onNext: () => void; onBack: () => void;
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
      <div className="mt-6"><PrimaryBtn onClick={onNext} disabled={!canContinue}>Continue</PrimaryBtn><BackLink onBack={onBack} /></div>
    </div>
  );
}

// ---------- Step 5: Professor (RMP-matched roster; last, first A→Z) ----------
function ProfessorStep({ draft, update, onNext, onBack }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void; onNext: () => void; onBack: () => void;
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
        <div className="mt-3 flex items-center justify-between">
          <button type="button" onClick={onBack} className="text-sm text-gray-500 underline hover:text-gray-700">Back</button>
          <button type="button" onClick={() => { update("professorName", ""); update("professorLeadId", null); onNext(); }} className="text-sm text-gray-500 underline hover:text-gray-700">My professor isn&apos;t listed</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Step 6: Choose your preferred option ----------
function HelpOptionsStep({ draft, update, onNext, onBack }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void; onNext: () => void; onBack: () => void;
}) {
  const code = draft.courseCode.trim();
  const suffix = code ? ` for ${code}` : "";
  const OPTIONS: { value: HelpType; title: string; lines: string[]; muted?: boolean }[] = [
    { value: "made_to_order", title: `Get exam prep videos${suffix}`, lines: ["Price determined after review", "Sent in 2-5 business days", "First come, first served"] },
    { value: "one_on_one", title: `Get 1-on-1 tutoring${suffix}`, lines: ["$150/hr", "Meets on Zoom", "Limited slots available"] },
    { value: "something_else", title: "Request something else", lines: ["Need help a different way?", "Share what you're looking for"], muted: true },
  ];
  return (
    <div>
      <Title>Choose your preferred option</Title>
      <div className="space-y-3">
        {OPTIONS.map((o) => {
          const active = draft.helpType === o.value;
          return (
            <button key={o.value} type="button" onClick={() => update("helpType", o.value)}
              className={cn("flex w-full items-start justify-between gap-3 rounded-2xl border text-left transition",
                o.muted ? "px-4 py-3.5" : "px-5 py-5",
                active ? "border-transparent text-white" : "bg-white hover:border-gray-300")}
              style={active ? { background: NAVY } : undefined}>
              <span>
                <span className={cn("block font-bold", o.muted ? "text-sm" : "text-base")}>{o.title}</span>
                <ul className={cn("mt-1.5 space-y-0.5", o.muted ? "" : "list-disc pl-5")}>
                  {o.lines.map((line) => {
                    const isPrice = line.startsWith("$");
                    return (
                      <li key={line}
                        className={cn(o.muted ? "text-xs" : "text-sm", active ? "text-white/85" : "text-gray-600", isPrice && "font-semibold")}
                        style={isPrice && !active ? { color: RED } : undefined}>
                        {line}
                      </li>
                    );
                  })}
                </ul>
              </span>
              {active && <Check className={cn("mt-1 shrink-0", o.muted ? "h-4 w-4" : "h-5 w-5")} />}
            </button>
          );
        })}
      </div>
      <div className="mt-6"><PrimaryBtn onClick={onNext} disabled={!draft.helpType}>Continue</PrimaryBtn><BackLink onBack={onBack} /></div>
    </div>
  );
}

// ---------- Consolidated request summary (confirm step + confirmation page) ----------
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium" style={{ color: NAVY }}>{value}</span>
    </div>
  );
}
function RequestSummary({ draft }: { draft: Draft }) {
  const code = draft.courseCode.trim() || draft.courseName.trim();
  const prof = draft.professorName.trim();
  const courseLine = [code, prof].filter(Boolean).join(" · ");
  return (
    <div className="rounded-2xl border bg-gray-50 px-5 py-5 sm:px-6">
      {draft.campusName.trim() && (
        <p className="text-[15px] font-bold" style={{ color: NAVY }}>{draft.campusName.trim()}</p>
      )}
      {courseLine && <p className="mt-0.5 text-sm text-gray-600">{courseLine}</p>}
      <div className="mt-3 space-y-1.5 border-t border-gray-200 pt-3">
        <SummaryRow label="Days to next exam" value={examSummary(draft)} />
        <SummaryRow label="Chosen option" value={chosenOptionLabel(draft.helpType)} />
      </div>
    </div>
  );
}

// ---------- Step 7: Your info + submit ----------
function InfoStep({ draft, update, sessionId, addAttachment, removeAttachment, onBack, onSubmitted }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  sessionId: string; addAttachment: (a: Attachment) => void; removeAttachment: (path: string) => void;
  onBack: () => void; onSubmitted: (r: SubmitOrderResult) => void;
}) {
  const submitFn = useServerFn(submitOrder);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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
      // The scope rides along as one order_chapters row so Lee sees the ask; the
      // free-text detail lives in special_requests and the files in attachments.
      const detail = draft.specialInstructions.trim();
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
          tier: draft.helpType,
          chapterCountOnly: null,
          requestScope: draft.requestScope,
          requestNotes: null,
          specialInstructions: detail || null,
          attachments: draft.attachments,
          interestedInGroup: false,
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
      <Title subtitle="I'll respond in 1 business day with a gameplan.">Confirm your request</Title>
      <RequestSummary draft={draft} />

      <div className="mt-5">
        <DetailBox draft={draft} update={update} sessionId={sessionId} addAttachment={addAttachment} removeAttachment={removeAttachment} />
      </div>

      <p className="mt-6 text-sm font-bold" style={{ color: NAVY }}>Add your info</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="First name" error={errors.firstName}><Input value={draft.firstName} onChange={(e) => update("firstName", e.target.value)} autoComplete="given-name" /></Field>
        <Field label="Last name" error={errors.lastName}><Input value={draft.lastName} onChange={(e) => update("lastName", e.target.value)} autoComplete="family-name" /></Field>
        <Field label="Email" error={errors.email}><Input type="email" value={draft.email} onChange={(e) => update("email", e.target.value)} autoComplete="email" /></Field>
        <Field label="Phone" error={errors.phone}><Input type="tel" value={draft.phone} placeholder="(555) 555-5555" onChange={(e) => update("phone", e.target.value)} autoComplete="tel" /></Field>
      </div>

      <div className="mt-6">
        <PrimaryBtn onClick={submit} disabled={busy}>
          {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</> : "Submit exam prep request"}
        </PrimaryBtn>
      </div>
      <BackLink onBack={onBack} />
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
  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #EAEEF6 0%, #FAFAF7 360px)", fontFamily: "Inter, -apple-system, sans-serif" }}>
      <Header />
      <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8">
        <div className="rounded-3xl bg-white p-6 shadow-[0_10px_40px_-15px_rgba(20,33,61,0.15)] sm:p-9">
          <div className="mx-auto grid h-14 w-14 place-content-center rounded-full bg-emerald-50"><Check className="h-8 w-8 text-emerald-600" /></div>
          <h1 className="mt-5 text-center text-2xl font-bold sm:text-3xl" style={{ color: NAVY }}>Request received!</h1>
          {result.shortRef && (
            <p className="mt-1 text-center text-sm text-gray-500">Reference <span className="font-mono">#{result.shortRef}</span></p>
          )}

          <div className="mt-6"><RequestSummary draft={draft} /></div>

          <div className="mt-6">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">What happens next</p>
            <ol className="mt-3 space-y-3 text-sm text-gray-800">
              <li className="flex gap-3"><Num n={1} /> I review your request (1 business day) and send back a gameplan, and we&apos;ll go from there.</li>
              <li className="flex gap-3"><Num n={2} /> You&apos;ll receive a text soon with more details.</li>
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
