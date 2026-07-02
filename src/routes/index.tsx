import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Toaster } from "sonner";

import Hero from "@/components/landing/Hero";
import Reviews from "@/components/landing/Reviews";
import ContactForm from "@/components/landing/ContactForm";
import SiteFooter from "@/components/landing/SiteFooter";
import PainHook from "@/components/landing/PainHook";
import { Reveal } from "@/components/landing/Reveal";
import { getSiteSettings } from "@/lib/site-settings.functions";

const NAVY = "#14213D";
const RED = "#CE1126";
const LOGO_URL = "https://lwfiles.mycourse.app/672bc379cd024d536f651ecc-public/1554d231f0e2bf121ac35937c4d438ca.png";

const RED_BTN_CLASS =
  "hero-anim-btn group rounded-2xl px-8 py-4 text-[16px] font-bold text-white transition-all duration-200 hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0 inline-flex items-center justify-center gap-2";
const RED_BTN_STYLE: React.CSSProperties = {
  background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)`,
  fontFamily: "Inter, sans-serif",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), 0 14px 36px rgba(206,17,38,0.42)",
  textDecoration: "none",
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Survive Accounting — Videos for accounting exam prep" },
      {
        name: "description",
        content:
          "Send Lee your toughest homework problems, review sheets, or exam topics. Get a custom help video with notes and exam prep tips — made for your exact course. Free to request.",
      },
      { property: "og:title", content: "Survive Accounting — Videos for accounting exam prep" },
      { property: "og:description", content: "Custom help videos for your accounting exam — made for what you're stuck on." },
      { property: "og:type", content: "website" },
    ],
  }),
  loader: () => getSiteSettings(),
  component: Home,
});

function HeroCta() {
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <a href="/order" className={RED_BTN_CLASS} style={RED_BTN_STYLE}>
          <span style={{ fontWeight: 800 }}>Get Started</span>
          <span className="transition-transform group-hover:translate-x-0.5">→</span>
        </a>
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className="text-[12.5px]" style={{ color: "rgba(255,255,255,0.65)", fontFamily: "Inter, sans-serif" }}>
          Covering Intro &amp; Intermediate Accounting
        </p>
      </div>
    </div>
  );
}

// Sticky top navbar (homepage only). Left: wordmark. Right: "How it works" link only.
// Condenses subtly on scroll.
function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // One source of truth: "How it works" smooth-scrolls to the #how-it-works section on /.
  const goToHowItWorks = (e: React.MouseEvent) => {
    if (typeof document === "undefined") return;
    const el = document.getElementById("how-it-works");
    if (el) { e.preventDefault(); el.scrollIntoView({ behavior: "smooth", block: "start" }); }
  };
  return (
    <header
      className="sticky top-0 z-50 w-full border-b transition-shadow duration-300"
      style={{
        background: "linear-gradient(180deg, rgba(20,33,61,0.98) 0%, rgba(16,26,49,0.98) 100%)",
        borderColor: "rgba(255,255,255,0.08)",
        boxShadow: scrolled
          ? "0 8px 26px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.04) inset"
          : "0 4px 16px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.04) inset",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        className={`mx-auto flex w-full max-w-6xl items-center px-4 transition-all duration-300 sm:px-6 ${
          scrolled ? "h-12 sm:h-14" : "h-14 sm:h-16"
        }`}
      >
        <a href="/" aria-label="Survive Accounting — home" className="inline-flex items-center">
          <img
            src={LOGO_URL}
            alt="Survive Accounting"
            className={`w-auto select-none transition-all duration-300 ${scrolled ? "h-[18px] sm:h-5" : "h-5 sm:h-[22px]"}`}
            draggable={false}
          />
        </a>
        <nav className="ml-auto flex items-center gap-1.5 sm:gap-3">
          <a
            href="/#how-it-works"
            onClick={goToHowItWorks}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:text-white sm:text-[15px]"
          >
            How it works
          </a>
        </nav>
      </div>
    </header>
  );
}

function Home() {
  const settings = Route.useLoaderData();
  const s = settings.sections;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F8FAFC" }}>
      <SiteNav />
      {s.hero && (
        <Hero
          headline="Need help with exam prep?"
          subtext="Get help from a real tutor. Tell me what's coming up on your test. I'll send videos back that help you cram before your exam."
          ctaSlot={<HeroCta />}
        />
      )}

      {/* Social proof: testimonials — right under the hero. */}
      <Reviews />

      {s.painHook && <PainHook />}

      {/* How it works. Nav "How it works" anchors here. */}
      <section id="how-it-works" className="scroll-mt-20 px-4 py-16 sm:py-20" style={{ background: "#FFFFFF" }}>
        <Reveal className="mx-auto max-w-5xl">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: RED }}>
            How it works
          </p>
          <h2 className="mx-auto mt-2 max-w-2xl text-center text-2xl font-bold tracking-tight sm:text-3xl" style={{ color: NAVY }}>
            Get help videos made for what&apos;s on your test.
          </h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {[
              { n: 1, title: "Send it", body: "Tell me what you're stuck on. Homework problem, review sheet, chapter, exam topic — whatever you've got." },
              { n: 2, title: "Get a gameplan", body: "I'll reply in 1 business day with what I'll make, what it costs, and how you'll benefit." },
              { n: 3, title: "You approve, I build", body: "Approve the gameplan, and I'll deliver it before your exam. You only pay after it's sent." },
            ].map((step) => (
              <div key={step.n} className="text-center">
                <div className="mx-auto grid h-12 w-12 place-content-center rounded-full text-[17px] font-bold text-white" style={{ background: NAVY }}>
                  {step.n}
                </div>
                <h3 className="mt-4 text-lg font-semibold" style={{ color: NAVY }}>{step.title}</h3>
                <p className="mx-auto mt-2 max-w-xs text-[14.5px] leading-relaxed text-gray-600">{step.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <a
              href="/order"
              className="inline-flex items-center justify-center gap-2 rounded-2xl px-8 py-3.5 text-[15px] font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110"
              style={{ background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)`, boxShadow: "0 10px 28px rgba(206,17,38,0.35)" }}
            >
              Get Started <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </a>
          </div>
        </Reveal>
      </section>

      {s.questions && <ContactForm />}

      <SiteFooter />
      <Toaster position="top-center" richColors />
    </div>
  );
}
