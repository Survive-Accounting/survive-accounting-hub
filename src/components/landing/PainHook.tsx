// The pain hook — progressive reveal of "my exam looked nothing like…".
// Items stagger in once the section scrolls into view (Lee's progressive-reveal
// teaching style), then the punchline lands.
import { useEffect, useRef, useState } from "react";

const NAVY = "#14213D";
const RED = "#CE1126";

const ITEMS = [
  "my lectures",
  "my quizzes",
  "my homework",
  "the textbook",
  "the solution manual",
];

export default function PainHook({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setStarted(true); },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    if (shown >= ITEMS.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 250 : 380);
    return () => clearTimeout(t);
  }, [started, shown]);

  const allShown = shown >= ITEMS.length;

  return (
    <section ref={ref} className={className} style={{ background: NAVY }}>
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:py-24">
        <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.55)" }}>
          The #1 thing I hear
        </p>
        <h2 className="mt-3 text-3xl font-bold leading-tight text-white sm:text-4xl">
          "My exam looked <span style={{ color: RED }}>nothing</span> like…"
        </h2>

        <ul className="mx-auto mt-8 flex max-w-xl flex-wrap justify-center gap-2.5">
          {ITEMS.map((item, i) => (
            <li
              key={item}
              className="rounded-full border px-4 py-2 text-sm font-medium transition-all duration-500"
              style={{
                borderColor: "rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.92)",
                opacity: i < shown ? 1 : 0,
                transform: i < shown ? "translateY(0)" : "translateY(8px)",
              }}
            >
              {item}
            </li>
          ))}
        </ul>

        <p
          className="mt-10 text-xl font-bold transition-opacity duration-700 sm:text-2xl"
          style={{ color: "white", opacity: allShown ? 1 : 0 }}
        >
          I totally get it. My videos make sure nothing on test day surprises you.
        </p>

        <div className="mt-8 transition-opacity duration-700" style={{ opacity: allShown ? 1 : 0 }}>
          <a
            href="/order"
            className="inline-flex items-center justify-center gap-2 rounded-2xl px-8 py-3.5 text-[15px] font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110"
            style={{ background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)`, boxShadow: "0 10px 28px rgba(206,17,38,0.35)" }}
          >
            Request Help Video →
          </a>
        </div>
      </div>
    </section>
  );
}
