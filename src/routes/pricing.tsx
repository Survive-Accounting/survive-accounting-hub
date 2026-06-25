// /pricing — three-tier plans (materials = waitlist, 1-on-1 = live booking)
// + "how it works". No checkout. Materials capture into campus_waitlist.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Toaster } from "sonner";

import SiteNavbar from "@/components/landing/SiteNavbar";
import SiteFooter from "@/components/landing/SiteFooter";
import PricingPlans from "@/components/landing/PricingPlans";
import HowItWorks from "@/components/landing/HowItWorks";

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

      {/* How it works (shared component) */}
      <HowItWorks />

      <SiteFooter />
      <Toaster position="top-center" richColors />
    </div>
  );
}
