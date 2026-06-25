// Shared "How it works" 3-step band (used on / and /pricing).
import { ListChecks, BookOpen, Target } from "lucide-react";

const NAVY = "#14213D";

export default function HowItWorks({ className }: { className?: string }) {
  return (
    <section className={className}>
      <div className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
        <h2 className="text-center text-2xl font-bold sm:text-3xl" style={{ color: NAVY }}>
          How it works
        </h2>
        <div className="mt-10 grid gap-8 sm:grid-cols-3">
          <Step icon={<ListChecks className="h-6 w-6" />} n={1}
            title="Pick your plan"
            body="Test pass, semester membership, or 1-on-1." />
          <Step icon={<BookOpen className="h-6 w-6" />} n={2}
            title="Get your course's chapters"
            body="Matched to exactly what you're studying." />
          <Step icon={<Target className="h-6 w-6" />} n={3}
            title="Practice the real exam style"
            body={`The questions + explainers that fix "my exam looked nothing like."`} />
        </div>
      </div>
    </section>
  );
}

function Step({ icon, n, title, body }: {
  icon: React.ReactNode; n: number; title: string; body: string;
}) {
  return (
    <div className="text-center">
      <div className="mx-auto grid h-14 w-14 place-content-center rounded-2xl text-white" style={{ background: NAVY }}>
        {icon}
      </div>
      <div className="mt-4 text-xs font-bold uppercase tracking-wide text-gray-400">Step {n}</div>
      <h3 className="mt-1 text-lg font-semibold" style={{ color: NAVY }}>{title}</h3>
      <p className="mx-auto mt-2 max-w-xs text-sm text-gray-600">{body}</p>
    </div>
  );
}
