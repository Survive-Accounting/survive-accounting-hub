// /offer/mckenzie — a job offer, for Mckenzie.
//
// A private page Lee texts to his wife. Not a document: something she opens at an airport, reads
// in three minutes, and feels something about.
//
// ── THE COPY IS LEE'S, VERBATIM ───────────────────────────────────────────────────────────────
// Every line of prose on this page was written by him and is reproduced exactly — the jokes, the
// contractions, "plz help", "butterbean", the lot. It is not marketing copy and must never be
// smoothed into any. If a future pass is tempted to "tighten" a sentence here: don't. The voice
// IS the product on this page.
//
// SHE IS ANALYTICAL, so numbers are stated plainly and never propped up with adjectives. The
// vision is a table because she will read the numbers first; the terms are a table for the same
// reason. Nowhere does a word do a number's job.
//
// Mobile first — she is opening this on a phone.
//
// NO email capture, no urgency, no countdown, no analytics beyond the site pixel, no stock
// photography. Both buttons text him; she is not a lead.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { DEFAULT_FRAME_THEME, FrameBackground, frameThemeVars } from "@/components/frames";
import { useNavyDocument } from "@/components/site/SiteHeader";
import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { DOOR_CARD_CSS, DOOR_CTA_VARS } from "@/components/site/home-two-door/DoorCard";
import { checkOfferPassword, offerUnlocked } from "@/lib/offer-gate.functions";
import { OFFER_PHOTO_URL } from "@/lib/site-config";
import { ogMeta } from "@/lib/og";
import { scrollToId } from "@/lib/ui-scroll";

/** Both buttons and the task CTA open a text to Lee. No form, no fields. */
const LEE_SMS = "sms:+16012018759";

const TASK_ID = "task";
const VISION_ID = "vision";

