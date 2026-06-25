// /start — Syllabus-first tutoring request page.
// Student uploads syllabus + basic contact info. Lee reviews manually before sending a booking link.
import { useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Upload, CheckCircle2, FileText, X } from "lucide-react";
import { Toaster, toast } from "sonner";
import { z } from "zod";

import SiteNavbar from "@/components/landing/SiteNavbar";
import Hero from "@/components/landing/Hero";
import SiteFooter from "@/components/landing/SiteFooter";
import BookTutoringModal from "@/components/landing/BookTutoringModal";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

const NAVY = "#14213D";
const RED = "#CE1126";
const LEE_PHONE_DISPLAY = "(662) 565-8818";

export const Route = createFileRoute("/start")({
  head: () => ({
    meta: [
      { title: "Get Help With Your Accounting Course — Survive Accounting" },
      {
        name: "description",
        content:
          "Upload your syllabus and Lee will respond within 1 business day if he's a good fit to tutor you.",
      },
    ],
  }),
  component: StartPage,
});

const requestSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  phone: z.string().trim().min(7, "Phone is required").max(40),
  email: z.string().trim().email("Valid email is required").max(255),
  course_notes: z.string().trim().max(2000).optional(),
});

function StartPage() {
  const navigate = useNavigate();
  const [bookOpen, setBookOpen] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const scrollToForm = () =>
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="min-h-screen bg-background">
      {/* Top-right "Book Tutoring" routes into the onboarding flow (/onboard
          creates the conversation and redirects to /o/{short_ref}). */}
      <SiteNavbar onBookTutoring={() => navigate({ to: "/onboard" })} />
      <Hero
        headline="Get help with your accounting course"
        subtext={`Upload your syllabus, and I'll respond within 1 business day if I'm a good fit to tutor you.`}
        ctaSlot={
          <div className="flex flex-col items-center gap-2">
            <Button
              onClick={scrollToForm}
              className="h-12 px-8 text-base font-bold text-white shadow-lg"
              style={{ background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)` }}
            >
              <Upload className="mr-2 h-5 w-5" />
              Upload Syllabus
            </Button>
            <p className="text-sm text-muted-foreground">
              Questions? Text <span className="font-semibold">{LEE_PHONE_DISPLAY}</span>
            </p>
          </div>
        }
      />

      <section
        ref={formRef}
        className="px-4 py-16 sm:py-20"
        style={{ background: "#F5F7FA" }}
      >
        <div className="mx-auto w-full max-w-xl">
          <RequestForm />
        </div>
      </section>

      <SiteFooter
        onScrollToContact={scrollToForm}
        onScrollToReviews={scrollToForm}
        onBookTutoring={() => setBookOpen(true)}
      />
      <BookTutoringModal open={bookOpen} onOpenChange={setBookOpen} />
      <Toaster position="top-center" richColors />
    </div>
  );
}

function RequestForm() {
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [syllabusFile, setSyllabusFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    course_notes: "",
  });

  const set =
    <K extends keyof typeof form>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const pickFile = (file: File | null) => {
    if (!file) {
      setSyllabusFile(null);
      return;
    }
    const MAX = 25 * 1024 * 1024;
    if (file.size > MAX) {
      toast.error("Syllabus must be under 25MB");
      return;
    }
    setSyllabusFile(file);
  };

  const submit = async () => {
    const parsed = requestSchema.safeParse(form);
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
    if (!syllabusFile) {
      setErrors((e) => ({ ...e, syllabus: "Please attach your syllabus" }));
      toast.error("Please attach your syllabus");
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const safeName = syllabusFile.name.replace(/[^A-Za-z0-9._-]/g, "_");
      const path = `${crypto.randomUUID()}/${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("student-syllabi")
        .upload(path, syllabusFile, {
          upsert: false,
          contentType: syllabusFile.type || undefined,
        });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

      const payload = {
        name: parsed.data.name,
        phone: parsed.data.phone,
        email: parsed.data.email,
        course_notes: parsed.data.course_notes || null,
        syllabus_file_url: path,
        status: "new",
      };

      const { error } = await (supabase.from("tutoring_requests" as never) as any).insert(payload);
      if (error) throw new Error(error.message);

      setDone(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div
        className="rounded-2xl bg-white p-8 shadow-xl text-center"
        style={{ fontFamily: "Inter, sans-serif" }}
      >
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
        <h2 className="mt-4 text-xl font-bold sm:text-2xl" style={{ color: NAVY }}>
          Thanks — I got your syllabus.
        </h2>
        <p className="mt-3 text-sm text-gray-700">
          I'll review it and text you within 1 business day if I'm a good fit to tutor you.
        </p>
        <p className="mt-3 text-sm text-gray-700">
          If you have questions, text me at{" "}
          <span className="font-semibold">{LEE_PHONE_DISPLAY}</span>.
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
          Request tutoring
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Required fields marked with <span className="text-red-600">*</span>.
        </p>
      </div>

      <div className="space-y-4">
        <Field label="Name" required err={fieldErr("name")}>
          <Input value={form.name} onChange={set("name")} autoComplete="name" />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Phone" required err={fieldErr("phone")}>
            <Input
              type="tel"
              value={form.phone}
              onChange={set("phone")}
              autoComplete="tel"
              placeholder="(555) 555-5555"
            />
          </Field>
          <Field label="Email" required err={fieldErr("email")}>
            <Input
              type="email"
              value={form.email}
              onChange={set("email")}
              autoComplete="email"
            />
          </Field>
        </div>

        <Field label="Syllabus" required err={fieldErr("syllabus")}>
          <SyllabusPicker file={syllabusFile} onPick={pickFile} />
        </Field>

        <Field label="Course / notes" err={fieldErr("course_notes")}>
          <Textarea
            value={form.course_notes}
            onChange={set("course_notes")}
            rows={3}
            placeholder="Course code, professor, anything I should know (optional)"
          />
        </Field>

        <Button
          onClick={submit}
          disabled={submitting}
          className="h-12 w-full text-base font-bold text-white"
          style={{ background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)` }}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
            </>
          ) : (
            "Submit request"
          )}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  err,
  children,
}: {
  label: string;
  required?: boolean;
  err?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-1.5 block text-sm font-medium text-gray-800">
        {label} {required && <span className="text-red-600">*</span>}
      </Label>
      {children}
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}

function SyllabusPicker({
  file,
  onPick,
}: {
  file: File | null;
  onPick: (f: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  if (file) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3">
        <FileText className="h-5 w-5 text-emerald-700" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-emerald-900">{file.name}</div>
          <div className="text-[11px] text-emerald-700">
            {(file.size / 1024 / 1024).toFixed(2)} MB
          </div>
        </div>
        <button
          type="button"
          onClick={() => onPick(null)}
          className="rounded p-1 text-emerald-700 hover:bg-emerald-100"
          aria-label="Remove file"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-600 hover:border-gray-400 hover:bg-gray-100"
    >
      <Upload className="h-5 w-5" />
      <span>Click to upload syllabus (PDF, DOC, image — up to 25MB)</span>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.heic"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
    </button>
  );
}
