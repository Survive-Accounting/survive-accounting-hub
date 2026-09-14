// THE CHAPTER DASHBOARD'S BODY — shared by /chapters/dashboard (a chair, signed in) and
// /admin/chapter-test (an admin on the exec test chapter). Moved out of the route file on 2026-09-14
// so a second page can render it; the route keeps sign-in, this keeps everything after it.
import { useState } from "react";
import { Check, FileText, Image as ImageIcon, Loader2, MessageSquare, Minus, Plus, Presentation } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { SEAT_PRICE } from "@/components/site/ChapterAccess";
import { chapterGroupMe } from "@/components/learn/LearnChapterBar";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { saveFlyerImage } from "@/lib/flyer-image";
import { buildShareUrl } from "@/lib/share-url";
import { schoolBySlug } from "@/lib/schools";
import { LEE_PHONE_DISPLAY, LEE_SMS_HREF } from "@/lib/partners";
import {
  markChapterStep, requestChapterSeats, SEAT_REQUEST_MIN, SEAT_REQUEST_STEP,
  type ChapterHome, type ChapterStep,
} from "@/lib/chapter-dashboard.functions";

export const PANEL: React.CSSProperties = { background: "rgba(245,239,230,0.05)", border: "1px solid rgba(245,239,230,0.12)", borderRadius: 16 };
const BTN_QUIET: React.CSSProperties = { minHeight: 38, borderRadius: 10, padding: "0 12px", background: "rgba(245,239,230,0.08)", border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)", fontSize: 13, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" };

/** Who the dashboard acts as: the signed-in chair, or an admin on the exec test dashboard. */
export type DashboardAuth = { accessToken: string } | { preview: true };

