// CAMPUS REP — the per-campus advertisement. SELF-VERIFY ERA: the old "send it to Lee and I'll
// reach out personally" application form is retired — signup is self-serve at /rep/join
// (form → phone verify → dashboard), so this page's one job is the pitch and the CTA.
//
// (The old form's work-authorization gate went with it; the server fn submitRepInterest still
// exists but nothing renders it. If the independent-contractor authorization check needs to
// return, it belongs on /rep/join now.)
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { useCampus } from "@/lib/campus-context";

export function RepInterest({ schoolName }: { schoolSlug?: string; schoolName: string }) {
  const { code } = useCampus();

  return (
    <main className="mx-auto w-full max-w-[620px] px-5 pb-24 pt-12 sm:pb-32" style={{ fontFamily: BRAND_SANS }}>
      <p className="text-[12px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.16em" }}>Campus reps</p>
      <h1 className="mt-3 text-[27px] font-black leading-[1.14] sm:text-[33px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.015em" }}>
        One job: get my free Exam&nbsp;1 prep into every chapter house at {schoolName}.
      </h1>

      <ul className="mt-6 flex flex-col gap-2.5">
        <li className="flex items-start gap-2.5 text-[14.5px] leading-relaxed" style={{ color: "var(--brand-cream)" }}>
          <span aria-hidden className="shrink-0" style={{ color: "var(--accent)" }}>⚡</span>
          <span>Find the right execs or advisors in each fraternity and sorority.</span>
        </li>
        <li className="flex items-start gap-2.5 text-[14.5px] leading-relaxed" style={{ color: "var(--brand-cream)" }}>
          <span aria-hidden className="shrink-0" style={{ color: "var(--accent)" }}>⚡</span>
          <span>Send them the free {code || "Exam 1"} kit. Get the flyer in the house.</span>
        </li>
        <li className="flex items-start gap-2.5 text-[14.5px] leading-relaxed" style={{ color: "var(--brand-cream)" }}>
          <span aria-hidden className="shrink-0" style={{ color: "var(--accent)" }}>⚡</span>
          <span>Earn <b style={{ color: "var(--accent)" }}>10%</b> of the revenue you generate — just one chapter can earn you <b style={{ color: "var(--accent)" }}>$300+</b>.</span>
        </li>
      </ul>

      {/* The honest line. It is the most persuasive thing on the page precisely because it is not
          a pitch — a student can tell the difference between a company hiring and a person asking. */}
      <p className="mt-6 text-[14px] italic leading-relaxed" style={{ color: "var(--text-muted)" }}>
        I&apos;m one person filming videos. I need help getting them in front of people who need them.
      </p>

      <a
        href="/rep/join"
        className="mt-8 flex w-full items-center justify-center rounded-xl text-[16px] font-black"
        style={{ minHeight: 54, background: "var(--accent)", color: "#0B1220" }}
      >
        Get started — takes 30 seconds ⚡
      </a>
      <p className="mt-2.5 text-center text-[12.5px]" style={{ color: "var(--text-muted)" }}>
        Sign up, verify your phone, and your dashboard opens — no waiting.
      </p>
    </main>
  );
}
