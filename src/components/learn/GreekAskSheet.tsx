// "IN A FRATERNITY OR SORORITY?" — the school picker's second step (2026-09-16).
//
// Lee: the home page's Start cramming "should open /learn with school picker up, also ask them if they're in a
// greek org." One question, two answers. Yes opens the chapter finder (the existing LearnChapterModule flow, so a
// pick here is the same pick a chair's link makes); No just closes. Nothing is written until a chapter is chosen.
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { useDismiss } from "@/lib/use-dismiss";

export function GreekAskSheet({ schoolName, onYes, onNo }: { schoolName: string | null; onYes: () => void; onNo: () => void }) {
  useDismiss<HTMLDivElement>(onNo, { outside: false });
  return (
    <div className="fixed inset-0 z-[240] flex items-end justify-center sm:items-center sm:px-4" style={{ background: "rgba(0,0,0,0.72)" }} onClick={onNo}>
      <div role="dialog" aria-label="Are you in a fraternity or sorority?" className="lk-in flex w-full max-w-[430px] flex-col rounded-t-2xl p-5 sm:rounded-2xl"
        style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-default)", boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)", paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))", fontFamily: BRAND_SANS, color: "var(--brand-cream)" }}
        onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[19px] font-black" style={{ fontFamily: BRAND_DISPLAY, lineHeight: 1.15 }}>Are you in a fraternity or sorority{schoolName ? ` at ${schoolName}` : ""}?</h3>
        <p className="mt-1.5 text-[13px]" style={{ color: "var(--text-muted)" }}>Your chapter can fund everyone's access. Pick it and it shows on your page.</p>
        <button type="button" autoFocus onClick={onYes} className="mt-4 w-full rounded-xl text-[14px] font-black" style={{ minHeight: 50, background: "var(--accent)", color: "#14213D", border: 0, cursor: "pointer", fontFamily: BRAND_DISPLAY, letterSpacing: "0.02em" }}>Yes — pick my chapter</button>
        <button type="button" onClick={onNo} className="mt-2 w-full rounded-xl text-[13px] font-bold" style={{ minHeight: 46, background: "rgba(255,255,255,0.08)", color: "var(--brand-cream)", border: "1px solid var(--border-default)", cursor: "pointer" }}>No, just me</button>
      </div>
    </div>
  );
}
