import { createFileRoute } from "@tanstack/react-router";
import SiteNavbar from "@/components/landing/SiteNavbar";
import SiteFooter from "@/components/landing/SiteFooter";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of Service — Survive Accounting" }] }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteNavbar />
      <div className="mx-auto max-w-2xl px-6 py-16 text-sm leading-relaxed text-foreground">
        <h1 className="mb-2 font-sans text-3xl font-bold tracking-tight">Terms of Service</h1>
        <p className="mb-8 text-muted-foreground">Last updated: June 11, 2026 · Survive Accounting / Earned Wisdom, LLC</p>

        <Section title="1. Acceptance">
          By accessing this website or booking a tutoring session, you agree to these Terms of Service. If you do not agree, please do not use our services. These terms are between you and Earned Wisdom, LLC ("Survive Accounting," "we," "us").
        </Section>

        <Section title="2. Services">
          Survive Accounting provides virtual one-on-one accounting tutoring and exam-prep sessions delivered via video call. Sessions are booked through our online booking system and conducted by Lee Ingram or qualified tutors working under our supervision.
        </Section>

        <Section title="3. Booking and payment">
          <ul className="ml-4 list-disc space-y-1">
            <li>Sessions must be booked in advance through our booking page.</li>
            <li>Payment is collected at the time of booking via our payment processor.</li>
            <li>Cancellations made at least 24 hours before a session are eligible for a full refund or reschedule. Cancellations within 24 hours are non-refundable.</li>
            <li>We reserve the right to cancel or reschedule sessions at our discretion; in such cases you will receive a full refund.</li>
          </ul>
        </Section>

        <Section title="4. SMS communications">
          <p>Our SMS number is provided for students to initiate tutoring inquiries. By texting our number you consent to receive replies related to your inquiry.</p>
          <p className="mt-2">We do not use your phone number for marketing unrelated to your tutoring inquiry. Standard message and data rates may apply. Reply <strong>STOP</strong> at any time to opt out. Reply <strong>HELP</strong> for assistance.</p>
        </Section>

        <Section title="5. Academic integrity">
          Our tutoring services are designed to help students understand course material, build skills, and prepare for exams. We do not complete assignments, exams, or coursework on behalf of students. Use of our services must comply with your institution's academic integrity policies. We are not responsible for any academic conduct violations arising from misuse of our services.
        </Section>

        <Section title="6. No guarantee of results">
          Tutoring outcomes depend on student effort, preparation, and other factors outside our control. We do not guarantee specific grades, exam scores, or academic outcomes. Our commitment is to provide high-quality, knowledgeable instruction in every session.
        </Section>

        <Section title="7. Intellectual property">
          All content on this website — including text, videos, study materials, and course resources — is owned by Earned Wisdom, LLC and may not be reproduced, redistributed, or used commercially without written permission.
        </Section>

        <Section title="8. Limitation of liability">
          To the fullest extent permitted by law, Survive Accounting and Earned Wisdom, LLC shall not be liable for any indirect, incidental, or consequential damages arising from use of our services. Our total liability for any claim shall not exceed the amount you paid for the session giving rise to the claim.
        </Section>

        <Section title="9. Governing law">
          These terms are governed by the laws of the State of Mississippi. Any disputes shall be resolved in the courts of Lafayette County, Mississippi.
        </Section>

        <Section title="10. Changes">
          We may update these terms at any time. Continued use of our services after an update constitutes acceptance of the revised terms. The date at the top reflects the most recent revision.
        </Section>

        <Section title="11. Contact">
          Questions about these terms? Email us at <a href="mailto:lee@surviveaccounting.com" className="underline">lee@surviveaccounting.com</a>.
        </Section>
      </div>
      <SiteFooter />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="mb-2 font-sans text-base font-semibold">{title}</h2>
      <div className="space-y-1 text-muted-foreground">{children}</div>
    </div>
  );
}
