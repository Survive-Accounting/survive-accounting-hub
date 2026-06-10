// /outreach/school/:slug — the public campus landing page professors share.
// Ported wrapper from the original app (CampusTemplatePage: eyebrow bar +
// course-codes strip with safe school-color accents) around the new homepage.
// Supports per-professor personalization: ?p={landing_token}
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import Hero from "@/components/landing/Hero";
import Reviews from "@/components/landing/Reviews";
import SiteFooter from "@/components/landing/SiteFooter";
import BookTutoringModal from "@/components/landing/BookTutoringModal";
import { buildSchoolPalette, DEFAULT_PALETTE, type SchoolPalette } from "@/lib/schoolColorSafety";
import { fetchCampusBySlug, fetchLeadByToken, formatPhonePretty, recordLandingEvent } from "@/lib/outreach-api";
import { supabase } from "@/integrations/supabase/client";

const NAVY = "#14213D";

export const Route = createFileRoute("/outreach_/school/$slug")({
  validateSearch: (search: Record<string, unknown>) => ({
    p: typeof search.p === "string" ? search.p : undefined,
    book: typeof search.book === "string" ? search.book : undefined,
    src: typeof search.src === "string" ? search.src : undefined,
  }),
  head: () => ({
    meta: [{ title: "Accounting Help — Survive Accounting" }],
  }),
  component: SchoolLandingPage,
});

// ---- Ported verbatim from the original CampusTemplatePage ----
function SchoolEyebrowBar({ schoolName, palette }: { schoolName: string; palette: SchoolPalette }) {
  return (
    <div
      style={{
        background: NAVY,
        color: "#FFFFFF",
        padding: "10px 16px",
        textAlign: "center",
        fontFamily: "Inter, sans-serif",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: 7,
          height: 7,
          borderRadius: 999,
          background: palette.eyebrowBadge,
          marginRight: 8,
          verticalAlign: "middle",
        }}
      />
      <span style={{ opacity: 0.7 }}>Accounting Help for </span>
      <span style={{ color: "#FFFFFF" }}>{schoolName}</span>
    </div>
  );
}

function CourseCodesStrip({ codes, palette }: { codes: string[]; palette: SchoolPalette }) {
  if (!codes.length) return null;
  return (
    <section
      style={{
        background: "#FFFFFF",
        borderTop: "1px solid #E5E7EB",
        borderBottom: "1px solid #E5E7EB",
        padding: "18px 16px",
      }}
    >
      <div className="mx-auto flex flex-wrap items-center justify-center gap-2 sm:gap-3" style={{ maxWidth: 880 }}>
        <span
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 13,
            fontWeight: 600,
            color: "#6B7280",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginRight: 6,
          }}
        >
          Helping students in:
        </span>
        {codes.map((code) => (
          <span
            key={code}
            style={{
              display: "inline-block",
              padding: "6px 12px",
              borderRadius: 999,
              border: `1.5px solid ${palette.pillBorder}`,
              background: palette.pillBackground,
              color: palette.pillText,
              fontFamily: "Inter, sans-serif",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.02em",
            }}
          >
            {code}
          </span>
        ))}
      </div>
      <div
        aria-hidden
        className="mx-auto"
        style={{
          marginTop: 14,
          maxWidth: 64,
          height: 2,
          borderRadius: 2,
          background: palette.accentDivider,
          opacity: 0.7,
        }}
      />
    </section>
  );
}

/** Subtle personalization line — only when a professor token resolves. */
function ProfessorRecommendBar({ name, palette }: { name: string; palette: SchoolPalette }) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        padding: "10px 16px",
        textAlign: "center",
        fontFamily: "Inter, sans-serif",
        fontSize: 13,
        color: "#374151",
        borderBottom: "1px solid #E5E7EB",
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: 999,
          background: palette.accentDivider,
          marginRight: 8,
          verticalAlign: "middle",
        }}
      />
      Shared with <strong>{name}</strong>'s students
    </div>
  );
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

