// /careers — Lee, 2026-09-05: "the jobs page I wanna build. Just put it in the footer and
// advertise it a little, send it to people." Four roles with a real job-description shape
// (what you'll do, who we're looking for, compensation) plus Campus Rep, which hands off to the
// existing /rep/join flow instead of duplicating it. One shared application form; picking
// "Apply" on a card scrolls down and pre-selects that role.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";

import SiteNavbar from "@/components/landing/SiteNavbar";
import SiteFooter from "@/components/landing/SiteFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { uploadResume } from "@/components/ideas/upload";
import { submitJobApplication, type JobRole } from "@/lib/careers.functions";

export const Route = createFileRoute("/careers")({
  head: () => ({
    meta: [
      { title: "Careers — Survive Accounting" },
      { name: "description", content: "Help build Survive Accounting from the ground floor — tutor content creators, campus marketing, and operations." },
    ],
    links: [{ rel: "canonical", href: "https://surviveaccounting.com/careers" }],
  }),
  component: CareersPage,
});

interface RoleDef {
  key: JobRole;
  title: string;
  hook: string;
  responsibilities: string[];
  looking: string[];
  comp: string;
  note?: string;
}

const ROLES: RoleDef[] = [
  {
    key: "tutor-content-creator",
    title: "Tutor Content Creator",
    hook: "Teach your subject the Survive way — short, punchy videos built to actually get watched, not skipped.",
    responsibilities: [
      "Film short-form lesson content in your subject, using Survive's own filming and editing tools",
      "Turn exam-style questions into scannable, quick-hit videos",
      "Pick your own subject line — accounting is where we started, but organic chemistry, finance, and statistics are open, and if it's something else entirely, tell us what you'd teach",
    ],
    looking: [
      "You know a subject well enough to teach it",
      "Comfortable on camera, or willing to get comfortable — no on-camera experience required",
      "Self-directed: this is a build-your-own-content role, not a script-reading one",
    ],
    comp: "Compensation negotiated up front, and/or a royalty on what you build. We're flexible here — tell us what structure makes sense for you.",
    note: "This one doesn't start until Summer 2027. No rush — we're just finding out who's interested.",
  },
  {
    key: "national-campaign-manager",
    title: "National Campaign Manager",
    hook: "Run the campus rep program nationally — recruiting, campaigns, and the people who carry Survive Accounting onto campus.",
    responsibilities: [
      "Own the campus rep program end to end: recruiting reps, running campaigns, tracking what's actually working",
      "Build and lead marketing pushes across schools",
      "Work directly with Lee to set strategy, then go execute it",
    ],
    looking: [
      "Experience running people or campaigns, or genuinely ready to step into it",
      "Comfortable managing a distributed team spread across different schools",
    ],
    comp: "Negotiated, likely with a commission tied to growth — the specifics get worked out directly.",
  },
  {
    key: "operations-lead",
    title: "Operations Manager",
    hook: "Help me delegate, build real processes, and get this ready to scale — we're about to bring on a wave of campus reps.",
    responsibilities: [
      "Work directly with Lee to figure out what should be delegated, and to whom",
      "Build the processes and systems that connect everything else, as the team grows past one person doing it all",
      "A separate seat from the existing VA management, on purpose — not a gap, a deliberate split so the same person isn't managing both sides",
    ],
    looking: [
      "Organized, process-minded, comfortable asking \"why do we do it this way\"",
      "No specific background required — this is about how you think, not a checklist",
    ],
    comp: "Negotiated directly with Lee.",
  },
  // "Platform Engineer" removed for now (Lee, 2026-09-05) — may come back later.
];

const ROLE_LABEL: Record<JobRole, string> = {
  "tutor-content-creator": "Tutor Content Creator",
  "national-campaign-manager": "National Campaign Manager",
  "operations-lead": "Operations Manager",
  other: "Other",
};

