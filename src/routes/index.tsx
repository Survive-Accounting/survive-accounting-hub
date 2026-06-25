import { createFileRoute } from "@tanstack/react-router";
import { Toaster } from "sonner";

import Hero from "@/components/landing/Hero";
import Reviews from "@/components/landing/Reviews";
import ContactForm from "@/components/landing/ContactForm";
import SiteFooter from "@/components/landing/SiteFooter";
import PainHook from "@/components/landing/PainHook";
import SoulBand from "@/components/landing/SoulBand";
import DualWelcome from "@/components/landing/DualWelcome";
import HowItWorks from "@/components/landing/HowItWorks";
import PricingPlans from "@/components/landing/PricingPlans";
import FreeVideoCapture from "@/components/landing/FreeVideoCapture";
import BeyondTeaser from "@/components/landing/BeyondTeaser";

const NAVY = "#14213D";
const RED = "#CE1126";

const RED_BTN_CLASS =
  "hero-anim-btn group rounded-2xl px-8 py-4 text-[16px] font-bold text-white transition-all duration-200 hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0 inline-flex items-center justify-center gap-2";
const RED_BTN_STYLE: React.CSSProperties = {
  background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)`,
  fontFamily: "Inter, sans-serif",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), 0 14px 36px rgba(206,17,38,0.42)",
  textDecoration: "none",
};
const GHOST_BTN_CLASS =
  "hero-anim-btn rounded-2xl px-8 py-4 text-[16px] font-semibold transition-all duration-200 hover:bg-white/10 inline-flex items-center justify-center gap-2";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Survive Accounting — Survive it. Or learn to love it." },
      {
        name: "description",
        content:
          "Accounting tutoring from someone who actually does. 1-on-1 with Lee Ingram, plus free explainers and exam-style practice. Survive your course — or learn to love it.",
      },
      { property: "og:title", content: "Survive Accounting" },
      { property: "og:description", content: "Accounting tutoring from someone who actually does." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Home,
});

function HeroCta() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <a href="/onboard" className={RED_BTN_CLASS} style={RED_BTN_STYLE}>
          <span style={{ fontWeight: 800 }}>Book a session</span>
          <span className="transition-transform group-hover:translate-x-0.5">→</span>
        </a>
        <a
          href="#free-videos"
          className={GHOST_BTN_CLASS}
          style={{ color: "white", border: "1px solid rgba(255,255,255,0.28)", textDecoration: "none" }}
        >
          Get free explainers
        </a>
      </div>
      <p className="text-[12.5px]" style={{ color: "rgba(255,255,255,0.7)", fontFamily: "Inter, sans-serif" }}>
        1,000+ students helped since 2015 · 1-on-1 spots open now
      </p>
    </div>
  );
}

function Home() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F8FAFC" }}>
      <Hero
        headline="Survive it. Or learn to love it."
        subtext="Accounting tutoring from someone who actually does."
        ctaSlot={<HeroCta />}
      />

      <PainHook />
      <SoulBand />
      <DualWelcome />
      <Reviews />
      <HowItWorks />

      {/* The three plans (reused on /pricing too) */}
      <section className="px-4 py-16 sm:py-20" style={{ background: "#F8FAFC" }}>
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-2xl font-bold sm:text-3xl" style={{ color: NAVY }}>
            Pick the way you want to pass
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-[15px] text-gray-600">
            Materials are launching soon — get on the list. 1-on-1 with Lee is available now.
          </p>
          <div className="mt-10">
            <PricingPlans bookHref="/onboard" />
          </div>
        </div>
      </section>

      <FreeVideoCapture />
      <BeyondTeaser />
      <ContactForm />

      <SiteFooter />
      <Toaster position="top-center" richColors />
    </div>
  );
}
