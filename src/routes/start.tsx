// /start — where texted students land: a slick campus search that routes to
// the campus page, with a waitlist form for campuses not in the system yet.
// Kept human: waitlist submissions go straight to Lee, no automation.
import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, GraduationCap, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";

const NAVY = "#14213D";
const RED = "#CE1126";

export const Route = createFileRoute("/start")({
  head: () => ({
    meta: [
      { title: "Find Your Campus — Survive Accounting" },
      { name: "description", content: "Pick your school to see how Lee can help with your accounting course." },
    ],
  }),
  component: StartPage,
});

interface CampusOption { id: string; name: string; slug: string; state: string | null }

async function fetchSelectableCampuses(): Promise<CampusOption[]> {
  const { data, error } = await supabase
    .from("campuses")
    .select("id,name,slug,state,approval_status,archived_at")
    .eq("approval_status", "approved")
    .is("archived_at", null)
    .order("name");
  if (error) throw error;
  return (data ?? [])
    .filter((c: any) => c.slug)
    .map((c: any) => ({ id: c.id, name: c.name ?? "", slug: c.slug, state: c.state ?? null }));
}

function StartPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [showWaitlist, setShowWaitlist] = useState(false);
  const campusesQuery = useQuery({ queryKey: ["selectable-campuses"], queryFn: fetchSelectableCampuses, retry: 1 });

  const campuses = campusesQuery.data ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return campuses.slice(0, 8);
    return campuses
      .filter((c) => c.name.toLowerCase().includes(q) || (c.state ?? "").toLowerCase() === q)
      .slice(0, 8);
  }, [campuses, query]);

  const noMatches = query.trim().length > 1 && filtered.length === 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Eyebrow */}
      <div style={{ background: NAVY }} className="px-4 py-2.5 text-center">
        <span className="font-sans text-[12px] font-bold uppercase tracking-[0.14em] text-white">
          <span aria-hidden className="mr-2 inline-block h-[7px] w-[7px] rounded-full align-middle" style={{ background: RED }} />
          Survive<span className="opacity-70">Accounting</span>
        </span>
      </div>

      <div className="mx-auto max-w-xl px-5 py-10 sm:py-14">
        <div className="text-center">
          <GraduationCap className="mx-auto h-8 w-8" style={{ color: NAVY }} />
          <h1 className="mt-3 font-sans text-2xl font-bold tracking-tight sm:text-3xl">
            What school are you at?
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick your campus and I'll show you exactly how I can help with your accounting course.
          </p>
        </div>

        <div className="relative mt-6">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowWaitlist(false); }}
            placeholder="Start typing — e.g. Ole Miss, Auburn…"
            className="h-12 pl-9 text-base"
          />
        </div>

        {campusesQuery.isLoading ? (
          <div className="mt-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="mt-4 space-y-2">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate({ to: "/outreach/school/$slug", params: { slug: c.slug }, search: { src: "start" } as never })}
                className="group flex w-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition hover:border-[#14213D]/40 hover:bg-muted/40"
              >
                <span className="text-sm font-semibold">{c.name}</span>
                {c.state && <span className="text-xs text-muted-foreground">{c.state}</span>}
                <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" style={{ color: undefined }} />
              </button>
            ))}
          </div>
        )}

        {/* Not seeing your campus */}
        <div className="mt-6 text-center">
          {!showWaitlist && (
            <button
              onClick={() => setShowWaitlist(true)}
              className="text-sm text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground"
            >
              {noMatches ? "Can't find your school? I can still help →" : "Not seeing your campus?"}
            </button>
          )}
        </div>

        {(showWaitlist || noMatches) && <WaitlistForm prefillCampus={noMatches ? query.trim() : ""} />}
      </div>
    </div>
  );
}

function WaitlistForm({ prefillCampus }: { prefillCampus: string }) {
  const [form, setForm] = useState({
    name: "", email: "", phone: "", campus_text: prefillCampus, course_text: "",
    wants_text: true, wants_call: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    const email = form.email.trim();
    if (!email || !/.+@.+\..+/.test(email)) { toast.error("A valid email is required"); return; }
    setSubmitting(true);
    const { error } = await (supabase.from("campus_waitlist" as never) as any).insert({
      name: form.name.trim() || null,
      email,
      phone: form.phone.trim() || null,
      campus_text: form.campus_text.trim() || null,
      course_text: form.course_text.trim() || null,
      wants_text: form.wants_text,
      wants_call: form.wants_call,
      source: "start_page",
    });
    setSubmitting(false);
    if (error) { toast.error("Something went wrong — try again?"); return; }
    setDone(true);
  };

  if (done) {
    return (
      <div className="mt-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-5 text-center">
        <div className="text-sm font-semibold">Got it — I'll reach out personally. 🤝</div>
        <p className="mt-1 text-xs text-muted-foreground">
          I read every one of these myself. Expect to hear from me soon{form.wants_text && form.phone ? " by text" : ""}.
          — Lee
        </p>
      </div>
    );
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="mt-4 rounded-lg border border-border bg-card p-5">
      <div className="text-sm font-semibold">Tell me where you are — I'll reach out personally.</div>
      <div className="mt-3 grid gap-2.5">
        <Input placeholder="Your name" value={form.name} onChange={set("name")} className="h-10" />
        <Input placeholder="Email (required)" type="email" value={form.email} onChange={set("email")} className="h-10" />
        <Input placeholder="Phone (optional)" type="tel" value={form.phone} onChange={set("phone")} className="h-10" />
        <div className="grid grid-cols-2 gap-2.5">
          <Input placeholder="Your school" value={form.campus_text} onChange={set("campus_text")} className="h-10" />
          <Input placeholder="Course (e.g. ACC 201)" value={form.course_text} onChange={set("course_text")} className="h-10" />
        </div>
        <div className="flex items-center gap-5 pt-1">
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={form.wants_text} onCheckedChange={(v) => setForm((f) => ({ ...f, wants_text: !!v }))} />
            Text me back
          </label>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={form.wants_call} onCheckedChange={(v) => setForm((f) => ({ ...f, wants_call: !!v }))} />
            Call me back
          </label>
        </div>
        <Button onClick={submit} disabled={submitting} className="mt-1 h-10" style={{ background: NAVY }}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Send to Lee
        </Button>
      </div>
    </div>
  );
}
