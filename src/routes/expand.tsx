// /expand — UNLISTED referral page. Audience: former students (tutoring alumni + past Survive
// Accounting users) arriving from a personal email from Lee. Not linked from anywhere on the site;
// noindex,nofollow. Krug: ONE screen, THREE tiers, biggest ask first — the forward is the product.
//
// GUARDS (deliberate, don't "improve" these):
//   · No email-capture gate anywhere. This audience is already known to Lee; asking to identify
//     themselves before the ask would be insulting and would kill the forward.
//   · Nothing commercial. No price, no seats, no plans. The word "free" appears only inside the two
//     pre-written messages, because that's the true and useful thing to say to a friend.
//   · The pre-written message copy is EXACT and must stay that way. Real people send these to real
//     friends — formalizing or lengthening them makes them unsendable. The only addition is the
//     ?src=expand tracking param, shown in the block so what you read is what you send.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Copy, MessageSquare, Play } from "lucide-react";

import { DEFAULT_FRAME_THEME, FrameBackground, frameThemeVars } from "@/components/frames";
import { BoltBoil, SurviveWordmark } from "@/components/brand-cards/bolt-boil";
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { getSiteSettings } from "@/lib/site-settings.functions";
import { logExpandEvent, submitReferral, type ExpandEvent } from "@/lib/referrals.functions";
import { Footer } from "./landing";

