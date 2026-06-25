// "Who I am" — the soul band. Childhood-photo slot (Lee supplies the image)
// + a short, warm bio. Replace the placeholder by importing Lee's photo into
// the <img> src below (e.g. import kidPhoto from "@/assets/lee-kid-joa.jpg").
import { ImageIcon } from "lucide-react";

const NAVY = "#14213D";
const RED = "#CE1126";

export default function SoulBand({ className }: { className?: string }) {
  return (
    <section className={className} style={{ background: "#FFFFFF" }}>
      <div className="mx-auto grid max-w-5xl items-center gap-10 px-4 py-16 sm:py-20 md:grid-cols-[300px_1fr]">
        {/* Childhood photo slot — Lee supplies (young Lee with the Journal of Accountancy) */}
        <div className="mx-auto w-full max-w-[300px]">
          <div
            className="relative aspect-[4/5] overflow-hidden rounded-3xl border bg-gray-100"
            style={{ borderColor: "rgba(20,33,61,0.12)", boxShadow: "0 16px 40px -20px rgba(20,33,61,0.4)" }}
          >
            <div className="absolute inset-0 grid place-content-center text-center text-gray-400">
              <ImageIcon className="mx-auto h-10 w-10" />
              <span className="mt-2 px-4 text-xs">
                Photo slot — young Lee with the<br />Journal of Accountancy
              </span>
            </div>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: RED }}>
            Who I am
          </p>
          <h2 className="mt-2 text-2xl font-bold leading-tight sm:text-3xl" style={{ color: NAVY }}>
            I've loved this stuff since I was a kid.
          </h2>
          <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-gray-700">
            <p>
              I'm Lee — Ole Miss accounting alum (&apos;17), bachelor&apos;s and master&apos;s, and I&apos;ve
              been tutoring accounting every semester since 2015.
            </p>
            <p>
              I built Survive Accounting during the pandemic, and now I do this full-time —
              tutoring students 1-on-1 and adding new teaching content almost every day. This
              isn&apos;t a side hustle or a call center. It&apos;s the thing I actually love doing.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
