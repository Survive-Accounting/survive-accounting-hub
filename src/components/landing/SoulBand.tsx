// "Who I am" — the soul band. Main childhood photo (Lee + the Journal of
// Accountancy) with a small "look closer" detail-crop inset of the magazine
// masthead overlapping the corner. Lee fills two image slots by dropping files
// into the app's public/ folder:
//   public/lee-kid-joa.jpg         -> main wide photo
//   public/lee-kid-joa-detail.jpg  -> zoomed masthead crop
// If a file is absent, a graceful placeholder shows instead.
import { useState } from "react";
import { ImageIcon } from "lucide-react";

const NAVY = "#14213D";
const RED = "#CE1126";

const MAIN_PHOTO = "/lee-kid-joa.jpg";
const DETAIL_PHOTO = "/lee-kid-joa-detail.jpg";

function FramedPhoto({
  src, alt, className, label,
}: { src: string; alt: string; className?: string; label: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={`grid place-content-center bg-gray-100 text-center text-gray-400 ${className ?? ""}`}>
        <ImageIcon className="mx-auto h-8 w-8" />
        <span className="mt-1 px-3 text-[10px] leading-tight">{label}</span>
      </div>
    );
  }
  return (
    <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)}
      className={`h-full w-full object-cover ${className ?? ""}`} />
  );
}

export default function SoulBand({ className }: { className?: string }) {
  return (
    <section className={className} style={{ background: "#FFFFFF" }}>
      <div className="mx-auto grid max-w-5xl items-center gap-12 px-4 py-16 sm:py-20 md:grid-cols-[320px_1fr]">
        {/* Main photo + detail-crop inset */}
        <div className="relative mx-auto w-full max-w-[320px]">
          <div
            className="aspect-[4/5] overflow-hidden rounded-3xl border"
            style={{ borderColor: "rgba(20,33,61,0.12)", boxShadow: "0 16px 40px -20px rgba(20,33,61,0.4)" }}
          >
            <FramedPhoto src={MAIN_PHOTO} alt="Lee as a kid with the Journal of Accountancy"
              label="Photo: young Lee with the Journal of Accountancy" />
          </div>
          {/* "look closer" detail crop, overlapping the bottom-right corner */}
          <div
            className="absolute -bottom-6 -right-4 h-28 w-28 overflow-hidden rounded-2xl ring-4 ring-white"
            style={{ boxShadow: "0 12px 28px -10px rgba(20,33,61,0.5)" }}
            aria-hidden="true"
          >
            <FramedPhoto src={DETAIL_PHOTO} alt="Journal of Accountancy masthead" label="masthead detail" />
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: RED }}>
            Who I am
          </p>
          <h2 className="mt-2 text-2xl font-bold leading-tight sm:text-3xl" style={{ color: NAVY }}>
            I come from a long line of accountants — I&apos;ve loved this stuff since I was a kid.
          </h2>
          <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-gray-700">
            <p>
              I&apos;m Lee — Ole Miss accounting alum (&apos;17), bachelor&apos;s and master&apos;s, and I&apos;ve
              been tutoring accounting every semester since 2015.
            </p>
            <p>
              I built Survive Accounting during the pandemic, and now I do this full-time. This isn&apos;t a
              side hustle or a call center — it&apos;s the thing I genuinely love doing. Whether you want to
              survive your course or learn to love it like I do, you&apos;re in the right place.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
