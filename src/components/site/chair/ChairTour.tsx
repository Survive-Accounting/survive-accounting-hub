// THE QUICK TOUR (Build 2, section 3). For a chair who dismissed the share panel and wants to look
// around first. Five points, in the brief's order, as ONE skippable card with a stepper — not a
// modal chain. Skip is always one tap away, and the platform is visible behind it the whole time,
// so it reads as an orientation, not a gate.
//
// Point 4 ("The deal") is THE ONLY place a price appears anywhere in the Greek flow, and it appears
// only here, only to a chair. A member never sees it.
import { useState } from "react";
import { X } from "lucide-react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { SEAT_MINIMUM, SEAT_PRICE } from "@/components/site/ChapterAccess";
import { LEE_PHONE_DISPLAY, LEE_SMS_HREF } from "@/lib/partners";

const NAVY = "#0F1A2E";
const CARD = "#101B31";
const CREAM = "#F5F1E8";
const MUTED = "#8B97BD";
const AMBER = "#F5A623";
const RED = "#CE1126";

type StepBody = { kind: "what" | "who" | "see" | "deal" | "interested" };

export function ChairTour({
  audienceLabel,
  courseLabel,
  onClose,
  onInterested,
}: {
  /** "your chapter" / "Alpha Chi Omega" / "your council" — who the tour is talking to. */
  audienceLabel: string;
  /** The campus course code ("AC 210") or a neutral fallback. */
  courseLabel: string;
  onClose: () => void;
  /** The section-3 point 5 action. Low-commitment, never a purchase. */
  onInterested: () => void;
}) {
  const steps: Array<{ title: string; body: StepBody }> = [
    { title: "What this is", body: { kind: "what" } },
    { title: "Who makes it", body: { kind: "who" } },
    { title: "What you'll see", body: { kind: "see" } },
    { title: "The deal", body: { kind: "deal" } },
    { title: "Interested?", body: { kind: "interested" } },
  ];
  const [i, setI] = useState(0);
  const step = steps[i];
  const last = i === steps.length - 1;

  return (
    <div
      className="w-[min(92vw,380px)] overflow-hidden rounded-2xl shadow-2xl"
      style={{ background: CARD, border: "1px solid rgba(245,239,230,0.14)", fontFamily: BRAND_SANS }}
      role="dialog"
      aria-label="Quick tour"
    >
      {/* progress + skip — skip is always reachable */}
      <div className="flex items-center gap-2 px-4 pt-3.5">
        <div className="flex flex-1 items-center gap-1.5">
          {steps.map((_, k) => (
            <span
              key={k}
              className="h-1 flex-1 rounded-full"
              style={{ background: k <= i ? AMBER : "rgba(245,239,230,0.16)" }}
            />
          ))}
        </div>
        <button
          onClick={onClose}
          className="grid h-7 w-7 place-items-center rounded-full"
          style={{ background: "rgba(245,239,230,0.06)", color: MUTED }}
          aria-label="Skip the tour"
        >
          <X size={15} />
        </button>
      </div>

      <div className="px-4 pb-4 pt-3">
        <h3 className="text-[17px] font-black" style={{ color: CREAM, fontFamily: BRAND_DISPLAY }}>
          {step.title}
        </h3>

        <div className="mt-2 min-h-[132px] text-[13px] leading-relaxed" style={{ color: "#C7D0E8" }}>
          {step.body.kind === "what" && (
            <p>
              A member of {audienceLabel} opens {courseLabel} and gets the whole first exam free — cram
              videos that cover what the test actually asks, and practice questions worked start to
              finish. Everything aimed at one thing: the grade on Exam 1.
            </p>
          )}

          {step.body.kind === "who" && (
            <>
              <ul className="space-y-1.5">
                <li>· Two accounting degrees.</li>
                <li>· Worked with 1,000+ accounting students.</li>
                <li>· Built by one person, Lee Ingram.</li>
              </ul>
              <a
                href="/#lee"
                className="mt-2.5 inline-block text-[12.5px] font-bold underline underline-offset-4"
                style={{ color: AMBER }}
              >
                More about Lee →
              </a>
            </>
          )}

          {step.body.kind === "see" && (
            <>
              <p className="mb-2">Once you claim, your chapter's page is a tab right here:</p>
              {/* A preview of the chair's dashboard view — shape only, no invented numbers. */}
              <div className="rounded-xl p-3" style={{ background: NAVY, border: "1px solid rgba(245,239,230,0.1)" }}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold" style={{ color: MUTED }}>Members joined</span>
                  <span className="text-[11px] font-bold" style={{ color: MUTED }}>Want sponsorship</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between">
                  <span className="text-[22px] font-black" style={{ color: CREAM }}>—</span>
                  <span className="text-[22px] font-black" style={{ color: AMBER }}>—</span>
                </div>
                <div className="mt-2.5 space-y-1.5">
                  {[0, 1, 2].map((k) => (
                    <div key={k} className="flex items-center gap-2">
                      <span className="grid h-5 w-5 place-items-center rounded-full text-[9px] font-black" style={{ background: "rgba(245,166,35,0.14)", color: AMBER }}>•</span>
                      <span className="h-2 rounded-full" style={{ width: `${64 - k * 12}%`, background: "rgba(245,239,230,0.14)" }} />
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-2 text-[11.5px]" style={{ color: MUTED }}>Names as they arrive. No milestones, no pressure.</p>
            </>
          )}

          {step.body.kind === "deal" && (
            <>
              <div className="rounded-xl p-3" style={{ background: NAVY, border: `1px solid ${RED}` }}>
                <p className="text-[13px] font-black" style={{ color: CREAM }}>Exam 1 — free for everyone.</p>
                <p className="mt-0.5 text-[12px]" style={{ color: MUTED }}>Every member, no cost to the chapter, nothing to buy.</p>
              </div>
              <p className="mt-2.5">
                If the chapter wants the rest — Exam 2, Exam 3 and the Final — that's{" "}
                <b style={{ color: CREAM }}>${SEAT_PRICE} per member for the semester</b>, {SEAT_MINIMUM}-seat
                minimum. A chapter chooses it; a member never pays and never sees a price.
              </p>
            </>
          )}

          {step.body.kind === "interested" && (
            <p>
              No pressure and nothing to buy. If it looks worth a look for {audienceLabel}, say so and
              Lee will follow up — a person, not a funnel.
            </p>
          )}
        </div>

        {/* nav */}
        <div className="mt-3 flex items-center gap-2">
          {i > 0 && (
            <button
              onClick={() => setI((n) => Math.max(0, n - 1))}
              className="rounded-xl px-3 py-2 text-[12.5px] font-bold"
              style={{ background: "rgba(245,239,230,0.06)", color: CREAM }}
            >
              Back
            </button>
          )}
          <div className="flex-1" />
          {!last ? (
            <button
              onClick={() => setI((n) => Math.min(steps.length - 1, n + 1))}
              className="rounded-xl px-4 py-2 text-[13px] font-black"
              style={{ background: AMBER, color: "#0B1220" }}
            >
              Next
            </button>
          ) : (
            <a
              href={`${LEE_SMS_HREF}?&body=${encodeURIComponent(`Hi Lee — interested in Survive for ${audienceLabel}.`)}`}
              onClick={onInterested}
              className="rounded-xl px-4 py-2 text-[13px] font-black"
              style={{ background: AMBER, color: "#0B1220" }}
            >
              I'm interested
            </a>
          )}
        </div>
        {last && (
          <p className="mt-2 text-center text-[11px]" style={{ color: MUTED }}>
            Opens a text to Lee at {LEE_PHONE_DISPLAY}. No account, no charge.
          </p>
        )}
      </div>
    </div>
  );
}
