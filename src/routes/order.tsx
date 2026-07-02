// /order — Request a Cram Video. A student sends what they're stuck on (free, no
// card); Lee reviews and replies with a quote; the student pays only after they
// approve the quote and receive the video. Scope-first: the student's problem
// comes first, context second, identity last. Submit saves SERVER-SIDE
// (service-role) via submitOrder. Nothing is charged here.
//
// NOTE: copy here is intentionally hardcoded (Cram Video positioning). The old
// editable copy store (order-copy.functions.ts / "Edit Student Flow") is keyed to
// the previous step structure and no longer drives this page — see
// docs/OVERNIGHT_QUESTIONS.md #4.
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Toaster, toast } from "sonner";
import { Check, ChevronDown, Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const PILL = "Free to request · I quote before I build · Pay only if you approve";
const FOOTER_PREFIX = "Questions? Text me anytime at";
const PAGE_TITLE = "Request a Cram Video";
const PAGE_SUBLINE = "Made for what you're stuck on. No card, no obligation.";

export const Route = createFileRoute("/order")({
  head: () => ({
    meta: [
      { title: "Request a Cram Video — Survive Accounting" },
      { name: "description", content: "Free to request. I quote before I build. You only pay once you approve the quote and receive your Cram Video — a short custom video made for your exact course." },
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
const STEPS = ["What you need", "Exam", "School", "Course", "Professor", "Your info"] as const;

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
  examChoice: "date" | "this_week" | "next_week" | "not_sure" | null;
  examDate: string;
  campusId: string | null; campusName: string; campusOther: boolean;
  courseFamily: FamilyKey | null; courseCode: string; courseName: string; courseOther: boolean;
  professorName: string; professorLeadId: string | null;
  firstName: string; lastName: string; email: string; phone: string;
};

const EMPTY: Draft = {
  requestScope: null,
  examChoice: null, examDate: "",
  campusId: null, campusName: "", campusOther: false,
  courseFamily: null, courseCode: "", courseName: "", courseOther: false,
  professorName: "", professorLeadId: null,
  firstName: "", lastName: "", email: "", phone: "",
};

// A concrete date wins; otherwise the chosen week/"not sure" rides along as the
// timeframe so Lee still sees the urgency. (Delivery math is never shown here.)
function examTimeframeFor(d: Draft): ExamTimeframe | null {
  if (d.examDate) return null;
  if (d.examChoice === "this_week") return "this_week";
  if (d.examChoice === "next_week") return "next_week";
  if (d.examChoice === "not_sure") return "not_sure";
  return null;
}
function examDateFor(d: Draft): string | null {
  return d.examDate ? d.examDate : null;
}
function examLabel(d: Draft): string {
  if (d.examDate) return fmtDate(d.examDate);
  if (d.examChoice === "not_sure") return "Not sure yet";
  if (d.examChoice === "this_week") return "This week";
  if (d.examChoice === "next_week") return "Next week";
  return "—";
}

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
    <div className="min-h-screen" style={{ background: "#FAFAF7", fontFamily: "Inter, -apple-system, sans-serif" }}>
      <Toaster richColors position="top-center" />
      <Header />
      <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6">
        <h1 className="text-center text-2xl font-bold sm:text-3xl" style={{ color: NAVY }}>{PAGE_TITLE}</h1>
        <p className="mx-auto mt-1.5 max-w-md text-center text-sm text-gray-600">{PAGE_SUBLINE}</p>
        <div className="mt-4"><HeaderPill /></div>
        <div className="mt-4"><Progress step={step} /></div>
        <div className="mt-5 rounded-3xl bg-white p-5 shadow-[0_10px_40px_-15px_rgba(20,33,61,0.15)] sm:p-8">
          {step === 0 && <ScopeStep draft={draft} update={update} onNext={next} />}
          {step === 1 && <ExamStep draft={draft} update={update} onNext={next} onBack={back} />}
          {step === 2 && <CampusStep draft={draft} update={update} onNext={next} onBack={back} />}
          {step === 3 && <CourseStep draft={draft} update={update} ctx={ctx} onNext={next} onBack={back} />}
          {step === 4 && <ProfessorStep draft={draft} update={update} onNext={next} onBack={back} />}
          {step === 5 && <InfoStep draft={draft} update={update} onBack={back} onSubmitted={setResult} />}
        </div>
        <StepFooter />
        <OrderFaq />
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
function HeaderPill() {
  return (
    <div className="rounded-full border px-4 py-2 text-center text-[12.5px] font-medium"
      style={{ borderColor: "rgba(20,33,61,0.12)", background: "rgba(20,33,61,0.04)", color: NAVY }}>
      {PILL}
    </div>
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
      <div className="mt-6"><PrimaryBtn onClick={onNext} disabled={!draft.requestScope}>Continue</PrimaryBtn></div>
    </div>
  );
}

// ---------- Step 2: Exam (no delivery math shown) ----------
function weekDates(offset: number) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const mondayIdx = (today.getDay() + 6) % 7;
  const monday = new Date(today); monday.setDate(today.getDate() - mondayIdx + offset * 7);
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    return { iso: d.toISOString().slice(0, 10), dow: names[i], day: d.getDate(), past: d < today };
  });
}
function ExamStep({ draft, update, onNext, onBack }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void; onNext: () => void; onBack: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const pills = draft.examChoice === "this_week" ? weekDates(0) : draft.examChoice === "next_week" ? weekDates(1) : [];
  const canContinue = draft.examChoice === "date"
    ? !!draft.examDate
    : draft.examChoice === "this_week" || draft.examChoice === "next_week" || draft.examChoice === "not_sure";

  return (
    <div>
      <Title>When&apos;s your exam?</Title>
      <div className="space-y-4">
        <div className="rounded-2xl border bg-white p-4">
          <Label className="mb-2 block text-sm font-medium">I know the date</Label>
          <Input type="date" min={today} value={draft.examChoice === "date" ? draft.examDate : ""}
            onChange={(e) => { update("examChoice", "date"); update("examDate", e.target.value); }} />
        </div>
        <div className="text-center text-xs uppercase tracking-wide text-gray-400">or</div>
        <div className="grid grid-cols-3 gap-2">
          {([["this_week", "This week"], ["next_week", "Next week"], ["not_sure", "Not sure yet"]] as const).map(([k, label]) => {
            const active = draft.examChoice === k;
            return (
              <button key={k} type="button"
                onClick={() => { update("examChoice", k); update("examDate", ""); }}
                className={cn("rounded-2xl border px-3 py-4 text-sm font-medium transition", active ? "border-transparent text-white" : "bg-white hover:border-gray-300")}
                style={active ? { background: NAVY } : undefined}>{label}</button>
            );
          })}
        </div>
        {pills.length > 0 && (
          <div>
            <p className="mb-2 text-xs text-gray-500">Which day? (optional)</p>
            <div className="grid grid-cols-7 gap-1.5">
              {pills.map((p) => {
                const active = draft.examDate === p.iso;
                return (
                  <button key={p.iso} type="button" disabled={p.past}
                    onClick={() => update("examDate", p.iso)}
                    className={cn("flex flex-col items-center rounded-lg border py-2 text-[11px] transition",
                      p.past ? "cursor-not-allowed opacity-30" : active ? "border-transparent text-white" : "bg-white hover:border-gray-300")}
                    style={active ? { background: RED } : undefined}>
                    <span className="font-semibold">{p.dow}</span><span>{p.day}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
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
function RequestSummary({ draft }: { draft: Draft }) {
  const course = [draft.courseCode.trim(), draft.courseName.trim()].filter(Boolean).join(" · ");
  return (
    <div className="rounded-2xl border bg-gray-50 p-4">
      <div className="space-y-1.5">
        {draft.campusName.trim() && <ReceiptRow label="SCHOOL" value={draft.campusName.trim()} />}
        {course && <ReceiptRow label="COURSE" value={course} />}
        <ReceiptRow label="PROFESSOR" value={draft.professorName.trim() || "—"} />
        {draft.requestScope && <ReceiptRow label="REQUEST" value={scopeLabel(draft.requestScope)} />}
        <ReceiptRow label="EXAM" value={examLabel(draft)} />
      </div>
      <div className="mt-3 border-t border-dashed border-gray-300 pt-3">
        <ReceiptRow label="DUE TODAY" value="$0" strong />
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
      // chapterCountOnly = null. The scope rides along as one order_chapters row so
      // Lee sees the ask in the admin drawer; free-text notes come later on the tracker.
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
          tier: "made_to_order",
          chapterCountOnly: null,
          requestScope: draft.requestScope,
          requestNotes: null,
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
      <Title>Almost done.</Title>
      <RequestSummary draft={draft} />

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Field label="First name" error={errors.firstName}><Input value={draft.firstName} onChange={(e) => update("firstName", e.target.value)} autoComplete="given-name" /></Field>
        <Field label="Last name" error={errors.lastName}><Input value={draft.lastName} onChange={(e) => update("lastName", e.target.value)} autoComplete="family-name" /></Field>
        <Field label="Email" error={errors.email}><Input type="email" value={draft.email} onChange={(e) => update("email", e.target.value)} autoComplete="email" /></Field>
        <Field label="Phone" error={errors.phone}><Input type="tel" value={draft.phone} placeholder="(555) 555-5555" onChange={(e) => update("phone", e.target.value)} autoComplete="tel" /></Field>
      </div>

      <div className="mt-5 space-y-2 rounded-2xl bg-gray-50 p-4 text-sm text-gray-700">
        <p>From Lee — Ole Miss accounting grad, tutoring since 2015. 1,000+ students helped.</p>
        <p><span className="font-semibold">Try For 1 Test Guarantee:</span> Didn&apos;t help on your test? Reply within 72 hours after your exam — full refund, no questions.</p>
        <p>Free to request. You only pay once you approve my quote and receive your Cram Video.</p>
      </div>

      <div className="mt-3 rounded-2xl border border-dashed p-4 text-sm text-gray-700" style={{ borderColor: "rgba(20,33,61,0.18)" }}>
        Prefer live 1-on-1? A small number of semester students at $150/hr — text me at{" "}
        <a href={`sms:${WORK_PHONE_HREF}`} className="font-semibold hover:underline" style={{ color: RED }}>{WORK_PHONE_DISPLAY}</a>.
      </div>

      <div className="mt-5">
        <PrimaryBtn onClick={submit} disabled={busy}>
          {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</> : "Send my request →"}
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
    "I make your Cram Video and deliver before your exam.",
  ];
  return (
    <div className="min-h-screen" style={{ background: "#FAFAF7", fontFamily: "Inter, -apple-system, sans-serif" }}>
      <Header />
      <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8">
        <div className="rounded-3xl bg-white p-6 shadow-[0_10px_40px_-15px_rgba(20,33,61,0.15)] sm:p-9">
          <div className="mx-auto grid h-14 w-14 place-content-center rounded-full bg-emerald-50"><Check className="h-8 w-8 text-emerald-600" /></div>
          <h1 className="mt-5 text-center text-2xl font-bold sm:text-3xl" style={{ color: NAVY }}>
            Request received{result.shortRef ? <> — <span className="font-mono">#{result.shortRef}</span></> : null}
          </h1>

          <div className="mt-6"><RequestSummary draft={draft} /></div>

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

// ---------- FAQ (under the wizard, not inside it) ----------
function OrderFaq() {
  const faqs = [
    {
      q: "What's a Cram Video?",
      a: "A short custom video — usually 2 to 5 minutes per problem or topic — plus notes, made for your exact course, professor, and what you're stuck on.",
    },
    {
      q: "When do I pay?",
      a: "Only after you approve my quote and receive your video. If it didn't help on your test, reply within 72 hours of your exam for a full refund.",
    },
    {
      q: "What can I send with my request?",
      a: "Anything that helps — a homework problem, screenshot, review sheet, chapter, or exam topic. You'll be able to add files or notes on your request tracker page after you submit.",
    },
  ];
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="mx-auto mt-8 max-w-2xl">
      <h2 className="mb-3 text-center text-sm font-bold uppercase tracking-wide text-gray-500">Questions</h2>
      <div className="space-y-2">
        {faqs.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={i} className="overflow-hidden rounded-2xl border bg-white">
              <button type="button" onClick={() => setOpen(isOpen ? null : i)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold" style={{ color: NAVY }}>
                {f.q}<ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", isOpen && "rotate-180")} />
              </button>
              {isOpen && <p className="px-4 pb-4 text-sm text-gray-600">{f.a}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
