import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { ImageIcon, Menu, X } from "lucide-react";

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
      { property: "og:url", content: "https://surviveaccounting.com/" },
    ],
    links: [{ rel: "canonical", href: "https://surviveaccounting.com/" }],
  }),
  loader: () => getSiteSettings(),
  component: Home,
});

// Organization + EducationalOrganization + WebSite JSON-LD (rendered into the home DOM so
// it SSRs for crawlers). sameAs is intentionally omitted — no confirmed Survive Accounting
// brand social profiles yet (the footer's @grooveginger is Lee's separate music brand).
// Add real handles here when available.
const ORG_JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": ["Organization", "EducationalOrganization"],
      "@id": "https://surviveaccounting.com/#org",
      name: "Survive Accounting",
      url: "https://surviveaccounting.com/",
      logo: "https://lwfiles.mycourse.app/672bc379cd024d536f651ecc-public/1554d231f0e2bf121ac35937c4d438ca.png",
      description:
        "Personalized accounting exam-prep videos and interactive journal-entry practice for Intro and Intermediate Accounting students.",
      founder: { "@type": "Person", name: "Lee Ingram" },
      email: "lee@surviveaccounting.com",
    },
    {
      "@type": "WebSite",
      "@id": "https://surviveaccounting.com/#website",
      url: "https://surviveaccounting.com/",
      name: "Survive Accounting",
      publisher: { "@id": "https://surviveaccounting.com/#org" },
    },
  ],
};

function OrgJsonLd() {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSONLD) }} />
  );
}

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
          Videos made weekly · Covering Intro and Intermediate · More info below
        </p>
      </div>
    </div>
  );
}

