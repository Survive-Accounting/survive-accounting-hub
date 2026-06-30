// /order — made-to-order exam prep wizard. The student specifies their exact
// campus → course → professor → textbook → chapters → exam date, then picks how
// they want it (free teaser / made-to-order / 1-on-1). Submit saves SERVER-SIDE
// (service-role) via submitOrder. Pay-on-delivery; no payment is collected here.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Toaster, toast } from "sonner";
import { Check, Loader2, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { searchCampuses, type CampusLite } from "@/lib/onboarding.functions";
import {
  getOrderCampusContext,
  searchOrderProfessors,
  listSupportedTextbooks,
  submitOrder,
  computeOrderPricing,
  type FamilyKey,
  type OrderCampusContext,
  type ProfessorLite,
  type SupportedTextbook,
  type ExamTimeframe,
  type SubmitOrderResult,
} from "@/lib/orders.functions";

const NAVY = "#14213D";
const RED = "#CE1126";
const LOGO_URL = "https://lwfiles.mycourse.app/672bc379cd024d536f651ecc-public/1554d231f0e2bf121ac35937c4d438ca.png";
const WORK_PHONE_DISPLAY = "(662) 565-8818";
const WORK_PHONE_HREF = "+16625658818";

export const Route = createFileRoute("/order")({
  head: () => ({
    meta: [
      { title: "Order exam prep — Survive Accounting" },
      { name: "description", content: "Custom exam prep built for your exact course, professor, and chapters." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrderWizard,
});

const FAMILY_LABELS: Record<FamilyKey, string> = {
  intro_1: "Intro to Financial Accounting",
  intro_2: "Intro to Managerial Accounting",
  intermediate_1: "Intermediate Accounting I",
  intermediate_2: "Intermediate Accounting II",
};
const FAMILY_ORDER: FamilyKey[] = ["intro_1", "intro_2", "intermediate_1", "intermediate_2"];

// Standard curriculum topics per family — a sensible, EDITABLE default for
// campuses/books we don't have a chapter list for. Never presented as the
// student's actual book; the UI says "adjust to match your book."
const DEFAULT_CHAPTERS: Record<FamilyKey, string[]> = {
  intro_1: [
    "Intro to Financial Statements", "Recording Transactions (Journal Entries)",
    "Adjusting Entries", "Completing the Accounting Cycle", "Merchandising Operations",
    "Inventory", "Cash & Receivables", "Long-Lived Assets", "Liabilities",
    "Stockholders' Equity", "Statement of Cash Flows", "Financial Statement Analysis",
  ],
  intro_2: [
    "Intro to Managerial Accounting", "Job Order Costing", "Process Costing",
    "Activity-Based Costing", "Cost-Volume-Profit Analysis", "Variable Costing",
    "Master Budgets", "Flexible Budgets & Standard Costs", "Performance Evaluation",
    "Relevant Costs for Decisions", "Capital Budgeting",
  ],
  intermediate_1: [
    "Conceptual Framework", "Income Statement & Comprehensive Income",
    "Balance Sheet & Disclosures", "Time Value of Money", "Cash & Receivables",
    "Inventory: Cost & Valuation", "PP&E: Acquisition & Disposition",
    "Depreciation & Impairment", "Intangible Assets", "Current Liabilities & Contingencies",
  ],
  intermediate_2: [
    "Bonds & Long-Term Liabilities", "Leases", "Income Taxes",
    "Pensions & Postretirement Benefits", "Stockholders' Equity",
    "Dilutive Securities & EPS", "Investments", "Revenue Recognition",
    "Accounting Changes & Error Analysis", "Statement of Cash Flows",
  ],
};

type SelectedChapter = { label: string; struggle: string };

type Draft = {
  campusId: string | null;
  campusName: string;
  campusOther: boolean;

  courseFamily: FamilyKey | null;
  courseCode: string;
  courseName: string;
  courseOther: boolean;

  professorName: string;
  professorLeadId: string | null;

  textbookName: string;
  textbookFamilyId: string | null;
  textbookNotes: string;

  chapters: SelectedChapter[];

  examMode: "date" | "bucket" | null;
  examDate: string;
  examTimeframe: ExamTimeframe | null;

  tier: "free_teaser" | "made_to_order" | "one_on_one" | null;
  rush: boolean;

  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

const EMPTY_DRAFT: Draft = {
  campusId: null, campusName: "", campusOther: false,
  courseFamily: null, courseCode: "", courseName: "", courseOther: false,
  professorName: "", professorLeadId: null,
  textbookName: "", textbookFamilyId: null, textbookNotes: "",
  chapters: [],
  examMode: null, examDate: "", examTimeframe: null,
  tier: null, rush: false,
  firstName: "", lastName: "", email: "", phone: "",
};

const STEPS = ["School", "Course", "Professor", "Textbook", "Chapters", "Exam", "Choose", "Your info"] as const;
const fmtMoney = (cents: number) => `$${Math.round(cents / 100)}`;
const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const parseChapterNumber = (label: string): number | null => {
  const m = label.match(/\d+/);
  return m ? Number(m[0]) : null;
};

function OrderWizard() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [result, setResult] = useState<SubmitOrderResult | null>(null);
  const update = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((p) => ({ ...p, [k]: v }));

  // Campus context (codes/titles/textbooks) for the selected campus.
  const ctxFn = useServerFn(getOrderCampusContext);
  const [ctx, setCtx] = useState<OrderCampusContext | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!draft.campusId) { setCtx(null); return; }
    ctxFn({ data: { campusId: draft.campusId } })
      .then((c) => { if (!cancelled) setCtx(c); })
      .catch(() => { if (!cancelled) setCtx(null); });
    return () => { cancelled = true; };
  }, [draft.campusId, ctxFn]);

  const pricing = useMemo(
    () => computeOrderPricing({
      chapterCount: draft.chapters.length,
      examDate: draft.examMode === "date" && draft.examDate ? draft.examDate : null,
      timeframe: draft.examMode === "bucket" ? draft.examTimeframe : null,
      rush: draft.rush,
    }),
    [draft.chapters.length, draft.examMode, draft.examDate, draft.examTimeframe, draft.rush],
  );

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  if (result) {
    return <SuccessScreen draft={draft} result={result} />;
  }

  return (
    <div className="min-h-screen" style={{ background: "#FAFAF7", fontFamily: "Inter, -apple-system, sans-serif" }}>
      <Toaster richColors position="top-center" />
      <Header />
      <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6 sm:pt-10">
        <Progress step={step} />
        <div className="mt-6 rounded-3xl bg-white p-5 shadow-[0_10px_40px_-15px_rgba(20,33,61,0.15)] sm:p-8">
          {step === 0 && <CampusStep draft={draft} update={update} onNext={next} />}
          {step === 1 && <CourseStep draft={draft} update={update} ctx={ctx} onNext={next} onBack={back} />}
          {step === 2 && <ProfessorStep draft={draft} update={update} onNext={next} onBack={back} />}
          {step === 3 && <TextbookStep draft={draft} update={update} ctx={ctx} onNext={next} onBack={back} />}
          {step === 4 && <ChaptersStep draft={draft} update={update} onNext={next} onBack={back} />}
          {step === 5 && <ExamStep draft={draft} update={update} onNext={next} onBack={back} />}
          {step === 6 && (
            <StackStep
              draft={draft} update={update} pricing={pricing}
              onPick={(tier) => { update("tier", tier); next(); }}
              onBack={back}
            />
          )}
          {step === 7 && (
            <InfoStep
              draft={draft} update={update} pricing={pricing}
              onBack={back} onSubmitted={setResult}
            />
          )}
        </div>
        <p className="mt-5 text-center text-xs text-gray-500">
          Questions? Text me anytime at{" "}
          <a href={`sms:${WORK_PHONE_HREF}`} className="font-semibold hover:underline" style={{ color: RED }}>
            {WORK_PHONE_DISPLAY}
          </a>
        </p>
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

// ---------- Step 1: Campus ----------
function CampusStep({ draft, update, onNext }: { draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void; onNext: () => void }) {
  const searchFn = useServerFn(searchCampuses);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CampusLite[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (draft.campusOther || draft.campusId) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await searchFn({ data: { q: query } });
        if (!cancelled) setResults(r);
      } catch { /* ignore */ } finally { if (!cancelled) setSearching(false); }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, draft.campusOther, draft.campusId, searchFn]);

  const picked = !!draft.campusId || (draft.campusOther && draft.campusName.trim().length > 0);

  return (
    <div>
      <Title subtitle="We'll pull your course details from your school when we have them.">What school are you at?</Title>

      {draft.campusId && !draft.campusOther ? (
        <div className="flex items-center justify-between rounded-xl border bg-gray-50 px-4 py-3">
          <span className="text-sm font-medium">{draft.campusName}</span>
          <Button variant="ghost" size="sm" onClick={() => { update("campusId", null); update("campusName", ""); setQuery(""); }}>Change</Button>
        </div>
      ) : draft.campusOther ? (
        <div className="space-y-2">
          <Input placeholder="Type your school name" value={draft.campusName} autoFocus
            onChange={(e) => update("campusName", e.target.value)} />
          <button type="button" className="text-xs text-gray-600 underline"
            onClick={() => { update("campusOther", false); update("campusName", ""); }}>
            Search for my school instead
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input className="pl-9" placeholder="Search schools…" value={query} autoFocus
              onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="mt-2 max-h-56 overflow-auto rounded-xl border bg-white">
            {searching && <div className="p-3 text-xs text-gray-500">Searching…</div>}
            {!searching && results.length === 0 && <div className="p-3 text-xs text-gray-500">No matches yet — keep typing.</div>}
            {results.map((r) => (
              <button key={r.id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                onClick={() => { update("campusId", r.id); update("campusName", r.name); update("campusOther", false); }}>
                {r.name}
              </button>
            ))}
          </div>
          <button type="button" className="mt-2 text-xs text-gray-600 underline"
            onClick={() => { update("campusOther", true); update("campusId", null); }}>
            My school isn&apos;t listed
          </button>
        </>
      )}

      <div className="mt-6">
        <PrimaryBtn onClick={onNext} disabled={!picked}>Continue</PrimaryBtn>
      </div>
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

  const pickFamily = (f: FamilyKey) => {
    update("courseFamily", f);
    update("courseCode", ctx?.codes[f] ?? "");
    update("courseName", ctx?.titles[f] ?? FAMILY_LABELS[f]);
    update("courseOther", false);
  };

  const canContinue = otherMode
    ? draft.courseName.trim().length > 0 || draft.courseCode.trim().length > 0
    : !!draft.courseFamily;

  return (
    <div>
      <Title subtitle="Which accounting course is this for?">Your course</Title>

      {!otherMode ? (
        <>
          <div className="space-y-2">
            {FAMILY_ORDER.map((f) => {
              const code = ctx?.codes[f] ?? null;
              const title = ctx?.titles[f] ?? FAMILY_LABELS[f];
              const active = draft.courseFamily === f;
              return (
                <button key={f} type="button" onClick={() => pickFamily(f)}
                  className={cn("flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition",
                    active ? "border-transparent text-white" : "bg-white hover:border-gray-300")}
                  style={active ? { background: NAVY } : undefined}>
                  <span>
                    {code && <span className="font-semibold">{code} · </span>}
                    <span className={active ? "" : "text-gray-800"}>{title}</span>
                  </span>
                  {active && <Check className="h-4 w-4" />}
                </button>
              );
            })}
          </div>
          <button type="button" className="mt-3 text-xs text-gray-600 underline" onClick={() => update("courseOther", true)}>
            My course isn&apos;t listed
          </button>
        </>
      ) : (
        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block text-sm">Course code <span className="text-gray-400">(optional)</span></Label>
            <Input placeholder="e.g. ACCT 2101" value={draft.courseCode} onChange={(e) => update("courseCode", e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block text-sm">Course name</Label>
            <Input placeholder="e.g. Principles of Financial Accounting" value={draft.courseName} onChange={(e) => update("courseName", e.target.value)} />
          </div>
          {!forceOther && (
            <button type="button" className="text-xs text-gray-600 underline" onClick={() => update("courseOther", false)}>
              Pick from the list instead
            </button>
          )}
        </div>
      )}

      <div className="mt-6">
        <PrimaryBtn onClick={onNext} disabled={!canContinue}>Continue</PrimaryBtn>
        <BackLink onBack={onBack} />
      </div>
    </div>
  );
}

// ---------- Step 3: Professor ----------
function ProfessorStep({ draft, update, onNext, onBack }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void; onNext: () => void; onBack: () => void;
}) {
  const searchFn = useServerFn(searchOrderProfessors);
  const [results, setResults] = useState<ProfessorLite[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!draft.campusId) return;
    if (draft.professorLeadId) return; // already picked
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await searchFn({ data: { campusId: draft.campusId!, q: draft.professorName } });
        if (!cancelled) setResults(r);
      } catch { /* ignore */ }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [draft.professorName, draft.campusId, draft.professorLeadId, searchFn]);

  return (
    <div>
      <Title subtitle="Knowing your professor helps me match their exam style. Don't know it? Skip — totally fine.">
        Who&apos;s your professor?
      </Title>

      <Input
        placeholder="Type your professor's name"
        value={draft.professorName}
        onChange={(e) => { update("professorName", e.target.value); update("professorLeadId", null); setOpen(true); }}
        onFocus={() => setOpen(true)}
        autoFocus
      />
      {open && draft.campusId && !draft.professorLeadId && results.length > 0 && (
        <div className="mt-2 max-h-48 overflow-auto rounded-xl border bg-white">
          {results.map((p) => (
            <button key={p.id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
              onClick={() => { update("professorName", p.name); update("professorLeadId", p.id); setOpen(false); }}>
              {p.name}{p.title ? <span className="ml-1.5 text-xs text-gray-500">{p.title}</span> : null}
            </button>
          ))}
        </div>
      )}
      {draft.professorLeadId && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-700">
          <Check className="h-3.5 w-3.5" /> Matched to your school&apos;s directory
        </p>
      )}

      <div className="mt-6">
        <PrimaryBtn onClick={onNext}>Continue</PrimaryBtn>
        <div className="mt-3 flex items-center justify-between">
          <button type="button" onClick={onBack} className="text-sm text-gray-500 underline hover:text-gray-700">Back</button>
          <button type="button" onClick={() => { update("professorName", ""); update("professorLeadId", null); onNext(); }}
            className="text-sm text-gray-500 underline hover:text-gray-700">Skip — I&apos;m not sure</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Step 4: Textbook ----------
function TextbookStep({ draft, update, ctx, onNext, onBack }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void; ctx: OrderCampusContext | null; onNext: () => void; onBack: () => void;
}) {
  const listFn = useServerFn(listSupportedTextbooks);
  const [supported, setSupported] = useState<SupportedTextbook[]>([]);
  const [mode, setMode] = useState<"confirm" | "pick" | "other">("pick");

  const known = draft.courseFamily && ctx ? ctx.textbooks[draft.courseFamily] : null;
  const knownLabel = known?.title
    ? `${known.title}${known.authors ? ` — ${known.authors}` : ""}${known.publisher ? ` (${known.publisher})` : ""}`
    : null;

  // Initialize the step's mode once we know whether a textbook is known.
  useEffect(() => {
    if (knownLabel && !draft.textbookName) setMode("confirm");
  }, [knownLabel, draft.textbookName]);

  useEffect(() => {
    let cancelled = false;
    listFn().then((r) => { if (!cancelled) setSupported(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, [listFn]);

  const familyOptions = useMemo(
    () => supported.filter((s) => !draft.courseFamily || s.courseFamily === draft.courseFamily),
    [supported, draft.courseFamily],
  );

  const confirmKnown = () => {
    if (knownLabel) { update("textbookName", knownLabel); update("textbookFamilyId", null); }
    onNext();
  };

  return (
    <div>
      <Title subtitle="The right book lets me match your exact chapters and notation.">Your textbook</Title>

      {mode === "confirm" && knownLabel ? (
        <div className="space-y-4">
          <div className="rounded-2xl border bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Your course usually uses</p>
            <p className="mt-1 text-sm font-medium" style={{ color: NAVY }}>{knownLabel}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <PrimaryBtn onClick={confirmKnown}>That&apos;s my book →</PrimaryBtn>
            <Button variant="outline" className="h-12 text-base font-semibold" style={{ color: NAVY, borderColor: NAVY }}
              onClick={() => setMode("pick")}>
              Mine&apos;s different
            </Button>
          </div>
        </div>
      ) : mode === "other" ? (
        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block text-sm">Textbook name</Label>
            <Input placeholder="Title + author if you have it" value={draft.textbookName}
              onChange={(e) => { update("textbookName", e.target.value); update("textbookFamilyId", null); }} autoFocus />
          </div>
          <div>
            <Label className="mb-1.5 block text-sm">Anything else about it? <span className="text-gray-400">(optional)</span></Label>
            <Input placeholder="Edition, or 'professor's own notes'…" value={draft.textbookNotes}
              onChange={(e) => update("textbookNotes", e.target.value)} />
          </div>
          <button type="button" className="text-xs text-gray-600 underline" onClick={() => setMode("pick")}>
            Pick from the list instead
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {knownLabel && (
            <button type="button" className="mb-1 text-xs text-gray-600 underline" onClick={() => setMode("confirm")}>
              ← Back to your course&apos;s usual book
            </button>
          )}
          {familyOptions.map((t) => {
            const active = draft.textbookFamilyId === t.id;
            return (
              <button key={t.id} type="button"
                onClick={() => { update("textbookFamilyId", t.id); update("textbookName", t.label); }}
                className={cn("flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition",
                  active ? "border-transparent text-white" : "bg-white hover:border-gray-300")}
                style={active ? { background: NAVY } : undefined}>
                <span>{t.label}</span>
                {active && <Check className="h-4 w-4 shrink-0" />}
              </button>
            );
          })}
          {familyOptions.length === 0 && <p className="text-sm text-gray-500">No matches — use the option below.</p>}
          <button type="button" className="mt-1 text-xs text-gray-600 underline"
            onClick={() => { setMode("other"); update("textbookFamilyId", null); update("textbookName", ""); }}>
            My book isn&apos;t listed
          </button>
        </div>
      )}

      {mode !== "confirm" && (
        <div className="mt-6">
          <PrimaryBtn onClick={onNext}>Continue</PrimaryBtn>
          <div className="mt-3 flex items-center justify-between">
            <button type="button" onClick={onBack} className="text-sm text-gray-500 underline hover:text-gray-700">Back</button>
            <button type="button" onClick={() => { update("textbookName", ""); update("textbookFamilyId", null); onNext(); }}
              className="text-sm text-gray-500 underline hover:text-gray-700">Skip for now</button>
          </div>
        </div>
      )}
      {mode === "confirm" && <BackLink onBack={onBack} />}
    </div>
  );
}

// ---------- Step 5: Chapters + struggles ----------
function ChaptersStep({ draft, update, onNext, onBack }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void; onNext: () => void; onBack: () => void;
}) {
  const candidates = draft.courseFamily ? DEFAULT_CHAPTERS[draft.courseFamily] : DEFAULT_CHAPTERS.intro_1;
  const [custom, setCustom] = useState("");

  const isSelected = (label: string) => draft.chapters.some((c) => c.label === label);
  const toggle = (label: string) => {
    if (isSelected(label)) update("chapters", draft.chapters.filter((c) => c.label !== label));
    else update("chapters", [...draft.chapters, { label, struggle: "" }]);
  };
  const setStruggle = (label: string, struggle: string) =>
    update("chapters", draft.chapters.map((c) => (c.label === label ? { ...c, struggle } : c)));
  const editLabel = (oldLabel: string, newLabel: string) =>
    update("chapters", draft.chapters.map((c) => (c.label === oldLabel ? { ...c, label: newLabel } : c)));
  const addCustom = () => {
    const label = custom.trim();
    if (!label || isSelected(label)) { setCustom(""); return; }
    update("chapters", [...draft.chapters, { label, struggle: "" }]);
    setCustom("");
  };

  return (
    <div>
      <Title subtitle="Pick the chapters your exam covers. These are the standard topics — adjust any label to match your book.">
        Which chapters?
      </Title>

      <div className="space-y-1.5">
        {candidates.map((label) => (
          <button key={label} type="button" onClick={() => toggle(label)}
            className={cn("flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition",
              isSelected(label) ? "border-emerald-300 bg-emerald-50" : "bg-white hover:border-gray-300")}>
            <span className={cn("grid h-4 w-4 shrink-0 place-content-center rounded border", isSelected(label) ? "border-emerald-500 bg-emerald-500 text-white" : "border-gray-300")}>
              {isSelected(label) && <Check className="h-3 w-3" />}
            </span>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <Input placeholder="Add another chapter…" value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} />
        <Button variant="outline" onClick={addCustom} disabled={!custom.trim()}>Add</Button>
      </div>

      {draft.chapters.length > 0 && (
        <div className="mt-5 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Your {draft.chapters.length} chapter{draft.chapters.length === 1 ? "" : "s"} — adjust labels &amp; tell me what&apos;s tough
          </p>
          {draft.chapters.map((c) => (
            <div key={c.label} className="rounded-xl border bg-gray-50 p-3">
              <div className="flex items-center gap-2">
                <Input value={c.label} onChange={(e) => editLabel(c.label, e.target.value)} className="h-8 bg-white text-sm" />
                <button type="button" onClick={() => toggle(c.label)} className="text-gray-400 hover:text-red-600" title="Remove">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <Input className="mt-2 h-8 bg-white text-sm" placeholder="What's tripping you up here? (optional)"
                value={c.struggle} onChange={(e) => setStruggle(c.label, e.target.value)} />
            </div>
          ))}
        </div>
      )}

      <div className="mt-6">
        <PrimaryBtn onClick={onNext} disabled={draft.chapters.length === 0}>Continue</PrimaryBtn>
        <BackLink onBack={onBack} />
      </div>
    </div>
  );
}

// ---------- Step 6: Exam date ----------
function ExamStep({ draft, update, onNext, onBack }: {
  draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void; onNext: () => void; onBack: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const buckets: { key: ExamTimeframe; label: string }[] = [
    { key: "this_week", label: "This week" },
    { key: "next_week", label: "Next week" },
    { key: "not_sure", label: "Not sure yet" },
  ];
  const canContinue =
    (draft.examMode === "date" && !!draft.examDate) ||
    (draft.examMode === "bucket" && !!draft.examTimeframe);

  return (
    <div>
      <Title subtitle="So I can make sure it's in your hands in time.">When&apos;s your exam?</Title>

      <div className="space-y-4">
        <div className="rounded-2xl border bg-white p-4">
          <Label className="mb-2 block text-sm font-medium">I know the date</Label>
          <Input type="date" min={today} value={draft.examMode === "date" ? draft.examDate : ""}
            onChange={(e) => { update("examMode", "date"); update("examDate", e.target.value); update("examTimeframe", null); }} />
        </div>
        <div className="text-center text-xs uppercase tracking-wide text-gray-400">or</div>
        <div className="grid grid-cols-3 gap-2">
          {buckets.map((b) => {
            const active = draft.examMode === "bucket" && draft.examTimeframe === b.key;
            return (
              <button key={b.key} type="button"
                onClick={() => { update("examMode", "bucket"); update("examTimeframe", b.key); update("examDate", ""); }}
                className={cn("rounded-2xl border px-3 py-4 text-sm font-medium transition",
                  active ? "border-transparent text-white" : "bg-white hover:border-gray-300")}
                style={active ? { background: NAVY } : undefined}>
                {b.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <PrimaryBtn onClick={onNext} disabled={!canContinue}>Continue</PrimaryBtn>
        <BackLink onBack={onBack} />
      </div>
    </div>
  );
}

// ---------- Step 7: Summary → the stack ----------
function StackStep({ draft, update, pricing, onPick, onBack }: {
  draft: Draft;
  update: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  pricing: ReturnType<typeof computeOrderPricing>;
  onPick: (tier: "free_teaser" | "made_to_order" | "one_on_one") => void;
  onBack: () => void;
}) {
  // If the exam timing no longer leaves rush on the table, clear any stale rush.
  useEffect(() => {
    if (!pricing.rushAvailable && draft.rush) update("rush", false);
  }, [pricing.rushAvailable, draft.rush, update]);

  const courseLabel = [draft.courseCode, draft.courseName].filter(Boolean).join(" · ") || "Your course";
  const examLabel = draft.examMode === "date" && draft.examDate
    ? fmtDate(draft.examDate)
    : draft.examTimeframe === "this_week" ? "This week"
    : draft.examTimeframe === "next_week" ? "Next week" : "Not sure yet";

  return (
    <div>
      <Title subtitle="Here's what I've got. Now pick how you want it.">Your exam prep</Title>

      {/* recap */}
      <div className="mb-5 space-y-1.5 rounded-2xl border bg-gray-50 p-4 text-sm">
        <RecapRow label="School" value={draft.campusName || "—"} />
        <RecapRow label="Course" value={courseLabel} />
        {draft.professorName && <RecapRow label="Professor" value={draft.professorName} />}
        {draft.textbookName && <RecapRow label="Textbook" value={draft.textbookName} />}
        <RecapRow label="Chapters" value={`${draft.chapters.length} selected`} />
        <RecapRow label="Exam" value={examLabel} />
      </div>

      <div className="space-y-3">
        {/* Free teaser */}
        <TierCard
          title="Free teaser" price="$0"
          desc="Get the free version of this prep when it's released. No payment, ever."
          cta="Get it free" onClick={() => onPick("free_teaser")} outline
        />

        {/* Made-to-order */}
        <div className="rounded-2xl border-2 p-5" style={{ borderColor: RED }}>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: RED }}>Recommended</span>
              <h3 className="text-lg font-bold" style={{ color: NAVY }}>Made-to-order</h3>
            </div>
            <div className="text-right">
              <div className="text-2xl font-extrabold" style={{ color: NAVY }}>{fmtMoney(pricing.totalCents)}</div>
              <div className="text-[11px] text-gray-500">pay on delivery</div>
            </div>
          </div>
          <p className="mt-2 text-sm text-gray-600">
            Custom prep for your exact {draft.chapters.length} chapter{draft.chapters.length === 1 ? "" : "s"}, built around your course &amp; professor.
          </p>

          {/* delivery check */}
          <div className="mt-3 rounded-xl bg-gray-50 p-3 text-sm">
            {pricing.makesItStandard === true && (
              <p className="flex items-center gap-2 text-emerald-700">
                <Check className="h-4 w-4" /> Ready by {fmtDate(pricing.deliveryTargetDate)} — before your exam.
              </p>
            )}
            {pricing.makesItStandard === null && (
              <p className="text-gray-600">Standard delivery: about {pricing.standardDays} days ({fmtDate(pricing.deliveryTargetDate)}).</p>
            )}
            {pricing.makesItStandard === false && (
              <div>
                <p className="flex items-center gap-2 text-amber-700">
                  ⚠️ Standard ({pricing.standardDays} days) would land after your exam.
                </p>
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm font-medium" style={{ color: NAVY }}>
                  <input type="checkbox" checked={draft.rush} onChange={(e) => update("rush", e.target.checked)} className="h-4 w-4" />
                  Add Rush (+{fmtMoney(4900)}) to guarantee it before your exam
                </label>
              </div>
            )}
          </div>

          <div className="mt-4">
            <PrimaryBtn onClick={() => onPick("made_to_order")}>
              Continue with made-to-order — {fmtMoney(pricing.totalCents)}
            </PrimaryBtn>
          </div>
        </div>

        {/* Premium 1-on-1 */}
        <TierCard
          title="Premium 1-on-1" price="$1,250"
          desc="Lee as your semester coach — live 1-on-1 sessions built around your course. Request contact; no payment now."
          cta="Request 1-on-1" onClick={() => onPick("one_on_one")} outline
        />
      </div>

      <BackLink onBack={onBack} />
    </div>
  );
}

function RecapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs uppercase tracking-wide text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-800">{value}</span>
    </div>
  );
}

function TierCard({ title, price, desc, cta, onClick, outline }: {
  title: string; price: string; desc: string; cta: string; onClick: () => void; outline?: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold" style={{ color: NAVY }}>{title}</h3>
        <span className="text-xl font-extrabold" style={{ color: NAVY }}>{price}</span>
      </div>
      <p className="mt-1.5 text-sm text-gray-600">{desc}</p>
      <Button onClick={onClick}
        className={cn("mt-4 h-11 w-full text-base font-semibold", !outline && "text-white")}
        variant={outline ? "outline" : undefined}
        style={outline ? { color: NAVY, borderColor: NAVY } : { background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)` }}>
        {cta}
      </Button>
    </div>
  );
}

// ---------- Step 8: Your info → submit ----------
function InfoStep({ draft, update, pricing, onBack, onSubmitted }: {
  draft: Draft;
  update: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  pricing: ReturnType<typeof computeOrderPricing>;
  onBack: () => void;
  onSubmitted: (r: SubmitOrderResult) => void;
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
    if (!validate() || !draft.tier) return;
    setBusy(true);
    try {
      const r = await submitFn({
        data: {
          firstName: draft.firstName.trim(),
          lastName: draft.lastName.trim(),
          email: draft.email.trim(),
          phone: draft.phone.trim(),
          campusId: draft.campusId,
          campusText: draft.campusId ? null : (draft.campusName.trim() || null),
          courseFamily: draft.courseFamily,
          courseCode: draft.courseCode.trim() || null,
          courseName: draft.courseName.trim() || null,
          professorName: draft.professorName.trim() || null,
          professorLeadId: draft.professorLeadId,
          textbookName: draft.textbookName.trim() || null,
          textbookFamilyId: draft.textbookFamilyId,
          textbookNotes: draft.textbookNotes.trim() || null,
          examDate: draft.examMode === "date" && draft.examDate ? draft.examDate : null,
          examTimeframe: draft.examMode === "bucket" ? draft.examTimeframe : null,
          tier: draft.tier,
          rush: draft.tier === "made_to_order" ? pricing.rush : false,
          chapters: draft.chapters.map((c) => ({
            chapterLabel: c.label,
            chapterNumber: parseChapterNumber(c.label),
            struggleNote: c.struggle.trim() || null,
          })),
        },
      });
      onSubmitted(r);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  const tierLabel = draft.tier === "free_teaser" ? "the free teaser"
    : draft.tier === "one_on_one" ? "Premium 1-on-1" : "your made-to-order prep";

  return (
    <div>
      <Title subtitle={`Last step — where do I send ${tierLabel}?`}>Your info</Title>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name" error={errors.firstName}>
          <Input value={draft.firstName} onChange={(e) => update("firstName", e.target.value)} autoComplete="given-name" />
        </Field>
        <Field label="Last name" error={errors.lastName}>
          <Input value={draft.lastName} onChange={(e) => update("lastName", e.target.value)} autoComplete="family-name" />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input type="email" value={draft.email} onChange={(e) => update("email", e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <Input type="tel" value={draft.phone} placeholder="(555) 555-5555" onChange={(e) => update("phone", e.target.value)} autoComplete="tel" />
        </Field>
      </div>

      {draft.tier === "made_to_order" && (
        <div className="mt-4 flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 text-sm">
          <span className="text-gray-600">Total (pay on delivery)</span>
          <span className="text-lg font-bold" style={{ color: NAVY }}>{fmtMoney(pricing.totalCents)}</span>
        </div>
      )}

      <div className="mt-6">
        <PrimaryBtn onClick={submit} disabled={busy}>
          {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</> : "Submit request"}
        </PrimaryBtn>
        <BackLink onBack={onBack} />
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

// ---------- Success ----------
function SuccessScreen({ draft, result }: { draft: Draft; result: SubmitOrderResult }) {
  const courseLabel = [draft.courseCode, draft.courseName].filter(Boolean).join(" · ") || "your course";
  return (
    <div className="min-h-screen" style={{ background: "#FAFAF7", fontFamily: "Inter, -apple-system, sans-serif" }}>
      <Header />
      <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-10">
        <div className="rounded-3xl bg-white p-6 text-center shadow-[0_10px_40px_-15px_rgba(20,33,61,0.15)] sm:p-10">
          <div className="mx-auto grid h-16 w-16 place-content-center rounded-full bg-emerald-50">
            <Check className="h-9 w-9 text-emerald-600" />
          </div>
          <h1 className="mt-5 text-2xl font-bold sm:text-3xl" style={{ color: NAVY }}>
            {draft.firstName ? `You're set, ${draft.firstName}!` : "You're set!"}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
            Reference <span className="font-mono font-semibold">{result.shortRef}</span>
          </p>

          <div className="mx-auto mt-6 max-w-sm space-y-1.5 rounded-2xl border bg-gray-50 p-4 text-left text-sm">
            <RecapRow label="Course" value={courseLabel} />
            {draft.professorName && <RecapRow label="Professor" value={draft.professorName} />}
            <RecapRow label="Chapters" value={`${result.chapterCount}`} />
            {result.tier === "made_to_order" && (
              <>
                <RecapRow label="Total" value={`${fmtMoney(result.totalCents)} — pay on delivery`} />
                {result.deliveryTargetDate && <RecapRow label="Ready by" value={fmtDate(result.deliveryTargetDate)} />}
              </>
            )}
            <RecapRow label="Option" value={
              result.tier === "free_teaser" ? "Free teaser"
              : result.tier === "one_on_one" ? "Premium 1-on-1" : "Made-to-order"
            } />
          </div>

          <div className="mx-auto mt-6 max-w-md text-left text-sm text-gray-700">
            <p className="font-semibold" style={{ color: NAVY }}>What happens next</p>
            <ul className="mt-2 space-y-1.5">
              {result.tier === "free_teaser" && <li>• I&apos;ll email you the free version the moment it&apos;s ready.</li>}
              {result.tier === "made_to_order" && (
                <>
                  <li>• I&apos;ll build your prep for these exact chapters.</li>
                  {result.deliveryTargetDate && <li>• It&apos;ll be ready by {fmtDate(result.deliveryTargetDate)}.</li>}
                  <li>• You pay on delivery — nothing now.</li>
                </>
              )}
              {result.tier === "one_on_one" && <li>• I&apos;ll reach out personally to set up your sessions.</li>}
            </ul>
          </div>

          <p className="mt-6 text-sm text-gray-600">
            Questions? Text me at{" "}
            <a href={`sms:${WORK_PHONE_HREF}`} className="font-semibold hover:underline" style={{ color: RED }}>{WORK_PHONE_DISPLAY}</a>
          </p>
        </div>
      </div>
    </div>
  );
}
