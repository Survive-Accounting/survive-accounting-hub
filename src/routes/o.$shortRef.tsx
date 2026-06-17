// /o/{short_ref} — Simplified 3-step tutoring request.
// 1) Your info  →  2) Confirm pricing  →  3) Optional extras + submit  →  success.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Check, CheckCircle2, Loader2, Search, Upload } from "lucide-react";
import { Toaster, toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  getOnboarding,
  submitOnboarding,
  searchCampuses,
  uploadOnboardingSyllabus,
  type CampusLite,
  type OnboardingSnapshot,
} from "@/lib/onboarding.functions";

const NAVY = "#14213D";
const RED = "#CE1126";

const STRESS_OPTIONS = [
  "Upcoming exam", "Falling behind", "Homework", "Understanding concepts",
  "Test anxiety", "Busy schedule", "Need accountability", "Just trying to pass",
];

const FUTURE_OPTIONS = [
  "Practice exams with video solutions",
  "Homework help",
  "Group reviews",
  "Free tips and updates",
];

const STEPS = ["Add Your Info", "Confirm Pricing", "Submit Request"] as const;

const onboardingQuery = (shortRef: string) =>
  queryOptions({
    queryKey: ["onboarding", shortRef],
    queryFn: () => getOnboarding({ data: { shortRef: Number(shortRef) } }),
  });

