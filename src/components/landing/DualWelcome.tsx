// The dual welcome — speaks to both audiences on one page: the struggler who
// wants to survive, and the lover ("LOA") who wants to go deeper.
import { LifeBuoy, Rocket } from "lucide-react";
import { Reveal } from "@/components/landing/Reveal";

const NAVY = "#14213D";
const RED = "#CE1126";

const CARDS = [
  {
    icon: LifeBuoy, iconBg: RED, title: "Just need to survive it?",
    body: "I'll cut the fluff and focus on what actually moves the needle — quick wins, clear patterns, and exactly what your exam tests. Nothing else.",
  },
  {
    icon: Rocket, iconBg: NAVY, title: "Love accounting like I do?",
    body: "Here's where it gets fun: the why behind the rules, what actually matters on the job, and how far down the rabbit hole goes. Accounting's a lifelong puzzle — anyone who says it's boring just had the wrong guide.",
  },
];

export default function DualWelcome({ className }: { className?: string }) {
  return (
    // Tinted gradient panel for section depth/alternation.
    <section
      className={className}
      style={{ background: "linear-gradient(180deg, #F8FAFC 0%, #EEF2F9 55%, #F8FAFC 100%)" }}
    >
      <div className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
        <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl" style={{ color: NAVY }}>
          Every student is welcome here.
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {CARDS.map((c, i) => (
            <Reveal key={c.title} delay={i * 0.1} className="h-full">
              <div className="h-full rounded-3xl border border-gray-200/80 bg-white p-7 shadow-[0_8px_30px_-18px_rgba(20,33,61,0.3)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_20px_44px_-22px_rgba(20,33,61,0.4)]">
                <div className="grid h-12 w-12 place-content-center rounded-2xl text-white" style={{ background: c.iconBg }}>
                  <c.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-bold" style={{ color: NAVY }}>{c.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-gray-700">{c.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
