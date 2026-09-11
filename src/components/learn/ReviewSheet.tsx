// LEAVE A REVIEW (Lee, 2026-09-11, the polish brief §12): "Leave a review" used to link to the
// home page's testimonials; now it opens this sheet — name, email, campus, five stars, a comment
// — and writes one row through reviews.functions' submitReview (public.student_reviews; nothing
// is published). Centred on a desk, a bottom sheet on a phone; the same chrome as the bar's other
// sheets (.lk-sheet). Prefilled from what the page already knows: the account's email, the
// campus, the course and the exam (those three are shown, not edited — they are the page's
// context, and a review is about where the student is). Name is asked (the session has no name).
//
// THE STARS are five real radio inputs (one radiogroup): arrow keys move, Space picks, a screen
// reader hears "3 of 5 stars"; the visual star is the label. Escape and a click outside close.
// Success: "Thanks — your review means a lot." Demo mode never writes.
import { useId, useState, type FormEvent } from "react";
import { Check, Loader2, Star, X } from "lucide-react";

import { BRAND_SANS } from "@/components/canvas/brand";
import { EMAIL_RE, isUuid } from "@/components/learn/learn-gate";
import { LK } from "@/components/learn/learn-theme";
import { submitReview } from "@/lib/reviews.functions";
import { useDismiss } from "@/lib/use-dismiss";

export const REVIEW_THANKS = "Thanks — your review means a lot.";

