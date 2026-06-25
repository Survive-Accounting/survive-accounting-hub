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
const GHOST_BTN_CLASS =
  "hero-anim-btn rounded-2xl px-8 py-4 text-[16px] font-semibold transition-all duration-200 hover:bg-white/10 inline-flex items-center justify-center gap-2";

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

function HeroCta({ settings }: { settings: SiteSettings }) {
  const embed = settings.introVideo.show ? toEmbedSrc(settings.introVideo.url) : null;
  const showFreeExplainers = settings.sections.freeExplainers;
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <a href="/onboard" className={RED_BTN_CLASS} style={RED_BTN_STYLE}>
          <span style={{ fontWeight: 800 }}>Book a session</span>
          <span className="transition-transform group-hover:translate-x-0.5">→</span>
        </a>
        {showFreeExplainers && (
          <a href="#free-videos" className={GHOST_BTN_CLASS}
            style={{ color: "white", border: "1px solid rgba(255,255,255,0.28)", textDecoration: "none" }}>
            Get free explainers
          </a>
        )}
      </div>
      <p className="text-[12.5px]" style={{ color: "rgba(255,255,255,0.7)", fontFamily: "Inter, sans-serif" }}>
        1,000+ students helped since 2015 · Only 10 hours a week
      </p>
      {embed && (
        <div className="mt-4 w-full max-w-xl overflow-hidden rounded-2xl border border-white/15 shadow-2xl">
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
      )}
    </div>
  );
}

// Sticky top navbar (homepage only). Left: wordmark. Right: Pricing + the
// waitlist-first CTA. "Join the Waitlist" scrolls to the plans + capture
// section (#plans); if that section is toggled off, it falls back to /pricing.
function SiteNav() {
  const goToPlans = () => {
    if (typeof document === "undefined") return;
    const el = document.getElementById("plans");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    else window.location.href = "/pricing";
  };
  return (
    <header
      className="sticky top-0 z-50 w-full border-b"
      style={{
        background: "linear-gradient(180deg, rgba(20,33,61,0.98) 0%, rgba(16,26,49,0.98) 100%)",
        borderColor: "rgba(255,255,255,0.08)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.22), 0 1px 0 rgba(255,255,255,0.04) inset",
        backdropFilter: "blur(8px)",
      }}
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center px-4 sm:h-16 sm:px-6">
        <a href="/" aria-label="Survive Accounting — home" className="inline-flex items-center">
          <img src={LOGO_URL} alt="Survive Accounting" className="h-5 w-auto select-none sm:h-[22px]" draggable={false} />
        </a>
        <nav className="ml-auto flex items-center gap-1.5 sm:gap-3">
          <a
            href="/pricing"
            className="rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:text-white sm:text-[15px]"
          >
            Pricing
          </a>
          <button
            type="button"
            onClick={goToPlans}
            className="rounded-xl px-3.5 py-2 text-sm font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 sm:px-5 sm:text-[15px]"
            style={{
              background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)`,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 22px rgba(206,17,38,0.36)",
            }}
          >
            Join the Waitlist
          </button>
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
          subtext="Accounting tutoring from someone who actually loves it."
          ctaSlot={<HeroCta settings={settings} />}
        />
      )}

      {s.painHook && <PainHook />}
      {s.whoIAm && <SoulBand />}
      {/* GLM design pass: Reviews moved up to follow Lee's story — social proof
          lands while the personal connection is high, before audiences self-sort
          in Dual welcome. Easy to revert by moving <Reviews /> back below it. */}
      <Reviews />
      {s.dualWelcome && <DualWelcome />}
      {s.howItWorks && <HowItWorks />}

      {s.plans && (
        <section id="plans" className="scroll-mt-20 px-4 py-16 sm:py-20" style={{ background: "#F8FAFC" }}>
          <div className="mx-auto max-w-6xl">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "rgba(20,33,61,0.55)" }}>
              Plans
            </p>
            <h2 className="mt-2 text-center text-2xl font-bold tracking-tight sm:text-3xl" style={{ color: NAVY }}>
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
      )}

      {s.freeExplainers && <FreeVideoCapture />}
      {s.beyondExam && <BeyondTeaser />}
      {s.questions && <ContactForm />}

      <SiteFooter />
      <Toaster position="top-center" richColors />
    </div>
  );
}
