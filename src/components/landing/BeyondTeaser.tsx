// "Beyond the Exam" teaser — points the curious to the future content hub (/beyond).
import { ArrowRight } from "lucide-react";

const NAVY = "#14213D";
const RED = "#CE1126";

export default function BeyondTeaser({ className }: { className?: string }) {
  return (
    <section className={className} style={{ background: "#FFFFFF" }}>
      <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:py-20">
        <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: RED }}>
          Beyond the exam
        </p>
        <h2 className="mx-auto mt-2 max-w-2xl text-2xl font-bold leading-tight sm:text-3xl" style={{ color: NAVY }}>
          Accounting is more than passing the test.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-[15px] text-gray-600">
          Why major in accounting, the real-world stuff school skips — EINs &amp; LLCs, payroll,
          taxes, self-employment — and how to land a Big Four interview. It&apos;s all coming.
        </p>
        <a
          href="/beyond"
          className="mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white transition hover:brightness-110"
          style={{ background: `linear-gradient(180deg, ${NAVY} 0%, #0B1426 100%)` }}
        >
          Take a look <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </section>
  );
}