export function ReviewSheet({ narrow, email, userId, campusId, campusSlug, campusName, courseCode, examLabel, demo, onClose }: {
  narrow: boolean;
  email: string | null;
  userId: string | null;
  campusId: string | null;
  campusSlug: string | null;
  campusName: string | null;
  courseCode: string | null;
  examLabel: string | null;
  demo: boolean;
  onClose: () => void;
}) {
  const ref = useDismiss<HTMLDivElement>(onClose);
  const id = useId();
  const [name, setName] = useState("");
  const [mail, setMail] = useState(email ?? "");
  const [campus, setCampus] = useState(campusName ?? "");
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"open" | "busy" | "done" | "error">("open");
  const [msg, setMsg] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (state === "busy") return;
    if (!name.trim()) { setState("error"); setMsg("Add your name."); return; }
    if (!EMAIL_RE.test(mail.trim())) { setState("error"); setMsg("Enter a valid email."); return; }
    if (!rating) { setState("error"); setMsg("Pick a star rating."); return; }
    if (!comment.trim()) { setState("error"); setMsg("Write a few words."); return; }
    setState("busy");
    try {
      if (!demo) {
        await submitReview({ data: {
          name: name.trim(), email: mail.trim(), rating, comment: comment.trim(),
          campusId: isUuid(campusId) ? campusId : null, campusSlug: campusSlug ?? (campus.trim() || null), courseCode, exam: examLabel,
          userId: isUuid(userId) ? userId : null, sourcePath: "/learn", isTest: false,
        } });
      }
      setState("done");
    } catch (err) {
      setState("error");
      setMsg(err instanceof Error && err.message ? err.message : "Couldn't save that — try again in a moment.");
    }
  };

  const field = { fontFamily: BRAND_SANS } as const;
  const label = { display: "block", fontSize: 12, fontWeight: 700, color: LK.muted, marginBottom: 4, fontFamily: BRAND_SANS } as const;
  const context = [courseCode, examLabel].filter(Boolean).join(" · ");
  return (
    <div className="fixed inset-0 z-[110] flex justify-center" style={{ background: "rgba(0,0,0,0.55)", alignItems: narrow ? "flex-end" : "center", padding: narrow ? 0 : 16 }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} className={`lk-sheet lk-in ${narrow ? "rounded-t-2xl" : "rounded-2xl"}`} style={{ maxWidth: narrow ? undefined : 460, maxHeight: narrow ? "92dvh" : "calc(100dvh - 32px)", overflowY: "auto", padding: 20, paddingBottom: narrow ? "max(20px, env(safe-area-inset-bottom, 0px))" : 20 }}>
        <div className="mb-3 flex items-center justify-between">
          <span id={`${id}-title`} className="lk-disp" style={{ fontSize: 22 }}>Leave a review</span>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full" style={{ background: LK.border, color: LK.text, border: 0, cursor: "pointer" }}><X className="h-4 w-4" /></button>
        </div>
        {state === "done" ? (
          <div className="py-4 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full" style={{ background: LK.green, color: "#fff" }}><Check className="h-6 w-6" /></span>
            <p className="lk-disp mt-3" style={{ fontSize: 18, margin: "12px 0 0" }}>{REVIEW_THANKS}</p>
            <button type="button" onClick={onClose} className="lk-btn lk-btn-ghost mt-4">Back to cramming</button>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="flex flex-col" style={{ gap: 12 }}>
            <div className="grid gap-3" style={{ gridTemplateColumns: narrow ? "1fr" : "1fr 1fr" }}>
              <div>
                <label htmlFor={`${id}-name`} style={label}>Name</label>
                <input id={`${id}-name`} className="lk-field" autoComplete="name" value={name} onChange={(e) => { setName(e.target.value); if (state === "error") setState("open"); }} style={field} autoFocus={!narrow} />
              </div>
              <div>
                <label htmlFor={`${id}-email`} style={label}>Email</label>
                <input id={`${id}-email`} type="email" inputMode="email" autoComplete="email" className="lk-field" value={mail} onChange={(e) => { setMail(e.target.value); if (state === "error") setState("open"); }} style={field} />
              </div>
            </div>
            <div>
              <label htmlFor={`${id}-campus`} style={label}>Campus</label>
              {campusName ? (
                <div className="lk-field flex items-center justify-between" style={{ ...field, background: LK.surface, color: LK.text }}>
                  <span className="truncate">{campusName}</span>
                  {context && <span className="ml-3 shrink-0 text-[12.5px] font-semibold" style={{ color: LK.muted }}>{context}</span>}
                </div>
              ) : (
                <input id={`${id}-campus`} className="lk-field" placeholder="Your school" value={campus} onChange={(e) => setCampus(e.target.value)} style={field} />
              )}
            </div>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={label}>Rating</legend>
              <div role="radiogroup" aria-label="Rating, 1 to 5 stars" className="flex items-center" style={{ gap: 4 }} onMouseLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map((n) => {
                  const lit = n <= (hover || rating);
                  return (
                    <label key={n} className="relative grid cursor-pointer place-items-center rounded-lg" style={{ width: 40, height: 40 }} onMouseEnter={() => setHover(n)} title={`${n} of 5 stars`}>
                      <input type="radio" name={`${id}-rating`} value={n} checked={rating === n} onChange={() => { setRating(n); if (state === "error") setState("open"); }} aria-label={`${n} of 5 stars`} className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                      <Star className="h-7 w-7 transition-transform peer-focus-visible:scale-110" style={{ color: lit ? LK.acc : LK.dim, fill: lit ? LK.acc : "transparent", transition: "color 120ms, fill 120ms" }} aria-hidden />
                      <span className="pointer-events-none absolute inset-0 rounded-lg peer-focus-visible:ring-2" style={{ ["--tw-ring-color" as string]: LK.acc } as never} aria-hidden />
                    </label>
                  );
                })}
                <span className="ml-2 text-[12.5px] font-semibold tabular-nums" style={{ color: LK.muted, minWidth: 64 }}>{rating ? `${rating} of 5` : ""}</span>
              </div>
            </fieldset>
            <div>
              <label htmlFor={`${id}-comment`} style={label}>Your review</label>
              <textarea id={`${id}-comment`} className="lk-field" rows={4} placeholder="What did it do for you?" value={comment} onChange={(e) => { setComment(e.target.value); if (state === "error") setState("open"); }} style={{ ...field, resize: "vertical", minHeight: 96 }} />
            </div>
            {state === "error" && <p role="alert" className="text-[12.5px]" style={{ color: LK.red, margin: 0 }}>{msg}</p>}
            <button type="submit" disabled={state === "busy"} className="lk-btn-cta w-full disabled:opacity-60" style={{ minHeight: 50, fontSize: 15 }}>
              {state === "busy" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Send my review
            </button>
            <p className="text-[11.5px]" style={{ color: LK.dim, margin: 0, lineHeight: 1.4 }}>Reviews are read by Lee before anything is shown on the site.</p>
          </form>
        )}
      </div>
    </div>
  );
}
