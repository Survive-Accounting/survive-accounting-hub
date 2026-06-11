import { createFileRoute } from "@tanstack/react-router";
import SiteNavbar from "@/components/landing/SiteNavbar";
import SiteFooter from "@/components/landing/SiteFooter";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy Policy — Survive Accounting" }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteNavbar />
      <div className="mx-auto max-w-2xl px-6 py-16 text-sm leading-relaxed text-foreground">
        <h1 className="mb-2 font-sans text-3xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="mb-8 text-muted-foreground">Last updated: June 11, 2026 · Survive Accounting / Earned Wisdom, LLC</p>

        <Section title="1. Who we are">
          Survive Accounting is operated by Earned Wisdom, LLC ("we," "us," or "our"), a tutoring service run by Lee Ingram. We provide virtual accounting tutoring and exam-prep support to students across the United States. You can reach us at lee@surviveaccounting.com.
        </Section>

        <Section title="2. Information we collect">
          <ul className="ml-4 list-disc space-y-1">
            <li><strong>Contact information</strong> you provide voluntarily — name, email address, phone number, and school or course details — when you fill out a form, book a session, or text our number.</li>
            <li><strong>Messages</strong> you send to our SMS number, including the content of those messages and the date and time they were sent.</li>
            <li><strong>Usage data</strong> such as pages visited and links clicked, collected automatically through standard web analytics.</li>
          </ul>
        </Section>

        <Section title="3. How we use your information">
          We use the information we collect to:
          <ul className="ml-4 mt-1 list-disc space-y-1">
            <li>Respond to your messages and provide tutoring services</li>
            <li>Send you booking confirmations and session reminders</li>
            <li>Follow up on tutoring inquiries you have initiated</li>
            <li>Improve our services and website</li>
          </ul>
        </Section>

        <Section title="4. SMS messaging">
          <p>If you text our SMS number, you are initiating contact with us and consenting to receive replies related to your tutoring inquiry. We will use your phone number only to respond to messages you initiate and to send information directly relevant to your request.</p>
          <p className="mt-2"><strong>We do not share, sell, rent, or trade your mobile phone number with any third party for marketing purposes.</strong> Your number is never shared with advertisers or data brokers.</p>
          <p className="mt-2">Message frequency varies based on your inquiry — typically 2–5 messages per conversation. Standard message and data rates may apply depending on your carrier and plan.</p>
          <p className="mt-2">To stop receiving messages, reply <strong>STOP</strong> at any time. To get help, reply <strong>HELP</strong>. We honor all opt-out requests immediately.</p>
        </Section>

        <Section title="5. Email communications">
          If you are an accounting professor and have received an email from us, your contact information was obtained from publicly available faculty directories. Each email includes a clear opt-out instruction. Reply to any email asking us to stop and we will remove you from all future correspondence immediately.
        </Section>

        <Section title="6. Sharing your information">
          We do not sell your personal information. We may share information with service providers who help us operate our business (such as Resend for email delivery, Twilio for SMS, and Supabase for data storage), solely for the purpose of providing those services. These providers are contractually prohibited from using your information for any other purpose.
        </Section>

        <Section title="7. Data retention">
          We retain your information for as long as necessary to provide services and comply with legal obligations. You may request deletion of your data at any time by emailing lee@surviveaccounting.com.
        </Section>

        <Section title="8. Your rights">
          Depending on your location, you may have the right to access, correct, or delete personal information we hold about you. Contact us at lee@surviveaccounting.com to exercise any of these rights.
        </Section>

        <Section title="9. Changes to this policy">
          We may update this policy from time to time. The date at the top of this page reflects the most recent revision. Continued use of our services after an update constitutes acceptance of the revised policy.
        </Section>

        <Section title="10. Contact">
          Questions about this policy? Email us at <a href="mailto:lee@surviveaccounting.com" className="underline">lee@surviveaccounting.com</a>.
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
