import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Toaster } from "sonner";

import Hero from "@/components/landing/Hero";
import Reviews from "@/components/landing/Reviews";
import ContactForm from "@/components/landing/ContactForm";
import SiteFooter from "@/components/landing/SiteFooter";
import PainHook from "@/components/landing/PainHook";
import SoulBand from "@/components/landing/SoulBand";
import DualWelcome from "@/components/landing/DualWelcome";
import PricingPlans from "@/components/landing/PricingPlans";
import FreeVideoCapture from "@/components/landing/FreeVideoCapture";
import BeyondTeaser from "@/components/landing/BeyondTeaser";
import { getSiteSettings, type SiteSettings } from "@/lib/site-settings.functions";

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
      { title: "Survive Accounting — Survive it. Or learn to love it." },
      {
        name: "description",
        content:
          "Accounting tutoring from someone who actually loves it. 1-on-1 with Lee Ingram, plus exam-style practice. Survive your course — or learn to love it.",
      },
      { property: "og:title", content: "Survive Accounting" },
      { property: "og:description", content: "Accounting tutoring from someone who actually loves it." },
      { property: "og:type", content: "website" },
    ],
  }),
  loader: () => getSiteSettings(),
  component: Home,
});

/** Host-agnostic: turn a YouTube/Vimeo URL or bare YouTube ID into an embeddable src. */
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

function HeroCta() {
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <a href="/onboard" className={RED_BTN_CLASS} style={RED_BTN_STYLE}>
          <span style={{ fontWeight: 800 }}>Get started</span>
          <span className="transition-transform group-hover:translate-x-0.5">→</span>
        </a>
      </div>
      <p className="text-[12.5px]" style={{ color: "rgba(255,255,255,0.7)", fontFamily: "Inter, sans-serif" }}>
        1,000+ students helped since 2015 · Intro &amp; Intermediate Accounting
      </p>
    </div>
  );
}

/** Intro video — a framed player (replaces the old "How it works" section).
 *  Wired to the existing /outreach/landing hero-video field (settings.introVideo).
 *  Gracefully hidden if no URL is set. */
function IntroVideoSection({ settings }: { settings: SiteSettings }) {
  const embed = toEmbedSrc(settings.introVideo.url);
  if (!embed) return null;
  return (
    <section className="px-4 py-14 sm:py-20" style={{ background: "#FFFFFF" }}>
      <div className="mx-auto max-w-3xl">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: RED }}>
          Watch: why I do this
        </p>
        <div className="mt-5 overflow-hidden rounded-3xl border shadow-[0_24px_70px_-30px_rgba(20,33,61,0.55)]"
          style={{ borderColor: "rgba(20,33,61,0.10)" }}>
          <div className="relative aspect-video bg-black/40">
            <iframe
              src={embed}
              title="Watch Lee's intro"
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/** "As featured in" press strip — understated credibility band. */
function PressBar() {
  const outlets = ["Oxford Eagle", "Innovate Mississippi", "The Daily Mississippian", "Magee News"];
  return (
    <section className="border-b px-4 py-6" style={{ background: "#FFFFFF", borderColor: "rgba(20,33,61,0.07)" }}>
      <div className="mx-auto max-w-5xl">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
          As featured in
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
          {outlets.map((o) => (
            <span key={o} className="text-sm font-semibold tracking-tight text-gray-500 sm:text-[15px]">
              {o}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// Sticky top navbar (homepage only). Left: wordmark. Right: Pricing link +
// "Sign Up" (same destination as the hero "Get started" CTA → /onboard).
// Condenses subtly on scroll.
function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
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
            href="/pricing"
            className="rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:text-white sm:text-[15px]"
          >
            Pricing
          </a>
          <a
            href="/onboard"
            className="rounded-xl px-3.5 py-2 text-sm font-bold text-white no-underline transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 sm:px-5 sm:text-[15px]"
            style={{
              background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)`,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 22px rgba(206,17,38,0.36)",
            }}
          >
            Sign Up
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
          headline="Survive it. Or learn to love it."
          subtext="Accounting tutoring from someone who genuinely loves it — and teaches it like a normal person."
          ctaSlot={<HeroCta />}
        />
      )}

      <PressBar />
      <IntroVideoSection settings={settings} />

      {s.painHook && <PainHook />}
      {s.whoIAm && <SoulBand />}
      {/* Reviews follow Lee's story — social proof lands while the personal
          connection is high, before audiences self-sort in Dual welcome. */}
      <Reviews />
      {s.dualWelcome && <DualWelcome />}

      {s.plans && (
        <section id="plans" className="scroll-mt-20 px-4 py-16 sm:py-20" style={{ background: "#F8FAFC" }}>
          <div className="mx-auto max-w-6xl">
            <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl" style={{ color: NAVY }}>
              Pick the way you want to prep
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-[15px] text-gray-600">
              Practice exams + videos coming soon. 1-on-1 with me is open now.
            </p>
            <div className="mt-10">
              <PricingPlans bookHref="/onboard" />
            </div>
          </div>
        </section>
      )}

      {s.freeExplainers && <FreeVideoCapture />}
      {s.beyondExam && <BeyondTeaser />}
      {s.questions && <ContactForm />}

      <SiteFooter />
      <Toaster position="top-center" richColors />
    </div>
  );
}
