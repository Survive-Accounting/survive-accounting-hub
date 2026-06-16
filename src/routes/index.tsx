import { createFileRoute } from "@tanstack/react-router";
import { Toaster } from "sonner";
import Hero from "@/components/landing/Hero";
import Reviews from "@/components/landing/Reviews";
import SiteFooter from "@/components/landing/SiteFooter";

const TUTOR_PHONE_E164 = "+16625658818";
const TUTOR_PHONE_PRETTY = "(662) 565-8818";
const SMS_BODY = "Hi Lee, I need help with my accounting class.";
const SMS_HREF = `sms:${TUTOR_PHONE_E164}?body=${encodeURIComponent(SMS_BODY)}`;

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
    <div className="flex flex-col items-center gap-3">
      <a
        href={SMS_HREF}
        className="hero-anim-btn rounded-xl px-9 py-4 text-[16px] font-bold text-white transition-all duration-200 hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0 inline-flex items-center justify-center"
        style={{
          background: "linear-gradient(180deg, #CE1126 0%, #A8101F 100%)",
          fontFamily: "Inter, sans-serif",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.25), 0 10px 28px rgba(206,17,38,0.35)",
          letterSpacing: "0.01em",
          textDecoration: "none",
        }}
      >
        Text Lee for Tutoring →
      </a>
      <a
        href={`tel:${TUTOR_PHONE_E164}`}
        className="hero-anim-btn text-[13px] font-medium"
        style={{
          color: "rgba(255,255,255,0.78)",
          fontFamily: "Inter, sans-serif",
          textDecoration: "none",
        }}
      >
        {TUTOR_PHONE_PRETTY}
      </a>
    </div>
  );
}

function SmsPolicyFootnote() {
  return (
    <div
      style={{
        background: "#0b1a36",
        borderTop: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <details className="mx-auto max-w-[1100px] px-4 sm:px-6 py-3 group">
        <summary
          className="cursor-pointer list-none text-[11px] tracking-wide"
          style={{
            color: "rgba(255,255,255,0.4)",
            fontFamily: "Inter, sans-serif",
          }}
        >
          <span className="underline underline-offset-4 group-open:hidden">
            SMS policy
          </span>
          <span className="underline underline-offset-4 hidden group-open:inline">
            Hide SMS policy
          </span>
        </summary>
        <p
          className="mt-2 text-[11px] leading-relaxed"
          style={{
            color: "rgba(255,255,255,0.55)",
            fontFamily: "Inter, sans-serif",
            maxWidth: 640,
          }}
        >
          By texting {TUTOR_PHONE_PRETTY}, you agree to receive replies from Lee
          about your tutoring request. Message frequency varies. Msg &amp; data
          rates may apply. Reply STOP to opt out, HELP for help. See our{" "}
          <a href="/privacy" className="underline hover:text-white">Privacy</a>{" "}
          and{" "}
          <a href="/terms" className="underline hover:text-white">Terms</a>.
        </p>
      </details>
    </div>
  );
}

function Home() {
  const goToReviews = () => scrollToId("reviews-section");

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: "#F8FAFC" }}>
      <Hero
        headline="Let's Make Accounting Exams Feel Easy"
        subtext="I've helped over 1,000 students ace exams confidently. I'd love to help you, too. Text 662-565-8818 to request tutoring."
        ctaSlot={<HeroCta />}
      />
      <Reviews />
      <SmsPolicyFootnote />
      <SiteFooter onScrollToReviews={goToReviews} />
      <Toaster position="top-center" richColors />
    </div>
  );
}