export const Route = createFileRoute("/expand")({
  head: () => ({ meta: [
    { title: "⚡ Help Survive Accounting grow" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  loader: () => getSiteSettings(),
  component: ExpandPage,
});

// The two messages, verbatim. `?src=expand` makes a forward attributable — arrivals land on the
// normal pages, and the chapter signup carries the source through its own flow.
const MSG_STUDENT = "My old accounting tutor built free exam prep for intro accounting — the first exam's completely free, no signup: https://surviveaccounting.com?src=expand";
const MSG_GREEK = "A buddy of mine gives fraternities free exam prep for intro accounting — free for the whole chapter, takes a minute to set up: https://surviveaccounting.com/chapters?src=expand";

/** Any YouTube form (watch?v= / youtu.be / embed / bare id) → an embed URL. Returns null when the
 *  setting is empty or unrecognizable, which renders the branded placeholder instead. */
function youtubeEmbed(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const id =
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/.exec(s)?.[1] ??
    (/^[\w-]{6,}$/.test(s) ? s : null);
  if (!id) return null;
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;
}

// Analytics are best-effort and must never block or break the ask.
const track = (event: ExpandEvent) => { void logExpandEvent({ data: { event } }).catch(() => {}); };

function ExpandPage() {
  const settings = Route.useLoaderData();
  const embed = youtubeEmbed(settings.expandVideoUrl);
  return (
    <div style={{ ...frameThemeVars(DEFAULT_FRAME_THEME), background: "var(--brand-navy)", color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY, minHeight: "100vh", position: "relative", overflowX: "hidden" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}><FrameBackground variant="orbital" intensity={0.32} animate /></div>
      <main style={{ position: "relative", zIndex: 1, maxWidth: 760, margin: "0 auto", padding: "0 18px" }}>

        {/* HERO — minimal. The ask is named in the headline; no scroll needed to know why you're here. */}
        <section className="flex flex-col items-center pt-14 pb-7 text-center sm:pt-20">
          <SurviveWordmark size={78} />
          <h1 className="mt-6 text-[25px] font-black leading-tight sm:text-[31px]" style={{ letterSpacing: "-0.01em" }}>
            Help me get this to the students who need it.
          </h1>
          <p className="mt-3.5 max-w-lg text-[14.5px] leading-relaxed sm:text-[15.5px]" style={{ color: "var(--brand-cream)", opacity: 0.86, fontFamily: BRAND_SANS }}>
            You knew Survive Accounting back when. Here's what it's become — and a small favor.
          </p>
        </section>

        {/* TIER 1 — THE VIDEO. No autoplay: this audience chose to be here, so a click starts it
            with sound on. Click-to-load also keeps YouTube's player off the page until wanted. */}
        <VideoBlock embed={embed} />

        {/* TIER 2 — THE FORWARD (the primary ask, and the page's real conversion) */}
        <section className="mt-11">
          <h2 className="text-center text-[19px] font-black sm:text-[22px]">The favor: send this to ONE person.</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <ForwardCard
              title="Know someone taking accounting?"
              message={MSG_STUDENT}
              copyEvent="copy_student"
              smsEvent="sms_student"
            />
            <ForwardCard
              title="Know someone who runs a fraternity or sorority?"
              message={MSG_GREEK}
              copyEvent="copy_greek"
              smsEvent="sms_greek"
            />
          </div>
        </section>

        {/* TIER 3 — THE FALLBACK. One box, unstructured on purpose. */}
        <ReferralForm />

        <Footer />
      </main>
    </div>
  );
}

function VideoBlock({ embed }: { embed: string | null }) {
  const [playing, setPlaying] = useState(false);
  return (
    <section className="overflow-hidden rounded-2xl" style={{ background: "rgba(245,239,230,0.05)", border: "1px solid rgba(252,163,17,0.4)" }}>
      <div className="relative w-full" style={{ aspectRatio: "16 / 9", background: "#0B1220" }}>
        {embed && playing ? (
          <iframe
            src={`${embed}&autoplay=1`}
            title="Survive Accounting — what it's become"
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          /* Branded poster — the boiling bolt. Doubles as the placeholder until the URL is set. */
          <div className="absolute inset-0 grid place-items-center px-6 text-center">
            <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-[0.16]" aria-hidden>
              <BoltBoil height={230} red="var(--bolt-primary)" blue="var(--bolt-secondary)" />
            </div>
            {embed ? (
              <button
                onClick={() => { setPlaying(true); track("play_video"); }}
                className="relative flex flex-col items-center gap-3 transition-transform hover:scale-[1.03]"
              >
                <span className="grid h-16 w-16 place-items-center rounded-full" style={{ background: "var(--accent)", color: "#0B1220", boxShadow: "0 18px 44px -14px rgba(252,163,17,0.66)" }}>
                  <Play className="ml-0.5 h-7 w-7" fill="#0B1220" />
                </span>
                <span className="text-[13.5px] font-bold" style={{ color: "var(--brand-cream)", fontFamily: BRAND_SANS }}>Two minutes — what it's become</span>
              </button>
            ) : (
              <p className="relative max-w-sm text-[13.5px] leading-relaxed" style={{ color: "var(--text-muted)", fontFamily: BRAND_SANS }}>
                Video's on its way. The favor below is the part that matters — it works without it.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// One forward card: the exact message in a readable block, a copy button that CONFIRMS, and — on
// phones, where nearly every forward will actually happen — a Messages deep-link with no recipient
// so the sender picks the person in their own address book.
function ForwardCard({ title, message, copyEvent, smsEvent }: { title: string; message: string; copyEvent: ExpandEvent; smsEvent: ExpandEvent }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true); setFailed(false); track(copyEvent);
      setTimeout(() => setCopied(false), 2600);
    } catch { setFailed(true); }
  };
  return (
    <div className="flex flex-col rounded-2xl p-4 sm:p-5" style={{ background: "rgba(245,239,230,0.05)", border: "1px solid rgba(245,239,230,0.13)", fontFamily: BRAND_SANS }}>
      <h3 className="text-[15px] font-black leading-snug" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>{title}</h3>
      <p className="mt-3 flex-1 rounded-xl px-3.5 py-3 text-[13.5px] leading-relaxed" style={{ background: "rgba(0,0,0,0.26)", border: "1px solid rgba(245,239,230,0.12)", color: "var(--brand-cream)" }}>
        {message}
      </p>
      <button
        onClick={() => void copy()}
        className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-black transition-transform active:scale-[0.99]"
        style={{ background: copied ? "#3BF5A0" : "var(--accent)", color: "#0B1220" }}
      >
        {copied ? <><Check className="h-4 w-4" /> Copied — now paste it in a text</> : <><Copy className="h-4 w-4" /> Copy message</>}
      </button>
      {/* Phones only — the deep link opens Messages with the text prefilled and no recipient. */}
      <a
        href={`sms:?&body=${encodeURIComponent(message)}`}
        onClick={() => track(smsEvent)}
        className="mt-2 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 text-[14.5px] font-bold sm:hidden"
        style={{ border: "1px solid rgba(252,163,17,0.5)", color: "var(--accent)" }}
      >
        <MessageSquare className="h-4 w-4" /> Open in Messages
      </a>
      {failed && <p className="mt-2 text-[12px]" style={{ color: "#F3C6CC" }}>Couldn't copy automatically — press and hold the message above to copy it.</p>}
    </div>
  );
}

function ReferralForm() {
  const [text, setText] = useState("");
  const [email, setEmail] = useState("");
  const [okToName, setOkToName] = useState(false); // unchecked by default, deliberately
  const [state, setState] = useState<"open" | "busy" | "done" | "error">("open");
  const emailOk = !email.trim() || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const submit = async () => {
    const t = text.trim();
    if (!t || state === "busy" || !emailOk) return;
    setState("busy");
    try {
      await submitReferral({ data: { rawText: t, referrerEmail: email.trim() || null, okToName } });
      setState("done");
    } catch { setState("error"); }
  };
  const inputStyle = { background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)" } as const;

  return (
    <section className="mt-11" style={{ fontFamily: BRAND_SANS }}>
      <h2 className="text-center text-[17.5px] font-black sm:text-[19px]" style={{ fontFamily: BRAND_DISPLAY }}>
        Or, if you'd rather I reach out — who should I talk to?
      </h2>
      <div className="mx-auto mt-4 max-w-lg rounded-2xl p-4 sm:p-5" style={{ background: "rgba(245,239,230,0.05)", border: "1px solid rgba(245,239,230,0.13)" }}>
        {state === "done" ? (
          <p className="py-3 text-center text-[15px] font-bold" style={{ color: "var(--brand-cream)" }}>Got it — thank you.<br /><span style={{ color: "var(--accent)" }}>— Lee</span></p>
        ) : (
          <>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); if (state === "error") setState("open"); }}
              rows={4}
              placeholder="Name, chapter, campus — however you'd say it. (&ldquo;My little brother's roommate is in Sig Ep at Auburn&rdquo; works fine.)"
              className="w-full resize-y rounded-xl px-3.5 py-3 text-[14px] leading-relaxed outline-none"
              style={inputStyle}
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="Your email (optional — only if you're open to me following up)"
              className="mt-2.5 w-full rounded-xl px-3.5 py-3 text-[14px] outline-none"
              style={inputStyle}
            />
            {!emailOk && <p className="mt-1.5 text-[12px]" style={{ color: "#F3C6CC" }}>That email doesn't look right — fix it, or leave it blank.</p>}
            <label className="mt-3 flex cursor-pointer items-center gap-2.5 py-1 text-[13.5px]" style={{ color: "var(--brand-cream)" }}>
              <input type="checkbox" checked={okToName} onChange={(e) => setOkToName(e.target.checked)} className="h-[18px] w-[18px] shrink-0 accent-[var(--accent)]" />
              OK to mention you sent me
            </label>
            {state === "error" && <p className="mt-2 text-[12.5px]" style={{ color: "#F3C6CC" }}>That didn't send — try once more, or just text me below.</p>}
            <button
              onClick={() => void submit()}
              disabled={!text.trim() || !emailOk || state === "busy"}
              className="mt-3 min-h-[48px] w-full rounded-xl px-4 text-[15px] font-black transition-opacity disabled:opacity-40"
              style={{ background: "var(--accent)", color: "#0B1220" }}
            >
              {state === "busy" ? "Sending…" : "Send it to Lee"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