function CareersPage() {
  const [role, setRole] = useState<JobRole>("tutor-content-creator");
  const formRef = useRef<HTMLDivElement>(null);
  const applyFor = (r: JobRole) => {
    setRole(r);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteNavbar />

      <section className="mx-auto max-w-2xl px-6 pb-10 pt-16 text-center">
        <h1 className="font-sans text-4xl font-bold tracking-tight text-foreground text-balance">Build this with us</h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          Survive Accounting is early and growing fast. We're looking for a handful of people to help build it —
          not a big company, a small team with real ownership of what they touch.
        </p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Here's the honest part: we can't pay most of these roles right now. Survive Accounting is
          self-funded, and we're looking at raising in 2027 if we aren't already generating steady
          revenue by then. What's on offer instead is a real seat at an early-stage company with a lot
          of room to grow into — for several of these, think of it like an internship: get in on the
          ground floor of something with real potential. Students are genuinely welcome to apply.
        </p>
      </section>

      <section className="mx-auto max-w-2xl space-y-5 px-6 pb-16">
        {ROLES.map((r) => (
          <RoleCard key={r.key} role={r} onApply={() => applyFor(r.key)} />
        ))}

        {/* CAMPUS REP — the existing, already-built application flow; not duplicated here. */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-sans text-xl font-semibold text-foreground">Campus Rep</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Represent Survive Accounting on your own campus — the rep program has its own application
            and dashboard already.
          </p>
          <Button asChild className="mt-4">
            <Link to="/rep/join">Apply to be a Campus Rep →</Link>
          </Button>
        </div>
      </section>

      <section ref={formRef} className="border-t border-border bg-muted/30 py-16">
        <div className="mx-auto max-w-xl px-6">
          <h2 className="font-sans text-2xl font-bold text-foreground">Apply</h2>
          <p className="mt-2 text-sm text-muted-foreground">A résumé helps but isn't required — a few lines about why you're interested goes a long way.</p>
          <ApplyForm role={role} onRoleChange={setRole} />
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function RoleCard({ role, onApply }: { role: RoleDef; onApply: () => void }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="font-sans text-xl font-semibold text-foreground">{role.title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{role.hook}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What you'll do</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm leading-snug text-foreground/90">
            {role.responsibilities.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Who we're looking for</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm leading-snug text-foreground/90">
            {role.looking.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-muted/50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Compensation</p>
        <p className="mt-1 text-sm leading-relaxed text-foreground/90">{role.comp}</p>
      </div>
      {role.note && <p className="mt-3 text-xs italic text-muted-foreground">{role.note}</p>}

      <Button onClick={onApply} className="mt-4">Apply for this role</Button>
    </div>
  );
}

function ApplyForm({ role, onRoleChange }: { role: JobRole; onRoleChange: (r: JobRole) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [why, setWhy] = useState("");
  const [notes, setNotes] = useState("");
  const [resume, setResume] = useState<{ url: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const addResume = async (file: File) => {
    setUploading(true); setErr(null);
    try { const a = await uploadResume(file); setResume({ url: a.url, name: a.name }); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setUploading(false); }
  };

  const submit = async () => {
    if (!name.trim() || !email.trim()) { setErr("Your name and email first."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await submitJobApplication({ data: {
        role, name: name.trim(), email: email.trim(),
        subject: role === "tutor-content-creator" ? (subject.trim() || null) : null,
        why: why.trim() || null, notes: notes.trim() || null,
        resumeUrl: resume?.url ?? null, resumeName: resume?.name ?? null,
      } });
      if (!r.ok) { setErr(r.error ?? "Something went wrong — try again."); return; }
      setDone(true);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="mt-6 rounded-2xl border border-border bg-card p-6 text-sm leading-relaxed text-foreground">
        Got it — thank you. Lee reads these himself and will reach out directly if it's a fit.
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <div>
        <Label htmlFor="role">Which role?</Label>
        <Select value={role} onValueChange={(v) => onRoleChange(v as JobRole)}>
          <SelectTrigger id="role" className="mt-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(ROLE_LABEL) as JobRole[]).filter((k) => k !== "other").map((k) => (
              <SelectItem key={k} value={k}>{ROLE_LABEL[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" className="mt-1.5" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
      {role === "tutor-content-creator" && (
        <div>
          <Label htmlFor="subject">What subject would you teach?</Label>
          <Input id="subject" className="mt-1.5" placeholder="e.g. organic chemistry, finance, statistics — write in your own" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
      )}
      <div>
        <Label htmlFor="why">Why does this role interest you?</Label>
        <Textarea id="why" className="mt-1.5" rows={3} value={why} onChange={(e) => setWhy(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="notes">Anything else we should know? (optional)</Label>
        <Textarea id="notes" className="mt-1.5" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div>
        <Label>Résumé (optional)</Label>
        <div className="mt-1.5 flex items-center gap-3">
          <input type="file" accept=".pdf,.doc,.docx,image/*" className="hidden" id="resume-file"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void addResume(f); e.target.value = ""; }} />
          <Button type="button" variant="outline" disabled={uploading} onClick={() => document.getElementById("resume-file")?.click()}>
            {uploading ? "Uploading…" : resume ? "Replace résumé" : "Attach résumé"}
          </Button>
          {resume && <span className="text-sm text-muted-foreground">{resume.name}</span>}
        </div>
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Button onClick={() => void submit()} disabled={busy || uploading} className="w-full sm:w-auto">
        {busy ? "Sending…" : "Send application"}
      </Button>
    </div>
  );
}