// Sticky top navbar (homepage only). Bold red band. Left: logo. Right: How it
// works · Reviews · Contact — each smooth-scrolls to its section. Hamburger menu
// on mobile.
const NAV_LINKS = [
  { label: "How it works", id: "how-it-works" },
  { label: "Reviews", id: "reviews-section" },
  { label: "Contact", id: "contact-form" },
];
function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const scrollTo = (id: string) => (e: React.MouseEvent) => {
    if (typeof document === "undefined") return;
    const el = document.getElementById(id);
    if (el) { e.preventDefault(); el.scrollIntoView({ behavior: "smooth", block: "start" }); }
    setMenuOpen(false);
  };
  return (
    <header
      className="sticky top-0 z-50 w-full transition-shadow duration-300"
      style={{
        background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)`,
        boxShadow: scrolled
          ? "0 10px 28px rgba(168,16,31,0.45)"
          : "0 4px 16px rgba(168,16,31,0.30)",
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

        {/* Desktop links */}
        <nav className="ml-auto hidden items-center gap-1 sm:flex">
          {NAV_LINKS.map((l) => (
            <a key={l.id} href={`/#${l.id}`} onClick={scrollTo(l.id)}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-white/90 transition-colors hover:text-white sm:text-[15px]">
              {l.label}
            </a>
          ))}
        </nav>

        {/* Mobile hamburger */}
        <button type="button" aria-label="Menu" aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className="ml-auto inline-flex items-center justify-center rounded-lg p-1.5 text-white transition-colors hover:bg-white/10 sm:hidden">
          {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="sm:hidden" style={{ background: "#A8101F", borderTop: "1px solid rgba(255,255,255,0.15)" }}>
          <nav className="mx-auto flex max-w-6xl flex-col px-4 py-1.5">
            {NAV_LINKS.map((l) => (
              <a key={l.id} href={`/#${l.id}`} onClick={scrollTo(l.id)}
                className="rounded-lg px-2 py-3 text-base font-semibold text-white/90 hover:text-white">
                {l.label}
              </a>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}

/** Slick white-matted photo frame, with a graceful placeholder if the file
 *  isn't in public/ yet. */
function LeePhoto({ src, alt, aspect }: { src: string; alt: string; aspect: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="rounded-[22px] bg-white p-2.5 ring-1 ring-black/5"
      style={{ boxShadow: "0 26px 60px -26px rgba(20,33,61,0.5)" }}>
      <div className={`relative ${aspect} overflow-hidden rounded-2xl bg-slate-200`}>
        {failed ? (
          <div className="grid h-full w-full place-content-center p-4 text-center text-xs text-slate-500">
            <ImageIcon className="mx-auto h-6 w-6 text-slate-400" />
            <span className="mt-1.5">{alt}</span>
          </div>
        ) : (
          <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
        )}
      </div>
    </div>
  );
}

function Home() {
  const settings = Route.useLoaderData();
  const s = settings.sections;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F8FAFC" }}>
      <OrgJsonLd />
      <SiteNav />
      {s.hero && (
        <Hero
          headline="Get on-demand help from a real tutor."
          subtext="Tell me what's stressing you most about your next accounting exam, and I'll send personalized videos back tailored to your course."
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
            How Survive Accounting works
          </p>
          <h2 className="mx-auto mt-2 max-w-2xl text-center text-2xl font-bold tracking-tight sm:text-3xl" style={{ color: NAVY }}>
            Get personalized exam prep videos
          </h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {[
              { n: 1, img: "/step1.png", title: "Tell me what you're stuck on", body: "Homework problem, review sheet, chapter, exam topic — whatever you've got." },
              { n: 2, img: "/step2.png", title: "Make a gameplan", body: "I'll reply in 1 business day with what I'll make, what it costs, and how you'll benefit." },
              { n: 3, img: "/step3.png", title: "Get ready to ace it", body: "Once you approve the gameplan, I'll make you a personalized video. First come, first served." },
            ].map((step) => (
              <div key={step.n} className="text-center">
                <img src={step.img} alt="" aria-hidden="true" className="mx-auto mb-3 w-full max-w-[280px] object-contain" loading="lazy" />
                <div className="mx-auto grid h-12 w-12 place-content-center rounded-full text-[17px] font-bold text-white" style={{ background: NAVY }}>
                  {step.n}
                </div>
                <h3 className="mt-4 text-lg font-semibold" style={{ color: NAVY }}>{step.title}</h3>
                <p className="mx-auto mt-2 max-w-xs text-[14.5px] leading-relaxed text-gray-600">{step.body}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* About Lee — editorial profile. Two-column on desktop, stacked on mobile. */}
      <section id="about" className="px-4 py-16 sm:py-24" style={{ background: "linear-gradient(180deg, #EDF3FB 0%, #FBFCFE 100%)" }}>
        <Reveal className="mx-auto max-w-[1160px]">
          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-start lg:gap-14">
            {/* Article column — also the mobile flow (images interleave via lg:hidden). */}
            <div className="text-left">
              <div className="flex items-center gap-3">
                <span className="h-px w-10 shrink-0" style={{ background: RED }} />
                <span className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: RED }}>Meet Lee Ingram</span>
              </div>
              <h2 className="mt-4 text-[32px] font-normal leading-[1.08] sm:text-[42px]" style={{ color: NAVY, fontFamily: "'DM Serif Display', serif" }}>
                Hey, I&apos;m Lee Ingram.
              </h2>
              <p className="mt-3 max-w-xl text-[17px] leading-relaxed text-gray-600 sm:text-lg">
                I make accounting feel less stressful with custom help videos, focused exam prep, and clear explanations.
              </p>

              {/* Main image — mobile placement (after the deck). */}
              <figure className="mt-7 lg:hidden">
                <LeePhoto src="/lee-stadium.webp" alt="Lee at Arkansas vs. Ole Miss, 2023" aspect="aspect-[5/4]" />
                <figcaption className="mt-2 text-center text-[11px] italic leading-snug text-slate-500">Arkansas vs. Ole Miss, 2023</figcaption>
              </figure>

              <div className="mt-6 max-w-xl space-y-5 text-[16px] leading-[1.75] text-gray-700">
                <p>I&apos;m an Ole Miss accounting grad who&apos;s tutored full-time since 2015. During COVID, I started sending quick, personalized help videos to students who were stuck studying from home all over the country.</p>
                <p>That idea became Survive Accounting. Since then, I&apos;ve helped 1,000+ students feel more prepared for accounting exams.</p>
                <p>I love accounting — but I know not every student does. My job is to make it feel less stressful, more straightforward, and maybe even a little fun to learn.</p>
                <p>I take good care of every student who comes my way, and I&apos;m glad you stopped by.</p>
              </div>

              {/* Childhood inset — mobile placement (after the body). */}
              <figure className="mx-auto mt-7 max-w-[190px] lg:hidden">
                <LeePhoto src="/lee-kid-joa-cropped.jpg" alt="Young Lee reading the Journal of Accountancy" aspect="aspect-[3/7]" />
                <figcaption className="mt-2 text-center text-[11px] italic leading-snug text-slate-500">Reading my dad&apos;s <span className="font-medium not-italic">Journal of Accountancy</span> circa 1998.</figcaption>
              </figure>

              <blockquote className="mt-9 border-l-2 pl-5" style={{ borderColor: RED }}>
                <p className="text-[22px] leading-snug sm:text-2xl" style={{ color: NAVY, fontFamily: "'DM Serif Display', serif" }}>
                  &ldquo;I take good care of every student who comes my way.&rdquo;
                </p>
              </blockquote>

              <div className="mt-8">
                <a href="/order"
                  className="group inline-flex items-center justify-center gap-2 rounded-2xl px-8 py-3.5 text-[15px] font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110"
                  style={{ background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)`, boxShadow: "0 10px 28px rgba(206,17,38,0.35)" }}>
                  Request Help <span className="transition-transform group-hover:translate-x-0.5">→</span>
                </a>
              </div>
            </div>

            {/* Image composition — desktop only (stadium main + childhood inset overlapping). */}
            <div className="relative hidden lg:block">
              <figure>
                <LeePhoto src="/lee-stadium.webp" alt="Lee at Arkansas vs. Ole Miss, 2023" aspect="aspect-[5/4]" />
                <figcaption className="mt-2 pr-1 text-right text-[11px] italic leading-snug text-slate-500">Arkansas vs. Ole Miss, 2023</figcaption>
              </figure>
              <figure className="absolute -bottom-6 -left-10 w-[34%]">
                <LeePhoto src="/lee-kid-joa-cropped.jpg" alt="Young Lee reading the Journal of Accountancy" aspect="aspect-[3/7]" />
                <figcaption className="mt-1.5 text-center text-[10px] italic leading-snug text-slate-500">Reading my dad&apos;s <span className="font-medium not-italic">Journal of Accountancy</span> circa 1998.</figcaption>
              </figure>
            </div>
          </div>
        </Reveal>
      </section>

      {s.questions && <ContactForm />}

      <SiteFooter />
      <Toaster position="top-center" richColors />
    </div>
  );
}
