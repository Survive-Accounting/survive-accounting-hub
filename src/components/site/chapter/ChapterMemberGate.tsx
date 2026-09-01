// THE MEMBER GATE — the /go page's one form, and the reason the page exists.
//
// ── WHY THIS FILE EXISTS AT ALL ───────────────────────────────────────────────────────────────
// ChapterGate (the magic-link version) only ever mounted INSIDE ExamPlayer, passed down as
// `videoGate`. Commit 2a410e66 set `hidePlayer` on chapter pages, so the player stopped
// rendering and the gate went with it. Since then /go/<campus>/<chapter> has rendered ZERO
// inputs: every "Start cramming →" and every sticky "Exam 1 Free" scrolled to an `#exam1` anchor
// that no longer existed either. The page has been a brochure.
//
// So the gate is its own section now. It does not need a player to exist, and it owns `#exam1`.
//
// ── AND WHY IT NO LONGER SENDS A MAGIC LINK ───────────────────────────────────────────────────
// The old gate's argument was that a seat is an `entitlements` row and an entitlement needs a
// user_id, so a captured email cannot hold a seat. Still true — and seat grants are blocked on
// 0118 regardless, so today the magic link buys nothing and costs the student the exact moment
// they were about to start studying. Name, email, in. When seats unblock, an account can be
// created from the captured address; nothing here forecloses that.
//
// ── THE CHECKBOX, AND THE ONE RULE ABOUT IT ───────────────────────────────────────────────────
// It is UNCHECKED. A checked-by-default box turns "14 members want this" into "14 members didn't
// opt out", and that number gets put in front of a scholarship chair. The default is the whole
// integrity of the number, which is why it is also stored as its own record rather than as a
// flag on the signup — see joinChapterAsMember.
//
// NO PRICING ON THIS SCREEN. Not a per-seat rate, not a minimum, not a hint. A member does not
// need the deal in her head; that conversation belongs to the chair. One line is enough.
import { useEffect, useState } from "react";

import { ArrowRight, Check } from "lucide-react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { Bolt } from "@/components/canvas/brand";
import { nbspCode } from "@/lib/course-code";
import { currentContactRef } from "@/lib/contact-ref";
import { joinChapterAsMember } from "@/lib/greek-go.functions";
import { deviceAnonId } from "@/lib/device-id";

