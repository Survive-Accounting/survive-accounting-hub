// /rep/review/<partner>/<interview|approve|deny>?t=… — the links in Lee's review text. Work from
// his phone with no login: the signature in `t` is the credential (rep-review.server.ts).
//
// A GET never decides anything — SMS apps prefetch links — so this page shows who it is and a
// one-tap confirm. Once decided, every link for that applicant is dead ("already approved").
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { CTA, RepShell } from "@/components/reps/RepApply";
import { decideFromReviewLink, getReviewLink, type ReviewLinkState } from "@/lib/rep-pre-onboarding.functions";
import { comfortLabel } from "@/lib/rep-pre-onboarding";

export const Route = createFileRoute("/rep_/review/$partnerId/$decision")({
  validateSearch: (s: Record<string, unknown>): { t?: string } => (typeof s.t === "string" ? { t: s.t } : {}),
  head: () => ({ meta: [{ title: "Rep review — Survive" }, { name: "robots", content: "noindex" }] }),
  component: ReviewPage,
});

type Decision = "interview" | "approve" | "deny";
const isDecision = (s: string): s is Decision => s === "interview" || s === "approve" || s === "deny";

const VERB: Record<Decision, { title: string; button: string; done: string }> = {
  interview: { title: "Invite to a call?", button: "Send the call text", done: "Sent. After the call, the approve / deny links are in your texts — and below." },
  approve: { title: "Approve after the call?", button: "Approve — text them", done: "Approved. Their dashboard is open and they have your text." },
  deny: { title: "Deny?", button: "Deny — text them", done: "Done. They have your text; the application is held for future semesters." },
};

function ReviewPage() {
  const { partnerId, decision } = Route.useParams();
  const { t } = Route.useSearch();
  const [st, setSt] = useState<ReviewLinkState | { ok: false; error: string } | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof decideFromReviewLink>> | null>(null);
  const [busy, setBusy] = useState(false);
  const d = isDecision(decision) ? decision : null;

  useEffect(() => {
    if (!d) { setSt({ ok: false, error: "That link isn't valid." }); return; }
    void getReviewLink({ data: { partnerId, decision: d, t: t ?? null } }).then(setSt).catch(() => setSt({ ok: false, error: "Couldn't reach the server." }));
  }, [partnerId, d, t]);

  const confirm = async () => {
    if (!d || !t || busy) return;
    setBusy(true);
    try { setResult(await decideFromReviewLink({ data: { partnerId, decision: d, t } })); }
    catch { setResult({ ok: false, error: "Couldn't reach the server — try again." }); }
    finally { setBusy(false); }
  };

  const sans: React.CSSProperties = { fontFamily: BRAND_SANS };
  const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-default)" };

  return (
    <RepShell>
      <section className="mx-auto max-w-sm pt-12" style={sans}>
        {!st && <p className="text-center text-[14px]" style={{ color: "var(--text-muted)" }}>Checking the link…</p>}
        {st && !st.ok && <><h1 className="text-[22px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>Can't use this link.</h1><p className="mt-2 text-[14px]" style={{ color: "#F3C6CC" }}>{st.error}</p></>}

        {st?.ok && st.decided && (
          <>
            <p className="text-[12px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.14em" }}>Already decided</p>
            <h1 className="mt-2 text-[24px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>This one is {st.decision}{st.repNumber ? ` — rep #${st.repNumber}` : ""}.</h1>
            <p className="mt-2 text-[14px]" style={{ color: "var(--text-muted)" }}>The links in that text are one-time. Anything else goes through the roster.</p>
          </>
        )}

        {st?.ok && !st.decided && d && !result && (
          <>
            <p className="text-[12px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.14em" }}>{VERB[d].title}</p>
            <h1 className="mt-2 text-[26px] font-black leading-[1.1]" style={{ fontFamily: BRAND_DISPLAY }}>{st.name} · {st.campus}</h1>
            <div className="mt-4 grid gap-2 rounded-2xl p-4 text-[13.5px]" style={card}>
              <p><b>{st.studentStatus === "alumni" ? "Alumni" : "Student"}</b>{st.major ? ` · ${st.major}` : ""} · {st.flow.replace(/_/g, " ")}{st.invitedAt ? " · invited to a call" : ""}</p>
              {st.why && <p style={{ color: "var(--text-muted)" }}>“{st.why}”</p>}
              <p><b>Comfortable with:</b> {st.comfort.length ? st.comfort.map(comfortLabel).join(" · ") : "—"}</p>
              <p><b>Chapters:</b> {st.targets} picked · {st.connections} with a connection</p>
            </div>
            {d === "approve" && !st.invitedAt && <p className="mt-3 text-[12.5px]" style={{ color: "#FFC9A3" }}>Heads up: you haven't sent the call text yet. Approving now skips the call.</p>}
            <button type="button" onClick={() => void confirm()} disabled={busy || !t} className="mt-5 w-full rounded-xl text-[15px] font-black disabled:opacity-40" style={{ ...CTA, ...(d === "deny" ? { background: "#F3C6CC" } : {}) }}>
              {busy ? "One sec…" : VERB[d].button}
            </button>
          </>
        )}

        {result && !result.ok && <p className="mt-4 text-[13px]" role="alert" style={{ color: "#F3C6CC" }}>{result.error}</p>}
        {result?.ok && d && (
          <>
            <p className="text-[12px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.14em" }}>Done</p>
            <h1 className="mt-2 text-[24px] font-black leading-[1.1]" style={{ fontFamily: BRAND_DISPLAY }}>{VERB[d].done}</h1>
            {"repNumber" in result && result.repNumber ? <p className="mt-2 text-[14px]">Rep #{result.repNumber}{result.assignedCount != null ? ` · ${result.assignedCount} chapters assigned${result.skipped ? `, ${result.skipped} already held` : ""}` : ""}</p> : null}
            <div className="mt-4 rounded-2xl p-4 text-[13px]" style={{ ...card, whiteSpace: "pre-wrap" }}>
              <p className="text-[11px] font-black uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.12em" }}>{result.sms.ok ? "Texted to them" : `Not sent (${result.sms.reason ?? "?"}) — the text would have been`}</p>
              <p className="mt-1">{result.sms.preview}</p>
            </div>
            {result.leeSms && (
              <div className="mt-3 rounded-2xl p-4 text-[13px]" style={{ ...card, whiteSpace: "pre-wrap" }}>
                <p className="text-[11px] font-black uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.12em" }}>Your next two links</p>
                <p className="mt-1">{result.leeSms.split("\n").map((line, i) => {
                  const m = /^(Approve|Deny): (\S+)$/.exec(line);
                  return m ? <span key={i} className="block"><a href={m[2]} className="font-bold underline underline-offset-4" style={{ color: "var(--accent)" }}>{m[1]} →</a></span> : <span key={i} className="block">{line}</span>;
                })}</p>
              </div>
            )}
          </>
        )}
      </section>
    </RepShell>
  );
}
