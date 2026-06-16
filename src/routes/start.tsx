// /start — Student Intake Hub.
// Single entry point for students to share class context + (optionally) upload their syllabus.
// Keeps homepage branding (SiteNavbar, Hero, Reviews, ContactForm, SiteFooter).
// Booking link is NOT shown here in Phase 1. Square is unchanged.
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Upload, CheckCircle2, FileText, X, Calendar, Clock } from "lucide-react";
import { Toaster, toast } from "sonner";
import { z } from "zod";

import SiteNavbar from "@/components/landing/SiteNavbar";
import Hero from "@/components/landing/Hero";
import Reviews from "@/components/landing/Reviews";
import ContactForm from "@/components/landing/ContactForm";
import SiteFooter from "@/components/landing/SiteFooter";
import BookTutoringModal from "@/components/landing/BookTutoringModal";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectValue, SelectTrigger,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { computeIntakeRouting, type RoutingDecision } from "@/lib/intake-routing";

const NAVY = "#14213D";
const RED = "#CE1126";

// ---------- Routing ----------

type StartSearch = {
  campus?: string;          // campus slug
  campus_id?: string;       // campus uuid
  course?: string;          // free-text course
  course_family?: string;
  source?: string;
  campaign_id?: string;
  lead_id?: string;
};

export const Route = createFileRoute("/start")({
  validateSearch: (search): StartSearch => ({
    campus: typeof search.campus === "string" ? search.campus : undefined,
    campus_id: typeof search.campus_id === "string" ? search.campus_id : undefined,
    course: typeof search.course === "string" ? search.course : undefined,
    course_family: typeof search.course_family === "string" ? search.course_family : undefined,
    source: typeof search.source === "string" ? search.source : undefined,
    campaign_id: typeof search.campaign_id === "string" ? search.campaign_id : undefined,
    lead_id: typeof search.lead_id === "string" ? search.lead_id : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Get Help With Your Accounting Course — Survive Accounting" },
      { name: "description", content: "Tell Lee what class you're in, upload your syllabus, and get on the path to tutoring." },
    ],
  }),
  component: StartPage,
});

// ---------- Data ----------

interface CampusOption { id: string; name: string; slug: string | null; state: string | null }

async function fetchSelectableCampuses(): Promise<CampusOption[]> {
  const { data, error } = await supabase
    .from("campuses")
    .select("id,name,slug,state,approval_status,archived_at")
    .eq("approval_status", "approved")
    .is("archived_at", null)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((c: any) => ({
    id: c.id, name: c.name ?? "", slug: c.slug ?? null, state: c.state ?? null,
  }));
}

// ---------- Validation ----------

const COURSE_FAMILIES = [
  { value: "intro_1", label: "Intro 1 — Financial Accounting" },
  { value: "intro_2", label: "Intro 2 — Managerial Accounting" },
  { value: "intermediate_1", label: "Intermediate Accounting I" },
  { value: "intermediate_2", label: "Intermediate Accounting II" },
  { value: "other", label: "Other / not sure" },
];

const intakeSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(80),
  last_name: z.string().trim().min(1, "Last name is required").max(80),
  email: z.string().trim().email("Valid email is required").max(255),
  phone: z.string().trim().min(7, "Phone is required").max(40),
  campus_id: z.string().uuid().nullable(),
  school_name: z.string().trim().max(160),
  course_family: z.string().min(1, "Pick the course family"),
  course_code_or_name: z.string().trim().min(1, "Course code or name is required").max(120),
  professor_name: z.string().trim().max(120),
  next_exam_date: z.string().max(20),
  is_accounting_major: z.string().max(10),
  is_greek_member: z.string().max(10),
  greek_org_name: z.string().trim().max(120),
  how_did_you_hear_about_me: z.string().trim().max(200),
  notes: z.string().trim().max(2000),
});

// ---------- Component ----------

