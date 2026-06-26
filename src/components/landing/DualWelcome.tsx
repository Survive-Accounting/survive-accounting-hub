// The dual welcome — speaks to both audiences on one page: the struggler who
// wants to survive, and the lover ("LOA") who wants to go deeper.
import { LifeBuoy, Rocket } from "lucide-react";

const NAVY = "#14213D";
const RED = "#CE1126";

export default function DualWelcome({ className }: { className?: string }) {
  return (
    <section className={className} style={{ background: "#F8FAFC" }}>
      <div className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
        <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl" style={{ color: NAVY }}>
          Every student is welcome here.
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <div className="rounded-3xl border border-gray-200 bg-white p-7 shadow-sm transition-shadow hover:shadow-md">
            <div className="grid h-12 w-12 place-content-center rounded-2xl text-white" style={{ background: RED }}>
              <LifeBuoy className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-bold" style={{ color: NAVY }}>Just need to survive it?</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-gray-700">
              I&apos;ll cut the fluff and focus on what actually moves the needle — quick wins, clear
              patterns, and exactly what your exam tests. Nothing else.
            </p>
          </div>
          <div className="rounded-3xl border border-gray-200 bg-white p-7 shadow-sm transition-shadow hover:shadow-md">
            <div className="grid h-12 w-12 place-content-center rounded-2xl text-white" style={{ background: NAVY }}>
              <Rocket className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-bold" style={{ color: NAVY }}>Love accounting like I do?</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-gray-700">
              Here&apos;s where it gets fun: the why behind the rules, what actually matters on the job,
              and how far down the rabbit hole goes. Accounting&apos;s a lifelong puzzle — anyone who
              says it&apos;s boring just had the wrong guide.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
