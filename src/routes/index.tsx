import { createFileRoute } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { MessageCircle } from "lucide-react";
import Hero from "@/components/landing/Hero";
import Reviews from "@/components/landing/Reviews";
import ContactForm from "@/components/landing/ContactForm";
import SiteFooter from "@/components/landing/SiteFooter";

const TUTOR_PHONE_E164 = "+16625658818";
const TUTOR_PHONE_PRETTY = "(662) 565-8818";
const SMS_BODY = "Hi Lee, I'm interested in accounting tutoring.";
const SMS_HREF = `sms:${TUTOR_PHONE_E164}?body=${encodeURIComponent(SMS_BODY)}`;

const RED_BTN_CLASS =
  "hero-anim-btn group rounded-2xl px-10 py-5 text-[17px] font-bold text-white transition-all duration-200 hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0 inline-flex items-center justify-center gap-3";
const RED_BTN_STYLE: React.CSSProperties = {
  background: "linear-gradient(180deg, #CE1126 0%, #A8101F 100%)",
  fontFamily: "Inter, sans-serif",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.25), 0 14px 36px rgba(206,17,38,0.42)",
  letterSpacing: "0.01em",
  textDecoration: "none",
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Survive Accounting — Let's Make Accounting Simple" },
      {
        name: "description",
        content:
          "Text Lee Ingram for laid-back virtual accounting tutoring. Upload your syllabus and he'll let you know if your course is a good fit.",
      },
      { property: "og:title", content: "Survive Accounting" },
      {
        property: "og:description",
        content:
          "Text Lee to get help in your accounting course. Upload your syllabus and find out if it's a good fit.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Home,
});

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function HeroCta() {
  return (
    <div className="flex flex-col items-center gap-4">
      {/* Mobile: SMS link */}
      <a
        href={SMS_HREF}
        className={`${RED_BTN_CLASS} md:hidden`}
        style={RED_BTN_STYLE}
      >
        <MessageCircle className="w-5 h-5" strokeWidth={2.5} />
        <span style={{ fontWeight: 800, letterSpacing: "0.02em" }}>
          Text Lee {TUTOR_PHONE_PRETTY}
        </span>
      </a>

      {/* Desktop/tablet: Book Tutoring → /start */}
      <a
        href="/start"
        className={`${RED_BTN_CLASS} hidden md:inline-flex`}
        style={RED_BTN_STYLE}
      >
        <span style={{ fontWeight: 800, letterSpacing: "0.02em" }}>
          Book Tutoring
        </span>
        <span className="transition-transform group-hover:translate-x-0.5">→</span>
      </a>

      <ul
        className="hero-anim-btn mt-4 flex flex-wrap items-center justify-center gap-2 sm:gap-2.5"
        style={{ listStyle: "none", padding: 0, margin: 0 }}
      >
        {[
          { icon: "☀️", label: "Available July 2026" },
          { icon: "⏳", label: "Intro & Intermediate · Limited slots" },
        ].map((b) => (
          <li
            key={b.label}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] sm:text-[12.5px]"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.16)",
              color: "rgba(255,255,255,0.82)",
              fontFamily: "Inter, sans-serif",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              letterSpacing: "0.005em",
            }}
          >
            <span aria-hidden="true" className="text-[13px] leading-none">{b.icon}</span>
            <span>{b.label}</span>
          </li>
        ))}
      </ul>

    </div>
  );
}


function Home() {
  const goToReviews = () => scrollToId("reviews-section");

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: "#F8FAFC" }}>
      <Hero
        headline="Get Expert Help in Accounting"
        subtext="Boost exam confidence with virtual tutoring by Lee Ingram. Both intro and intermediate courses are covered."
        ctaSlot={<HeroCta />}
      />

      <Reviews />
      <ContactForm />
      
      <SiteFooter onScrollToReviews={goToReviews} />
      <Toaster position="top-center" richColors />
    </div>
  );
}