function StartPage() {
  const search = Route.useSearch();
  const [bookOpen, setBookOpen] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  return (
    <div className="min-h-screen bg-background">
      <SiteNavbar />
      <Hero
        headline="Get help with your accounting course"
        subtext="Tell Lee what class you're in, upload your syllabus, and book tutoring."
        ctaSlot={
          <Button
            onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="h-12 px-8 text-base font-bold text-white shadow-lg"
            style={{ background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)` }}
          >
            Start the form ↓
          </Button>
        }
      />

      <section ref={formRef} className="px-4 py-16 sm:py-20" style={{ background: "#F5F7FA" }}>
        <div className="mx-auto w-full max-w-2xl">
          <IntakeForm initialSearch={search} />
        </div>
      </section>

      <Reviews />
      <ContactForm />
      <SiteFooter
        onScrollToContact={() => document.getElementById("contact-form")?.scrollIntoView({ behavior: "smooth" })}
        onScrollToReviews={() => document.getElementById("reviews-section")?.scrollIntoView({ behavior: "smooth" })}
        onBookTutoring={() => setBookOpen(true)}
      />
      <BookTutoringModal open={bookOpen} onOpenChange={setBookOpen} />
      <Toaster position="top-center" richColors />
    </div>
  );
}

// ---------- Form ----------

function IntakeForm({ initialSearch }: { initialSearch: StartSearch }) {
  const campusesQuery = useQuery({ queryKey: ["selectable-campuses"], queryFn: fetchSelectableCampuses, retry: 1 });
  const campuses = campusesQuery.data ?? [];

  const [done, setDone] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [routing, setRouting] = useState<RoutingDecision | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    campus_id: "" as string,           // uuid or "" (other)
    school_name: "",
    course_family: initialSearch.course_family ?? "",
    course_code_or_name: initialSearch.course ?? "",
    professor_name: "",
    next_exam_date: "",
    is_accounting_major: "",
    is_greek_member: "",
    greek_org_name: "",
    how_did_you_hear_about_me: "",
    notes: "",
  });

  const [syllabusFile, setSyllabusFile] = useState<File | null>(null);

  // Prefill campus_id from ?campus=<slug> or ?campus_id=<uuid>
  useEffect(() => {
    if (!campuses.length) return;
    if (form.campus_id) return;
    if (initialSearch.campus_id) {
      const hit = campuses.find((c) => c.id === initialSearch.campus_id);
      if (hit) setForm((f) => ({ ...f, campus_id: hit.id }));
    } else if (initialSearch.campus) {
      const hit = campuses.find((c) => c.slug === initialSearch.campus);
      if (hit) setForm((f) => ({ ...f, campus_id: hit.id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campuses.length]);

  const set =
    <K extends keyof typeof form>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const pickFile = (file: File | null) => {
    if (!file) { setSyllabusFile(null); return; }
    const MAX = 25 * 1024 * 1024; // 25 MB
    if (file.size > MAX) {
      toast.error("Syllabus must be under 25MB");
      return;
    }
    setSyllabusFile(file);
  };

  const submit = async () => {
    const parsed = intakeSchema.safeParse({ ...form, campus_id: form.campus_id || null });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as string;
        if (k && !errs[k]) errs[k] = issue.message;
      }
      setErrors(errs);
      toast.error("Please fix the highlighted fields");
      return;
    }
    setErrors({});

    // Either campus_id or free-text school_name
    if (!parsed.data.campus_id && !parsed.data.school_name.trim()) {
      setErrors({ school_name: "Pick your school or type its name" });
      toast.error("Please pick your school or type its name");
      return;
    }

    setSubmitting(true);
    try {
      let syllabusUrl: string | null = null;
      let syllabusAt: string | null = null;

      if (syllabusFile) {
        const safeName = syllabusFile.name.replace(/[^A-Za-z0-9._-]/g, "_");
        const path = `${crypto.randomUUID()}/${safeName}`;
        const { error: upErr } = await supabase
          .storage
          .from("student-syllabi")
          .upload(path, syllabusFile, { upsert: false, contentType: syllabusFile.type || undefined });
        if (upErr) throw new Error(`Syllabus upload failed: ${upErr.message}`);
        syllabusUrl = path;
        syllabusAt = new Date().toISOString();
      }

      const sourceParams: Record<string, string> = {};
      for (const [k, v] of Object.entries(initialSearch)) {
        if (typeof v === "string" && v) sourceParams[k] = v;
      }

      const payload = {
        first_name: parsed.data.first_name,
        last_name: parsed.data.last_name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        campus_id: parsed.data.campus_id,
        school_name: parsed.data.school_name || null,
        course_family: parsed.data.course_family,
        course_code_or_name: parsed.data.course_code_or_name,
        professor_name: parsed.data.professor_name || null,
        next_exam_date: parsed.data.next_exam_date || null,
        is_accounting_major:
          parsed.data.is_accounting_major === "yes" ? true :
          parsed.data.is_accounting_major === "no" ? false : null,
        is_greek_member:
          parsed.data.is_greek_member === "yes" ? true :
          parsed.data.is_greek_member === "no" ? false : null,
        greek_org_name: parsed.data.greek_org_name || null,
        how_did_you_hear_about_me: parsed.data.how_did_you_hear_about_me || null,
        notes: parsed.data.notes || null,
        syllabus_file_url: syllabusUrl,
        syllabus_uploaded_at: syllabusAt,
        source: initialSearch.source ?? null,
        source_campaign_id: initialSearch.campaign_id ?? null,
        source_lead_id: initialSearch.lead_id ?? null,
        source_url_params: sourceParams,
      };

      const { data: inserted, error } = await (supabase.from("student_intake_submissions" as never) as any)
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      const newId = inserted?.id as string;
      setSubmissionId(newId);

      // Compute routing decision
      const decision = await computeIntakeRouting({
        campusId: parsed.data.campus_id,
        courseFamily: parsed.data.course_family,
        hasSyllabus: !!syllabusUrl,
      });
      setRouting(decision);

      // Persist routing result + flags (don't block on failure)
      await (supabase.from("student_intake_submissions" as never) as any)
        .update({
          routing_result: decision.result,
          routing_reason: decision.reason,
          booking_link_shown: decision.result === "bookable_ready",
          waitlist_joined: decision.result === "waitlist_review",
        })
        .eq("id", newId);

      // Fire-and-forget notifications — never break the form
      supabase.functions.invoke("student-intake-notify", { body: { submission_id: newId } })
        .catch((e) => console.warn("[intake-notify]", e));

      setDone(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Late syllabus upload after submit (for bookable_needs_syllabus)
  const uploadSyllabusLate = async (file: File) => {
    if (!submissionId) return;
    try {
      const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
      const path = `${crypto.randomUUID()}/${safeName}`;
      const { error: upErr } = await supabase.storage.from("student-syllabi")
        .upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (upErr) throw new Error(upErr.message);

      await (supabase.from("student_intake_submissions" as never) as any)
        .update({ syllabus_file_url: path, syllabus_uploaded_at: new Date().toISOString() })
        .eq("id", submissionId);

      // Recompute routing
      const decision = await computeIntakeRouting({
        campusId: form.campus_id || null,
        courseFamily: form.course_family,
        hasSyllabus: true,
      });
      setRouting(decision);

      await (supabase.from("student_intake_submissions" as never) as any)
        .update({
          routing_result: decision.result,
          routing_reason: decision.reason,
          booking_link_shown: decision.result === "bookable_ready",
        })
        .eq("id", submissionId);

      supabase.functions.invoke("student-intake-notify", { body: { submission_id: submissionId } })
        .catch((e) => console.warn("[intake-notify]", e));

      toast.success("Syllabus uploaded!");
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    }
  };

  if (done) {
    return (
      <div
        className="rounded-2xl bg-white p-8 text-center shadow-xl"
        style={{ fontFamily: "Inter, sans-serif" }}
      >
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <h2 className="mt-4 text-2xl font-bold" style={{ color: NAVY }}>
          Thanks — your info was saved.
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
          Lee will review your details {syllabusFile ? "and your syllabus " : ""}and follow up shortly.
        </p>
      </div>
    );
  }

  const fieldErr = (k: string) => errors[k];

  return (
    <div
      className="rounded-2xl bg-white p-6 shadow-xl sm:p-8"
      style={{ fontFamily: "Inter, sans-serif" }}
    >
      <div className="mb-6">
        <h2 className="text-xl font-bold sm:text-2xl" style={{ color: NAVY }}>
          Tell Lee about your class
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Takes about a minute. Required fields marked with <span className="text-red-600">*</span>.
        </p>
      </div>

      <div className="space-y-5">
        {/* You */}
        <Section title="About you">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First name" required err={fieldErr("first_name")}>
              <Input value={form.first_name} onChange={set("first_name")} autoComplete="given-name" />
            </Field>
            <Field label="Last name" required err={fieldErr("last_name")}>
              <Input value={form.last_name} onChange={set("last_name")} autoComplete="family-name" />
            </Field>
            <Field label="Email" required err={fieldErr("email")}>
              <Input type="email" value={form.email} onChange={set("email")} autoComplete="email" />
            </Field>
            <Field label="Phone" required err={fieldErr("phone")}>
              <Input type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" placeholder="(555) 555-5555" />
            </Field>
          </div>
        </Section>

        {/* School + course */}
        <Section title="Your class">
          <div className="grid gap-3">
            <Field label="School" required err={fieldErr("school_name")}>
              <Select
                value={form.campus_id || "__other"}
                onValueChange={(v) => setForm((f) => ({ ...f, campus_id: v === "__other" ? "" : v }))}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder={campusesQuery.isLoading ? "Loading schools…" : "Pick your school"} />
                </SelectTrigger>
                <SelectContent>
                  {campuses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.state ? ` · ${c.state}` : ""}
                    </SelectItem>
                  ))}
                  <SelectItem value="__other">My school isn't listed</SelectItem>
                </SelectContent>
              </Select>
              {!form.campus_id && (
                <Input
                  className="mt-2"
                  placeholder="Type your school name"
                  value={form.school_name}
                  onChange={set("school_name")}
                />
              )}
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Which course?" required err={fieldErr("course_family")}>
                <Select
                  value={form.course_family}
                  onValueChange={(v) => setForm((f) => ({ ...f, course_family: v }))}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Pick a course family" />
                  </SelectTrigger>
                  <SelectContent>
                    {COURSE_FAMILIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Course code or name" required err={fieldErr("course_code_or_name")}>
                <Input value={form.course_code_or_name} onChange={set("course_code_or_name")} placeholder="e.g. ACCY 201" />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Professor (optional)">
                <Input value={form.professor_name} onChange={set("professor_name")} />
              </Field>
              <Field label="Next exam date (optional)">
                <Input type="date" value={form.next_exam_date} onChange={set("next_exam_date")} />
              </Field>
            </div>
          </div>
        </Section>

        {/* Syllabus upload — prominent */}
        <Section title="Upload your syllabus">
          <SyllabusUploader file={syllabusFile} onPick={pickFile} />
        </Section>

        {/* About you (extra) */}
        <Section title="A few extras (optional)">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Accounting major?">
              <Select value={form.is_accounting_major} onValueChange={(v) => setForm((f) => ({ ...f, is_accounting_major: v }))}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="unsure">Not sure yet</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="In a fraternity or sorority?">
              <Select value={form.is_greek_member} onValueChange={(v) => setForm((f) => ({ ...f, is_greek_member: v }))}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {form.is_greek_member === "yes" && (
              <Field label="Greek org name">
                <Input value={form.greek_org_name} onChange={set("greek_org_name")} />
              </Field>
            )}
            <Field label="How did you hear about Lee?">
              <Input value={form.how_did_you_hear_about_me} onChange={set("how_did_you_hear_about_me")} placeholder="e.g. friend, Instagram, my professor" />
            </Field>
          </div>
          <Field label="Anything else Lee should know?">
            <Textarea rows={3} value={form.notes} onChange={set("notes")} placeholder="Specific topics you're stuck on, exam dates, etc." />
          </Field>
        </Section>

        <Button
          onClick={submit}
          disabled={submitting}
          className="h-12 w-full text-base font-bold text-white"
          style={{ background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)` }}
        >
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Send to Lee
        </Button>
        <p className="text-center text-[11px] text-gray-500">
          By submitting, you agree Lee may text or email you about your tutoring request.
        </p>
      </div>
    </div>
  );
}

