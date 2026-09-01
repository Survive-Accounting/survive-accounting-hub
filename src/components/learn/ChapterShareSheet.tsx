// THE SHARE SHEET (learn-share-flow, Phase 4) — the deliverable. A chair picked her chapter; this
// is what she came for: what her chapter gets, then the link, ready to send. NEVER gated behind a
// form — the whole promise was 30 seconds. The ask comes AFTER a copy, and is fully skippable.
//
// The link is the CAMPUS link (/s/<campus>), not a per-chapter one: it survives being forwarded
// council → chair → member → a friend at another chapter, and the CTA bar adapts on the far end.
// A per-chapter link breaks at the first hop. (Phase 5 stamps the sharer's ?by= onto it.)
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Check, X, Send } from "lucide-react";

import { NEON } from "@/components/canvas/theme";
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { SEAT_MINIMUM, SEAT_PRICE } from "@/components/site/ChapterAccess";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { LEE_SIGNOFF } from "@/lib/partners";
import { nbspCode } from "@/lib/course-code";
import { submitIntake } from "@/lib/intake.functions";
import { listCampusIntroCodes } from "@/lib/default-map.functions";
import { schoolBySlug } from "@/lib/schools";

const ORIGIN = "surviveaccounting.com";
const AMBER = NEON.yellow;

export function ChapterShareSheet({
  campusSlug,
  campusName,
  chapterName,
  sharerBy,
  testing,
  onClose,
}: {
  campusSlug: string;
  campusName: string;
  chapterName: string;
  /** The SHARER's contact id, stamped onto the link as ?by= so the forward chain stays visible
   *  (learn-share-flow §8). This is the "reuse an existing id" half: the last known human this
   *  browser carries. Minting a brand-new contact for a fully anonymous sharer is a follow-up
   *  (it needs a data home) — until then an anonymous share simply carries no by. */
  sharerBy?: string | null;
  /** In ?test mode: don't read course codes or write the ask. */
  testing?: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<"link" | "message" | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [shared, setShared] = useState(false);

  const campus = schoolBySlug(campusSlug);
  const codeQ = useQuery({
    queryKey: ["share-sheet-code", campus?.campusId],
    queryFn: () => listCampusIntroCodes({ data: { ids: [campus!.campusId] } }),
    enabled: !testing && !!campus?.campusId,
    staleTime: 600_000,
    networkMode: "always",
  });
  const code = testing ? "AC 210" : codeQ.data?.find((c) => c.campusId === campus?.campusId)?.code ?? null;
  const course = code ? nbspCode(code) : "intro accounting";

  // THE ONE LINK — campus-level, so it survives forwarding, stamped with the sharer's ?by= so the
  // council → chair → member → friend chain stays visible.
  const plainLink = `${ORIGIN}/s/${campusSlug}${sharerBy ? `?by=${sharerBy}` : ""}`;
  const message = [
    `Free ${course} prep for ${chapterName} — the whole first exam is free.`,
    `Cram videos, practice questions, full walkthroughs. No account, nothing to buy.`,
    plainLink,
    ``,
    LEE_SIGNOFF,
  ].join("\n");

  const copy = async (what: "link" | "message") => {
    const text = what === "link" ? `https://${plainLink}` : message;
    const ok = await copyToClipboard(text);
    setShared(true); // the ask appears after any copy attempt, even a blocked one
    setCopied(ok ? what : null);
    setCopyFailed(!ok);
    if (ok) window.setTimeout(() => setCopied((c) => (c === what ? null : c)), 2400);
  };

  return (
    <div className="fixed inset-0 z-[97] flex items-end justify-center sm:items-center" style={{ background: "rgba(4,7,14,0.7)" }} onClick={onClose}>
      <div
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl px-4 pb-5 pt-4 sm:max-w-[440px] sm:rounded-2xl"
        style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}`, fontFamily: BRAND_SANS }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between">
          <p className="text-[12px] font-black uppercase tracking-[0.12em]" style={{ color: AMBER }}>
            {chapterName} <span aria-hidden style={{ opacity: 0.5 }}>·</span> {campusName}
          </p>
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: NEON.muted }} aria-label="Close"><X size={16} /></button>
        </div>

        {/* WHAT YOUR CHAPTER GETS — before any ask (§6). */}
        <div className="mt-2 rounded-xl p-3.5" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${NEON.borderSoft}` }}>
          <p className="text-[12px] font-black uppercase tracking-wide" style={{ color: NEON.green }}>Free for every member, right now</p>
          <ul className="mt-1.5 space-y-1 text-[13px]" style={{ color: NEON.text }}>
            <li className="flex gap-2"><Check size={15} style={{ color: NEON.green, flexShrink: 0 }} /> Exam 1 — every topic, videos and practice</li>
            <li className="flex gap-2"><Check size={15} style={{ color: NEON.green, flexShrink: 0 }} /> No account, no cost, nothing to buy</li>
          </ul>
          <p className="mt-3 text-[12px] font-black uppercase tracking-wide" style={{ color: NEON.muted }}>Sponsored by your chapter, if you want it later</p>
          <ul className="mt-1.5 space-y-1 text-[12.5px]" style={{ color: NEON.muted }}>
            <li>· Exams 2, 3, and the Final</li>
            <li>· ${SEAT_PRICE} per member, {SEAT_MINIMUM} minimum</li>
          </ul>
        </div>

        {/* THE SHARE BLOCK — the link + copy (§6). This is the deliverable; never gated. */}
        <div className="mt-3">
          <p className="w-full break-all rounded-xl px-3.5 py-2.5 text-[13px] font-bold" style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}>{plainLink}</p>
          <div className="mt-2 flex gap-2">
            <button onClick={() => void copy("link")} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-black" style={{ background: copied === "link" ? NEON.green : AMBER, color: "#0B1220" }}>
              {copied === "link" ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy link</>}
            </button>
            <button onClick={() => void copy("message")} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-black" style={{ background: copied === "message" ? NEON.green : "rgba(255,255,255,0.08)", color: copied === "message" ? "#0B1220" : NEON.text, border: `1px solid ${NEON.borderSoft}` }}>
              {copied === "message" ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy message</>}
            </button>
          </div>
          {copyFailed && (
            <div className="mt-2">
              <p role="alert" className="mb-1 text-[12px] font-bold" style={{ color: NEON.red }}>This browser blocked the copy — select the message and copy by hand.</p>
              <pre className="w-full overflow-y-auto whitespace-pre-wrap break-words rounded-xl px-3 py-2.5 text-[12px] leading-relaxed" style={{ maxHeight: 160, background: "rgba(0,0,0,0.3)", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}>{message}</pre>
            </div>
          )}
        </div>

        {/* THE ASK — only after a copy has happened (§7), fully skippable. */}
        {shared && (
          <ShareAsk campusSlug={campusSlug} campusName={campusName} chapterName={chapterName} code={code} testing={testing} onDone={onClose} />
        )}
      </div>
    </div>
  );
}