export function ChapterMemberGate({ id, schoolSlug, chapterSlug, chapterName, letters, schoolName, code, bolt, onJoined, onStartExam, initialDone = false }: {
  /** The anchor. This section IS `#exam1`. */
  id: string;
  schoolSlug: string;
  chapterSlug: string;
  chapterName: string;
  /** What students call the chapter — "Chi Omega", "ADPi". Used in the checkbox verbatim. */
  letters: string;
  schoolName: string;
  code: string | null;
  bolt: { c1: string; c2: string };
  /** Fired after a successful join, so the page can record the member and move on. */
  onJoined?: () => void;
  /** This member has already joined (an account, or this device's own record). The section still
   *  RENDERS — it owns #exam1, and an anchor that only exists for strangers is the bug this
   *  component was written to fix — it just opens on the Exam 1 door instead of the form. */
  initialDone?: boolean;
  /** Into Exam 1. Owned by the route, because only it knows where the player lives. */
  onStartExam: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [wantsSponsor, setWantsSponsor] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">(initialDone ? "done" : "idle");
  // initialDone arrives from a client-only read (localStorage / the auth session), so it is false
  // on the server render and can flip a tick later. Without this the returning member sees the
  // form for one frame and then watches it swap.
  useEffect(() => { if (initialDone) setState((s) => (s === "idle" ? "done" : s)); }, [initialDone]);
  const [err, setErr] = useState("");

  // Read once on the client: the ref that brought them, and this browser's de-dup handle.
  const [ctx, setCtx] = useState<{ ref: string | null; deviceId: string | null }>({ ref: null, deviceId: null });
  useEffect(() => { setCtx({ ref: currentContactRef(), deviceId: deviceAnonId() }); }, []);

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const ready = name.trim().length > 1 && emailOk;
  const course = code ? nbspCode(code) : "intro accounting";

  const submit = async () => {
    if (!ready || state === "sending") return;
    setState("sending"); setErr("");
    try {
      const r = await joinChapterAsMember({
        data: {
          schoolSlug, chapterSlug,
          name: name.trim(), email: email.trim(),
          wantsSponsor,
          ref: ctx.ref, deviceId: ctx.deviceId,
        },
      });
      if (!r.ok) { setState("error"); setErr("I couldn't find that chapter — text Lee and he'll sort it."); return; }
      setState("done");
      onJoined?.();
    } catch {
      setState("error");
      setErr("Couldn't reach the server — try again in a moment.");
    }
  };

  const FIELD: React.CSSProperties = {
    width: "100%", minHeight: 52, borderRadius: 12, padding: "0 14px",
    background: "var(--bg-input, rgba(0,0,0,0.24))",
    border: "1px solid var(--border-default)", color: "var(--brand-cream)",
    // 16px explicitly — under it iOS zooms the page on focus and never zooms back out.
    fontSize: 16, outline: "none",
  };

  return (
    <section
      id={id}
      className="sa-anchor mx-auto w-full max-w-[560px] scroll-mt-6 px-5 py-10"
      style={{ fontFamily: BRAND_SANS, position: "relative", zIndex: 1 }}
    >
      {/* ── THE CHAPTER'S OWN PAGE, SAID ABOVE THE FOLD ──────────────────────────────────────
          The letters and the campus bolt, before the ask. This framing is what earns the email:
          a member is handing her address to HER CHAPTER's page, not to a company she met in a
          group chat. Take the branding away and the same two fields read as a newsletter box. */}
      <div className="flex items-center justify-center gap-2.5">
        <span aria-hidden className="inline-block shrink-0" style={{ width: 22 }}>
          <Bolt c1={bolt.c1} c2={bolt.c2} title={`${schoolName} bolt`} />
        </span>
        <p className="text-[12.5px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.14em" }}>
          {letters} <span aria-hidden style={{ opacity: 0.5 }}>·</span> {schoolName}
        </p>
      </div>

      {state === "done" ? (
        <div className="mt-4 text-center">
          <p className="text-[22px] font-black leading-tight" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
            You&apos;re in. ⚡
          </p>
          <p className="mx-auto mt-2 max-w-[34ch] text-[14px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Exam 1 is free for every {letters} member — videos, practice questions and full
            walkthroughs for {course}.
          </p>
          {/* STRAIGHT INTO EXAM 1. One control, and it is the biggest thing on the screen. */}
          <button
            type="button"
            onClick={onStartExam}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl text-[16px] font-black"
            style={{ minHeight: 56, background: "var(--accent)", color: "#0B1220", border: 0, cursor: "pointer" }}
          >
            Start Exam 1 <ArrowRight className="h-4 w-4" />
          </button>
          {wantsSponsor && (
            <p className="mt-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              I&apos;ve noted that you&apos;d want {letters} to cover the rest.
            </p>
          )}
        </div>
      ) : (
        <>
          <h2
            className="mt-3 text-center text-[26px] font-black leading-[1.14] sm:text-[30px]"
            style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.015em" }}
          >
            Free {course} Exam 1 for {letters}
          </h2>
          <p className="mx-auto mt-2 max-w-[36ch] text-center text-[14.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            The whole first exam — cram videos, practice questions, walkthroughs. Nothing to buy.
          </p>

          <div className="mt-5 flex flex-col gap-2.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
              autoComplete="name"
              placeholder="Your name"
              aria-label="Your name"
              style={FIELD}
            />
            <input
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("idle"); }}
              onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@school.edu"
              aria-label="Your email"
              style={FIELD}
            />
          </div>

          {/* ── THE CHECKBOX ──────────────────────────────────────────────────────────────────
              The chapter's REAL letters and the campus's REAL course code, so it reads as a
              sentence about her house rather than a generic upsell. Unchecked, always. */}
          <button
            type="button"
            role="checkbox"
            aria-checked={wantsSponsor}
            onClick={() => setWantsSponsor((v) => !v)}
            className="mt-3 flex w-full items-start gap-3 rounded-xl px-3.5 py-3 text-left"
            style={{
              background: wantsSponsor ? "rgba(252,163,17,0.09)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${wantsSponsor ? "var(--accent)" : "var(--border-default)"}`,
              cursor: "pointer", minHeight: 56,
            }}
          >
            <span
              aria-hidden
              className="mt-0.5 grid shrink-0 place-items-center rounded-md"
              style={{
                height: 22, width: 22,
                background: wantsSponsor ? "var(--accent)" : "transparent",
                border: `2px solid ${wantsSponsor ? "var(--accent)" : "var(--border-default)"}`,
                color: "#0B1220",
              }}
            >
              {wantsSponsor && <Check className="h-3.5 w-3.5" strokeWidth={3.5} />}
            </span>
            <span className="min-w-0 text-[14px] leading-snug" style={{ color: "var(--brand-cream)" }}>
              I&apos;d want <span className="font-black">{letters}</span> to sponsor{" "}
              <span className="font-black">{course}</span> for me
            </span>
          </button>
          {/* THE ONLY THING SAID ABOUT MONEY ON THIS SCREEN. No rate, no minimum, no hint. */}
          <p className="mt-1.5 px-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            Chapters can cover this for their members.
          </p>

          {state === "error" && (
            <p role="alert" className="mt-2.5 text-[13px]" style={{ color: "#F3C6CC" }}>{err}</p>
          )}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={!ready || state === "sending"}
            className="mt-4 w-full rounded-xl text-[16px] font-black transition-opacity disabled:opacity-45"
            style={{ minHeight: 56, background: "var(--accent)", color: "#0B1220", border: 0, cursor: "pointer" }}
          >
            {state === "sending" ? "One second…" : "Start Exam 1 ⚡"}
          </button>

          <p className="mt-3 text-center text-[11.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Your school email works best. {letters}&apos;s exec can see who joins.
          </p>
        </>
      )}
    </section>
  );
}