export const Route = createFileRoute("/offer/mckenzie")({
  // Read the cookie on the server so a returning visit renders the offer directly instead of
  // flashing the gate and then replacing it.
  loader: async () => ({ unlocked: await offerUnlocked().catch(() => false) }),
  head: () => ({
    meta: [
      ...ogMeta({
        title: "Formal Job Offer — Mckenzie Ingram",
        description: "Director of Experience · Survive Accounting",
        path: "/offer/mckenzie",
      }),
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OfferPage,
});

function OfferPage() {
  const { unlocked } = Route.useLoaderData();
  const [open, setOpen] = useState(unlocked);
  useNavyDocument();

  return (
    <div
      style={{
        ...frameThemeVars(DEFAULT_FRAME_THEME),
        ...DOOR_CTA_VARS,
        background: "var(--bg-page)", color: "var(--brand-cream)",
        minHeight: "100dvh", position: "relative", overflowX: "clip",
        fontFamily: BRAND_SANS,
      }}
    >
      <style>{DOOR_CARD_CSS}</style>
      <style>{OFFER_CSS}</style>
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
        <FrameBackground variant="orbital" intensity={0.3} animate />
      </div>
      <div style={{ position: "relative", zIndex: 1 }}>
        {open ? <Offer /> : <Gate onPass={() => setOpen(true)} />}
      </div>
    </div>
  );
}

// ── 1. THE GATE ───────────────────────────────────────────────────────────────────────────────
/** The whole first screen: bolt, prompt, hint, field. Nothing else. */
function Gate({ onPass }: { onPass: () => void }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [nope, setNope] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const submit = async () => {
    if (busy || !pw.trim()) return;
    setBusy(true);
    setNope(false);
    try {
      const r = await checkOfferPassword({ data: { password: pw } });
      if (r.ok) { onPass(); return; }
      // A shake and "nope". No error styling, no counter, no lockout.
      setNope(true);
      boxRef.current?.classList.remove("offer-shake");
      void boxRef.current?.offsetWidth; // restart the animation
      boxRef.current?.classList.add("offer-shake");
    } catch {
      setNope(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main
      className="mx-auto flex w-full max-w-[420px] flex-col items-center justify-center px-6 text-center"
      style={{ minHeight: "100dvh" }}
    >
      <div ref={boxRef} className="w-full">
        <div className="mx-auto mb-8 inline-block"><BoltBoil height={72} /></div>

        <p className="text-[14px]" style={{ color: "var(--brand-cream)", opacity: 0.9 }}>
          Enter family password to view offer
        </p>

        <input
          autoFocus
          type="password"
          value={pw}
          onChange={(e) => { setPw(e.target.value); setNope(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
          aria-label="Family password"
          className="mt-4 w-full rounded-xl px-4 text-center outline-none"
          style={{
            fontSize: 16, minHeight: 52,
            background: "rgba(0,0,0,0.35)", border: "1px solid var(--border-default)",
            color: "var(--brand-cream)", letterSpacing: "0.2em",
          }}
        />

        <p className="mt-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          hint: it&apos;s our boy
        </p>

        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="mt-5 w-full rounded-xl text-[15px] font-black disabled:opacity-45"
          style={{ minHeight: 52, background: "var(--accent)", color: "#0B1220", border: 0, cursor: "pointer" }}
        >
          Enter
        </button>

        {nope && (
          <p className="mt-3 text-[13px]" style={{ color: "var(--text-muted)" }}>nope</p>
        )}
      </div>
    </main>
  );
}

// ── THE OFFER ─────────────────────────────────────────────────────────────────────────────────
function Offer() {
  return (
    <main className="mx-auto w-full max-w-[680px] px-5 pb-24 pt-10 sm:pt-14">
      {/* THE HEADSHOT. A circle at the top, the way a job offer carries the person it is for.
          The slot stays EMPTY until the real photo is dropped in — nothing is substituted. */}
      {OFFER_PHOTO_URL && (
        <div className="mb-8 flex justify-center">
          <div
            className="relative overflow-hidden"
            style={{
              width: 168, height: 168, borderRadius: "50%",
              boxShadow: "0 20px 50px -20px rgba(0,0,0,0.85)",
              // A hairline ring so the circle reads as a portrait frame against the navy rather
              // than as a photo that happens to be round.
              outline: "1px solid rgba(245,239,230,0.18)", outlineOffset: 2,
              background: "rgba(0,0,0,0.3)",
            }}
          >
            {/* See the note above: the crop is done by size + offset, not object-fit, because
                cover cannot reach the top sixth of a 3:4 image inside a square. */}
            <img
              src={OFFER_PHOTO_URL}
              alt="Mckenzie Ingram"
              className="absolute max-w-none"
              style={{ width: "209.7%", left: "-40.8%", top: "-11.9%" }}
            />
          </div>
        </div>
      )}

      {/* ── 3. HERO ─────────────────────────────────────────────────────────────────────────── */}
      <section className="text-center">
        <div className="mx-auto mb-6 inline-block"><BoltBoil height={84} /></div>

        <p className="text-[11.5px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.18em" }}>
          Formal job offer
        </p>
        <h1 className="mt-3 text-[30px] font-black leading-tight sm:text-[36px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
          Mckenzie Ingram
        </h1>
        <p className="mt-1 text-[17px] font-extrabold" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", opacity: 0.85 }}>
          Director of Experience
        </p>
        <p className="mt-1 text-[13px] uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.14em" }}>
          Survive Accounting
        </p>
      </section>

      <section className="mt-12 text-center">
        <p className="mx-auto max-w-[24ch] text-[24px] font-black leading-[1.2] sm:text-[30px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
          I think I&apos;ve built the road map to a seven-figure business for us.
        </p>
        <p className="mx-auto mt-5 max-w-[30ch] text-[17px] font-bold leading-snug" style={{ color: "var(--brand-cream)", opacity: 0.86 }}>
          I can&apos;t draw the map and drive the car at the same time.
        </p>
        {/* Its own line. It is the joke and the actual ask. */}
        <p className="mt-5 text-[19px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--accent)" }}>
          plz help
        </p>
      </section>

      {/* ── 4. THE JOB ──────────────────────────────────────────────────────────────────────── */}
      <section className="mt-14">
        <p className="text-[15px] leading-relaxed" style={{ color: "var(--brand-cream)", opacity: 0.9 }}>
          For Survive to succeed, three people have to have a great experience:
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {[
            ["Campus reps", "sign up and start sharing with chapters immediately"],
            ["Scholarship chairs", "sign their chapter up and start inviting members"],
            ["Students", "sign up and start studying"],
          ].map(([who, what]) => (
            <div
              key={who}
              className="rounded-xl px-4 py-3"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
            >
              <div className="text-[11.5px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.14em" }}>{who}</div>
              <div className="mt-0.5 text-[14px]" style={{ color: "var(--brand-cream)", opacity: 0.85 }}>{what}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-4 text-[15px] leading-relaxed" style={{ color: "var(--brand-cream)", opacity: 0.9 }}>
          <p>The faster and easier we make it for those three, the faster this grows.</p>
          <p>
            This is where you can help. It isn&apos;t a technical role. It&apos;s pulling up what I build on
            your phone or laptop and telling me when it&apos;s annoying or confusing — and how the
            process should work instead.
          </p>
          <p>
            I bring the big ideas, the teaching, the videos, and the building. I need you to bring
            your brain, your Svetlana vibes, and your Leo queen energy.
          </p>
          <p>
            Once there&apos;s enough revenue coming in, we hire VAs — managed by King — until neither of
            us is doing any of the work.
          </p>
        </div>
      </section>

      {/* ── 5. TWO DOORS ────────────────────────────────────────────────────────────────────── */}
      <section className="mt-14 grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => scrollToId(TASK_ID)}
          className="sa-door-card flex flex-col items-center rounded-2xl px-5 py-6 text-center"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", cursor: "pointer" }}
        >
          <span className="mb-3 inline-block"><BoltBoil height={72} /></span>
          <span className="text-[15px] font-black uppercase" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "0.04em" }}>
            Try a small task
          </span>
          <span className="mt-3 w-full rounded-xl px-4 py-3 text-[14.5px] font-black" style={{ background: "var(--cta-solo-bg)", color: "var(--cta-solo-fg)" }}>
            A task for the airport →
          </span>
          <span className="mt-3 text-[13px]" style={{ color: "var(--text-muted)" }}>Easy to learn. Huge impact.</span>
        </button>

        <button
          type="button"
          onClick={() => scrollToId(VISION_ID)}
          className="sa-door-card flex flex-col items-center rounded-2xl px-5 py-6 text-center"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", cursor: "pointer" }}
        >
          <span className="mb-3 inline-block"><GlobeMark height={72} /></span>
          <span className="text-[15px] font-black uppercase" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "0.04em" }}>
            See the vision
          </span>
          <span className="mt-3 w-full rounded-xl px-4 py-3 text-[14.5px] font-black" style={{ background: "var(--cta-chapter-bg)", color: "var(--cta-chapter-fg)" }}>
            2030 and beyond →
          </span>
          <span className="mt-3 text-[13px]" style={{ color: "var(--text-muted)" }}>500 campuses. New courses, same niche.</span>
        </button>
      </section>

      {/* ── 6. THE SMALL TASK ───────────────────────────────────────────────────────────────── */}
      <section id={TASK_ID} className="sa-anchor mt-14 rounded-2xl px-5 py-6" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
        <p className="text-[11.5px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.16em" }}>
          Your first task — perfect for an airport
        </p>
        <h2 className="mt-3 text-[20px] font-black leading-snug" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
          Find personal Instagram handles for scholarship chairs.
        </h2>
        <p className="mt-3 text-[14.5px] leading-relaxed" style={{ color: "var(--brand-cream)", opacity: 0.85 }}>
          It&apos;s the most valuable data we collect. I built a system for finding them at scale.
        </p>
        <a
          href={`${LEE_SMS}?&body=${encodeURIComponent("Walk me through the Instagram handles task")}`}
          className="mt-5 inline-flex w-full items-center justify-center rounded-xl px-5 text-[15px] font-black sm:w-auto"
          style={{ minHeight: 52, background: "var(--accent)", color: "#0B1220" }}
        >
          I&apos;ll walk you through it →
        </a>
      </section>

      {/* ── 7. THE VISION ───────────────────────────────────────────────────────────────────── */}
      <section id={VISION_ID} className="sa-anchor mt-14">
        <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--border-default)" }}>
          <table className="w-full text-left" style={{ borderCollapse: "collapse" }}>
            <tbody>
              {[
                ["Fall 2026", "8+ campuses", "$30,000 – $150,000"],
                ["50 campuses", "~$20k each per year", "$1,000,000"],
                ["250 campuses", "", "$5,000,000"],
                ["500 campuses", "2030", "$10,000,000"],
              ].map(([a, b, c], i) => (
                <tr key={a} style={{ borderTop: i === 0 ? undefined : "1px solid var(--border-subtle)" }}>
                  <td className="px-4 py-3 text-[12.5px] font-black uppercase" style={{ color: "var(--brand-cream)", letterSpacing: "0.1em", whiteSpace: "nowrap" }}>{a}</td>
                  <td className="px-4 py-3 text-[13px]" style={{ color: "var(--text-muted)" }}>{b}</td>
                  <td className="px-4 py-3 text-right text-[15px] font-black tabular-nums" style={{ color: "var(--accent)", whiteSpace: "nowrap" }}>{c}</td>
                </tr>
              ))}
              <tr style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <td className="px-4 py-3 align-top text-[12.5px] font-black uppercase" style={{ color: "var(--brand-cream)", letterSpacing: "0.1em", whiteSpace: "nowrap" }}>And then</td>
                <td className="px-4 py-3 text-[13px]" colSpan={2} style={{ color: "var(--brand-cream)", opacity: 0.85 }}>
                  Intro &amp; Intermediate Accounting complete<br />
                  Finance · Stats · Chemistry<br />
                  Same platform, new courses, same Greek niche
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex flex-col gap-3 text-[15px] leading-relaxed" style={{ color: "var(--brand-cream)", opacity: 0.9 }}>
          <p>
            Each campus becomes a small business that mostly runs itself — us, some VAs, maybe a few
            employees at the right time.
          </p>
          <p className="font-black" style={{ color: "var(--brand-cream)", opacity: 1 }}>2030 = initiate dream life.</p>
        </div>
      </section>

      {/* ── 8. TERMS ────────────────────────────────────────────────────────────────────────── */}
      <section className="mt-14">
        <div className="overflow-hidden rounded-2xl" style={{ border: "1px solid var(--border-default)" }}>
          <table className="w-full text-left" style={{ borderCollapse: "collapse" }}>
            <tbody>
              {[
                ["Title", <>Director of Experience</>],
                ["Reports to", <>Yourself.</>],
                ["Hours", <>~10/week to start. Measured in campus launches you assist, not hours.</>],
                ["Compensation", <>2% of revenue to your spending account. 2% to mine.<br />At $1M/year — the 2030 goal — that&apos;s $20k each.</>],
                ["Start date", <>Monday, September 14</>],
                ["Equity", <>We already own 100% of it together, butterbean.</>],
              ].map(([label, value], i) => (
                <tr key={String(label)} style={{ borderTop: i === 0 ? undefined : "1px solid var(--border-subtle)" }}>
                  <td className="px-4 py-3 align-top text-[11.5px] font-black uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.12em", whiteSpace: "nowrap" }}>{label as string}</td>
                  <td className="px-4 py-3 text-[14.5px] leading-relaxed" style={{ color: "var(--brand-cream)" }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── 9. THE CLOSE ────────────────────────────────────────────────────────────────────── */}
      {/* TYPED, NOT DESIGNED. No bullets, no cards, no accent colour — a letter that happens to
          be on a webpage. Anything decorative added here would make it read as content. */}
      <section className="mt-16">
        <p className="text-[19px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
          Time to be a real man
        </p>

        <div className="mt-4 flex flex-col gap-4 text-[15.5px] leading-relaxed" style={{ color: "var(--brand-cream)", opacity: 0.92 }}>
          <p>It&apos;s long overdue that I put down my pride and ask you for more help.</p>
          <p>
            As Director of Experience, you&apos;ll help us build simple tools and processes for the
            people who make this business work — campus reps, VAs, scholarship chairs, and the
            students using Survive to study.
          </p>
          <p>
            I want every student on our platform to feel the way you feel when we go to Costco
            together.
          </p>
          <p>
            Let&apos;s do this together, because I can&apos;t do it alone. And you&apos;re my favorite person.
          </p>
          <p>
            I know you&apos;ve been struggling with a sense of purpose. I hope this shows you how I see
            you, and gives you a path to one. A fully delegated business, beautiful babies in a
            mountain home — mother-in-law suite included. Let&apos;s put some magick together and make
            it happen.
          </p>
          <p>Love you. Can&apos;t wait to see you soon.</p>
        </div>
      </section>

      {/* ── 11. BUTTONS ─────────────────────────────────────────────────────────────────────── */}
      <Answer />
    </main>
  );
}

