// THE CHAPTER GATE — an account before Exam 1 plays, on /go/ pages ONLY.
//
// WHY GREEK IS GATED AND SOLO IS NOT. On a chapter page the whole product is "your chapter set this
// up for you", and an exec who pays needs to know who joined. More concretely: a seat is an
// `entitlements` row, and an entitlement REQUIRES a user_id. Without an account a chapter can buy
// thirty seats and not one of them can be granted. The gate is what makes the paid product
// deliverable, not a marketing preference.
//
// The solo landing page keeps its "no account, no card" promise untouched — it is in the FAQ, and
// there the free exam is the whole pitch.
//
// MAGIC LINK, NOT A PLAIN EMAIL FIELD. A captured string in a table is not a user_id and cannot
// hold an entitlement, so a bare "enter your email" box would collect addresses and still leave
// seats ungrantable. This is Supabase OTP: the same sign-in exec already uses.
//
// WHAT THIS DELIBERATELY DOES NOT SAY: nothing here claims we check anyone against a chapter
// roster. We do not have rosters. The line is "your chapter's exec can see who joins", which is
// exactly what happens and nothing more.
import { useEffect, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { supabase } from "@/integrations/supabase/client";

export function ChapterGate({ chapterName }: { chapterName: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [redirect, setRedirect] = useState<string>();

  // Come back to THIS chapter page, not /learn: the link lands where the student already was, and
  // the return is what tags them to this chapter and reconciles any waiting seat.
  useEffect(() => { setRedirect(window.location.href); }, []);

  const send = async () => {
    const n = name.trim();
    const e = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { setState("error"); setMsg("That email doesn't look right."); return; }
    setState("sending"); setMsg("");
    try {
      // NAME RIDES ALONG ON THE ACCOUNT. Split into first/last so a text can say "Hey Jane"
      // rather than "Hey Jane Doe" — and so the exec roster, the Twilio alert and the
      // thank-you message all get a person instead of an email fragment.
      const [first, ...restName] = n.split(/\s+/).filter(Boolean);
      const { error } = await supabase.auth.signInWithOtp({
        email: e,
        options: {
          emailRedirectTo: redirect,
          data: { full_name: n, first_name: first ?? "", last_name: restName.join(" ") },
        },
      });
      if (error) { setState("error"); setMsg(error.message); return; }
      setState("sent");
    } catch { setState("error"); setMsg("Couldn't reach the server — try again in a moment."); }
  };

  return (
    <div className="grid h-full w-full place-items-center px-5 py-8" style={{ background: "var(--sa-surface-2)", fontFamily: BRAND_SANS }}>
      <div className="w-full max-w-sm text-center">
        {state === "sent" ? (
          <>
            <p className="text-[17px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Check your email ⚡</p>
            <p className="mx-auto mt-2 max-w-[34ch] text-[13.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              I sent a sign-in link to <span style={{ color: "var(--brand-cream)" }}>{email.trim()}</span>. Open it on this device and Exam 1 unlocks.
            </p>
            <button type="button" onClick={() => { setState("idle"); setMsg(""); }} className="mt-4 text-[12.5px] underline underline-offset-4" style={{ color: "var(--text-muted)", minHeight: 44 }}>
              Use a different email
            </button>
          </>
        ) : (
          <>
            <p className="text-[17px] font-black leading-snug" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
              Free Exam 1 for {chapterName} members
            </p>
            <p className="mt-2 text-[13.5px]" style={{ color: "var(--text-muted)" }}>
              Enter your email and I&apos;ll unlock it.
            </p>

            {/* NAME FIRST. It is the lower-commitment field, and leading with email makes the
                whole thing read as a signup form. DELIBERATELY UNVALIDATED — no required last
                name, no format rule. Anything that stops a student reaching the video costs more
                than a tidy roster gains. */}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
              autoComplete="name"
              placeholder="Your name"
              aria-label="Your name"
              className="mt-4 w-full rounded-xl px-3.5 text-center outline-none focus:ring-2"
              style={{ fontSize: 16, minHeight: 50, background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.18)", color: "var(--brand-cream)" }}
            />
            <input
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("idle"); }}
              onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@school.edu"
              aria-label="Your email"
              className="mt-2 w-full rounded-xl px-3.5 text-center outline-none focus:ring-2"
              // 16px explicitly — under it iOS zooms the page on focus and never zooms back.
              style={{ fontSize: 16, minHeight: 50, background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.18)", color: "var(--brand-cream)" }}
            />

            {state === "error" && <p className="mt-2 text-[12.5px]" role="alert" style={{ color: "#F3C6CC" }}>{msg}</p>}

            <button
              type="button"
              onClick={() => void send()}
              disabled={state === "sending"}
              className="mt-3 w-full rounded-xl text-[15.5px] font-black transition-opacity disabled:opacity-50"
              style={{ minHeight: 52, background: "var(--accent)", color: "#0B1220" }}
            >
              {state === "sending" ? "Sending…" : "Unlock Exam 1 ⚡"}
            </button>

            {/* A .edu address is PREFERRED, not required — plenty of students live in Gmail, and a
                hard .edu rule would lock out the exact people a chapter is trying to help. */}
            <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Your school email works best. Your chapter&apos;s exec can see who joins.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