function SchoolLandingPage() {
  const { slug } = Route.useParams();
  const { p: token, book } = Route.useSearch();
  const [bookOpen, setBookOpen] = useState(false);
  const [campusPhone, setCampusPhone] = useState<string | null>(null);

  const campusQuery = useQuery({
    queryKey: ["campus-landing", slug],
    queryFn: () => fetchCampusBySlug(slug),
    retry: 1,
  });

  const leadQuery = useQuery({
    queryKey: ["landing-lead", token],
    queryFn: () => fetchLeadByToken(token!),
    enabled: !!token,
    retry: 1,
  });

  const campus = campusQuery.data;

  useEffect(() => {
    if (campus?.name) document.title = `Accounting Help for ${campus.name} — Survive Accounting`;
  }, [campus?.name]);

  // Auto-open the booking flow for short-link arrivals (/t/{slug}).
  useEffect(() => {
    if (book === "1") setBookOpen(true);
  }, [book]);

  // Campus texting number, when provisioned.
  useEffect(() => {
    if (!campus?.id) return;
    (supabase.from("campus_phone_numbers" as never) as any)
      .select("phone_e164").eq("campus_id", campus.id).maybeSingle()
      .then(({ data }: { data: { phone_e164: string } | null }) => {
        if (data?.phone_e164) setCampusPhone(data.phone_e164);
      });
  }, [campus?.id]);

  // Record one view per visit (attributed to the professor when a token is present).
  const viewRecorded = useState(() => ({ done: false }))[0];
  useEffect(() => {
    if (!campus?.id || viewRecorded.done) return;
    viewRecorded.done = true;
    recordLandingEvent("view", campus.id, token, leadQuery.data?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campus?.id]);

  const openBooking = () => {
    if (campus?.id) recordLandingEvent("click", campus.id, token, leadQuery.data?.id ?? null);
    setBookOpen(true);
  };

  if (campusQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!campus) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 text-center px-6">
        <h1 className="text-xl font-bold">Page not found</h1>
        <p className="text-sm text-muted-foreground">
          This campus page doesn't exist. Check the link or head to{" "}
          <a href="/" className="underline">surviveaccounting.com</a>.
        </p>
      </div>
    );
  }

  // Safe school-color accents — falls back to brand defaults on any doubt.
  const palette = buildSchoolPalette({
    useSchoolColors: campus.use_school_colors,
    fallbackToDefaultColors: false,
    colorReviewStatus: "approved",
    primary: campus.color_primary,
    secondary: campus.color_secondary,
  });

  const lead = leadQuery.data;
  const profName = lead
    ? lead.is_phd
      ? `Dr. ${lead.last_name ?? lead.first_name ?? ""}`.trim()
      : [lead.first_name, lead.last_name].filter(Boolean).join(" ")
    : null;

  return (
    <div className="min-h-screen bg-background">
      <SchoolEyebrowBar schoolName={campus.name} palette={palette} />
      {profName && <ProfessorRecommendBar name={profName} palette={palette} />}
      {campusPhone && (
        <div
          style={{
            background: "#FFFFFF", padding: "10px 16px", textAlign: "center",
            fontFamily: "Inter, sans-serif", fontSize: 14, color: "#1f2937",
            borderBottom: "1px solid #E5E7EB",
          }}
        >
          📱 Questions? Text Lee:{" "}
          <a
            href={`sms:${campusPhone}`}
            style={{ fontWeight: 700, color: "#14213D", textDecoration: "underline" }}
            onClick={() => recordLandingEvent("click", campus.id, token, leadQuery.data?.id ?? null)}
          >
            {formatPhonePretty(campusPhone)}
          </a>
        </div>
      )}
      <Hero onBookTutoring={openBooking} onReadReviews={() => scrollToId("reviews-section")} />
      <CourseCodesStrip codes={campus.course_codes} palette={palette} />
      <Reviews />
      <SiteFooter
        onScrollToReviews={() => scrollToId("reviews-section")}
        onBookTutoring={openBooking}
      />
      <BookTutoringModal open={bookOpen} onOpenChange={setBookOpen} />
    </div>
  );
}
