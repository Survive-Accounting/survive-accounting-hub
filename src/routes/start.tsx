// /start — where texted students land. Same homepage UI (hero, reviews,
// contact, footer), with the campus search as the hero CTA.
import { useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2, Search } from "lucide-react";
import { Toaster, toast } from "sonner";

import SiteNavbar from "@/components/landing/SiteNavbar";
import Hero from "@/components/landing/Hero";
import Reviews from "@/components/landing/Reviews";
import ContactForm from "@/components/landing/ContactForm";
import SiteFooter from "@/components/landing/SiteFooter";
import BookTutoringModal from "@/components/landing/BookTutoringModal";
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

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

function StartPage() {
  const [bookOpen, setBookOpen] = useState(false);
  return (
    <div className="min-h-screen bg-background">
      <SiteNavbar />
      <Hero
        headline="Need Help in Accounting?"
        subtext="Pick your campus and I'll show you exactly how I can help with your course."
        ctaSlot={<CampusSearch />}
      />
      <Reviews />
      <ContactForm />
      <SiteFooter
        onScrollToContact={() => scrollToId("contact-form")}
        onScrollToReviews={() => scrollToId("reviews-section")}
        onBookTutoring={() => setBookOpen(true)}
      />
      <BookTutoringModal open={bookOpen} onOpenChange={setBookOpen} />
      <Toaster position="top-center" richColors />
    </div>
  );
}

function CampusSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [showWaitlist, setShowWaitlist] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const campusesQuery = useQuery({ queryKey: ["selectable-campuses"], queryFn: fetchSelectableCampuses, retry: 1 });

  const campuses = campusesQuery.data ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return campuses
      .filter((c) => c.name.toLowerCase().includes(q) || (c.state ?? "").toLowerCase() === q)
      .slice(0, 6);
  }, [campuses, query]);

  const typed = query.trim().length > 1;
  const noMatches = typed && filtered.length === 0;
  const open = (typed && filtered.length > 0) || showWaitlist || noMatches;

  return (
    <div ref={boxRef} className="hero-anim-btn relative w-full" style={{ maxWidth: 480 }}>
      <div
        className="flex items-center gap-2 rounded-xl bg-white px-4 transition-shadow"
        style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6), 0 10px 28px rgba(0,0,0,0.28)" }}
      >
        <Search className="h-4 w-4 shrink-0" style={{ color: NAVY }} />
        <input
          autoFocus
          value={query}
          onChange={(e) => { setQuery(e.target.value); setShowWaitlist(false); }}
          placeholder="Start typing your school — e.g. Ole Miss…"
          className="h-[56px] w-full bg-transparent text-[16px] outline-none placeholder:text-gray-400"
          style={{ fontFamily: "Inter, sans-serif", color: "#111827" }}
        />
        {campusesQuery.isLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
      </div>

      {!showWaitlist && (
        <button
          onClick={() => setShowWaitlist(true)}
          className="mt-3 text-[13px] underline decoration-white/40 underline-offset-2 transition hover:decoration-white"
          style={{ color: "rgba(255,255,255,0.78)", fontFamily: "Inter, sans-serif" }}
        >
          Not seeing your campus?
        </button>
      )}

      {open && (
        <div
          className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-xl bg-white text-left"
          style={{ boxShadow: "0 18px 50px rgba(0,0,0,0.35)" }}
        >
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() =>
                navigate({ to: "/outreach/school/$slug", params: { slug: c.slug }, search: { src: "start" } as never })
              }
              className="group flex w-full items-center gap-2 border-b border-gray-100 px-4 py-3 text-left transition hover:bg-gray-50"
            >
              <span className="text-[15px] font-semibold" style={{ color: "#111827", fontFamily: "Inter, sans-serif" }}>
                {c.name}
              </span>
              {c.state && <span className="text-xs text-gray-400">{c.state}</span>}
              <ChevronRight className="ml-auto h-4 w-4 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-gray-500" />
            </button>
          ))}
          {(noMatches || showWaitlist) && (
            <WaitlistForm prefillCampus={noMatches ? query.trim() : ""} />
          )}
        </div>
      )}
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
      campus_text: (form.campus_text || prefillCampus).trim() || null,
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
      <div className="p-5 text-center">
        <div className="text-sm font-semibold" style={{ color: "#111827" }}>Got it — I'll reach out personally. 🤝</div>
        <p className="mt-1 text-xs text-gray-500">
          I read every one of these myself. Expect to hear from me soon{form.wants_text && form.phone ? " by text" : ""}. — Lee
        </p>
      </div>
    );
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="p-4 text-left" style={{ fontFamily: "Inter, sans-serif" }}>
      <div className="text-sm font-semibold" style={{ color: "#111827" }}>
        Tell me where you are — I'll reach out personally.
      </div>
      <div className="mt-3 grid gap-2">
        <Input placeholder="Your name" value={form.name} onChange={set("name")} className="h-10 bg-white text-gray-900" />
        <Input placeholder="Email (required)" type="email" value={form.email} onChange={set("email")} className="h-10 bg-white text-gray-900" />
        <Input placeholder="Phone (optional)" type="tel" value={form.phone} onChange={set("phone")} className="h-10 bg-white text-gray-900" />
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Your school" value={form.campus_text} onChange={set("campus_text")} className="h-10 bg-white text-gray-900" />
          <Input placeholder="Course (e.g. ACC 201)" value={form.course_text} onChange={set("course_text")} className="h-10 bg-white text-gray-900" />
        </div>
        <div className="flex items-center gap-5 pt-1">
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <Checkbox checked={form.wants_text} onCheckedChange={(v) => setForm((f) => ({ ...f, wants_text: !!v }))} />
            Text me back
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <Checkbox checked={form.wants_call} onCheckedChange={(v) => setForm((f) => ({ ...f, wants_call: !!v }))} />
            Call me back
          </label>
        </div>
        <Button onClick={submit} disabled={submitting} className="mt-1 h-10 font-bold text-white" style={{ background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)` }}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Send to Lee →
        </Button>
      </div>
    </div>
  );
}
