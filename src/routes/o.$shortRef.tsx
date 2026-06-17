// /o/{short_ref} — Simplified 3-step tutoring request.
// 1) Your info  →  2) Confirm pricing  →  3) Optional extras + submit  →  success.
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Check, CheckCircle2, Loader2, Search, Upload } from "lucide-react";
import { Toaster, toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  getOnboarding,
  submitOnboarding,
  searchCampuses,
  getCampusCourseCodes,
  uploadOnboardingSyllabus,
  type CampusLite,
  type OnboardingSnapshot,
} from "@/lib/onboarding.functions";
import leeHeadshot from "@/assets/lee-headshot-original.png";

const LEE_PHONE_DISPLAY = "(662) 565-8818";
const LEE_PHONE_HREF = "+16625658818";
const LOGO_URL = "https://lwfiles.mycourse.app/672bc379cd024d536f651ecc-public/1554d231f0e2bf121ac35937c4d438ca.png";

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

const COURSE_FAMILIES = [
  { key: "intro_1", title: "Intro 1" },
  { key: "intro_2", title: "Intro 2" },
  { key: "intermediate_1", title: "IA1" },
  { key: "intermediate_2", title: "IA2" },
] as const;
type CourseFamilyKey = (typeof COURSE_FAMILIES)[number]["key"];
const COURSE_TITLE_BY_KEY: Record<CourseFamilyKey, string> = {
  intro_1: "Intro 1",
  intro_2: "Intro 2",
  intermediate_1: "IA1",
  intermediate_2: "IA2",
};
// Saved-course strings we recognize as a "known" dropdown selection (kept loose
// so older entries like "Intro Accounting 1" still round-trip into the dropdown).
const KNOWN_COURSE_TITLES = new Set<string>([
  ...COURSE_FAMILIES.map((c) => c.title),
  "Intro Accounting 1", "Intro Accounting 2",
  "Intermediate Accounting 1", "Intermediate Accounting 2",
]);

function courseNameToFamilyKey(name: string): CourseFamilyKey | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  if (n === "intro 1" || n === "intro accounting 1") return "intro_1";
  if (n === "intro 2" || n === "intro accounting 2") return "intro_2";
  if (n === "ia1" || n === "intermediate accounting 1") return "intermediate_1";
  if (n === "ia2" || n === "intermediate accounting 2") return "intermediate_2";
  return null;
}

function formatCourseOption(key: CourseFamilyKey, code: string | null): string {
  const title = COURSE_TITLE_BY_KEY[key];
  return code ? `${code} — ${title}` : title;
}


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
  schoolOther: boolean;
  course: string;
  courseOther: string;
  notSureCourse: boolean;
  pricingReaction: "sounds_good" | "more_than_expected" | null;
  stressFactors: string[];
  isGreekMember: boolean | null;
  greekOrgName: string;
  futureInterests: string[];
  accountingMajorStatus: "yes" | "no" | "definitely_not" | null;
};

