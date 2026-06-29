// A subtle, brief (~2s) school-spirit moment shown after a student selects their
// campus, before the course details settle in. With a verified campus_spirit row
// it washes the school's colors + a greeting ("Hotty Toddy!"); with NO verified
// row it shows a neutral, on-brand navy/red moment — never a guessed color/chant.
// Honors prefers-reduced-motion (no animation; a quick static beat, then done).
import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";

import type { CampusSpirit } from "@/lib/campus-spirit";

const NAVY = "#14213D";
const RED = "#CE1126";

export function SpiritMoment({
  spirit, schoolName, onDone,
}: { spirit: CampusSpirit | null; schoolName: string | null; onDone: () => void }) {
  const reduce = useReducedMotion();

  useEffect(() => {
    const t = setTimeout(onDone, reduce ? 600 : 2000);
    return () => clearTimeout(t);
  }, [reduce, onDone]);

  const primary = spirit?.primary_hex ?? NAVY;
  const secondary = spirit?.secondary_hex ?? RED;
  const headline = spirit
    ? (spirit.greeting ?? `Go ${spirit.mascot}!`)
    : "Let's get you ready.";
  const sub = spirit
    ? (schoolName ?? null)
    : (schoolName ? `${schoolName} — let's do this.` : null);

  const bg = `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`;

  if (reduce) {
    return (
      <div className="fixed inset-0 z-[60] grid place-content-center text-center" style={{ background: bg }}>
        <div>
          <p className="px-6 text-3xl font-bold text-white">{headline}</p>
          {sub && <p className="mt-2 text-sm font-medium text-white/80">{sub}</p>}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="fixed inset-0 z-[60] grid place-content-center text-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      style={{ background: bg }}
    >
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="px-6 text-3xl font-bold text-white sm:text-4xl" style={{ textShadow: "0 2px 24px rgba(0,0,0,0.3)" }}>
          {headline}
        </p>
        {sub && <p className="mt-2 text-sm font-medium text-white/80">{sub}</p>}
      </motion.div>
    </motion.div>
  );
}
