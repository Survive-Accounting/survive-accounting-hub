// /order — Cram Pack PRE-ORDER wizard. A pre-order is a QUOTE by chapter count,
// not a fully-specified order: the student gives campus → course → professor →
// how many chapters → exam date → contact. The specifics (textbook, exact
// chapters, syllabus, requests) are collected post-order in the Track Your Order
// conversation. Submit saves SERVER-SIDE (service-role). Pay on delivery.
import { useEffect, useMemo, useState } from "react";
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
  subtotalCentsForChapters,
  computeOrderPricing,
  STANDARD_DAYS_PER_CHAPTER,
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
const HEADER_PILL = "Cram Packs from $30 · Pay on delivery · Free if it didn't help on your test";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export const Route = createFileRoute("/order")({
  head: () => ({
    meta: [
      { title: "Pre-order your Cram Pack — Survive Accounting" },
      { name: "description", content: "Practice exam + video walk-throughs, made for your exact course. Pay on delivery." },
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
const STEPS = ["School", "Course", "Professor", "Chapters", "Exam", "Your info"] as const;

const fmtMoney = (cents: number) => `$${Math.round(cents / 100)}`;
const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

type Draft = {
  campusId: string | null; campusName: string; campusOther: boolean;
  courseFamily: FamilyKey | null; courseCode: string; courseName: string; courseOther: boolean;
  professorName: string; professorLeadId: string | null;
  chapterCount: number | null;               // 1..5 (5 = "5+")
  interestedInGroup: boolean; groupSize: string;
  examChoice: "date" | "this_week" | "next_week" | "not_sure" | null;
  examDate: string;                           // concrete yyyy-mm-dd
  firstName: string; lastName: string; email: string; phone: string;
};

const EMPTY: Draft = {
  campusId: null, campusName: "", campusOther: false,
  courseFamily: null, courseCode: "", courseName: "", courseOther: false,
  professorName: "", professorLeadId: null,
  chapterCount: null, interestedInGroup: false, groupSize: "",
  examChoice: null, examDate: "",
  firstName: "", lastName: "", email: "", phone: "",
};

// Exam timeframe stored on submit: a concrete date beats a bucket; "not sure"
// keeps the bucket with a null date.
function examTimeframeFor(d: Draft): ExamTimeframe | null {
  return d.examChoice === "not_sure" ? "not_sure" : null;
}
function examDateFor(d: Draft): string | null {
  return d.examDate ? d.examDate : null;
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

  const pricing = useMemo(
    () => computeOrderPricing({
      chapterCount: draft.chapterCount ?? 0,
      examDate: examDateFor(draft),
      timeframe: examTimeframeFor(draft),
      rush: false,
    }),
    [draft.chapterCount, draft.examDate, draft.examChoice],
  );

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  if (result) return <Confirmation draft={draft} result={result} pricing={pricing} />;

  return (
    <div className="min-h-screen" style={{ background: "#FAFAF7", fontFamily: "Inter, -apple-system, sans-serif" }}>
      <Toaster richColors position="top-center" />
      <Header />
      <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-5">
        <HeaderPill />
        <div className="mt-4"><Progress step={step} /></div>
        <div className="mt-5 rounded-3xl bg-white p-5 shadow-[0_10px_40px_-15px_rgba(20,33,61,0.15)] sm:p-8">
          {step === 0 && <CampusStep draft={draft} update={update} onNext={next} />}
          {step === 1 && <CourseStep draft={draft} update={update} ctx={ctx} onNext={next} onBack={back} />}
          {step === 2 && <ProfessorStep draft={draft} update={update} onNext={next} onBack={back} />}
          {step === 3 && <ChaptersStep draft={draft} update={update} onNext={next} onBack={back} />}
          {step === 4 && <ExamStep draft={draft} update={update} pricing={pricing} onNext={next} onBack={back} />}
          {step === 5 && <SummaryStep draft={draft} update={update} pricing={pricing} onBack={back} onSubmitted={setResult} />}
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
      {HEADER_PILL}
    </div>
  );
}
function StepFooter() {
  return (
    <p className="mt-5 text-center text-xs text-gray-500">
      Questions? Text me anytime at{" "}
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
      <h1 className="text-xl font-bold leading-tight sm:text-2xl" style={{ color: NAVY }}>{children}</h1>
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

// ---------- Step 1: School ----------
function CampusStep({ draft, update, onNext }: { draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void; onNext: () => void }) {
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
      <Title subtitle="So I can match your exact course.">Where do you go?</Title>
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
      <div className="mt-6"><PrimaryBtn onClick={onNext} disabled={!picked}>Continue</PrimaryBtn></div>
    </div>
  );
}

// ---------- Step 2: Course ----------
function CourseStep({ draft, update, ctx, onNext, onBack }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void; ctx: OrderCampusContext | null; onNext: () => void; onBack: () => void;
}) {
  const hasCodes = !!ctx && FAMILY_ORDER.some((f) => ctx.codes[f] || ctx.titles[f]);
  const forceOther = draft.campusOther || (!!draft.campusId && ctx !== null && !hasCodes);
  const otherMode = draft.courseOther || forceOther;
  const courseNameForPitch = draft.courseName.trim() || "your course";

  const pickFamily = (f: FamilyKey) => {
    update("courseFamily", f); update("courseCode", ctx?.codes[f] ?? "");
    update("courseName", ctx?.titles[f] ?? FAMILY_LABELS[f]); update("courseOther", false);
  };
  const canContinue = otherMode ? (draft.courseName.trim().length > 0 || draft.courseCode.trim().length > 0) : !!draft.courseFamily;

  return (
    <div>
      <Title subtitle="Which accounting course is this for?">Your course</Title>
      <p className="mb-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
        Pre-order a Cram Pack for <strong>{courseNameForPitch}</strong> — practice exam + video walk-throughs, made for your exact course, professor, and textbook.
      </p>
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

// ---------- Step 3: Professor (emailed-first list) ----------
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
      <Title subtitle="So I match your professor's exam style.">Who&apos;s your professor?</Title>
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
      </div>
    </div>
  );
}

// ---------- Step 4: How many chapters ----------
const CHAPTER_OPTIONS = [1, 2, 3, 4, 5] as const;
function ChaptersStep({ draft, update, onNext, onBack }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void; onNext: () => void; onBack: () => void;
}) {
  return (
    <div>
      <Title subtitle="We'll lock in the exact chapters from your syllabus after you pre-order.">How many chapters on the exam?</Title>
      <div className="grid grid-cols-5 gap-2">
        {CHAPTER_OPTIONS.map((n) => {
          const active = draft.chapterCount === n;
          const label = n === 5 ? "5+" : String(n);
          return (
            <button key={n} type="button" onClick={() => update("chapterCount", n)}
              className={cn("flex flex-col items-center gap-1 rounded-2xl border py-4 transition", active ? "border-transparent text-white" : "bg-white hover:border-gray-300")}
              style={active ? { background: NAVY } : undefined}>
              <span className="text-xl font-bold">{label}</span>
              <span className={cn("text-[11px]", active ? "text-white/80" : "text-gray-500")}>{fmtMoney(subtotalCentsForChapters(n))}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 rounded-xl border bg-gray-50 p-3">
        <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-800">
          <input type="checkbox" checked={draft.interestedInGroup} className="mt-0.5 h-4 w-4"
            onChange={(e) => update("interestedInGroup", e.target.checked)} />
          <span>Got classmates in the same class? I can prep this for the group — usually faster, possibly cheaper.</span>
        </label>
        {draft.interestedInGroup && (
          <div className="mt-3 flex items-center gap-2">
            <Label className="text-sm text-gray-700">How many?</Label>
            <Input type="number" min={2} className="h-9 w-24" value={draft.groupSize} onChange={(e) => update("groupSize", e.target.value)} />
          </div>
        )}
      </div>

      <div className="mt-6"><PrimaryBtn onClick={onNext} disabled={!draft.chapterCount}>Continue</PrimaryBtn><BackLink onBack={onBack} /></div>
    </div>
  );
}

// ---------- Step 5: Exam ----------
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
function ExamStep({ draft, update, pricing, onNext, onBack }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void; pricing: ReturnType<typeof computeOrderPricing>; onNext: () => void; onBack: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const pills = draft.examChoice === "this_week" ? weekDates(0) : draft.examChoice === "next_week" ? weekDates(1) : [];
  const canContinue = !!draft.examDate || draft.examChoice === "not_sure";
  const stdDays = STANDARD_DAYS_PER_CHAPTER * (draft.chapterCount ?? 0);

  return (
    <div>
      <Title subtitle="So your Cram Pack lands in time.">When&apos;s your exam?</Title>
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
            <p className="mb-2 text-xs text-gray-500">Which day?</p>
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

      {(draft.chapterCount ?? 0) > 0 && (
        <p className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
          {draft.examDate
            ? <>Estimated delivery: <strong>by {fmtDate(pricing.deliveryTargetDate)}</strong></>
            : draft.examChoice === "not_sure"
              ? <>Estimated delivery: <strong>{stdDays}–{stdDays + 4} days</strong> after you confirm your exam date</>
              : <>Estimated delivery: about <strong>{stdDays} days</strong></>}
        </p>
      )}

      <div className="mt-6"><PrimaryBtn onClick={onNext} disabled={!canContinue}>Continue</PrimaryBtn><BackLink onBack={onBack} /></div>
    </div>
  );
}

// ---------- Receipt (monospace, dotted leaders) ----------
function ReceiptRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5" style={{ fontFamily: MONO, fontSize: "13px", color: strong ? NAVY : "#374151" }}>
      <span className={strong ? "font-bold" : ""}>{label}</span>
      <span className="mb-[3px] flex-1 border-b border-dotted border-gray-400" />
      <span className={strong ? "font-bold" : ""}>{value}</span>
    </div>
  );
}
function Receipt({ draft, pricing }: { draft: Draft; pricing: ReturnType<typeof computeOrderPricing> }) {
  const course = [draft.courseCode, draft.courseName].filter(Boolean).join(" · ") || "—";
  const exam = draft.examDate ? fmtDate(draft.examDate) : draft.examChoice === "not_sure" ? "Not sure yet" : "—";
  const delivery = draft.examDate ? `by ${fmtDate(pricing.deliveryTargetDate)}` : "TBD (set exam date)";
  const subtotal = fmtMoney(pricing.subtotalCents);
  return (
    <div className="rounded-2xl border bg-gray-50 p-4">
      <div className="space-y-1.5">
        <ReceiptRow label="SCHOOL" value={draft.campusName || "—"} />
        <ReceiptRow label="COURSE" value={course} />
        <ReceiptRow label="PROFESSOR" value={draft.professorName.trim() || "—"} />
        <ReceiptRow label="CHAPTERS" value={`${draft.chapterCount ?? "—"}`} />
        <ReceiptRow label="EXAM" value={exam} />
      </div>
      <div className="my-2 border-t border-dashed border-gray-300" />
      <div className="space-y-1.5">
        <ReceiptRow label="PRE-ORDER" value={subtotal} strong />
        <ReceiptRow label="DELIVERY" value={delivery} />
        <ReceiptRow label="DUE TODAY" value="$0" />
        <ReceiptRow label="DUE ON DELIVERY" value={subtotal} strong />
      </div>
      <p className="mt-2 text-[11px] text-gray-500" style={{ fontFamily: MONO }}>Exact chapters locked in from your syllabus after pre-order.</p>
    </div>
  );
}

// ---------- Step 6: Summary + your info ----------
function SummaryStep({ draft, update, pricing, onBack, onSubmitted }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void; pricing: ReturnType<typeof computeOrderPricing>; onBack: () => void; onSubmitted: (r: SubmitOrderResult) => void;
}) {
  const submitFn = useServerFn(submitOrder);
  const [busy, setBusy] = useState<null | "made_to_order" | "one_on_one">(null);
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

  const submit = async (tier: "made_to_order" | "one_on_one") => {
    if (!validate()) return;
    setBusy(tier);
    try {
      const groupSize = draft.interestedInGroup && draft.groupSize.trim() ? Number(draft.groupSize) : null;
      const r = await submitFn({
        data: {
          firstName: draft.firstName.trim(), lastName: draft.lastName.trim(), email: draft.email.trim(), phone: draft.phone.trim(),
          campusId: draft.campusId, campusText: draft.campusId ? null : (draft.campusName.trim() || null),
          courseFamily: draft.courseFamily, courseCode: draft.courseCode.trim() || null, courseName: draft.courseName.trim() || null,
          professorName: draft.professorName.trim() || null, professorLeadId: draft.professorLeadId,
          examDate: examDateFor(draft), examTimeframe: examTimeframeFor(draft),
          tier,
          chapterCountOnly: tier === "made_to_order" ? draft.chapterCount : null,
          interestedInGroup: draft.interestedInGroup,
          groupSize: Number.isFinite(groupSize as number) ? groupSize : null,
        },
      });
      onSubmitted(r);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <div>
      <Title subtitle="Here's your pre-order. Nothing due today.">Your Cram Pack</Title>
      <Receipt draft={draft} pricing={pricing} />

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Field label="First name" error={errors.firstName}><Input value={draft.firstName} onChange={(e) => update("firstName", e.target.value)} autoComplete="given-name" /></Field>
        <Field label="Last name" error={errors.lastName}><Input value={draft.lastName} onChange={(e) => update("lastName", e.target.value)} autoComplete="family-name" /></Field>
        <Field label="Email" error={errors.email}><Input type="email" value={draft.email} onChange={(e) => update("email", e.target.value)} autoComplete="email" /></Field>
        <Field label="Phone" error={errors.phone}><Input type="tel" value={draft.phone} placeholder="(555) 555-5555" onChange={(e) => update("phone", e.target.value)} autoComplete="tel" /></Field>
      </div>

      {/* Trust block */}
      <div className="mt-5 space-y-2 rounded-2xl bg-gray-50 p-4 text-sm text-gray-700">
        <p><strong>From Lee</strong> — Ole Miss accounting alum, 10+ years tutoring, 1,000 students served.</p>
        <p><strong>Try For 1 Test Guarantee:</strong> Didn&apos;t help on your test? Reply within 72 hours after your exam — full refund, no questions.</p>
        <p><strong>Pay on delivery</strong> — nothing today.</p>
      </div>

      <div className="mt-5">
        <PrimaryBtn onClick={() => submit("made_to_order")} disabled={busy !== null}>
          {busy === "made_to_order" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</> : "Pre-order my Cram Pack →"}
        </PrimaryBtn>
      </div>

      {/* 1-on-1 secondary card (summary only) */}
      <div className="mt-4 rounded-2xl border bg-white p-4">
        <p className="text-sm text-gray-700">
          Want me as your semester coach instead? <strong>Premium 1-on-1 · $1,250</strong>
        </p>
        <Button variant="outline" className="mt-3 h-11 w-full text-base font-semibold" style={{ color: NAVY, borderColor: NAVY }}
          disabled={busy !== null} onClick={() => submit("one_on_one")}>
          {busy === "one_on_one" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</> : "Tell me about your semester →"}
        </Button>
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
function Confirmation({ draft, result, pricing }: { draft: Draft; result: SubmitOrderResult; pricing: ReturnType<typeof computeOrderPricing> }) {
  const isOneOnOne = result.tier === "one_on_one";
  return (
    <div className="min-h-screen" style={{ background: "#FAFAF7", fontFamily: "Inter, -apple-system, sans-serif" }}>
      <Header />
      <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8">
        <div className="rounded-3xl bg-white p-6 shadow-[0_10px_40px_-15px_rgba(20,33,61,0.15)] sm:p-9">
          <div className="mx-auto grid h-14 w-14 place-content-center rounded-full bg-emerald-50"><Check className="h-8 w-8 text-emerald-600" /></div>
          <h1 className="mt-5 text-center text-2xl font-bold sm:text-3xl" style={{ color: NAVY }}>
            {isOneOnOne ? "Request received" : "Pre-order received"} — order #{result.shortRef}
          </h1>

          {!isOneOnOne && <div className="mt-6"><Receipt draft={draft} pricing={pricing} /></div>}

          <div className="mt-6">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">What happens next</p>
            <ol className="mt-3 space-y-3 text-sm text-gray-800">
              {isOneOnOne ? (
                <li className="flex gap-3"><Num n={1} /> I&apos;ll reach out personally to hear about your semester and set up your sessions.</li>
              ) : (
                <>
                  <li className="flex gap-3"><Num n={1} /> I&apos;ll text you within 24 hours to confirm chapter details + grab your syllabus.</li>
                  <li className="flex gap-3"><Num n={2} /> I build your Cram Pack and you can watch progress on your order page.</li>
                  <li className="flex gap-3"><Num n={3} /> Pack delivered before your exam. Pay only if it helped.</li>
                </>
              )}
            </ol>
          </div>

          {!isOneOnOne && (
            <a href={`/order/${result.shortRef}`} className="mt-6 block">
              <Button className="h-12 w-full text-base font-bold text-white" style={{ background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)` }}>
                Track your order →
              </Button>
            </a>
          )}

          <p className="mt-6 text-center text-sm text-gray-600">
            Questions? Text me at{" "}
            <a href={`sms:${WORK_PHONE_HREF}`} className="font-semibold hover:underline" style={{ color: RED }}>{WORK_PHONE_DISPLAY}</a>
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
const FAQS: { q: string; a: string }[] = [
  { q: "What's in a Cram Pack?", a: "Practice exam questions + short video walk-throughs of the tough ones — made for your textbook and your professor's exam style." },
  { q: "When do I pay?", a: "On delivery — not before. If it didn't help on your test, reply within 72 hours of your exam for a full refund." },
  { q: "How fast?", a: "Usually 2 days per chapter. Rush available if your exam is sooner. Estimated delivery date shows up before you order." },
];
function OrderFaq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="mx-auto mt-8 max-w-2xl">
      <h2 className="mb-3 text-center text-sm font-bold uppercase tracking-wide text-gray-500">Questions</h2>
      <div className="space-y-2">
        {FAQS.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={f.q} className="overflow-hidden rounded-2xl border bg-white">
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
