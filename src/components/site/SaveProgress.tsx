// SAVE MY PROGRESS (08-21) — the optional benefit, never a gate. Exam 1 is fully usable signed
// out; this is the one natural door into the existing magic-link session (the same Supabase
// auth /learn uses — no parallel account system, no profile fields).
//
// WHAT "SAVED" MEANS TODAY (the data model that exists):
//   • the session itself (magic link) — so practice_attempts carry user_id from then on;
//   • student_set_progress (user_id, set_id, state) — in_progress when a set is opened,
//     complete when its practice/cram finishes (the same table /learn reads);
//   • a RESUME CONTEXT — exam / topic / set / stage (+ school slug, course, professor name) —
//     kept in localStorage and on the auth user's metadata, so the page they land on from the
//     link reopens where they were. School/course come from the ROUTE (campus page) or the
//     stored campus; the professor from the existing professor storage.
// Per-question answers are NOT persisted (no model for that yet — practice_attempts is a log).
import { useEffect, useState } from "react";
import { Loader2, Mail, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

export const RESUME_KEY = "sa-resume";

export interface ResumeContext {
  schoolSlug: string | null;
  courseCode: string | null;
  professorName: string | null;
  examNum: number;
  topicKey: string | null;
  setId: string | null;
  stage: "cram" | "practice" | "review";
  /** Where the link should bring them back to (the page they were on). */
  path: string;
  at: number;
}

export function writeResume(ctx: ResumeContext): void {
  try { localStorage.setItem(RESUME_KEY, JSON.stringify(ctx)); } catch { /* private mode */ }
}
/** Read-and-clear: a resume context is consumed exactly once, and only if it is fresh (7 days). */
export function takeResume(): ResumeContext | null {
  try {
    const raw = localStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    localStorage.removeItem(RESUME_KEY);
    const ctx = JSON.parse(raw) as ResumeContext;
    return Date.now() - (ctx.at ?? 0) < 7 * 86_400_000 ? ctx : null;
  } catch { return null; }
}

/** Per-set completion state under RLS — the same rows /learn reads. Best-effort; the UI never
 *  waits on it. 'complete' never downgrades. */
export function saveSetProgress(userId: string, setId: string, state: "in_progress" | "complete"): void {
  const t = supabase.from("student_set_progress" as never) as unknown as { upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => PromiseLike<{ error: { message?: string } | null }> };
  if (state === "in_progress") {
    // Don't clobber a finished set with "in progress" on a revisit.
    void (supabase.from("student_set_progress" as never) as unknown as { select: (c: string) => { eq: (k: string, v: string) => { eq: (k: string, v: string) => { maybeSingle: () => PromiseLike<{ data: { state?: string } | null }> } } } })
      .select("state").eq("user_id", userId).eq("set_id", setId).maybeSingle()
      .then((r) => { if (r.data?.state === "complete") return; void t.upsert({ user_id: userId, set_id: setId, state, updated_at: new Date().toISOString() }, { onConflict: "user_id,set_id" }); });
    return;
  }
  void t.upsert({ user_id: userId, set_id: setId, state, updated_at: new Date().toISOString() }, { onConflict: "user_id,set_id" });
}

/** The dialog: email in, link out. Bottom sheet on phones, centred card from sm up. */
export function SaveProgressDialog({ context, isTest, onClose }: { context: ResumeContext; isTest?: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const send = async () => {
    const e = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { setState("error"); setMsg("Enter a valid email."); return; }
    setState("sending");
    const ctx = { ...context, at: Date.now() };
    writeResume(ctx);
    const redirect = typeof window !== "undefined" ? `${window.location.origin}${ctx.path}` : undefined;
    // `data` lands on the auth user's metadata (new users) — the resume context survives a
    // different device; localStorage covers the same browser, which is the common case.
    const { error } = await supabase.auth.signInWithOtp({ email: e, options: { emailRedirectTo: redirect, data: { sa_resume: ctx, sa_is_test: !!isTest } } });
    if (error) { setState("error"); setMsg(error.message); return; }
    if (isTest) { void (async () => { const { markStep } = await import("@/lib/test-mode"); markStep("save", { email: e }); })(); }
    setState("sent");
  };
  return (
    <div className="fixed inset-0 z-[240] flex items-end justify-center sm:items-center sm:px-4" style={{ background: "rgba(5,8,16,0.72)" }} onClick={onClose}>
      <div role="dialog" aria-label="Save my progress" className="w-full max-w-[380px] rounded-t-2xl p-5 sm:rounded-2xl" style={{ background: "var(--bg-overlay, #0b1020)", border: "1px solid var(--border-default, rgba(148,163,190,0.16))", color: "var(--brand-cream, #F5EFE6)", boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)", paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4" style={{ color: "var(--accent, #FFA611)" }} />
          <span className="text-[15px] font-black">Save your progress</span>
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" style={{ color: "var(--text-muted, #93A0B4)" }}><X className="h-4 w-4" /></button>
        </div>
        {state === "sent" ? (
          <p className="mt-3 text-[14px] leading-relaxed" style={{ color: "var(--text-muted, #93A0B4)" }}>
            Check <b style={{ color: "var(--brand-cream, #F5EFE6)" }}>{email}</b> — one tap on the link brings you straight back here, signed in. No password, ever.
          </p>
        ) : (
          <>
            <p className="mt-2 text-[14px] leading-snug" style={{ color: "var(--text-muted, #93A0B4)" }}>Pick up right where you left off next time.</p>
            <input
              type="email" autoFocus inputMode="email" autoComplete="email" placeholder="you@school.edu"
              className="mt-3 w-full rounded-xl px-3 text-[15px] outline-none"
              style={{ minHeight: 46, background: "rgba(0,0,0,0.35)", border: "1px solid var(--border-default, rgba(148,163,190,0.16))", color: "var(--brand-cream, #F5EFE6)" }}
              value={email} onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("idle"); }}
              onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
            />
            {state === "error" && <p className="mt-1.5 text-[13px]" style={{ color: "#F3C6CC" }}>{msg}</p>}
            <button disabled={state === "sending"} onClick={() => void send()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl text-[14px] font-black disabled:opacity-50" style={{ minHeight: 46, background: "var(--accent, #FFA611)", color: "#0B1220" }}>
              {state === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Email me a sign-in link
            </button>
            <button onClick={onClose} className="mt-2 w-full text-[14px]" style={{ minHeight: 44, color: "var(--text-muted, #93A0B4)" }}>Keep studying without saving</button>
          </>
        )}
      </div>
    </div>
  );
}