function ShareAsk({
  campusSlug, campusName, chapterName, code, testing, onDone,
}: {
  campusSlug: string; campusName: string; chapterName: string; code: string | null; testing?: boolean; onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [exam2, setExam2] = useState(false);
  const [sponsor, setSponsor] = useState(false);
  const [updates, setUpdates] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const canSend = emailOk && (exam2 || sponsor || updates);

  const send = async () => {
    if (!canSend || busy) return;
    setBusy(true);
    try {
      if (!testing) {
        const campus = campusSlug;
        // THE WARM CHAPTER LEAD — the middle checkbox. Its own greek_sponsor_interest row so it
        // surfaces in the growth dashboard with her name, chapter, and campus (§7).
        if (sponsor) {
          await submitIntake({ data: {
            kind: "greek_sponsor_interest", email: email.trim(), name: name.trim() || null,
            campusSlug: campus, campusName, chapter: chapterName, courseCode: code,
            note: `${name.trim() || "A member"} is interested in ${chapterName} sponsoring Exams 2/3/Final.`,
            source: "learn-cta-ask", skipConfirmation: true,
          } }).catch(() => {});
        }
        // Exam 2 news / general updates — a lighter capture, deduped by the intake layer.
        if (exam2 || updates) {
          await submitIntake({ data: {
            kind: "notify_exam", email: email.trim(), name: name.trim() || null,
            campusSlug: campus, campusName, chapter: chapterName, courseCode: code, exam: 2,
            source: "learn-cta-ask", skipConfirmation: true,
          } }).catch(() => {});
        }
      }
      setDone(true);
      window.setTimeout(onDone, 1400);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="mt-4 rounded-xl px-4 py-4 text-center" style={{ background: "rgba(47,191,113,0.12)", border: `1px solid ${NEON.green}` }}>
        <Check size={22} className="mx-auto" style={{ color: NEON.green }} />
        <p className="mt-1 text-[13.5px] font-black" style={{ color: NEON.text }}>Got it — I'll be in touch.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t pt-3" style={{ borderColor: NEON.borderSoft }}>
      <p className="text-[13.5px] font-black" style={{ color: NEON.text, fontFamily: BRAND_DISPLAY }}>Want me to keep you posted?</p>
      <div className="mt-2 flex flex-col gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full rounded-xl px-3.5 outline-none" style={{ minHeight: 46, fontSize: 16, background: "rgba(0,0,0,0.24)", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" placeholder="Your email" className="w-full rounded-xl px-3.5 outline-none" style={{ minHeight: 46, fontSize: 16, background: "rgba(0,0,0,0.24)", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} />
      </div>
      <div className="mt-2.5 flex flex-col gap-2">
        <Check3 checked={exam2} onChange={setExam2} label="Send me the Exam 2 material when it's ready" />
        <Check3 checked={sponsor} onChange={setSponsor} label={`I'm interested in ${chapterName} sponsoring Exams 2, 3 and the Final`} />
        <Check3 checked={updates} onChange={setUpdates} label="Just send me occasional updates" />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={() => void send()} disabled={!canSend || busy} className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13.5px] font-black disabled:opacity-50" style={{ background: AMBER, color: "#0B1220" }}>
          <Send size={14} /> {busy ? "Sending…" : "Send"}
        </button>
        <button onClick={onDone} className="text-[13px] font-bold" style={{ color: NEON.muted }}>Skip</button>
      </div>
    </div>
  );
}

function Check3({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex items-start gap-2.5 rounded-xl px-3 py-2 text-left" style={{ background: checked ? "rgba(252,163,17,0.1)" : "rgba(255,255,255,0.03)", border: `1px solid ${checked ? AMBER : NEON.borderSoft}` }}>
      <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded" style={{ background: checked ? AMBER : "transparent", border: `1px solid ${checked ? AMBER : NEON.muted}` }}>
        {checked && <Check size={12} style={{ color: "#0B1220" }} />}
      </span>
      <span className="text-[12.5px]" style={{ color: NEON.text }}>{label}</span>
    </button>
  );
}