export function Dashboard({ data, auth, onChange }: { data: ChapterHome; auth: DashboardAuth; onChange: (d: ChapterHome) => void }) {
  const short = data.letters || data.chapterName;
  const schoolId = (data.schoolSlug && schoolBySlug(data.schoolSlug)?.id) || data.schoolSlug;
  const membersLink = schoolId && data.chapterSlug ? buildShareUrl({ campus: schoolId, chapter: data.chapterSlug }) : null;
  const post = membersLink ? chapterGroupMe({ courseCode: data.courseCode, url: membersLink, chapter: short }) : null;
  const art = data.schoolSlug && data.chapterSlug ? `/api/flyer/${data.schoolSlug}/${data.chapterSlug}` : null;
  const fmtDate = (s: string) => { try { return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch { return "—"; } };

  const [copied, setCopied] = useState<"link" | "post" | null>(null);
  const copy = async (what: "link" | "post") => {
    const text = what === "link" ? membersLink : post;
    if (text && (await copyToClipboard(text))) { setCopied(what); window.setTimeout(() => setCopied(null), 1800); }
  };
  const [imgBusy, setImgBusy] = useState(false);
  const flyerImage = async () => {
    if (!art || imgBusy) return;
    setImgBusy(true);
    try { await saveFlyerImage(`${art}?f=svg`, `survive-${(data.chapterSlug ?? "chapter")}-flyer.png`); } catch { window.open(`${art}?f=svg`, "_blank", "noopener"); }
    finally { setImgBusy(false); }
  };

  const [stepBusy, setStepBusy] = useState<ChapterStep | null>(null);
  const toggleStep = async (step: ChapterStep) => {
    if (stepBusy) return;
    const done = !data.steps[step];
    setStepBusy(step);
    try {
      const r = await markChapterStep({ data: { ...auth, step, done } });
      if (r.ok) onChange({ ...data, steps: { ...data.steps, [step]: r.at } });
    } finally { setStepBusy(null); }
  };

  const nothingYet = data.membersJoined === 0;
  const stats: Array<{ label: string; value: string }> = [
    { label: "Members joined", value: data.membersJoined ? String(data.membersJoined) : "—" },
    { label: "Joined this week", value: data.joinedThisWeek ? String(data.joinedThisWeek) : "—" },
    { label: "Minutes watched this week", value: data.usage && data.usage.minutesWatched ? String(data.usage.minutesWatched) : "—" },
  ];
  const doneCount = Object.values(data.steps).filter(Boolean).length;

  return (
    <div className="mb-16 grid gap-3" style={{ fontFamily: BRAND_SANS }}>
      {/* THE CHAPTER + THE LINK THEIR MEMBERS JOIN FROM */}
      <section className="p-5" style={{ ...PANEL, border: "1px solid rgba(252,163,17,0.4)" }}>
        <p className="text-[11px] font-black uppercase" style={{ letterSpacing: "0.12em", color: "var(--text-muted)" }}>Chapter dashboard{data.isTest ? " · test" : ""}</p>
        <h1 className="mt-1 text-[22px] font-black leading-tight" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>{data.chapterName}</h1>
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>{data.schoolName}{data.courseCode ? ` · ${data.courseCode}` : ""}</p>
        <div className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(245,239,230,0.14)" }}>
          {membersLink ? (
            <>
              <span className="min-w-0 flex-1 truncate text-[13px] font-bold" style={{ color: "var(--accent)" }}>{membersLink.replace(/^https?:\/\//, "")}</span>
              <button onClick={() => void copy("link")} className="shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-black" style={{ background: copied === "link" ? "#3BF5A0" : "var(--accent)", color: "#0B1220" }}>{copied === "link" ? "Copied" : "Copy"}</button>
            </>
          ) : (
            <span className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>Your members&apos; link is being set up — Lee will finish it.</span>
          )}
        </div>
        <p className="mt-1.5 text-[12px]" style={{ color: "var(--text-muted)" }}>Your members join {short}&apos;s page from this link with their email.</p>
        {/* ADD SEATS, where a chair looks first (Lee, 2026-09-14: "This should be on the chapter exec
            dashboard after they claim it"). Jumps to the seats section under the numbers. */}
        <button type="button" onClick={() => document.getElementById("add-seats")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl px-3.5 text-[13.5px] font-black" style={{ minHeight: 40, background: "var(--accent)", color: "#0B1220" }}>
          <Plus className="h-4 w-4" /> Add seats
        </button>
      </section>

      {/* THE NUMBERS — real rows only; an honest dash until there is something to count. */}
      <section className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="px-2 py-4 text-center" style={PANEL}>
            <div className="text-[26px] font-black leading-none" style={{ color: s.value === "—" ? "var(--text-muted)" : "var(--accent)" }}>{s.value}</div>
            <div className="mt-1.5 text-[11px] leading-tight" style={{ color: "var(--text-muted)" }}>{s.label}</div>
          </div>
        ))}
      </section>
      {nothingYet && <p className="-mt-1 text-center text-[13px]" style={{ color: "var(--brand-cream)", opacity: 0.85 }}>Nothing yet. These three steps get the first members in.</p>}

      <SeatRequest data={data} auth={auth} short={short} fmtDate={fmtDate} onRequested={(r) => onChange({ ...data, seatRequest: r })} />

      {/* THE ACTION STEPS */}
      <section className="p-5" style={PANEL}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[16px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Get your members in</h2>
          <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>{doneCount} of 3 done</span>
        </div>
        <div className="mt-3 grid gap-2.5">
          <StepRow n={1} title="Post in the chapter GroupMe" note="Paste the post in your chapter's group chat." done={data.steps.groupme} busy={stepBusy === "groupme"} onToggle={() => void toggleStep("groupme")} fmtDate={fmtDate}>
            {post && <button type="button" onClick={() => void copy("post")} style={BTN_QUIET}>{copied === "post" ? <><Check className="h-4 w-4" /> Copied</> : <><MessageSquare className="h-4 w-4" /> Copy GroupMe post</>}</button>}
          </StepRow>
          <StepRow n={2} title="Show the slide at chapter meeting" note="Put it on the screen; members scan the QR and join." done={data.steps.slide} busy={stepBusy === "slide"} onToggle={() => void toggleStep("slide")} fmtDate={fmtDate}>
            {art && <a href={`${art}?f=slide&pdf=1`} download={`survive-${data.chapterSlug}-slide.pdf`} style={BTN_QUIET}><Presentation className="h-4 w-4" /> Download slide</a>}
          </StepRow>
          <StepRow n={3} title="Print a flyer for the house" note="Hang it where members study. The image works in texts too." done={data.steps.flyer} busy={stepBusy === "flyer"} onToggle={() => void toggleStep("flyer")} fmtDate={fmtDate}>
            {art && <a href={art} target="_blank" rel="noreferrer" style={BTN_QUIET}><FileText className="h-4 w-4" /> Print flyer</a>}
            {art && <button type="button" onClick={() => void flyerImage()} disabled={imgBusy} style={BTN_QUIET}>{imgBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />} Flyer image</button>}
          </StepRow>
        </div>
      </section>

      {/* WHO JOINED */}
      <section className="overflow-hidden" style={PANEL}>
        <div className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: "rgba(245,239,230,0.1)" }}>
          <span className="text-[12px] font-black uppercase tracking-wide" style={{ color: "var(--brand-cream)" }}>Who joined</span>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{data.membersJoined} member{data.membersJoined === 1 ? "" : "s"}</span>
        </div>
        {data.roster.length === 0
          ? <div className="px-4 py-4 text-center text-[12.5px]" style={{ color: "var(--text-muted)" }}>No one yet.</div>
          : (
            <div className="max-h-72 overflow-y-auto">
              {data.roster.map((m) => (
                <div key={m.id} className="flex items-center gap-2 border-b px-4 py-2 text-[12.5px]" style={{ borderColor: "rgba(245,239,230,0.06)", color: "var(--brand-cream)" }}>
                  <span className="min-w-0 flex-1 truncate">{m.label}</span>
                  <span className="shrink-0" style={{ color: "var(--text-muted)" }}>{fmtDate(m.joinedAt)}</span>
                </div>
              ))}
            </div>
          )}
      </section>

      <p className="mt-1 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
        Questions? <a href={LEE_SMS_HREF} className="font-bold underline underline-offset-4" style={{ color: "var(--brand-cream)" }}>Text Lee {LEE_PHONE_DISPLAY}</a>
        {!data.preview && <><span aria-hidden> · </span>
        <button onClick={() => void supabase.auth.signOut()} className="underline underline-offset-4" style={{ color: "var(--text-muted)" }}>Sign out</button></>}
      </p>
    </div>
  );
}