/** Both text Lee and leave a small confirmation on the page. No form, no fields. */
function Answer() {
  const [said, setSaid] = useState<null | "yes" | "talk">(null);
  return (
    <section className="mt-12">
      <div className="grid gap-3 sm:grid-cols-2">
        <a
          href={`${LEE_SMS}?&body=${encodeURIComponent("I accept this offer")}`}
          onClick={() => setSaid("yes")}
          className="inline-flex items-center justify-center rounded-xl px-5 text-center text-[15px] font-black"
          style={{ minHeight: 54, background: "var(--cta-solo-bg)", color: "var(--cta-solo-fg)" }}
        >
          I accept this offer
        </a>
        <a
          href={`${LEE_SMS}?&body=${encodeURIComponent("Let's talk more about it")}`}
          onClick={() => setSaid("talk")}
          className="inline-flex items-center justify-center rounded-xl px-5 text-center text-[15px] font-black"
          style={{ minHeight: 54, background: "var(--cta-chapter-bg)", color: "var(--cta-chapter-fg)" }}
        >
          Let&apos;s talk more about it
        </a>
      </div>

      {said && (
        <p className="mt-4 text-center text-[14px] font-bold" style={{ color: "var(--accent)" }}>
          {said === "yes" ? "That opened a text to me. Send it and it's official ⚡" : "That opened a text to me — say whatever you want."}
        </p>
      )}
    </section>
  );
}

/** DOOR 2's mark — a globe, drawn in the same hand-drawn language as the site's other icons. */
function GlobeMark({ height = 72 }: { height?: number }) {
  return (
    <svg viewBox="0 0 72 72" width={height} height={height} fill="none" aria-hidden style={{ display: "block" }}>
      <circle cx="36" cy="36" r="26" stroke="var(--brand-cream)" strokeWidth={4} />
      <ellipse cx="36" cy="36" rx="11" ry="26" stroke="var(--brand-cream)" strokeWidth={3.5} />
      <path d="M11 28 H61" stroke="var(--brand-cream)" strokeWidth={3.5} strokeLinecap="round" />
      <path d="M11 44 H61" stroke="var(--brand-cream)" strokeWidth={3.5} strokeLinecap="round" />
      <circle cx="47" cy="24" r="3.5" fill="var(--accent)" />
    </svg>
  );
}

const OFFER_CSS = `
/* A shake, and nothing else. No red, no counter, no lockout — it is a family password. */
@keyframes offer-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-7px); }
  40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(2px); }
}
.offer-shake { animation: offer-shake 380ms ease; }
@media (prefers-reduced-motion: reduce) { .offer-shake { animation: none; } }
`;
