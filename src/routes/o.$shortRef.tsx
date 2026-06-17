// /o/{short_ref} — Onboarding wizard for students who texted Lee.
// Required: 1) contact, 2) campus/course, 3) stress, 4) pricing.
// Optional: 5) Greek, 6) future interests, 7) syllabus → final "all set" screen.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Search, Upload } from "lucide-react";
import { Toaster, toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  getOnboarding,
  saveOnboardingContact,
  saveOnboardingCampusCourse,
  saveOnboardingStress,
  saveOnboardingPricing,
  saveOnboardingGreek,
  saveOnboardingFutureInterests,
  uploadOnboardingSyllabus,
  completeOnboardingSyllabusStep,
  finishOnboarding,
  searchCampuses,
  type CampusLite,
  type OnboardingSnapshot,
} from "@/lib/onboarding.functions";

const NAVY = "#14213D";
const RED = "#CE1126";

const onboardingQuery = (shortRef: string) =>
  queryOptions({
    queryKey: ["onboarding", shortRef],
    queryFn: () => getOnboarding({ data: { shortRef: Number(shortRef) } }),
  });

export const Route = createFileRoute("/o/$shortRef")({
  head: () => ({
    meta: [
      { title: "Continue your tutoring request — Survive Accounting" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(onboardingQuery(params.shortRef)),
  component: OnboardingPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-lg font-semibold" style={{ color: NAVY }}>
          We couldn&apos;t find that link.
        </h1>
        <p className="mt-2 text-sm text-gray-600">{error.message}</p>
        <Button className="mt-4" onClick={() => { router.invalidate(); reset(); }}>
          Try again
        </Button>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="mx-auto max-w-md p-6 text-center">
      <h1 className="text-lg font-semibold" style={{ color: NAVY }}>Link not found.</h1>
    </div>
  ),
});

type StepKey =
  | "contact" | "campus" | "stress" | "pricing"
  | "greek" | "future" | "syllabus" | "done";

const STRESS_OPTIONS = [
  "Upcoming exam", "Falling behind", "Homework", "Understanding concepts",
  "Test anxiety", "Busy schedule", "Need accountability", "Study strategies",
  "Just trying to pass", "Something else",
];

const FUTURE_OPTIONS = [
  "Practice exams with video solutions",
  "Homework help",
  "Group reviews",
  "Free tips and updates",
];

const RAIL_STEPS: { key: StepKey; label: string; required: boolean }[] = [
  { key: "contact", label: "Contact info", required: true },
  { key: "campus", label: "School & course", required: true },
  { key: "stress", label: "What's stressing you", required: true },
  { key: "pricing", label: "Pricing", required: true },
  { key: "greek", label: "Greek org", required: false },
  { key: "future", label: "Future interests", required: false },
  { key: "syllabus", label: "Syllabus", required: false },
];

function initialStepFor(d: OnboardingSnapshot): StepKey {
  if (d.onboardingFinishedAt) return "done";
  if (!d.contactInfoCompletedAt || !d.email) return "contact";
  if ((!d.campus && !d.campusId) || !d.course) return "campus";
  if (!d.stressFactors.length) return "stress";
  if (!d.pricingReaction) return "pricing";
  if (!d.greekCompletedAt) return "greek";
  if (!d.futureInterestsCompletedAt) return "future";
  if (!d.syllabusStepCompletedAt) return "syllabus";
  return "done";
}

function OnboardingPage() {
  const { shortRef } = Route.useParams();
  const { data, refetch } = useSuspenseQuery(onboardingQuery(shortRef));

  const computed = useMemo(() => initialStepFor(data), [data]);
  const [step, setStep] = useState<StepKey>(computed);
  useEffect(() => { setStep(computed); }, [computed]);

  const stepIdx = Math.max(0, RAIL_STEPS.findIndex((s) => s.key === step));
  const progress = step === "done"
    ? 100
    : Math.round((stepIdx / RAIL_STEPS.length) * 100);

  const goNext = async (next: StepKey) => {
    await refetch();
    setStep(next);
  };

  return (
    <div className="min-h-screen" style={{ background: "#F5F7FA", fontFamily: "Inter, sans-serif" }}>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        {step !== "done" && (
          <div className="mb-4 sm:hidden">
            <ProgressBar progress={progress} step={step} />
          </div>
        )}

        <div className={cn("grid gap-6", step !== "done" && "sm:grid-cols-[220px_1fr]")}>
          {step !== "done" && (
            <aside className="hidden sm:block">
              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <ol className="space-y-3">
                  {RAIL_STEPS.map((s, i) => {
                    const isActive = s.key === step;
                    const isDone = i < stepIdx;
                    return (
                      <li key={s.key} className="flex items-start gap-3">
                        <span
                          className={cn(
                            "mt-0.5 grid h-6 w-6 place-content-center rounded-full text-xs font-semibold",
                            isDone ? "bg-emerald-500 text-white"
                              : isActive ? "text-white" : "bg-gray-200 text-gray-600",
                          )}
                          style={isActive && !isDone ? { background: NAVY } : undefined}
                        >
                          {isDone ? "✓" : i + 1}
                        </span>
                        <span
                          className={cn(
                            "text-sm",
                            isActive ? "font-semibold" : "text-gray-600",
                            !s.required && "italic",
                          )}
                          style={isActive ? { color: NAVY } : undefined}
                        >
                          {s.label}
                          {!s.required && <span className="ml-1 text-xs text-gray-400">(optional)</span>}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </aside>
          )}

          <main className={cn("rounded-2xl bg-white shadow-xl",
            step === "done" ? "p-6 sm:p-10" : "p-6 sm:p-8")}>
            {step === "contact" && (
              <ContactStep
                shortRef={shortRef}
                initialName={[data.firstName, data.lastName].filter(Boolean).join(" ")}
                initialEmail={data.email ?? ""}
                onDone={() => goNext("campus")}
              />
            )}
            {step === "campus" && (
              <CampusStep
                shortRef={shortRef}
                initialCampusId={data.campusId}
                initialSchool={data.campus}
                initialCourse={data.course}
                onDone={() => goNext("stress")}
              />
            )}
            {step === "stress" && (
              <StressStep
                shortRef={shortRef}
                initial={data.stressFactors}
                onDone={() => goNext("pricing")}
              />
            )}
            {step === "pricing" && (
              <PricingStep
                shortRef={shortRef}
                onDone={() => goNext("greek")}
              />
            )}
            {step === "greek" && (
              <GreekStep
                shortRef={shortRef}
                initial={{
                  isGreek: data.isGreekMember,
                  greekOrg: data.greekOrgName ?? "",
                }}
                onDone={() => goNext("future")}
              />
            )}
            {step === "future" && (
              <FutureStep
                shortRef={shortRef}
                initial={data.futureInterests}
                onDone={() => goNext("syllabus")}
              />
            )}
            {step === "syllabus" && (
              <SyllabusStep
                shortRef={shortRef}
                alreadyUploaded={!!data.syllabusUploadedAt}
                onDone={() => goNext("done")}
              />
            )}
            {step === "done" && (
              <DoneScreen
                shortRef={shortRef}
                data={data}
                onRefresh={refetch}
              />
            )}
          </main>
        </div>
      </div>
      <Toaster position="top-center" richColors />
    </div>
  );
}

function ProgressBar({ progress, step }: { progress: number; step: StepKey }) {
  const i = RAIL_STEPS.findIndex((s) => s.key === step);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs text-gray-600">
        <span>Step {Math.max(1, i + 1)} of {RAIL_STEPS.length}</span>
        <span>{progress}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div className="h-full transition-all" style={{ width: `${progress}%`, background: NAVY }} />
      </div>
    </div>
  );
}

function StepShell({
  title, subtitle, children,
}: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-xl font-bold sm:text-2xl" style={{ color: NAVY }}>{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-gray-600">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}

function PrimaryButton({
  children, disabled, onClick, type = "button",
}: { children: React.ReactNode; disabled?: boolean; onClick?: () => void; type?: "button" | "submit" }) {
  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="h-12 w-full text-base font-bold text-white"
      style={{ background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)` }}
    >
      {children}
    </Button>
  );
}

function SkipLink({ onClick, children = "Skip" }: { onClick: () => void; children?: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="text-sm text-gray-500 underline hover:text-gray-700">
      {children}
    </button>
  );
}

// ---------- Step 1 ----------
const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Valid email is required").max(255),
});

function ContactStep({
  shortRef, initialName, initialEmail, onDone,
}: { shortRef: string; initialName: string; initialEmail: string; onDone: () => void }) {
  const saveFn = useServerFn(saveOnboardingContact);
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: (input: { name: string; email: string }) =>
      saveFn({ data: { shortRef: Number(shortRef), ...input } }),
    onSuccess: () => onDone(),
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const submit = () => {
    const parsed = contactSchema.safeParse({ name, email });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const k = i.path[0] as string;
        if (k && !errs[k]) errs[k] = i.message;
      }
      setErrors(errs);
      return;
    }
    setErrors({});
    mutation.mutate(parsed.data);
  };

  return (
    <StepShell
      title="Continue your tutoring request"
      subtitle="Quick info so Lee knows who he's texting with."
    >
      <div className="space-y-4">
        <div>
          <Label className="mb-1.5 block text-sm font-medium text-gray-800">
            Name <span className="text-red-600">*</span>
          </Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
        </div>
        <div>
          <Label className="mb-1.5 block text-sm font-medium text-gray-800">
            Email <span className="text-red-600">*</span>
          </Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
        </div>
        <PrimaryButton disabled={mutation.isPending} onClick={submit}>
          {mutation.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>) : "Continue"}
        </PrimaryButton>
      </div>
    </StepShell>
  );
}

// ---------- Step 2 ----------
function CampusStep({
  shortRef, initialCampusId, initialSchool, initialCourse, onDone,
}: {
  shortRef: string;
  initialCampusId: string | null;
  initialSchool: string | null;
  initialCourse: string | null;
  onDone: () => void;
}) {
  const saveFn = useServerFn(saveOnboardingCampusCourse);
  const searchFn = useServerFn(searchCampuses);

  const [campusId, setCampusId] = useState<string | null>(initialCampusId);
  const [schoolName, setSchoolName] = useState<string>(initialSchool ?? "");
  const [course, setCourse] = useState<string>(initialCourse ?? "");
  const [other, setOther] = useState<boolean>(!initialCampusId && !initialSchool);
  const [notSureCourse, setNotSureCourse] = useState<boolean>(initialCourse === "Not sure");
  const [query, setQuery] = useState<string>("");
  const [results, setResults] = useState<CampusLite[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (other || campusId) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await searchFn({ data: { q: query } });
        if (!cancelled) setResults(r);
      } catch { /* ignore */ }
      finally { if (!cancelled) setSearching(false); }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, other, campusId, searchFn]);

  const mutation = useMutation({
    mutationFn: () => saveFn({
      data: {
        shortRef: Number(shortRef),
        campusId: other ? null : campusId,
        schoolName: other ? (schoolName.trim() || null) : null,
        courseCodeOrName: notSureCourse ? "Not sure" : (course.trim() || null),
      },
    }),
    onSuccess: () => onDone(),
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const canContinue =
    (other ? schoolName.trim().length > 0 : !!campusId || !!initialSchool) &&
    (notSureCourse || course.trim().length > 0);

  return (
    <StepShell title="Which school and course do you need help with?">
      <div className="space-y-5">
        <div>
          <Label className="mb-1.5 block text-sm font-medium text-gray-800">School</Label>
          {campusId && !other ? (
            <div className="flex items-center justify-between rounded-md border bg-gray-50 p-3">
              <span className="text-sm font-medium">{schoolName || "Selected school"}</span>
              <Button variant="ghost" size="sm"
                onClick={() => { setCampusId(null); setSchoolName(""); setQuery(""); }}>
                Change
              </Button>
            </div>
          ) : other ? (
            <div className="space-y-2">
              <Input
                placeholder="Type your school name"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
              />
              <button type="button" className="text-xs text-gray-600 underline"
                onClick={() => { setOther(false); setSchoolName(""); }}>
                Search for my school instead
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  className="pl-9"
                  placeholder="Search schools…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="mt-2 max-h-56 overflow-auto rounded-md border">
                {searching && <div className="p-3 text-xs text-gray-500">Searching…</div>}
                {!searching && results.length === 0 && (
                  <div className="p-3 text-xs text-gray-500">No matches.</div>
                )}
                {results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                    onClick={() => { setCampusId(r.id); setSchoolName(r.name); }}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
              <button type="button" className="mt-2 text-xs text-gray-600 underline"
                onClick={() => setOther(true)}>
                Other / Not sure
              </button>
            </>
          )}
        </div>

        <div>
          <Label className="mb-1.5 block text-sm font-medium text-gray-800">Course</Label>
          <Input
            placeholder="e.g. Accy 201, Intermediate I"
            value={course}
            onChange={(e) => { setCourse(e.target.value); if (e.target.value) setNotSureCourse(false); }}
            disabled={notSureCourse}
          />
          <label className="mt-2 flex items-center gap-2 text-xs text-gray-700">
            <Checkbox checked={notSureCourse}
              onCheckedChange={(v) => { setNotSureCourse(!!v); if (v) setCourse(""); }} />
            Not sure
          </label>
        </div>

        <PrimaryButton disabled={!canContinue || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>) : "Continue"}
        </PrimaryButton>
      </div>
    </StepShell>
  );
}

// ---------- Step 3 ----------
function StressStep({
  shortRef, initial, onDone,
}: { shortRef: string; initial: string[]; onDone: () => void }) {
  const saveFn = useServerFn(saveOnboardingStress);
  const [selected, setSelected] = useState<string[]>(initial);

  const toggle = (opt: string) =>
    setSelected((prev) => prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]);

  const mutation = useMutation({
    mutationFn: () => saveFn({ data: { shortRef: Number(shortRef), stressFactors: selected } }),
    onSuccess: () => onDone(),
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  return (
    <StepShell
      title="What's stressing you out most right now?"
      subtitle="Select all that apply."
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {STRESS_OPTIONS.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={cn(
                "rounded-xl border px-4 py-3 text-left text-sm transition",
                active ? "border-transparent text-white"
                  : "border-gray-200 bg-white hover:border-gray-300",
              )}
              style={active ? { background: NAVY } : undefined}
            >
              {opt}
            </button>
          );
        })}
      </div>
      <div className="mt-6">
        <PrimaryButton
          disabled={selected.length === 0 || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>) : "Continue"}
        </PrimaryButton>
      </div>
    </StepShell>
  );
}

// ---------- Step 4 ----------
function PricingStep({
  shortRef, onDone,
}: { shortRef: string; onDone: () => void }) {
  const saveFn = useServerFn(saveOnboardingPricing);
  const mutation = useMutation({
    mutationFn: (pricingReaction: "sounds_good" | "more_than_expected") =>
      saveFn({ data: { shortRef: Number(shortRef), pricingReaction } }),
    onSuccess: () => onDone(),
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  return (
    <StepShell title="How does this sound?">
      <ul className="space-y-3 rounded-xl border bg-gray-50 p-5 text-sm text-gray-800">
        <li>• Free 30-minute intro session</li>
        <li>• Intro Accounting tutoring: <strong>$100/hour</strong></li>
        <li>• Intermediate Accounting tutoring: <strong>$120/hour</strong></li>
        <li>• Zoom sessions with recording available</li>
      </ul>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Button
          onClick={() => mutation.mutate("sounds_good")}
          disabled={mutation.isPending}
          className="h-14 text-base font-bold text-white"
          style={{ background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)` }}
        >
          Sounds good
        </Button>
        <Button
          onClick={() => mutation.mutate("more_than_expected")}
          disabled={mutation.isPending}
          variant="outline"
          className="h-14 text-base font-semibold"
          style={{ color: NAVY, borderColor: NAVY }}
        >
          More than I expected
        </Button>
      </div>
    </StepShell>
  );
}

// ---------- Step 5: Greek ----------
function GreekStep({
  shortRef, initial, onDone,
}: {
  shortRef: string;
  initial: { isGreek: boolean | null; greekOrg: string };
  onDone: () => void;
}) {
  const saveFn = useServerFn(saveOnboardingGreek);
  type Mode = "choose" | "not" | null;
  const [mode, setMode] = useState<Mode>(
    initial.isGreek === true ? "choose" : initial.isGreek === false ? "not" : null,
  );
  const [org, setOrg] = useState(initial.greekOrg);

  const save = useMutation({
    mutationFn: (input: { skipped: boolean }) => saveFn({
      data: {
        shortRef: Number(shortRef),
        isGreekMember: input.skipped ? null : mode === "choose",
        greekOrgName: input.skipped ? null : (mode === "choose" ? (org.trim() || null) : null),
        skipped: input.skipped,
      },
    }),
    onSuccess: () => onDone(),
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  return (
    <StepShell
      title="Are you in a Greek organization?"
      subtitle="Many chapters help members pay for tutoring."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode("choose")}
          className={cn(
            "rounded-xl border px-4 py-4 text-left text-sm transition",
            mode === "choose" ? "border-transparent text-white" : "border-gray-200 hover:border-gray-300",
          )}
          style={mode === "choose" ? { background: NAVY } : undefined}
        >
          <div className="font-semibold">Choose my organization</div>
          <div className={cn("text-xs", mode === "choose" ? "text-white/80" : "text-gray-500")}>
            Tell us your chapter
          </div>
        </button>
        <button
          type="button"
          onClick={() => { setMode("not"); setOrg(""); }}
          className={cn(
            "rounded-xl border px-4 py-4 text-left text-sm transition",
            mode === "not" ? "border-transparent text-white" : "border-gray-200 hover:border-gray-300",
          )}
          style={mode === "not" ? { background: NAVY } : undefined}
        >
          <div className="font-semibold">Not Greek</div>
        </button>
      </div>

      {mode === "choose" && (
        <div className="mt-4">
          <Label className="mb-1.5 block text-sm font-medium text-gray-800">Organization</Label>
          <Input
            placeholder="e.g. Sigma Chi, Phi Mu"
            value={org}
            onChange={(e) => setOrg(e.target.value)}
          />
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <SkipLink onClick={() => save.mutate({ skipped: true })} />
        <Button
          onClick={() => save.mutate({ skipped: false })}
          disabled={!mode || save.isPending || (mode === "choose" && org.trim().length === 0)}
          className="h-11 px-6 text-sm font-bold text-white"
          style={{ background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)` }}
        >
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
        </Button>
      </div>
    </StepShell>
  );
}

// ---------- Step 6: Future interests ----------
function FutureStep({
  shortRef, initial, onDone,
}: { shortRef: string; initial: string[]; onDone: () => void }) {
  const saveFn = useServerFn(saveOnboardingFutureInterests);
  const [selected, setSelected] = useState<string[]>(initial);

  const toggle = (opt: string) =>
    setSelected((prev) => prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]);

  const save = useMutation({
    mutationFn: (input: { skipped: boolean }) => saveFn({
      data: {
        shortRef: Number(shortRef),
        futureInterests: input.skipped ? [] : selected,
        skipped: input.skipped,
      },
    }),
    onSuccess: () => onDone(),
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  return (
    <StepShell
      title="Want updates on lower-cost options?"
      subtitle="I'm building these and can notify you when they're available."
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {FUTURE_OPTIONS.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={cn(
                "rounded-xl border px-4 py-3 text-left text-sm transition",
                active ? "border-transparent text-white" : "border-gray-200 hover:border-gray-300",
              )}
              style={active ? { background: NAVY } : undefined}
            >
              {opt}
            </button>
          );
        })}
      </div>
      <div className="mt-6 flex items-center justify-between gap-3">
        <SkipLink onClick={() => save.mutate({ skipped: true })} />
        <Button
          onClick={() => save.mutate({ skipped: false })}
          disabled={selected.length === 0 || save.isPending}
          className="h-11 px-6 text-sm font-bold text-white"
          style={{ background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)` }}
        >
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save preferences"}
        </Button>
      </div>
    </StepShell>
  );
}

// ---------- Step 7: Syllabus ----------
function SyllabusStep({
  shortRef, alreadyUploaded, onDone,
}: { shortRef: string; alreadyUploaded: boolean; onDone: () => void }) {
  const uploadFn = useServerFn(uploadOnboardingSyllabus);
  const completeFn = useServerFn(completeOnboardingSyllabusStep);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(alreadyUploaded);

  const onFile = async (file: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Max 10MB."); return; }
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const base64 = btoa(binary);
      await uploadFn({
        data: {
          shortRef: Number(shortRef),
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          base64,
        },
      });
      setUploaded(true);
      toast.success("Syllabus uploaded.");
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const skip = useMutation({
    mutationFn: () => completeFn({ data: { shortRef: Number(shortRef) } }),
    onSuccess: () => onDone(),
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  return (
    <StepShell
      title="Upload your syllabus"
      subtitle="This helps me understand your class and prepare before we meet."
    >
      <label className={cn(
        "flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-sm",
        uploaded ? "border-emerald-300 bg-emerald-50 text-emerald-800"
          : "border-gray-300 text-gray-600 hover:bg-gray-50",
      )}>
        {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> :
          uploaded ? <CheckCircle2 className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
        {uploading ? "Uploading…" : uploaded ? "Syllabus uploaded" : "Upload syllabus (PDF or image)"}
        <input
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          disabled={uploading}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
        />
      </label>

      <div className="mt-6 flex items-center justify-between gap-3">
        <SkipLink onClick={() => skip.mutate()}>Skip</SkipLink>
        <Button
          variant="outline"
          onClick={() => skip.mutate()}
          disabled={skip.isPending}
          className="h-11 px-6 text-sm font-semibold"
          style={{ color: NAVY, borderColor: NAVY }}
        >
          {skip.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "I'll do this later"}
        </Button>
      </div>
    </StepShell>
  );
}

// ---------- Done screen ----------
function DoneScreen({
  shortRef, data, onRefresh,
}: {
  shortRef: string;
  data: OnboardingSnapshot;
  onRefresh: () => void;
}) {
  const finishFn = useServerFn(finishOnboarding);
  useEffect(() => {
    if (data.onboardingFinishedAt) return;
    finishFn({ data: { shortRef: Number(shortRef) } })
      .then(() => onRefresh())
      .catch(() => { /* non-blocking */ });
  }, [data.onboardingFinishedAt, finishFn, onRefresh, shortRef]);

  const pricingLabel =
    data.pricingReaction === "sounds_good" ? "Sounds good" :
    data.pricingReaction === "more_than_expected" ? "More than expected" :
    data.pricingReaction ?? "—";

  const syllabusStatus = data.syllabusUploadedAt
    ? "Uploaded"
    : data.syllabusStepCompletedAt ? "Will share later" : "—";

  const smsHref = data.leePhone
    ? `sms:${data.leePhone}?&body=${encodeURIComponent("Hi Lee, I completed the tutoring form.")}`
    : undefined;

  return (
    <div className="text-center">
      <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
      <h1 className="mt-4 text-2xl font-bold sm:text-3xl" style={{ color: NAVY }}>
        You&apos;re all set.
      </h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
        I&apos;ll review your information and follow up with how I can help.
      </p>

      <dl className="mx-auto mt-8 max-w-md divide-y rounded-xl border bg-gray-50 text-left text-sm">
        <SummaryRow label="School" value={data.campus ?? "—"} />
        <SummaryRow label="Course" value={data.course ?? "—"} />
        <SummaryRow label="Pricing reaction" value={pricingLabel} />
        <SummaryRow
          label="What's stressing you"
          value={data.stressFactors.length ? data.stressFactors.join(", ") : "—"}
        />
        {data.greekOrgName && <SummaryRow label="Greek organization" value={data.greekOrgName} />}
        {data.futureInterests.length > 0 && (
          <SummaryRow label="Future interests" value={data.futureInterests.join(", ")} />
        )}
        <SummaryRow label="Syllabus" value={syllabusStatus} />
      </dl>

      <div className="mt-8">
        {smsHref ? (
          <a
            href={smsHref}
            className="inline-flex h-12 w-full max-w-md items-center justify-center rounded-md text-base font-bold text-white shadow"
            style={{ background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)` }}
          >
            Text Lee
          </a>
        ) : (
          <p className="text-xs text-gray-500">Lee will reach out to you shortly.</p>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 px-4 py-3">
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900">{value}</dd>
    </div>
  );
}
