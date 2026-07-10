// /beyond — stubbed future content hub ("Beyond the Exam"). Coming-soon + the
// same free-video email capture so curious visitors have somewhere to land.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Toaster } from "sonner";

import SiteNavbar from "@/components/landing/SiteNavbar";
import SiteFooter from "@/components/landing/SiteFooter";
import FreeVideoCapture from "@/components/landing/FreeVideoCapture";

const NAVY = "#14213D";
const RED = "#CE1126";

export const Route = createFileRoute("/beyond")({
  head: () => ({
    meta: [
      { title: "Beyond the Exam — Survive Accounting" },
      {
        name: "description",
        content:
          "More than passing the test: why major in accounting, the real-world stuff school skips, and how to land a Big Four interview. Coming soon.",
      },
      { property: "og:title", content: "Beyond the Exam — Survive Accounting" },
      { property: "og:url", content: "https://surviveaccounting.com/beyond" },
    ],
    links: [{ rel: "canonical", href: "https://surviveaccounting.com/beyond" }],
  }),
  component: BeyondPage,
});

const TOPICS = [
  "Why major in accounting (and what it's actually like)",
  "EINs, LLCs & getting set up as self-employed",
  "Payroll & taxes without the panic",
  "How to land — and pass — a Big Four interview",
];

function BeyondPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen" style={{ background: "#F8FAFC" }}>
      <SiteNavbar onBookTutoring={() => navigate({ to: "/onboard" })} />

      <section className="px-4 pt-28 pb-12 text-center sm:pt-32">
        <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: RED }}>Beyond the exam</p>
        <h1 className="mx-auto mt-2 max-w-2xl text-3xl font-bold leading-tight sm:text-4xl" style={{ color: NAVY }}>
          Accounting is more than passing the test
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[15px] text-gray-600 sm:text-base">
          This is where the deeper, real-world content will live. It&apos;s coming — drop your
          email below and you&apos;ll be first to get it.
        </p>
        <ul className="mx-auto mt-8 grid max-w-xl gap-2.5 text-left sm:grid-cols-2">
          {TOPICS.map((t) => (
            <li key={t} className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm">
              {t} <span className="text-gray-400">· soon</span>
            </li>
          ))}
        </ul>
      </section>

      <FreeVideoCapture />
      <SiteFooter />
      <Toaster position="top-center" richColors />
    </div>
  );
}