function draftFromSnapshot(s: OnboardingSnapshot): Draft {
  // Strip synthetic web phone markers (e.g. "web:UUID") from prefill.
  const phone = s.phone && !s.phone.startsWith("web:") ? s.phone : "";
  // Map server-saved course (display name) back to a course-family key, the
  // "Not sure" sentinel, or a free-text write-in.
  const courseName = (s.course ?? "").trim();
  const familyKey = courseNameToFamilyKey(courseName);
  const isNotSure = courseName === "Not sure";
  const hasCampus = !!(s.campusId || s.campus);
  return {
    firstName: s.firstName ?? "",
    lastName: s.lastName ?? "",
    email: s.email ?? "",
    phone,
    campusId: s.campusId,
    schoolName: s.campus ?? "",
    schoolOther: !s.campusId && !!s.campus,
    course: familyKey ?? "",
    courseOther: !familyKey && !isNotSure && hasCampus ? courseName : "",
    notSureCourse: isNotSure,
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

  const firstName = draft.firstName.trim().split(/\s+/)[0] || "";
  const hasName = firstName.length > 0 && step > 0;

  return (
    <div className="min-h-screen" style={{ background: "#FAFAF7", fontFamily: "Inter, -apple-system, sans-serif" }}>
      <header
        className="sticky top-0 z-40 w-full border-b"
        style={{
          background: "linear-gradient(180deg, rgba(20,33,61,0.98) 0%, rgba(16,26,49,0.98) 100%)",
          borderColor: "rgba(255,255,255,0.08)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.04) inset",
        }}
      >
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6">
          <a href="/" aria-label="Survive Accounting — home" className="inline-flex items-center">
            <img src={LOGO_URL} alt="Survive Accounting" className="h-5 w-auto select-none sm:h-[22px]" draggable={false} />
          </a>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-14 pt-8 sm:pt-12 lg:grid-cols-[1fr_240px]">
        <div className="min-w-0">
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
                firstName={hasName ? firstName : null}
                draft={draft}
                update={update}
                onContinue={() => setStep(2)}
                onBack={() => setStep(0)}
              />
            )}
            {step === 2 && (
              <ExtrasStep
                firstName={hasName ? firstName : null}
                shortRef={shortRef}
                draft={draft}
                update={update}
                onBack={() => setStep(1)}
                onSubmitted={async () => { await refetch(); setStep(3); }}
              />
            )}
            {step === 3 && <SuccessScreen firstName={firstName || null} />}
          </div>
        </div>

        <LeeAside />
      </div>
      <Toaster position="top-center" richColors />
    </div>
  );
}

// ---------- Personal touch (desktop) ----------
function LeeAside() {
  return (
    <aside className="hidden lg:flex lg:flex-col lg:items-center lg:pt-2">
      <img
        src={leeHeadshot}
        alt="Lee Ingram, your tutor"
        className="h-24 w-24 rounded-full object-cover ring-4 ring-white shadow-[0_8px_24px_-10px_rgba(20,33,61,0.35)]"
        loading="lazy"
      />
      <div className="mt-4 text-center">
        <TrustPills />
      </div>
      <div className="mt-6 w-full border-t border-gray-200/70 pt-5 text-center">
        <p className="text-sm font-semibold" style={{ color: NAVY }}>Questions?</p>
        <p className="mt-0.5 text-xs text-gray-600">Text me anytime.</p>
        <p className="mt-2 text-base font-semibold tracking-tight" style={{ color: NAVY }}>Lee Ingram</p>
        <a
          href={`sms:${LEE_PHONE_HREF}`}
          className="mt-0.5 inline-block text-sm font-semibold tracking-tight hover:underline"
          style={{ color: RED }}
        >
          {LEE_PHONE_DISPLAY}
        </a>
      </div>
    </aside>
  );
}

// ---------- Trust pills ----------
function TrustPills() {
  const pillStyle: React.CSSProperties = {
    background: "rgba(20,33,61,0.04)",
    borderColor: "rgba(20,33,61,0.10)",
    color: NAVY,
  };
  return (
    <div className="mt-3 flex flex-col items-center gap-2">
      <span
        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium"
        style={pillStyle}
      >
        <Check className="h-3.5 w-3.5" style={{ color: RED }} />
        1,000+ students helped since 2015
      </span>
      <span
        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium"
        style={pillStyle}
      >
        <span aria-hidden>🎓</span>
        Bachelor&apos;s + Master&apos;s in Accounting
      </span>
    </div>
  );
}

