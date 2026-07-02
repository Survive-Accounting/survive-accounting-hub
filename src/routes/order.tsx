// /order — Request a Help Video. A student sends what they're stuck on (free, no
// card); Lee reviews and replies with a quote; the student pays only after they
// approve the quote and receive the video. Scope-first: the student's problem
// comes first, context second, identity last. Submit saves SERVER-SIDE
// (service-role) via submitOrder. Nothing is charged here.
//
// NOTE: copy here is intentionally hardcoded (Help Video positioning). The old
// editable copy store + "Edit Student Flow" editor were retired.
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Toaster, toast } from "sonner";
import { Check, ChevronDown, Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { searchCampuses, type CampusLite } from "@/lib/onboarding.functions";
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
const LOGO_URL = "https://lwfiles.mycourse.app/672bc379cd024d536f651ecc-public/1554d231f0e2bf121ac35937c4d438ca.png";
const WORK_PHONE_DISPLAY = "(662) 565-8818";
const WORK_PHONE_HREF = "+16625658818";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

const FOOTER_PREFIX = "Questions? Text me anytime at";
const PAGE_TITLE = "Get videos for accounting exam prep";
const PAGE_SUBLINE = "Tailored to your specific needs.";

export const Route = createFileRoute("/order")({
  head: () => ({
    meta: [
      { title: "Request a Help Video — Survive Accounting" },
      { name: "description", content: "Free to request. I quote before I build. You only pay once you approve the quote and receive your Help Video — a short custom video made for your exact course." },
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
const STEPS = ["What you need", "Help options", "Exam", "School", "Course", "Professor", "Your info"] as const;

type HelpType = "made_to_order" | "one_on_one";

type RequestScope = "everything_exam" | "one_chapter" | "one_or_two_topics" | "homework_explained";
const SCOPES: { value: RequestScope; label: string; helper: string }[] = [
  { value: "everything_exam", label: "Everything on my next exam", helper: "Broad review across the chapters your exam covers." },
  { value: "one_chapter", label: "One entire chapter", helper: "Deep on one chapter — practice + walk-throughs." },
  { value: "one_or_two_topics", label: "One or two topics", helper: "Targeted help on the specific parts tripping you up." },
  { value: "homework_explained", label: "Homework explained", helper: "A problem or set of problems, walked through step by step." },
];
const scopeLabel = (s: RequestScope | null) => SCOPES.find((x) => x.value === s)?.label ?? "—";

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

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
};

// A concrete exam date wins; otherwise "Not sure yet" rides along as the
// timeframe so Lee still sees the urgency. (Delivery math is never shown here.)
function examTimeframeFor(d: Draft): ExamTimeframe | null {
  if (d.examDate) return null;
  if (d.examChoice === "not_sure") return "not_sure";
  return null;
}
function examDateFor(d: Draft): string | null {
  return d.examDate ? d.examDate : null;
}
function examLabel(d: Draft): string {
  if (d.examDate) return fmtDate(d.examDate);
  if (d.examChoice === "not_sure") return "Not sure yet";
  return "—";
}
const helpTypeLabel = (t: HelpType) => (t === "one_on_one" ? "1-on-1 tutoring" : "Help Video");
const requestedDateLabel = () =>
  new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

function OrderPage() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [result, setResult] = useState<SubmitOrderResult | null>(null);
  const update = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((p) => ({ ...p, [k]: v }));

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
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #EAEEF6 0%, #FAFAF7 360px)", fontFamily: "Inter, -apple-system, sans-serif" }}>
      <Toaster richColors position="top-center" />
      <Header />
      {/* Navy identity band — page header. */}
      <div className="w-full" style={{ background: NAVY }}>
        <div className="mx-auto max-w-2xl px-4 pb-11 pt-9 text-center">
          <h1 className="text-[26px] font-normal leading-tight text-white sm:text-[32px]" style={{ fontFamily: "'DM Serif Display', serif" }}>
            {PAGE_TITLE}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: "rgba(255,255,255,0.72)" }}>{PAGE_SUBLINE}</p>
        </div>
      </div>
      <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6">
        <Progress step={step} />
        <div className="mt-5 rounded-3xl border border-black/5 bg-white p-5 shadow-[0_18px_50px_-20px_rgba(20,33,61,0.30)] sm:p-8">
          {step === 0 && <ScopeStep draft={draft} update={update} onNext={next} />}
          {step === 1 && <HelpOptionsStep draft={draft} update={update} onNext={next} onBack={back} />}
          {step === 2 && <ExamStep draft={draft} update={update} onNext={next} onBack={back} />}
          {step === 3 && <CampusStep draft={draft} update={update} onNext={next} onBack={back} />}
          {step === 4 && <CourseStep draft={draft} update={update} ctx={ctx} onNext={next} onBack={back} />}
          {step === 5 && <ProfessorStep draft={draft} update={update} onNext={next} onBack={back} />}
          {step === 6 && <InfoStep draft={draft} update={update} onBack={back} onSubmitted={setResult} />}
        </div>
        <StepFooter />
      </div>
    </div>
  );
}

// ---------- chrome ----------
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
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold" style={{ color: NAVY }}>Step {step + 1} of {STEPS.length}</span>
        <span className="text-gray-500">{STEPS[step]}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
        <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${pct}%`, background: RED }} />
      </div>
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

// ---------- Step 1: Scope (what do you need help with?) ----------
function ScopeStep({ draft, update, onNext }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void; onNext: () => void;
}) {
  return (
    <div>
      <Title>What do you need help with?</Title>
      <div className="space-y-2">
        {SCOPES.map((s) => {
          const active = draft.requestScope === s.value;
          return (
            <button key={s.value} type="button" onClick={() => update("requestScope", s.value)}
              className={cn("flex w-full items-start justify-between gap-3 rounded-2xl border px-4 py-4 text-left transition", active ? "border-transparent text-white" : "bg-white hover:border-gray-300")}
              style={active ? { background: NAVY } : undefined}>
              <span>
                <span className="block text-[15px] font-semibold">{s.label}</span>
                <span className={cn("mt-0.5 block text-xs", active ? "text-white/75" : "text-gray-500")}>{s.helper}</span>
              </span>
              {active && <Check className="mt-0.5 h-4 w-4 shrink-0" />}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-gray-500">Not sure yet? Pick the closest — you can add details later.</p>

      <div className="mt-5">
        <Label className="mb-1.5 block text-sm font-medium text-gray-800">
          Anything specific I should know? <span className="font-normal text-gray-400">(optional)</span>
        </Label>
        <textarea
          value={draft.requestNotes}
          onChange={(e) => update("requestNotes", e.target.value)}
          rows={3}
          placeholder="e.g. the chapters, the problem numbers, or what keeps tripping you up"
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200"
        />
      </div>

      <div className="mt-4 rounded-2xl border bg-white p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={draft.interestedInGroup}
            onChange={(e) => update("interestedInGroup", e.target.checked)} className="mt-1 h-4 w-4" />
          <span className="text-sm text-gray-700">
            <span className="font-medium text-gray-900">Studying with classmates?</span> I can make it for your group — check this for a group rate.
          </span>
        </label>
        {draft.interestedInGroup && (
          <div className="mt-3 pl-7">
            <Label className="mb-1.5 block text-xs text-gray-600">About how many? (optional)</Label>
            <Input type="number" min={2} max={100} value={draft.groupSize}
              onChange={(e) => update("groupSize", e.target.value)} placeholder="e.g. 4" className="max-w-[120px]" />
          </div>
        )}
      </div>

      <div className="mt-6"><PrimaryBtn onClick={onNext} disabled={!draft.requestScope}>Continue</PrimaryBtn></div>
    </div>
  );
}

// ---------- Step 2: Help options (how it's delivered) ----------
function HelpOptionsStep({ draft, update, onNext, onBack }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void; onNext: () => void; onBack: () => void;
}) {
  const OPTIONS: { value: HelpType; title: string; range: string; note: string }[] = [
    { value: "made_to_order", title: "Get a custom Help Video", range: "$25 – $150+", note: "Preview before you buy" },
    { value: "one_on_one", title: "Get 1-on-1 tutoring", range: "$150/hr", note: "Limited slots available" },
  ];
  return (
    <div>
      <Title>Choose help options</Title>
      <div className="space-y-3">
        {OPTIONS.map((o) => {
          const active = draft.helpType === o.value;
          return (
            <button key={o.value} type="button" onClick={() => update("helpType", o.value)}
              className={cn("flex w-full items-start justify-between gap-3 rounded-2xl border px-5 py-5 text-left transition", active ? "border-transparent text-white" : "bg-white hover:border-gray-300")}
              style={active ? { background: NAVY } : undefined}>
              <span>
                <span className="block text-base font-bold">{o.title}</span>
                <span className="mt-1 block text-lg font-semibold" style={{ color: active ? "#FFFFFF" : RED }}>{o.range}</span>
                <span className={cn("mt-0.5 block text-xs", active ? "text-white/75" : "text-gray-500")}>{o.note}</span>
              </span>
              {active && <Check className="mt-1 h-5 w-5 shrink-0" />}
            </button>
          );
        })}
      </div>
      <div className="mt-6"><PrimaryBtn onClick={onNext} disabled={!draft.helpType}>Continue</PrimaryBtn><BackLink onBack={onBack} /></div>
    </div>
  );
}

// ---------- Step 3: Exam (calendar-first, no delivery math) ----------
function ExamStep({ draft, update, onNext, onBack }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void; onNext: () => void; onBack: () => void;
}) {
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const selected = draft.examDate ? new Date(`${draft.examDate}T00:00:00`) : undefined;
  const canContinue = !!draft.examDate || draft.examChoice === "not_sure";
  return (
    <div>
      <Title>When&apos;s your exam?</Title>
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
      <button type="button"
        onClick={() => { update("examChoice", "not_sure"); update("examDate", ""); }}
        className={cn("mt-3 w-full rounded-2xl border px-4 py-3 text-sm font-medium transition",
          draft.examChoice === "not_sure" ? "border-transparent text-white" : "bg-white hover:border-gray-300")}
        style={draft.examChoice === "not_sure" ? { background: NAVY } : undefined}>
        Not sure yet
      </button>
      <div className="mt-6"><PrimaryBtn onClick={onNext} disabled={!canContinue}>Continue</PrimaryBtn><BackLink onBack={onBack} /></div>
    </div>
  );
}

// ---------- Step 3: School ----------
function CampusStep({ draft, update, onNext, onBack }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void; onNext: () => void; onBack: () => void;
}) {
  const searchFn = useServerFn(searchCampuses);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CampusLite[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (draft.campusOther || draft.campusId) return;
    let off = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try { const r = await searchFn({ data: { q: query } }); if (!off) setResults(r); }
      catch { /* ignore */ } finally { if (!off) setSearching(false); }
    }, 200);
    return () => { off = true; clearTimeout(t); };
  }, [query, draft.campusOther, draft.campusId, searchFn]);

  const picked = !!draft.campusId || (draft.campusOther && draft.campusName.trim().length > 0);
  return (
    <div>
      <Title>Where are you taking accounting?</Title>
      {draft.campusId && !draft.campusOther ? (
        <div className="flex items-center justify-between rounded-xl border bg-gray-50 px-4 py-3">
          <span className="text-sm font-medium">{draft.campusName}</span>
          <Button variant="ghost" size="sm" onClick={() => { update("campusId", null); update("campusName", ""); setQuery(""); }}>Change</Button>
        </div>
      ) : draft.campusOther ? (
        <div className="space-y-2">
          <Input placeholder="Type your school name" value={draft.campusName} autoFocus onChange={(e) => update("campusName", e.target.value)} />
          <button type="button" className="text-xs text-gray-600 underline" onClick={() => { update("campusOther", false); update("campusName", ""); }}>Search for my school instead</button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input className="pl-9" placeholder="Search schools…" value={query} autoFocus onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="mt-2 max-h-56 overflow-auto rounded-xl border bg-white">
            {searching && <div className="p-3 text-xs text-gray-500">Searching…</div>}
            {!searching && results.length === 0 && <div className="p-3 text-xs text-gray-500">No matches yet — keep typing.</div>}
            {results.map((r) => (
              <button key={r.id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                onClick={() => { update("campusId", r.id); update("campusName", r.name); update("campusOther", false); }}>{r.name}</button>
            ))}
          </div>
          <button type="button" className="mt-2 text-xs text-gray-600 underline" onClick={() => { update("campusOther", true); update("campusId", null); }}>My school isn&apos;t listed</button>
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

// ---------- Step 5: Professor (contacted-only picker) ----------
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
              {p.name}{p.title ? <span className="ml-1.5 text-xs text-gray-500">{p.title}</span> : null}
            </button>
          ))}
          {!showAll && filtered.length > 20 && (
            <button type="button" className="block w-full px-3 py-2 text-center text-xs font-medium text-gray-600 hover:bg-gray-50" onClick={() => setShowAll(true)}>
              Show more ({filtered.length - 20})
            </button>
          )}
        </div>
      )}
      {draft.professorLeadId && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-700"><Check className="h-3.5 w-3.5" /> Matched to your school&apos;s directory</p>
      )}

      <div className="mt-6">
        <PrimaryBtn onClick={onNext}>Continue</PrimaryBtn>
        <div className="mt-3 flex items-center justify-between">
          <button type="button" onClick={onBack} className="text-sm text-gray-500 underline hover:text-gray-700">Back</button>
          <button type="button" onClick={() => { update("professorName", ""); update("professorLeadId", null); onNext(); }} className="text-sm text-gray-500 underline hover:text-gray-700">My professor isn&apos;t listed</button>
        </div>
        <div className="mt-2 text-center">
          <button type="button" onClick={() => { update("professorName", ""); update("professorLeadId", null); onNext(); }} className="text-xs text-gray-400 underline hover:text-gray-600">Skip — I&apos;m not sure</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Request receipt (monospace, dotted leaders) ----------
function ReceiptRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5" style={{ fontFamily: MONO, fontSize: "13px", color: strong ? NAVY : "#374151" }}>
      <span className={strong ? "font-bold" : ""}>{label}</span>
      <span className="mb-[3px] flex-1 border-b border-dotted border-gray-400" />
      <span className={strong ? "font-bold" : ""}>{value}</span>
    </div>
  );
}
function InvoiceSummary({ draft }: { draft: Draft }) {
  const course = [draft.courseCode.trim(), draft.courseName.trim()].filter(Boolean).join(" · ");
  return (
    <div className="rounded-2xl border bg-gray-50 px-5 py-5 sm:px-6">
      <div className="space-y-2.5">
        {draft.campusName.trim() && <ReceiptRow label="SCHOOL" value={draft.campusName.trim()} />}
        {course && <ReceiptRow label="COURSE" value={course} />}
        <ReceiptRow label="PROFESSOR" value={draft.professorName.trim() || "—"} />
        <ReceiptRow label="HELP TYPE" value={helpTypeLabel(draft.helpType)} />
        {draft.requestScope && <ReceiptRow label="REQUEST" value={scopeLabel(draft.requestScope)} />}
        <ReceiptRow label="REQUESTED DATE" value={requestedDateLabel()} />
        <ReceiptRow label="EXAM DATE" value={examLabel(draft)} />
      </div>
    </div>
  );
}

// ---------- Step 6: Your info + confirmation ----------
function InfoStep({ draft, update, onBack, onSubmitted }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void; onBack: () => void; onSubmitted: (r: SubmitOrderResult) => void;
}) {
  const submitFn = useServerFn(submitOrder);
  const [busy, setBusy] = useState(false);
  const [showSpecial, setShowSpecial] = useState(false);
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
      // Map the request onto existing order fields. No finalized price yet, so
      // chapterCountOnly = null. The scope + the student's own note ride along as
      // one order_chapters row so Lee sees the ask in the admin drawer.
      const note = draft.requestNotes.trim();
      const chapters = draft.requestScope
        ? [{ chapterLabel: scopeLabel(draft.requestScope), chapterNumber: null, struggleNote: note || null }]
        : [];
      const groupSizeNum = draft.interestedInGroup && draft.groupSize.trim()
        ? Math.max(0, Math.min(500, parseInt(draft.groupSize, 10) || 0))
        : null;
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
          requestNotes: note || null,
          specialInstructions: draft.specialInstructions.trim() || null,
          interestedInGroup: draft.interestedInGroup,
          groupSize: groupSizeNum,
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
      <Title subtitle="I'll respond in 1 business day.">Confirm your request</Title>
      <InvoiceSummary draft={draft} />

      {/* Special instructions — collapsed row that expands to a textarea */}
      <div className="mt-3">
        <button type="button" onClick={() => setShowSpecial((v) => !v)}
          className="flex w-full items-center justify-between rounded-2xl border bg-white px-4 py-3 text-left text-sm font-medium text-gray-700 hover:border-gray-300">
          Special instructions (optional)
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-gray-400 transition-transform", showSpecial && "rotate-180")} />
        </button>
        {showSpecial && (
          <textarea value={draft.specialInstructions} onChange={(e) => update("specialInstructions", e.target.value)}
            maxLength={2000} rows={4}
            placeholder="Anything else I should know? Files, topics, questions — just type it here."
            className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200" />
        )}
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
          {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</> : "Request Help Video →"}
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
  const steps = [
    "I review what you sent and reply with a quote — usually within 1 business day.",
    "You approve the quote (no card needed until then).",
    result.tier === "one_on_one"
      ? "We set up your 1-on-1 session before your exam."
      : "I make your Help Video and deliver before your exam.",
  ];
  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #EAEEF6 0%, #FAFAF7 360px)", fontFamily: "Inter, -apple-system, sans-serif" }}>
      <Header />
      <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8">
        <div className="rounded-3xl bg-white p-6 shadow-[0_10px_40px_-15px_rgba(20,33,61,0.15)] sm:p-9">
          <div className="mx-auto grid h-14 w-14 place-content-center rounded-full bg-emerald-50"><Check className="h-8 w-8 text-emerald-600" /></div>
          <h1 className="mt-5 text-center text-2xl font-bold sm:text-3xl" style={{ color: NAVY }}>
            Request received{result.shortRef ? <> — <span className="font-mono">#{result.shortRef}</span></> : null}
          </h1>

          <div className="mt-6"><InvoiceSummary draft={draft} /></div>

          <div className="mt-6">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">What happens next</p>
            <ol className="mt-3 space-y-3 text-sm text-gray-800">
              {steps.map((s, i) => <li key={i} className="flex gap-3"><Num n={i + 1} /> {s}</li>)}
            </ol>
          </div>

          {result.shortRef && (
            <div className="mt-6">
              <a href={`/order/${result.shortRef}`}
                className="flex h-12 w-full items-center justify-center rounded-xl text-base font-bold text-white"
                style={{ background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)` }}>
                Track your request →
              </a>
            </div>
          )}

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
