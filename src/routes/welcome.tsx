// /welcome — Stripe Payment Link redirect target after a successful 1-on-1
// prepay. First thing a paying client sees: warm confirmation + book the intro
// call. Set the Stripe Payment Link's post-payment redirect URL to this route.
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { INTRO_CALL_BOOKING_URL } from "@/lib/site-config";

const NAVY = "#14213D";
const RED = "#CE1126";
const LOGO_URL = "https://lwfiles.mycourse.app/672bc379cd024d536f651ecc-public/1554d231f0e2bf121ac35937c4d438ca.png";

const LEE_PERSONAL_DISPLAY = "(601) 201-8759";
const LEE_PERSONAL_HREF = "+16012018759";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "You're in — Survive Accounting" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WelcomePage,
});

function WelcomePage() {
  const bookingReady = INTRO_CALL_BOOKING_URL.trim().length > 0;

  return (
    <div className="min-h-screen" style={{ background: "#FAFAF7", fontFamily: "Inter, sans-serif" }}>
      <header className="w-full border-b" style={{ background: "linear-gradient(180deg, rgba(20,33,61,0.98) 0%, rgba(16,26,49,0.98) 100%)", borderColor: "rgba(255,255,255,0.08)" }}>
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
            You&apos;re in — your seat is reserved.
          </h1>
          <p className="mx-auto mt-3 max-w-md text-[15px] text-gray-600">
            Thanks for reserving your 10-hour semester block. Here&apos;s what happens next.
          </p>
          <div className="mx-auto mt-6 flex max-w-md flex-wrap items-center justify-center gap-2 text-xs font-medium text-gray-500">
            <span className="rounded-full bg-gray-100 px-3 py-1">1 · Paid ✓</span>
            <span aria-hidden>→</span>
            <span className="rounded-full px-3 py-1 font-semibold text-white" style={{ background: NAVY }}>2 · Book your intro call</span>
            <span aria-hidden>→</span>
            <span className="rounded-full bg-gray-100 px-3 py-1">3 · Set your weekly time</span>
          </div>

          <div className="mt-7">
            {bookingReady ? (
              <a href={INTRO_CALL_BOOKING_URL} target="_blank" rel="noopener noreferrer" className="inline-block">
                <Button className="h-12 px-7 text-base font-bold text-white"
                  style={{ background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)` }}>
                  Book your intro call →
                </Button>
              </a>
            ) : (
              <Button className="h-12 px-7 text-base font-bold text-white"
                style={{ background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)` }}
                disabled title="Booking link coming">
                Book your intro call →
              </Button>
            )}
          </div>

          <div className="mt-8 border-t border-gray-200 pt-6 text-sm text-gray-600">
            <p>
              Call or text me anytime with questions:{" "}
              <a href={`sms:${LEE_PERSONAL_HREF}`} className="font-semibold hover:underline" style={{ color: RED }}>
                {LEE_PERSONAL_DISPLAY}
              </a>
            </p>
            <p className="mx-auto mt-4 max-w-md text-xs text-gray-500">
              <strong>Full refund if you&apos;re not happy after your first session.</strong> After that,
              no refunds — and any unused hours roll forward to the next semester.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