// ---------- Stepper ----------
function Stepper({ current }: { current: 0 | 1 | 2 }) {
  const pct = current === 0 ? 8 : current === 1 ? 50 : 92;
  return (
    <div>
      {/* Mobile: minimal label + animated bar */}
      <div className="sm:hidden">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold" style={{ color: NAVY }}>
            Step {current + 1} of 3
          </span>
          <span className="text-gray-500">{STEPS[current]}</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${pct}%`, background: RED }}
          />
        </div>
      </div>

      {/* Desktop: 3-dot indicator with connecting line */}
      <ol className="hidden items-center sm:flex">
        {STEPS.map((label, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={label} className="flex flex-1 items-center last:flex-none">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-content-center rounded-full border text-xs font-bold transition-colors",
                    done && "text-white",
                    active && "text-white shadow-sm",
                    !done && !active && "border-gray-300 bg-white text-gray-400",
                  )}
                  style={
                    done
                      ? { background: RED, borderColor: RED }
                      : active
                      ? { background: RED, borderColor: RED }
                      : undefined
                  }
                >
                  {done ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "text-sm",
                    active ? "font-semibold" : done ? "text-gray-500" : "text-gray-400",
                  )}
                  style={active ? { color: NAVY } : undefined}
                >
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <span
                  className="mx-4 h-px flex-1 transition-colors"
                  style={{ background: done ? RED : "#E5E7EB" }}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
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

  const schoolPicked = !!(draft.campusId || (draft.schoolOther && draft.schoolName.trim()));

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
    if (!schoolPicked) {
      errs.school = "Please select or enter your school";
    }
    const courseProvided =
      draft.notSureCourse ||
      draft.course.trim().length > 0 ||
      draft.courseOther.trim().length > 0;
    if (schoolPicked && !courseProvided) {
      errs.course = "Please pick a course or mark Not sure";
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
          <Input type="tel" value={draft.phone} placeholder="(555) 555-5555"
            onChange={(e) => update("phone", e.target.value)} autoComplete="tel" />
        </Field>
      </div>

      <SchoolPicker
        campusId={draft.campusId}
        schoolName={draft.schoolName}
        other={draft.schoolOther}
        onPick={(id, name) => {
          update("campusId", id);
          update("schoolName", name);
          update("schoolOther", false);
        }}
        onTypeOther={(name) => {
          update("campusId", null);
          update("schoolName", name);
          update("schoolOther", true);
        }}
        onClear={() => {
          update("campusId", null);
          update("schoolName", "");
          update("schoolOther", false);
        }}
        error={errors.school}
      />

      {schoolPicked && (
        <CoursePicker
          campusId={draft.campusId}
          course={draft.course}
          courseOther={draft.courseOther}
          notSure={draft.notSureCourse}
          onPickCourse={(v) => {
            update("course", v);
            update("courseOther", "");
            update("notSureCourse", false);
          }}
          onNotSure={() => {
            update("course", "");
            update("courseOther", "");
            update("notSureCourse", true);
          }}
          onTypeOther={(v) => {
            update("course", "");
            update("notSureCourse", false);
            update("courseOther", v);
          }}
          onResetOther={() => update("courseOther", "")}
          error={errors.course}
        />
      )}


      <div>
        <Label className="mb-3 block text-sm font-medium text-gray-800">
          Are you an accounting major?
        </Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            { value: "yes" as const, label: "Yes" },
            { value: "no" as const, label: "No" },
            { value: "definitely_not" as const, label: "Undecided" },
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
  campusId, schoolName, other, onPick, onTypeOther, onClear, error,
}: {
  campusId: string | null;
  schoolName: string;
  other: boolean;
  onPick: (id: string, name: string) => void;
  onTypeOther: (name: string) => void;
  onClear: () => void;
  error?: string;
}) {
  const searchFn = useServerFn(searchCampuses);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CampusLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Debounced search — only while open and not in "other" mode
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
    <div ref={wrapRef}>
      <Label className="mb-1.5 block text-sm font-medium text-gray-800">
        School<span className="ml-0.5 text-red-600">*</span>
      </Label>

      {campusId && !other ? (
        <div className="flex items-center justify-between rounded-xl border bg-gray-50 px-4 py-3">
          <span className="text-sm font-medium">{schoolName}</span>
          <Button variant="ghost" size="sm" onClick={() => { onClear(); setQuery(""); setOpen(false); }}>
            Change
          </Button>
        </div>
      ) : other ? (
        <div className="space-y-2">
          <Input
            placeholder="Type your school name"
            value={schoolName}
            onChange={(e) => onTypeOther(e.target.value)}
            autoFocus
          />
          <button type="button" className="text-xs text-gray-600 underline"
            onClick={() => { onClear(); setQuery(""); }}>
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
            <div className="mt-2 max-h-56 overflow-auto rounded-xl border bg-white shadow-sm">
              {searching && <div className="p-3 text-xs text-gray-500">Searching…</div>}
              {!searching && results.length === 0 && (
                <div className="p-3 text-xs text-gray-500">No matches.</div>
              )}
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                  onClick={() => { onPick(r.id, r.name); setOpen(false); setQuery(""); }}
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
          <button type="button" className="mt-2 text-xs text-gray-600 underline"
            onClick={() => { onTypeOther(""); setOpen(false); }}>
            My school isn&apos;t listed
          </button>
        </>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ---------- Course picker (shown after school is selected) ----------
function CoursePicker({
  campusId, course, courseOther, notSure,
  onPickCourse, onNotSure, onTypeOther, onResetOther, error,
}: {
  campusId: string | null;
  course: string; // a CourseFamilyKey or ""
  courseOther: string;
  notSure: boolean;
  onPickCourse: (v: CourseFamilyKey) => void;
  onNotSure: () => void;
  onTypeOther: (v: string) => void;
  onResetOther: () => void;
  error?: string;
}) {
  const codesFn = useServerFn(getCampusCourseCodes);
  const { data: codes } = useQuery({
    queryKey: ["campus-course-codes", campusId],
    queryFn: () => codesFn({ data: { campusId: campusId! } }),
    enabled: !!campusId,
    staleTime: 5 * 60_000,
  });

  const otherMode = courseOther.length > 0;
  const selectValue = notSure
    ? "__not_sure__"
    : otherMode
    ? "__other__"
    : course || "";

  const handleChange = (v: string) => {
    if (v === "__not_sure__") return onNotSure();
    onPickCourse(v as CourseFamilyKey);
  };

  return (
    <div>
      <Label className="mb-1.5 block text-sm font-medium text-gray-800">
        Course<span className="ml-0.5 text-red-600">*</span>
      </Label>

      {otherMode ? (
        <div className="space-y-2">
          <Input
            placeholder="Type your course name or number"
            value={courseOther.trim() === "" ? "" : courseOther}
            onChange={(e) => onTypeOther(e.target.value)}
            autoFocus
          />
          <button type="button" className="text-xs text-gray-600 underline"
            onClick={onResetOther}>
            Pick from the list instead
          </button>
        </div>
      ) : (
        <>
          <Select value={selectValue} onValueChange={handleChange}>
            <SelectTrigger className="h-11">
              <SelectValue placeholder="Pick your course" />
            </SelectTrigger>
            <SelectContent>
              {COURSE_FAMILIES.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {formatCourseOption(c.key, codes?.[c.key] ?? null)}
                </SelectItem>
              ))}
              <SelectItem value="__not_sure__">Not Sure</SelectItem>
            </SelectContent>
          </Select>
          <button
            type="button"
            className="mt-2 text-xs text-gray-600 underline"
            onClick={() => onTypeOther(" ")}
          >
            My course isn&apos;t listed
          </button>
        </>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ---------- Step 2: Pricing ----------
function PricingStep({
  firstName, draft, update, onContinue, onBack,
}: {
  firstName: string | null;
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
      <Title subtitle={firstName ? `Nice to meet you, ${firstName}.` : undefined}>
        How does this sound?
      </Title>


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
  firstName, shortRef, draft, update, onBack, onSubmitted,
}: {
  firstName: string | null;
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
        courseCodeOrName: draft.notSureCourse
          ? "Not sure"
          : (draft.courseOther.trim()
              || (draft.course ? COURSE_TITLE_BY_KEY[draft.course as CourseFamilyKey] ?? null : null)),
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
      <Title subtitle="Everything below is optional.">
        {firstName ? `Almost done, ${firstName}.` : "Almost done."}
      </Title>

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
function SuccessScreen({ firstName }: { firstName: string | null }) {
  return (
    <div className="py-6 text-center">
      <div className="mx-auto grid h-20 w-20 place-content-center rounded-full bg-emerald-50">
        <CheckCircle2 className="h-12 w-12 text-emerald-500" />
      </div>
      <h1 className="mt-6 text-3xl font-bold sm:text-4xl" style={{ color: NAVY }}>
        {firstName ? `Thanks, ${firstName}!` : "Thanks!"}
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