function StepRow({ n, title, note, done, busy, onToggle, fmtDate, children }: {
  n: number; title: string; note: string; done: string | null; busy: boolean; onToggle: () => void; fmtDate: (s: string) => string; children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl p-3.5" style={{ background: done ? "rgba(59,245,160,0.06)" : "rgba(0,0,0,0.18)", border: `1px solid ${done ? "rgba(59,245,160,0.35)" : "rgba(245,239,230,0.1)"}` }}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-black" style={done ? { background: "#3BF5A0", color: "#0B1220" } : { border: "1px solid rgba(245,239,230,0.3)", color: "var(--text-muted)" }}>
          {done ? <Check className="h-3.5 w-3.5" /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-black" style={{ color: "var(--brand-cream)" }}>{title}</div>
          <div className="mt-0.5 text-[12px]" style={{ color: "var(--text-muted)" }}>{done ? `Done ${fmtDate(done)}` : note}</div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {children}
            <button type="button" onClick={onToggle} disabled={busy} aria-pressed={!!done} style={{ ...BTN_QUIET, ...(done ? { background: "transparent", color: "var(--text-muted)", fontWeight: 600 } : { background: "var(--accent)", color: "#0B1220", border: 0 }) }}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : done ? "Undo" : "Mark done"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SeatRequest({ data, auth, short, fmtDate, onRequested }: { data: ChapterHome; auth: DashboardAuth; short: string; fmtDate: (s: string) => string; onRequested: (r: { seats: number; at: string }) => void }) {
  const [seats, setSeats] = useState(Math.max(SEAT_REQUEST_MIN, Math.ceil(Math.max(data.membersJoined, SEAT_REQUEST_MIN) / SEAT_REQUEST_STEP) * SEAT_REQUEST_STEP));
  const [editing, setEditing] = useState(!data.seatRequest);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const send = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await requestChapterSeats({ data: { ...auth, seats } });
      if (r.ok && r.at) { onRequested({ seats, at: r.at }); setEditing(false); }
      else setErr(r.error ?? "Couldn't send that — try again.");
    } catch { setErr("Couldn't reach the server — try again."); }
    finally { setBusy(false); }
  };
  return (
    <section id="add-seats" className="p-5" style={{ ...PANEL, scrollMarginTop: 80 }}>
      <h2 className="text-[16px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Add seats</h2>
      <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
        Seats unlock Exams 2, 3 and the Final for the members you choose, all semester. ${SEAT_PRICE} per member, {SEAT_REQUEST_MIN} minimum.
      </p>
      {!editing && data.seatRequest ? (
        <div className="mt-3 rounded-xl px-4 py-3" style={{ background: "rgba(252,163,17,0.1)", border: "1px solid rgba(252,163,17,0.4)" }}>
          <p className="text-[14px] font-black" style={{ color: "var(--brand-cream)" }}>Request sent — {data.seatRequest.seats} seats</p>
          <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--brand-cream)", opacity: 0.85 }}>Lee will reach out to set up {short}&apos;s seats. Requested {fmtDate(data.seatRequest.at)}.</p>
          <button type="button" onClick={() => { setSeats(data.seatRequest!.seats); setEditing(true); }} className="mt-2 text-[12px] underline underline-offset-4" style={{ color: "var(--text-muted)" }}>Change the number</button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center rounded-xl" style={{ border: "1px solid rgba(245,239,230,0.18)" }}>
            <button type="button" aria-label="Ten fewer" disabled={seats <= SEAT_REQUEST_MIN} onClick={() => setSeats((n) => Math.max(SEAT_REQUEST_MIN, n - SEAT_REQUEST_STEP))} className="grid h-11 w-11 place-items-center disabled:opacity-30" style={{ color: "var(--brand-cream)" }}><Minus className="h-4 w-4" /></button>
            <span className="min-w-[88px] text-center text-[15px] font-black tabular-nums" style={{ color: "var(--brand-cream)" }}>{seats} seats</span>
            <button type="button" aria-label="Ten more" disabled={seats >= 500} onClick={() => setSeats((n) => Math.min(500, n + SEAT_REQUEST_STEP))} className="grid h-11 w-11 place-items-center disabled:opacity-30" style={{ color: "var(--brand-cream)" }}><Plus className="h-4 w-4" /></button>
          </div>
          <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>${(seats * SEAT_PRICE).toLocaleString("en-US")} for the semester</span>
          <button type="button" onClick={() => void send()} disabled={busy} className="ml-auto rounded-xl px-4 text-[14px] font-black disabled:opacity-50" style={{ minHeight: 44, background: "var(--accent)", color: "#0B1220" }}>
            {busy ? "Sending…" : `Add ${seats} seats`}
          </button>
          <p className="w-full text-[11.5px]" style={{ color: "var(--text-muted)" }}>{data.preview ? "Test dashboard: this records the request and notifies no one." : "This is a request, not a charge. Lee reaches out to set it up."}</p>
          {err && <p className="w-full text-[12px]" role="alert" style={{ color: "#F3C6CC" }}>{err}</p>}
        </div>
      )}
    </section>
  );
}
