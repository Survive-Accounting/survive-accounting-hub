// /preview — email-gated shell "preview" dashboard. The end of onboarding drops
// students here (identified by ?email=&course=); Lee also links former students
// here for summer testing (they pass a tiny name+email gate). It turns "you're on
// the waitlist" into a living roadmap of what's being built + a feedback surface.
//
// NOTE: chapters here are clearly-labeled PLACEHOLDERS with the correct numbering
// (Intro 2 starts at 12, IA2 at 13). Real Ole Miss chapter data lives in the
// `chapters` table; wiring it in (per-course) is a follow-up — see the banner note.
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Toaster, toast } from "sonner";
import { Bell, BookOpen, FileText, Loader2, Lock, MessageSquarePlus, ThumbsUp, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { capturePreviewTester, submitPreviewFeedback } from "@/lib/preview-api";
import { PREVIEW_VISION_VIDEO_URL } from "@/lib/site-config";

const NAVY = "#14213D";
const RED = "#CE1126";
const LOGO_URL = "https://lwfiles.mycourse.app/672bc379cd024d536f651ecc-public/1554d231f0e2bf121ac35937c4d438ca.png";

type CourseKey = "intro_1" | "intro_2" | "intermediate_1" | "intermediate_2";
const COURSES: { key: CourseKey; code: string; title: string; start: number; end: number }[] = [
  { key: "intro_1", code: "ACCY 201", title: "Introduction to Financial Accounting", start: 1, end: 11 },
  { key: "intro_2", code: "ACCY 202", title: "Introduction to Managerial Accounting", start: 12, end: 24 },
  { key: "intermediate_1", code: "ACCY 303", title: "Intermediate Financial Accounting 1", start: 1, end: 12 },
  { key: "intermediate_2", code: "ACCY 304", title: "Intermediate Financial Accounting 2", start: 13, end: 24 },
];

function toEmbedSrc(url: string): string | null {
  const u = (url ?? "").trim();
  if (!u) return null;
  let m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/);
  if (m) return `https://www.youtube.com/embed/${m[1]}`;
  m = u.match(/vimeo\.com\/(\d+)/);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  if (/^[A-Za-z0-9_-]{8,15}$/.test(u)) return `https://www.youtube.com/embed/${u}`;
  if (/^https?:\/\//.test(u)) return u;
  return null;
}

interface PreviewSearch { course?: string; email?: string; name?: string; school?: string }

export const Route = createFileRoute("/preview")({
  validateSearch: (s: Record<string, unknown>): PreviewSearch => ({
    course: typeof s.course === "string" ? s.course : undefined,
    email: typeof s.email === "string" ? s.email : undefined,
    name: typeof s.name === "string" ? s.name : undefined,
    school: typeof s.school === "string" ? s.school : undefined,
  }),
  head: () => ({ meta: [{ title: "Your preview — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
  component: PreviewPage,
});

function PreviewPage() {
  const search = Route.useSearch();
  // If onboarding handed us an email, they're already identified → straight in.
  const [email, setEmail] = useState<string>(search.email?.trim().toLowerCase() ?? "");
  const entered = !!email;

  const initialCourse = (COURSES.find((c) => c.key === search.course)?.key) ?? "intro_1";
  const [course, setCourse] = useState<CourseKey>(initialCourse);

  return (
    <div className="min-h-screen" style={{ background: "#FAFAF7", fontFamily: "Inter, sans-serif" }}>
      <header className="sticky top-0 z-40 w-full border-b"
        style={{ background: "linear-gradient(180deg, rgba(20,33,61,0.98) 0%, rgba(16,26,49,0.98) 100%)", borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center px-4 sm:px-6">
          <a href="/" aria-label="Survive Accounting — home" className="inline-flex items-center">
            <img src={LOGO_URL} alt="Survive Accounting" className="h-5 w-auto select-none sm:h-[22px]" draggable={false} />
          </a>
          {entered && <span className="ml-auto text-xs text-white/55">Preview · {email}</span>}
        </div>
      </header>

      {!entered ? (
        <EmailGate
          defaultName={search.name ?? ""}
          school={search.school ?? null}
          courseKey={course}
          onIn={(e) => setEmail(e)}
        />
      ) : (
        <Dashboard email={email} course={course} setCourse={setCourse} school={search.school ?? null} />
      )}
      <Toaster position="top-center" richColors />
    </div>
  );
}

function EmailGate({
  defaultName, school, courseKey, onIn,
}: { defaultName: string; school: string | null; courseKey: CourseKey; onIn: (email: string) => void }) {
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await capturePreviewTester({ name, email, campus: school, course: courseKey, source: "preview_tester" });
      onIn(email.trim().toLowerCase());
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-3xl bg-white p-7 shadow-[0_10px_40px_-15px_rgba(20,33,61,0.18)] sm:p-9">
        <div className="grid h-12 w-12 place-content-center rounded-2xl" style={{ background: "rgba(20,33,61,0.06)" }}>
          <Lock className="h-6 w-6" style={{ color: NAVY }} />
        </div>
        <h1 className="mt-4 text-2xl font-bold" style={{ color: NAVY }}>Take a look at what I&apos;m building.</h1>
        <p className="mt-2 text-sm text-gray-600">
          No account, no password — just your name and email so I know who I&apos;m building for (and can
          tell you when new content drops).
        </p>
        <div className="mt-5 space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="g-name" className="text-xs">First name</Label>
            <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="given-name" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="g-email" className="text-xs">Email</Label>
            <Input id="g-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" autoComplete="email" />
          </div>
          <Button className="h-11 w-full text-base font-bold text-white"
            style={{ background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)` }}
            disabled={busy} onClick={submit}>
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> One sec…</> : "Take a look →"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Dashboard({
  email, course, setCourse, school,
}: { email: string; course: CourseKey; setCourse: (c: CourseKey) => void; school: string | null }) {
  const active = COURSES.find((c) => c.key === course)!;
  const chapters = useMemo(
    () => Array.from({ length: active.end - active.start + 1 }, (_, i) => active.start + i),
    [active],
  );
  const visionEmbed = toEmbedSrc(PREVIEW_VISION_VIDEO_URL);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-8 sm:px-6">
      {/* Vibe banner */}
      <div className="rounded-3xl p-6 text-white sm:p-8"
        style={{ background: "linear-gradient(135deg, #14213D 0%, #1c2c4d 60%, #0B1426 100%)" }}>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">You&apos;re early — help me shape this</p>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Here&apos;s what I&apos;m building for you.</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-white/75">
          Practice exams, video explainers, and journal entries to memorize — rolling out chapter by
          chapter, all the time. Tell me what would help you most and I&apos;ll build that first.
        </p>
      </div>

      {/* Vision video slot (hidden until Lee adds a URL) */}
      {visionEmbed && (
        <div className="mt-6 overflow-hidden rounded-3xl border shadow-sm" style={{ borderColor: "rgba(20,33,61,0.1)" }}>
          <div className="relative aspect-video bg-black/40">
            <iframe src={visionEmbed} title="Lee's vision" className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          </div>
        </div>
      )}

      {/* Course tabs */}
      <div className="mt-7 flex flex-wrap gap-2">
        {COURSES.map((c) => {
          const on = c.key === course;
          return (
            <button key={c.key} onClick={() => setCourse(c.key)}
              className="rounded-full border px-4 py-2 text-sm font-semibold transition-all"
              style={on ? { background: NAVY, color: "white", borderColor: NAVY } : { background: "white", color: NAVY, borderColor: "#e5e7eb" }}>
              {c.code}
            </button>
          );
        })}
      </div>
      <div className="mt-3">
        <h2 className="text-lg font-bold" style={{ color: NAVY }}>{active.code} · {active.title}</h2>
        <p className="text-xs text-gray-400">
          {school ? `Tailored to ${school}. ` : ""}Chapters below are a placeholder roadmap — real
          chapter content is being wired in.
        </p>
      </div>

      {/* Chapter roadmap */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {chapters.map((n) => (
          <ChapterCard key={n} email={email} course={course} chapter={`Chapter ${n}`} />
        ))}
      </div>

      {/* "Tell me what you'd like built" */}
      <GeneralFeedback email={email} course={course} />

      {/* Notify CTA */}
      <NotifyToggle email={email} />
    </div>
  );
}

const COMING_SOON = [
  { icon: FileText, label: "Practice exam questions" },
  { icon: Video, label: "Video explainers" },
  { icon: BookOpen, label: "Journal entries to memorize" },
];

function ChapterCard({ email, course, chapter }: { email: string; course: CourseKey; chapter: string }) {
  const [voted, setVoted] = useState(false);
  const vote = async () => {
    if (voted) return;
    setVoted(true);
    try { await submitPreviewFeedback({ email, course, chapter, reaction: "would_use" }); toast.success("Noted — thanks!"); }
    catch (e) { setVoted(false); toast.error((e as Error).message); }
  };
  return (
    <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-bold" style={{ color: NAVY }}>{chapter}</h3>
      <ul className="mt-3 space-y-2">
        {COMING_SOON.map((c) => (
          <li key={c.label} className="flex items-center gap-2 text-[13px] text-gray-500">
            <c.icon className="h-4 w-4 text-gray-400" />
            <span>{c.label}</span>
            <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-400">coming soon</span>
          </li>
        ))}
      </ul>
      <button onClick={vote}
        className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all"
        style={voted ? { background: "rgba(206,17,38,0.08)", color: RED, borderColor: "rgba(206,17,38,0.25)" } : { background: "white", color: NAVY, borderColor: "#e5e7eb" }}>
        <ThumbsUp className="h-3.5 w-3.5" /> {voted ? "I'd use this — got it" : "I'd use this"}
      </button>
    </div>
  );
}

function GeneralFeedback({ email, course }: { email: string; course: CourseKey }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const send = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    try { await submitPreviewFeedback({ email, course, chapter: null, comment }); setDone(true); setComment(""); toast.success("Thank you — this shapes what I build next."); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="mt-8 rounded-3xl border p-6 sm:p-7" style={{ borderColor: "rgba(20,33,61,0.1)", background: "white" }}>
      <div className="flex items-center gap-2">
        <MessageSquarePlus className="h-5 w-5" style={{ color: RED }} />
        <h3 className="text-base font-bold" style={{ color: NAVY }}>Tell me what you&apos;d like built</h3>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        A topic you&apos;re dreading, a chapter you want first, the kind of practice that&apos;d actually
        help — anything. You&apos;re shaping this.
      </p>
      <Textarea rows={3} className="mt-3" value={comment} onChange={(e) => setComment(e.target.value)}
        placeholder="e.g. Practice problems for revenue recognition would save my life" />
      <Button className="mt-3 font-bold text-white" style={{ background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)` }}
        disabled={busy || !comment.trim()} onClick={send}>
        {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</> : done ? "Send another" : "Send it to Lee"}
      </Button>
    </div>
  );
}

function NotifyToggle({ email }: { email: string }) {
  const [on, setOn] = useState(true);
  const toggle = async () => {
    const next = !on; setOn(next);
    if (next) {
      try { await capturePreviewTester({ email, source: "preview_tester" }); } catch { /* already on list */ }
    }
  };
  return (
    <div className="mt-6 flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <Bell className="h-5 w-5" style={{ color: NAVY }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: NAVY }}>Get notified when new content drops</p>
          <p className="text-xs text-gray-500">I&apos;ll email you the moment your chapters go live.</p>
        </div>
      </div>
      <button onClick={toggle} role="switch" aria-checked={on}
        className="relative h-7 w-12 rounded-full transition-colors"
        style={{ background: on ? RED : "#d1d5db" }}>
        <span className="absolute top-1 h-5 w-5 rounded-full bg-white transition-all" style={{ left: on ? 26 : 4 }} />
      </button>
    </div>
  );
}
