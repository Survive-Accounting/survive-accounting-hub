// /pricing — three-tier plans (materials = waitlist, 1-on-1 = live booking)
// + "how it works". No checkout. Materials capture into campus_waitlist.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { ListChecks, BookOpen, Target } from "lucide-react";

import SiteNavbar from "@/components/landing/SiteNavbar";
import SiteFooter from "@/components/landing/SiteFooter";
import PricingPlans from "@/components/landing/PricingPlans";

const NAVY = "#14213D";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Survive Accounting" },
      {
        name: "description",
        content:
          "Three ways to pass: a single-exam cram pass, a full semester membership, or premium 1-on-1 tutoring with Lee Ingram.",
      },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen" style={{ background: "#F8FAFC" }}>
      <SiteNavbar onBookTutoring={() => navigate({ to: "/onboard" })} />

      {/* Header */}
      <section className="px-4 pt-28 pb-10 text-center sm:pt-32">
        <h1 className="mx-auto max-w-2xl text-3xl font-bold leading-tight sm:text-4xl" style={{ color: NAVY }}>
          Pick the way you want to pass
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[15px] text-gray-600 sm:text-base">
          Materials are launching soon — get on the list. 1-on-1 tutoring with Lee is available now.
        </p>
      </section>

      {/* Plans */}
      <section className="px-4 pb-4">
        <div className="mx-auto max-w-6xl">
          <PricingPlans bookHref="/onboard" />
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold sm:text-3xl" style={{ color: NAVY }}>
            How it works
          </h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            <HowStep icon={<ListChecks className="h-6 w-6" />} n={1}
              title="Pick your plan"
              body="Test pass, semester membership, or 1-on-1." />
            <HowStep icon={<BookOpen className="h-6 w-6" />} n={2}
              title="Get your course's chapters"
              body="Matched to exactly what you're studying." />
            <HowStep icon={<Target className="h-6 w-6" />} n={3}
              title="Practice the real exam style"
              body={`The questions + explainers that fix "my exam looked nothing like."`} />
          </div>
        </div>
      </section>

      <SiteFooter />
      <Toaster position="top-center" richColors />
    </div>
  );
}

function HowStep({ icon, n, title, body }: {
  icon: React.ReactNode; n: number; title: string; body: string;
}) {
  return (
    <div className="text-center">
      <div className="mx-auto grid h-14 w-14 place-content-center rounded-2xl text-white" style={{ background: NAVY }}>
        {icon}
      </div>
      <div className="mt-4 text-xs font-bold uppercase tracking-wide text-gray-400">Step {n}</div>
      <h3 className="mt-1 text-lg font-semibold" style={{ color: NAVY }}>{title}</h3>
      <p className="mx-auto mt-2 max-w-xs text-sm text-gray-600">{body}</p>
    </div>
  );
}
