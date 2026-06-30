// /thankyou — simple waitlist confirmation (end of the onboarding waitlist flow).
// Deliberately NOT the preview dashboard and NOT /welcome (that's the prepaid
// path). Just "you're on the list" + a brief what-happens-next.
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";

const NAVY = "#14213D";
const RED = "#CE1126";
const LOGO_URL = "https://lwfiles.mycourse.app/672bc379cd024d536f651ecc-public/1554d231f0e2bf121ac35937c4d438ca.png";
const LEE_PHONE_DISPLAY = "(662) 565-8818";
const LEE_PHONE_HREF = "+16625658818";

interface ThankYouSearch { name?: string }

export const Route = createFileRoute("/thankyou")({
  validateSearch: (s: Record<string, unknown>): ThankYouSearch => ({
    name: typeof s.name === "string" ? s.name : undefined,
  }),
  head: () => ({
    meta: [
      { title: "You're on the list — Survive Accounting" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ThankYouPage,
});

function ThankYouPage() {
  const { name } = Route.useSearch();
  const first = (name ?? "").trim();

  return (
    <div className="min-h-screen" style={{ background: "#FAFAF7", fontFamily: "Inter, sans-serif" }}>
      <header className="w-full border-b"
        style={{ background: "linear-gradient(180deg, rgba(20,33,61,0.98) 0%, rgba(16,26,49,0.98) 100%)", borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center px-4">
          <a href="/" aria-label="Survive Accounting — home">
            <img src={LOGO_URL} alt="Survive Accounting" className="h-5 w-auto sm:h-[22px]" draggable={false} />
          </a>
        </div>
      </header>

      <div className="mx-auto w-full max-w-xl px-4 py-12 sm:py-16">
        <div className="rounded-3xl bg-white p-7 text-center shadow-[0_10px_40px_-15px_rgba(20,33,61,0.2)] sm:p-10">
          <div className="mx-auto grid h-20 w-20 place-content-center rounded-full bg-emerald-50">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          </div>
          <h1 className="mt-6 text-3xl font-bold sm:text-4xl" style={{ color: NAVY }}>
            You&apos;re on the list{first ? `, ${first}` : ""}.
          </h1>
          <p className="mx-auto mt-3 max-w-md text-[15px] text-gray-600">
            Thanks for joining. Here&apos;s what happens next:
          </p>

          <div className="mx-auto mt-6 max-w-md space-y-3 text-left">
            {[
              "I'll text or email you the moment your content drops.",
              "When the 1-on-1 spots open for the semester, you'll be first to know.",
              "Got a question before then? Just text me — I read every message.",
            ].map((line) => (
              <div key={line} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" style={{ color: RED }} />
                <span className="text-sm text-gray-700">{line}</span>
              </div>
            ))}
          </div>

          <div className="mt-8 border-t border-gray-200 pt-6 text-sm text-gray-600">
            <p>
              Questions? Text me:{" "}
              <a href={`sms:${LEE_PHONE_HREF}`} className="font-semibold hover:underline" style={{ color: RED }}>
                {LEE_PHONE_DISPLAY}
              </a>
            </p>
            <a href="/" className="mt-4 inline-block text-xs font-medium text-gray-400 hover:underline">
              ← Back to home
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