export const Route = createFileRoute("/o/$shortRef")({
  head: () => ({
    meta: [
      { title: "Request tutoring — Survive Accounting" },
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

type Draft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  campusId: string | null;
  schoolName: string;
  course: string;
  notSureCourse: boolean;
  pricingReaction: "sounds_good" | "more_than_expected" | null;
  stressFactors: string[];
  isGreekMember: boolean | null;
  greekOrgName: string;
  futureInterests: string[];
  accountingMajorStatus: "yes" | "no" | "definitely_not" | null;
};

function draftFromSnapshot(s: OnboardingSnapshot): Draft {
  return {
    firstName: s.firstName ?? "",
    lastName: s.lastName ?? "",
    email: s.email ?? "",
    phone: s.phone ?? "",
    campusId: s.campusId,
    schoolName: s.campus ?? "",
    course: s.course && s.course !== "Not sure" ? s.course : "",
    notSureCourse: s.course === "Not sure",
    pricingReaction: (s.pricingReaction as Draft["pricingReaction"]) ?? null,
    stressFactors: s.stressFactors,
    isGreekMember: s.isGreekMember,
    greekOrgName: s.greekOrgName ?? "",
    futureInterests: s.futureInterests,
    accountingMajorStatus: s.accountingMajorStatus,
  };
}

function OnboardingPage() {
  const { shortRef } = Route.useParams();
  const { data, refetch } = useSuspenseQuery(onboardingQuery(shortRef));

  const [step, setStep] = useState<0 | 1 | 2 | 3>(data.onboardingFinishedAt ? 3 : 0);
  const [draft, setDraft] = useState<Draft>(() => draftFromSnapshot(data));

  // Refresh draft if snapshot changes (e.g. after refetch)
  useEffect(() => { setDraft(draftFromSnapshot(data)); }, [data]);

  const update = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((p) => ({ ...p, [k]: v }));

  return (
    <div className="min-h-screen" style={{ background: "#FAFAF7", fontFamily: "Inter, -apple-system, sans-serif" }}>
      <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-14">
        {step < 3 && <Stepper current={step as 0 | 1 | 2} />}

        <div className="mt-6 rounded-3xl bg-white p-6 shadow-[0_10px_40px_-15px_rgba(20,33,61,0.15)] sm:p-10">
          {step === 0 && (
            <InfoStep
              draft={draft}
              update={update}
              onContinue={() => setStep(1)}
            />
          )}
          {step === 1 && (
            <PricingStep
              draft={draft}
              update={update}
              onContinue={() => setStep(2)}
              onBack={() => setStep(0)}
            />
          )}
          {step === 2 && (
            <ExtrasStep
              shortRef={shortRef}
              draft={draft}
              update={update}
              onBack={() => setStep(1)}
              onSubmitted={async () => { await refetch(); setStep(3); }}
            />
          )}
          {step === 3 && <SuccessScreen />}
        </div>
      </div>
      <Toaster position="top-center" richColors />
    </div>
  );
}

// ---------- Stepper ----------
function Stepper({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-4">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-2 sm:gap-3">
            <span
              className={cn(
                "grid h-7 w-7 shrink-0 place-content-center rounded-full text-xs font-bold",
                done ? "bg-emerald-500 text-white"
                  : active ? "text-white shadow-sm"
                  : "bg-gray-200 text-gray-500",
              )}
              style={active && !done ? { background: NAVY } : undefined}
            >
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span
              className={cn(
                "hidden truncate text-sm sm:inline",
                active ? "font-semibold" : "text-gray-500",
              )}
              style={active ? { color: NAVY } : undefined}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <span className={cn("ml-1 h-px flex-1", done ? "bg-emerald-400" : "bg-gray-200")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Title({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold leading-tight sm:text-3xl" style={{ color: NAVY }}>
        {children}
      </h1>
      {subtitle && <p className="mt-2 text-sm text-gray-600 sm:text-base">{subtitle}</p>}
    </div>
  );
}

function PrimaryBtn({
  children, onClick, disabled, full = true,
}: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; full?: boolean }) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      className={cn("h-12 text-base font-bold text-white", full && "w-full")}
      style={{ background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)` }}
    >
      {children}
    </Button>
  );
}

// ---------- Step 1: Info ----------
const infoSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().max(80).optional(),
  email: z.string().trim().email("Valid email is required").max(255),
  phone: z.string().trim().min(7, "Phone number is required").max(30),
});

function InfoStep({
  draft, update, onContinue,
}: { draft: Draft; update: <K extends keyof Draft>(k: K, v: Draft[K]) => void; onContinue: () => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [schoolNeeded, setSchoolNeeded] = useState(true);

  const handleContinue = () => {
    const parsed = infoSchema.safeParse({
      firstName: draft.firstName,
      lastName: draft.lastName,
      email: draft.email,
      phone: draft.phone,
    });
    const errs: Record<string, string> = {};
    if (!parsed.success) {
      for (const i of parsed.error.issues) {
        const k = i.path[0] as string;
        if (k && !errs[k]) errs[k] = i.message;
      }
    }
    if (!draft.schoolName.trim() && !draft.campusId) {
      errs.school = "Please select or enter your school";
    }
    if (!draft.notSureCourse && !draft.course.trim()) {
      errs.course = "Please add a course or mark Not sure";
    }
    setErrors(errs);
    if (Object.keys(errs).length === 0) onContinue();
  };

  return (
    <div className="space-y-7">
      <Title subtitle="This should only take about 2 minutes.">Let&apos;s get you tutored.</Title>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" required error={errors.firstName}>
          <Input value={draft.firstName} onChange={(e) => update("firstName", e.target.value)}
            autoComplete="given-name" />
        </Field>
        <Field label="Last name" error={errors.lastName}>
          <Input value={draft.lastName} onChange={(e) => update("lastName", e.target.value)}
            autoComplete="family-name" />
        </Field>
        <Field label="Email" required error={errors.email}>
          <Input type="email" value={draft.email}
            onChange={(e) => update("email", e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Phone" required error={errors.phone}>
          <Input type="tel" value={draft.phone}
            onChange={(e) => update("phone", e.target.value)} autoComplete="tel" />
        </Field>
      </div>

      <SchoolPicker
        campusId={draft.campusId}
        schoolName={draft.schoolName}
        onPick={(id, name) => { update("campusId", id); update("schoolName", name); setSchoolNeeded(false); }}
        onTypeOther={(name) => { update("campusId", null); update("schoolName", name); }}
        error={errors.school}
        initialOpen={schoolNeeded}
      />

      <Field label="Course" error={errors.course}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="e.g. Accy 201, Intermediate I"
            value={draft.course}
            disabled={draft.notSureCourse}
            onChange={(e) => { update("course", e.target.value); if (e.target.value) update("notSureCourse", false); }}
          />
          <Button
            type="button"
            variant={draft.notSureCourse ? "default" : "outline"}
            onClick={() => {
              const next = !draft.notSureCourse;
              update("notSureCourse", next);
              if (next) update("course", "");
            }}
            className="h-10 shrink-0"
            style={draft.notSureCourse ? { background: NAVY, color: "white" } : undefined}
          >
            Not sure
          </Button>
        </div>
      </Field>

      <div>
        <Label className="mb-1.5 block text-sm font-medium text-gray-800">
          Are you an accounting major?
        </Label>
        <p className="mb-3 text-xs text-gray-500">Totally optional — just helps us tailor things.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            { value: "yes" as const, label: "Yes" },
            { value: "no" as const, label: "No" },
            { value: "definitely_not" as const, label: "Definitely not 😄" },
          ].map((opt) => {
            const active = draft.accountingMajorStatus === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  update("accountingMajorStatus", active ? null : opt.value)
                }
                className="rounded-2xl border px-4 py-4 text-base font-medium transition-all"
                style={
                  active
                    ? { background: NAVY, color: "white", borderColor: NAVY }
                    : { background: "white", color: "#1f2937", borderColor: "#e5e7eb" }
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <PrimaryBtn onClick={handleContinue}>Continue</PrimaryBtn>
    </div>
  );
}

function Field({
  label, required, error, children,
}: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block text-sm font-medium text-gray-800">
        {label}{required && <span className="ml-0.5 text-red-600">*</span>}
      </Label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function SchoolPicker({
  campusId, schoolName, onPick, onTypeOther, error, initialOpen,
}: {
  campusId: string | null;
  schoolName: string;
  onPick: (id: string, name: string) => void;
  onTypeOther: (name: string) => void;
  error?: string;
  initialOpen: boolean;
}) {
  const searchFn = useServerFn(searchCampuses);
  const [other, setOther] = useState<boolean>(!campusId && !!schoolName);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CampusLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(initialOpen && !campusId);

  useEffect(() => {
    if (!open || other) return;
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
  }, [query, open, other, searchFn]);

  return (
    <div>
      <Label className="mb-1.5 block text-sm font-medium text-gray-800">
        School<span className="ml-0.5 text-red-600">*</span>
      </Label>

      {campusId && !other ? (
        <div className="flex items-center justify-between rounded-xl border bg-gray-50 px-4 py-3">
          <span className="text-sm font-medium">{schoolName}</span>
          <Button variant="ghost" size="sm" onClick={() => { setOpen(true); onPick("", ""); }}>
            Change
          </Button>
        </div>
      ) : other ? (
        <div className="space-y-2">
          <Input
            placeholder="Type your school name"
            value={schoolName}
            onChange={(e) => onTypeOther(e.target.value)}
          />
          <button type="button" className="text-xs text-gray-600 underline"
            onClick={() => { setOther(false); onTypeOther(""); setOpen(true); }}>
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
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
            />
          </div>
          {open && (
            <div className="mt-2 max-h-56 overflow-auto rounded-xl border">
              {searching && <div className="p-3 text-xs text-gray-500">Searching…</div>}
              {!searching && results.length === 0 && (
                <div className="p-3 text-xs text-gray-500">No matches.</div>
              )}
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                  onClick={() => { onPick(r.id, r.name); setOpen(false); }}
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
          <button type="button" className="mt-2 text-xs text-gray-600 underline"
            onClick={() => { setOther(true); setOpen(false); }}>
            My school isn&apos;t listed
          </button>
        </>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ---------- Step 2: Pricing ----------
function PricingStep({
  draft, update, onContinue, onBack,
}: {
  draft: Draft;
  update: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const choose = (v: "sounds_good" | "more_than_expected") => {
    update("pricingReaction", v);
    setTimeout(onContinue, 50);
  };

  return (
    <div className="space-y-7">
      <Title>How does this sound?</Title>

      <ul className="space-y-3 rounded-2xl border bg-gray-50 p-6 text-[15px] text-gray-800">
        <li className="flex gap-3"><Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> Free 30-minute introductory session</li>
        <li className="flex gap-3"><Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> Intro Accounting tutoring: <strong>$120/hour</strong></li>
        <li className="flex gap-3"><Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> Intermediate Accounting tutoring: <strong>$150/hour</strong></li>
        <li className="flex gap-3"><Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> Sessions meet virtually</li>
      </ul>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          onClick={() => choose("sounds_good")}
          className="h-14 text-base font-bold text-white"
          style={{ background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)` }}
        >
          Sounds good
        </Button>
        <Button
          onClick={() => choose("more_than_expected")}
          variant="outline"
          className="h-14 text-base font-semibold"
          style={{ color: NAVY, borderColor: NAVY }}
        >
          More than I expected
        </Button>
      </div>

      <div className="text-center">
        <button type="button" onClick={onBack}
          className="text-sm text-gray-500 underline hover:text-gray-700">
          Back
        </button>
      </div>

      {draft.pricingReaction && (
        <p className="text-center text-xs text-gray-500">
          Saved: {draft.pricingReaction === "sounds_good" ? "Sounds good" : "More than expected"}
        </p>
      )}
    </div>
  );
}

// ---------- Step 3: Extras + Submit ----------
function ExtrasStep({
  shortRef, draft, update, onBack, onSubmitted,
}: {
  shortRef: string;
  draft: Draft;
  update: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  onBack: () => void;
  onSubmitted: () => Promise<void> | void;
}) {
  const submitFn = useServerFn(submitOnboarding);
  const uploadFn = useServerFn(uploadOnboardingSyllabus);

  const [greekMode, setGreekMode] = useState<"choose" | "not" | null>(
    draft.isGreekMember === true ? "choose" : draft.isGreekMember === false ? "not" : null,
  );
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [syllabusLater, setSyllabusLater] = useState(false);

  const toggleStress = (opt: string) =>
    update("stressFactors",
      draft.stressFactors.includes(opt)
        ? draft.stressFactors.filter((x) => x !== opt)
        : [...draft.stressFactors, opt]);

  const toggleFuture = (opt: string) =>
    update("futureInterests",
      draft.futureInterests.includes(opt)
        ? draft.futureInterests.filter((x) => x !== opt)
        : [...draft.futureInterests, opt]);

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
      setSyllabusLater(false);
      toast.success("Syllabus uploaded.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const submit = useMutation({
    mutationFn: () => submitFn({
      data: {
        shortRef: Number(shortRef),
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim() || null,
        email: draft.email.trim(),
        phone: draft.phone.trim(),
        campusId: draft.campusId,
        schoolName: draft.campusId ? null : (draft.schoolName.trim() || null),
        courseCodeOrName: draft.notSureCourse ? "Not sure" : (draft.course.trim() || null),
        pricingReaction: draft.pricingReaction ?? "sounds_good",
        stressFactors: draft.stressFactors,
        isGreekMember: greekMode === "choose" ? true : greekMode === "not" ? false : null,
        greekOrgName: greekMode === "choose" ? (draft.greekOrgName.trim() || null) : null,
        futureInterests: draft.futureInterests,
        accountingMajorStatus: draft.accountingMajorStatus,
      },
    }),
    onSuccess: async () => { await onSubmitted(); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-8">
      <Title subtitle="Everything below is optional.">Almost done.</Title>

      {/* Stress */}
      <section>
        <h2 className="text-base font-semibold text-gray-900">What&apos;s stressing you out most right now?</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {STRESS_OPTIONS.map((opt) => (
            <Chip key={opt} active={draft.stressFactors.includes(opt)} onClick={() => toggleStress(opt)}>
              {opt}
            </Chip>
          ))}
        </div>
      </section>

      {/* Greek */}
      <section>
        <h2 className="text-base font-semibold text-gray-900">Greek Organization</h2>
        <p className="mt-1 text-xs text-gray-500">Many chapters help members pay for tutoring.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Chip active={greekMode === "choose"} onClick={() => setGreekMode("choose")}>
            Choose organization
          </Chip>
          <Chip active={greekMode === "not"} onClick={() => { setGreekMode("not"); update("greekOrgName", ""); }}>
            Not Greek
          </Chip>
        </div>
        {greekMode === "choose" && (
          <Input
            className="mt-3"
            placeholder="Organization or chapter name"
            value={draft.greekOrgName}
            onChange={(e) => update("greekOrgName", e.target.value)}
          />
        )}
      </section>

      {/* Future interests */}
      <section>
        <h2 className="text-base font-semibold text-gray-900">Interested in any of these add-ons?</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {FUTURE_OPTIONS.map((opt) => (
            <Chip key={opt} active={draft.futureInterests.includes(opt)} onClick={() => toggleFuture(opt)}>
              {opt}
            </Chip>
          ))}
        </div>
      </section>

      {/* Syllabus */}
      <section>
        <h2 className="text-base font-semibold text-gray-900">Upload your syllabus</h2>
        <p className="mt-1 text-xs text-gray-500">
          This is the best way for me to understand your class and determine whether I&apos;m a good fit.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className={cn(
            "flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-4 text-sm transition",
            uploaded ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : "border-gray-300 text-gray-700 hover:bg-gray-50",
          )}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> :
              uploaded ? <CheckCircle2 className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
            {uploading ? "Uploading…" : uploaded ? "Uploaded" : "Upload Syllabus"}
            <input
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
            />
          </label>
          <Chip active={syllabusLater} onClick={() => { setSyllabusLater(true); setUploaded(false); }}>
            I&apos;ll do this later
          </Chip>
        </div>
      </section>

      <div className="pt-2">
        <PrimaryBtn
          onClick={() => submit.mutate()}
          disabled={submit.isPending}
        >
          {submit.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…</>) : "Submit Tutoring Request"}
        </PrimaryBtn>
        <div className="mt-3 text-center">
          <button type="button" onClick={onBack}
            className="text-sm text-gray-500 underline hover:text-gray-700">
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

function Chip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border px-4 py-3 text-left text-sm transition",
        active ? "border-transparent text-white shadow-sm"
          : "border-gray-200 bg-white hover:border-gray-300",
      )}
      style={active ? { background: NAVY } : undefined}
    >
      {children}
    </button>
  );
}

// ---------- Success ----------
function SuccessScreen() {
  return (
    <div className="py-6 text-center">
      <div className="mx-auto grid h-20 w-20 place-content-center rounded-full bg-emerald-50">
        <CheckCircle2 className="h-12 w-12 text-emerald-500" />
      </div>
      <h1 className="mt-6 text-3xl font-bold sm:text-4xl" style={{ color: NAVY }}>
        Thanks!
      </h1>
      <p className="mx-auto mt-3 max-w-md text-[15px] text-gray-600">
        I&apos;ll personally review your information and follow up with how I can help.
      </p>

      <ul className="mx-auto mt-8 max-w-sm space-y-3 text-left text-[15px] text-gray-800">
        <li className="flex gap-3"><Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> Free 30-minute intro session</li>
        <li className="flex gap-3"><Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> Personalized support</li>
        <li className="flex gap-3"><Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> Virtual tutoring</li>
      </ul>
    </div>
  );
}
