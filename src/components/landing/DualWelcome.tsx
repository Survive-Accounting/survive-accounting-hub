// The dual welcome — speaks to both audiences on one page: the struggler who
// wants to survive, and the lover ("LOA") who wants to go deeper.
import { LifeBuoy, Sparkles } from "lucide-react";

const NAVY = "#14213D";
const RED = "#CE1126";

export default function DualWelcome({ className }: { className?: string }) {
  return (
    <section className={className} style={{ background: "#F8FAFC" }}>
      <div className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
        <h2 className="text-center text-2xl font-bold sm:text-3xl" style={{ color: NAVY }}>
          Every student&apos;s welcome.
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <div className="rounded-3xl border border-gray-200 bg-white p-7 shadow-sm">
            <div className="grid h-12 w-12 place-content-center rounded-2xl text-white" style={{ background: RED }}>
              <LifeBuoy className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-bold" style={{ color: NAVY }}>Hate this course?</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-gray-700">
              I&apos;ll help you survive it better than anyone — focused on exactly what your exam
              tests, so you stop drowning in everything that doesn&apos;t matter.
            </p>
          </div>
          <div className="rounded-3xl border border-gray-200 bg-white p-7 shadow-sm">
            <div className="grid h-12 w-12 place-content-center rounded-2xl text-white" style={{ background: NAVY }}>
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-bold" style={{ color: NAVY }}>Love it like I do?</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-gray-700">
              I&apos;ll show you what makes it genuinely cool — and what&apos;s worth knowing for an
              exam vs. just for the joy of it. There&apos;s more here than passing the test.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
