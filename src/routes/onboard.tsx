// /onboard — Premium multi-step lead qualification flow.
// Apple/TurboTax-inspired. Answers held in local state for now; Supabase wiring later.
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Upload,
  GraduationCap,
  Flame,
  Tag,
  Users,
  Sparkles,
  FileText,
  PartyPopper,
  X,
  Search,
  ChevronDown,
  HelpCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/onboard")({
  head: () => ({
    meta: [
      { title: "Get Started — Survive Accounting" },
      { name: "description", content: "Tell us about your course in 60 seconds. Premium 1-on-1 accounting tutoring with Lee." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OnboardPage,
});

type StressItem = "Upcoming exam" | "Falling behind" | "Don't understand concepts" | "Homework piling up" | "Bad grade on last test" | "Just starting the course";
type Pricing = "Single session" | "5-pack" | "Exam cram" | "Not sure yet";
type Future = "CPA exam" | "Internship prep" | "Grad school" | "Just passing this class";

type Answers = {
  campusId: string;
  campusName: string;
  courseCode: string;
  professor: string;
  stress: StressItem[];
  pricing: Pricing | "";
  greek: string;
  future: Future[];
  syllabusName: string;
  name: string;
  phone: string;
};

const STEPS = [
  { key: "campus", label: "Campus & Course", optional: false, icon: GraduationCap },
  { key: "stress", label: "What's Stressing You?", optional: false, icon: Flame },
  { key: "pricing", label: "Pricing", optional: false, icon: Tag },
  { key: "greek", label: "Greek Organization", optional: true, icon: Users },
  { key: "future", label: "Future Options", optional: true, icon: Sparkles },
  { key: "syllabus", label: "Syllabus", optional: true, icon: FileText },
  { key: "done", label: "Done", optional: false, icon: PartyPopper },
] as const;

function OnboardPage() {
  const [stepIdx, setStepIdx] = useState(0);
  const [direction, setDirection] = useState(1);
  const [answers, setAnswers] = useState<Answers>({
    campusId: "",
    campusName: "",
    courseCode: "",
    professor: "",
    stress: [],
    pricing: "",
    greek: "",
    future: [],
    syllabusName: "",
    name: "",
    phone: "",
  });

  const step = STEPS[stepIdx];
  const progress = ((stepIdx) / (STEPS.length - 1)) * 100;

  const canAdvance = useMemo(() => {
    switch (step.key) {
      case "campus":
        return answers.campusId.length > 0;
      case "stress":
        return answers.stress.length > 0;
      case "pricing":
        return answers.pricing !== "";
      default:
        return true;
    }
  }, [step.key, answers]);

  const next = useCallback(() => {
    if (stepIdx < STEPS.length - 1) {
      setDirection(1);
      setStepIdx((i) => i + 1);
    }
  }, [stepIdx]);

  const back = useCallback(() => {
    if (stepIdx > 0) {
      setDirection(-1);
      setStepIdx((i) => i - 1);
    }
  }, [stepIdx]);

  const skip = next;

  const update = <K extends keyof Answers>(key: K, value: Answers[K]) =>
    setAnswers((a) => ({ ...a, [key]: value }));

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[color:var(--brand-navy)]">
      {/* Mobile progress */}
      <div className="lg:hidden sticky top-0 z-20 border-b border-black/5 bg-[#FAFAF7]/90 backdrop-blur">
        <div className="px-5 py-4">
          <div className="flex items-center justify-between text-xs font-medium text-[color:var(--brand-navy)]/70">
            <span>Step {stepIdx + 1} of {STEPS.length}</span>
            <span className="truncate ml-2">{step.label}</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/5">
            <motion.div
              className="h-full rounded-full bg-[color:var(--brand-red)]"
              animate={{ width: `${progress}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
            />
          </div>
        </div>
      </div>

      <div className="mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 lg:grid-cols-[300px_1fr]">
        {/* Desktop progress sidebar */}
        <aside className="hidden lg:flex flex-col border-r border-black/5 px-8 py-12">
          <div className="mb-10">
            <div className="font-display text-2xl leading-tight text-[color:var(--brand-navy)]">
              Survive<span className="text-[color:var(--brand-red)]">.</span>
            </div>
            <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[color:var(--brand-navy)]/60">
              Accounting
            </div>
          </div>

          <ol className="space-y-1">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = i < stepIdx;
              const active = i === stepIdx;
              return (
                <li key={s.key}>
                  <div
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
                      active && "bg-[color:var(--brand-navy)]/5",
                    )}
                  >
                    <div
                      className={cn(
                        "grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[11px] font-semibold transition-all",
                        done && "border-[color:var(--brand-red)] bg-[color:var(--brand-red)] text-white",
                        active && !done && "border-[color:var(--brand-navy)] bg-[color:var(--brand-navy)] text-white",
                        !active && !done && "border-black/15 bg-white text-[color:var(--brand-navy)]/40",
                      )}
                    >
                      {done ? <Check className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          "truncate text-sm",
                          active ? "font-semibold text-[color:var(--brand-navy)]" : "text-[color:var(--brand-navy)]/70",
                          done && "text-[color:var(--brand-navy)]/50",
                        )}
                      >
                        {s.label}
                        {s.optional && <span className="ml-1 text-[color:var(--brand-navy)]/40">*</span>}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          <p className="mt-6 text-xs text-[color:var(--brand-navy)]/50">* Optional</p>

          <div className="mt-auto pt-10">
            <div className="h-1 w-full overflow-hidden rounded-full bg-black/5">
              <motion.div
                className="h-full rounded-full bg-[color:var(--brand-red)]"
                animate={{ width: `${progress}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 20 }}
              />
            </div>
            <p className="mt-3 text-xs text-[color:var(--brand-navy)]/50">
              {Math.round(progress)}% complete
            </p>
          </div>
        </aside>

        {/* Right content */}
        <main className="relative flex flex-col">
          <div className="flex-1 px-5 py-10 sm:px-10 sm:py-14 lg:px-16 lg:py-20">
            <div className="mx-auto w-full max-w-2xl">
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={step.key}
                  custom={direction}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
                  <StepContent
                    step={step.key}
                    answers={answers}
                    update={update}
                    onContinue={next}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Footer nav */}
          {step.key !== "done" && (
            <div className="sticky bottom-0 border-t border-black/5 bg-[#FAFAF7]/95 backdrop-blur px-5 py-4 sm:px-10 lg:px-16">
              <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={back}
                  disabled={stepIdx === 0}
                  className="h-12 rounded-full px-5 text-[color:var(--brand-navy)]/70 hover:bg-black/5 disabled:opacity-0"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>

                <div className="flex items-center gap-3">
                  {step.optional && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={skip}
                      className="h-12 rounded-full px-5 text-[color:var(--brand-navy)]/60 hover:bg-black/5"
                    >
                      Skip
                    </Button>
                  )}
                  <Button
                    type="button"
                    onClick={next}
                    disabled={!canAdvance}
                    className="h-12 rounded-full bg-[color:var(--brand-navy)] px-7 text-base font-semibold text-white shadow-lg shadow-[color:var(--brand-navy)]/20 hover:bg-[color:var(--brand-navy)]/90 disabled:opacity-40"
                  >
                    Continue <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function StepContent({
  step,
  answers,
  update,
  onContinue,
}: {
  step: typeof STEPS[number]["key"];
  answers: Answers;
  update: <K extends keyof Answers>(key: K, value: Answers[K]) => void;
  onContinue: () => void;
}) {
  if (step === "campus") {
    return (
      <StepShell
        eyebrow="Step 1"
        title="Let's get you started."
        subtitle="This should only take about 2 minutes."
      >
        <div className="space-y-8">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--brand-navy)] sm:text-xl">
              Which school and course do you need help with?
            </h2>
          </div>
          <CampusCoursePicker
            campusId={answers.campusId}
            campusName={answers.campusName}
            courseCode={answers.courseCode}
            onCampusChange={(id, name) => {
              update("campusId", id);
              update("campusName", name);
              update("courseCode", "");
            }}
            onCourseChange={(code) => update("courseCode", code)}
          />
        </div>
      </StepShell>
    );
  }


  if (step === "stress") {
    const items: StressItem[] = [
      "Upcoming exam",
      "Falling behind",
      "Don't understand concepts",
      "Homework piling up",
      "Bad grade on last test",
      "Just starting the course",
    ];
    const toggle = (v: StressItem) => {
      const has = answers.stress.includes(v);
      update("stress", has ? answers.stress.filter((x) => x !== v) : [...answers.stress, v]);
    };
    return (
      <StepShell
        eyebrow="Step 2"
        title="What's stressing you out?"
        subtitle="Pick anything that applies. The more honest, the better Lee can help."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((item) => {
            const active = answers.stress.includes(item);
            return (
              <button
                key={item}
                type="button"
                onClick={() => toggle(item)}
                className={cn(
                  "group flex items-center justify-between rounded-2xl border bg-white px-5 py-4 text-left text-base font-medium transition-all",
                  active
                    ? "border-[color:var(--brand-navy)] shadow-md shadow-[color:var(--brand-navy)]/10 ring-2 ring-[color:var(--brand-navy)]/10"
                    : "border-black/10 hover:border-[color:var(--brand-navy)]/40 hover:shadow-sm",
                )}
              >
                <span>{item}</span>
                <span
                  className={cn(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors",
                    active
                      ? "border-[color:var(--brand-navy)] bg-[color:var(--brand-navy)] text-white"
                      : "border-black/15 bg-white",
                  )}
                >
                  {active && <Check className="h-4 w-4" />}
                </span>
              </button>
            );
          })}
        </div>
      </StepShell>
    );
  }

  if (step === "pricing") {
    const options: { value: Pricing; price: string; desc: string }[] = [
      { value: "Single session", price: "$75/hr", desc: "Try one session, no commitment." },
      { value: "5-pack", price: "$340", desc: "Save $35. Most popular for steady support." },
      { value: "Exam cram", price: "$200", desc: "3-hour focused prep before your test." },
      { value: "Not sure yet", price: "—", desc: "Lee will recommend based on your needs." },
    ];
    return (
      <StepShell
        eyebrow="Step 3"
        title="Pick a starting point"
        subtitle="No payment now — you'll only pay after Lee confirms he's a good fit."
      >
        <div className="space-y-3">
          {options.map((opt) => {
            const active = answers.pricing === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => update("pricing", opt.value)}
                className={cn(
                  "flex w-full items-center justify-between gap-4 rounded-2xl border bg-white p-5 text-left transition-all",
                  active
                    ? "border-[color:var(--brand-navy)] shadow-md shadow-[color:var(--brand-navy)]/10 ring-2 ring-[color:var(--brand-navy)]/10"
                    : "border-black/10 hover:border-[color:var(--brand-navy)]/40 hover:shadow-sm",
                )}
              >
                <div className="min-w-0">
                  <div className="text-base font-semibold">{opt.value}</div>
                  <div className="mt-0.5 text-sm text-[color:var(--brand-navy)]/60">{opt.desc}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-display text-xl text-[color:var(--brand-navy)]">{opt.price}</div>
                </div>
              </button>
            );
          })}
        </div>
      </StepShell>
    );
  }

  if (step === "greek") {
    return (
      <StepShell
        eyebrow="Step 4 · Optional"
        title="In a Greek organization?"
        subtitle="Some chapters have study partners or shared notes Lee can plug into."
      >
        <Field label="Chapter or organization">
          <Input
            value={answers.greek}
            onChange={(e) => update("greek", e.target.value)}
            placeholder="Kappa Alpha, Chi Omega, etc."
            className="h-14 rounded-2xl border-black/10 bg-white px-5 text-base shadow-sm focus-visible:ring-[color:var(--brand-navy)]"
            autoFocus
          />
        </Field>
      </StepShell>
    );
  }

  if (step === "future") {
    const items: Future[] = ["CPA exam", "Internship prep", "Grad school", "Just passing this class"];
    const toggle = (v: Future) => {
      const has = answers.future.includes(v);
      update("future", has ? answers.future.filter((x) => x !== v) : [...answers.future, v]);
    };
    return (
      <StepShell
        eyebrow="Step 5 · Optional"
        title="Thinking long-term?"
        subtitle="Lee can weave career-relevant context into the tutoring sessions."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((item) => {
            const active = answers.future.includes(item);
            return (
              <button
                key={item}
                type="button"
                onClick={() => toggle(item)}
                className={cn(
                  "flex items-center justify-between rounded-2xl border bg-white px-5 py-4 text-left text-base font-medium transition-all",
                  active
                    ? "border-[color:var(--brand-navy)] shadow-md shadow-[color:var(--brand-navy)]/10 ring-2 ring-[color:var(--brand-navy)]/10"
                    : "border-black/10 hover:border-[color:var(--brand-navy)]/40 hover:shadow-sm",
                )}
              >
                <span>{item}</span>
                <span
                  className={cn(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-full border",
                    active ? "border-[color:var(--brand-navy)] bg-[color:var(--brand-navy)] text-white" : "border-black/15",
                  )}
                >
                  {active && <Check className="h-4 w-4" />}
                </span>
              </button>
            );
          })}
        </div>
      </StepShell>
    );
  }

  if (step === "syllabus") {
    return (
      <StepShell
        eyebrow="Step 6 · Optional"
        title="Drop in your syllabus"
        subtitle="It's the single biggest thing that lets Lee prep before your first session."
      >
        <label
          htmlFor="syllabus"
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed bg-white px-6 py-12 text-center transition-colors",
            answers.syllabusName ? "border-[color:var(--brand-navy)]/60" : "border-black/15 hover:border-[color:var(--brand-navy)]/40",
          )}
        >
          {answers.syllabusName ? (
            <>
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[color:var(--brand-navy)]/5">
                <FileText className="h-7 w-7 text-[color:var(--brand-navy)]" />
              </div>
              <div className="mt-4 max-w-full truncate text-base font-semibold">{answers.syllabusName}</div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  update("syllabusName", "");
                }}
                className="mt-3 inline-flex items-center gap-1 text-sm text-[color:var(--brand-navy)]/60 hover:text-[color:var(--brand-red)]"
              >
                <X className="h-3.5 w-3.5" /> Remove
              </button>
            </>
          ) : (
            <>
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[color:var(--brand-navy)]/5">
                <Upload className="h-7 w-7 text-[color:var(--brand-navy)]" />
              </div>
              <div className="mt-4 text-base font-semibold">Upload your syllabus</div>
              <div className="mt-1 text-sm text-[color:var(--brand-navy)]/60">PDF, DOCX, or photo — up to 10MB</div>
            </>
          )}
          <input
            id="syllabus"
            type="file"
            accept=".pdf,.doc,.docx,image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) update("syllabusName", f.name);
            }}
          />
        </label>
      </StepShell>
    );
  }

  // done
  return (
    <div className="text-center">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 18 }}
        className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[color:var(--brand-red)] text-white shadow-xl shadow-[color:var(--brand-red)]/30"
      >
        <Check className="h-10 w-10" strokeWidth={3} />
      </motion.div>
      <h1 className="font-display mt-8 text-4xl leading-tight sm:text-5xl">You're in.</h1>
      <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-[color:var(--brand-navy)]/70">
        Lee personally reviews every request and will text you within one business day.
      </p>

      <div className="mx-auto mt-10 max-w-md space-y-4 text-left">
        <Field label="Your name">
          <Input
            value={answers.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Jordan Smith"
            className="h-14 rounded-2xl border-black/10 bg-white px-5 text-base shadow-sm focus-visible:ring-[color:var(--brand-navy)]"
          />
        </Field>
        <Field label="Phone (for text)">
          <Input
            value={answers.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="(555) 123-4567"
            inputMode="tel"
            className="h-14 rounded-2xl border-black/10 bg-white px-5 text-base shadow-sm focus-visible:ring-[color:var(--brand-navy)]"
          />
        </Field>
        <Button
          type="button"
          onClick={() => {
            // TODO: wire to Supabase
            console.log("onboard answers", answers);
          }}
          disabled={!answers.name.trim() || !answers.phone.trim()}
          className="h-14 w-full rounded-2xl bg-[color:var(--brand-navy)] text-base font-semibold text-white shadow-lg shadow-[color:var(--brand-navy)]/20 hover:bg-[color:var(--brand-navy)]/90 disabled:opacity-40"
        >
          Send my request
        </Button>
        <p className="text-center text-xs text-[color:var(--brand-navy)]/50">
          By submitting you agree to receive a text reply from Lee.
        </p>
      </div>
    </div>
  );
}

function StepShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--brand-red)]">
        {eyebrow}
      </div>
      <h1 className="font-display mt-3 text-3xl leading-[1.05] sm:text-4xl lg:text-5xl">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-4 max-w-xl text-base leading-relaxed text-[color:var(--brand-navy)]/70 sm:text-lg">
          {subtitle}
        </p>
      )}
      <div className="mt-10">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-[color:var(--brand-navy)]/80">{label}</Label>
      {children}
    </div>
  );
}
