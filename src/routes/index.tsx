import { createFileRoute } from "@tanstack/react-router";
import { Toaster } from "sonner";
import SiteNavbar from "@/components/landing/SiteNavbar";
import Hero from "@/components/landing/Hero";
import SmsConsentBanner from "@/components/landing/SmsConsentBanner";
import Reviews from "@/components/landing/Reviews";
import ContactForm from "@/components/landing/ContactForm";
import SiteFooter from "@/components/landing/SiteFooter";
import SquareBookingSection from "@/components/landing/SquareBookingSection";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Survive Accounting — Let's Make Accounting Simple" },
      {
        name: "description",
        content:
          "Virtual tutoring and study support for college accounting students. Understand the material, build confidence, and perform better on exams.",
      },
      { property: "og:title", content: "Survive Accounting" },
      {
        property: "og:description",
        content:
          "Virtual tutoring and study support that helps you pass introductory and intermediate accounting.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Home,
});

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Home() {
  const goToBooking = () => scrollToId("book-tutoring");
  const goToContact = () => scrollToId("contact-form");
  const goToReviews = () => scrollToId("reviews-section");

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: "#F8FAFC" }}>
      <SiteNavbar />
      <SmsConsentBanner />
      <Hero onBookTutoring={goToBooking} onReadReviews={goToReviews} />
      <SquareBookingSection />
      <Reviews />
      <ContactForm />
      <SiteFooter
        onScrollToContact={goToContact}
        onScrollToReviews={goToReviews}
        onBookTutoring={goToBooking}
      />
      <Toaster position="top-center" richColors />
    </div>
  );
}