// ---------- Sub-components ----------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-600">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label, required, err, children,
}: { label: string; required?: boolean; err?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs font-medium text-gray-700">
        {label}{required && <span className="text-red-600"> *</span>}
      </Label>
      {children}
      {err && <span className="text-[11px] text-red-600">{err}</span>}
    </div>
  );
}

function SyllabusUploader({
  file, onPick,
}: { file: File | null; onPick: (f: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const sizeKb = useMemo(() => file ? Math.round(file.size / 1024) : 0, [file]);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      {!file ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white px-4 py-8 text-center transition hover:border-gray-400 hover:bg-gray-50"
        >
          <Upload className="h-6 w-6 text-gray-500" />
          <span className="text-sm font-semibold" style={{ color: NAVY }}>
            Click to upload your syllabus
          </span>
          <span className="max-w-md text-xs text-gray-500">
            Strongly recommended. If you want to book tutoring, Lee needs your syllabus first so he can prep for your course.
          </span>
          <span className="text-[11px] text-gray-400">PDF, DOC, image — up to 25MB</span>
        </button>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-5 w-5 shrink-0 text-emerald-700" />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-emerald-900">{file.name}</div>
              <div className="text-[11px] text-emerald-700">{sizeKb.toLocaleString()} KB · ready to upload</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { onPick(null); if (inputRef.current) inputRef.current.value = ""; }}
            className="rounded p-1 text-emerald-700 hover:bg-emerald-100"
            aria-label="Remove file"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
