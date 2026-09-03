// /x/<ref> — THE ACTION CARD. One link in every alert lands here: who this is, what they asked for,
// and every way to answer them — approve or decline a claim, review a rep, ring Lee's phone and
// bridge, call from this computer, text back with the ref, listen to a voicemail.
//
// /x/preview sends Lee real [PREVIEW] copies of each alert so the copy can be judged on a phone.
//
// AUTH. AdminGate collects the passcode; AdminSessionGate exchanges it for the HttpOnly cookie
// every server function here checks (assertAdmin). The URL is a pointer, never a permission.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import AdminGate from "@/components/AdminGate";
import { AdminSessionGate } from "@/components/AdminSessionGate";
import { BrowserDialer } from "@/components/admin/BrowserDialer";
import { DEFAULT_FRAME_THEME, frameThemeVars } from "@/components/frames";
import { SiteHeader, useNavyDocument } from "@/components/site/SiteHeader";
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import {
  decideClaimFromCard, getActionCard, PREVIEW_KINDS, renderAlertPreviews, sendAlertPreviews, startBridgeCall,
  type ActionCard, type PreviewKind,
} from "@/lib/action-card.functions";
import { adminReviewApplication } from "@/lib/rep-admin.functions";

export const Route = createFileRoute("/x/$ref")({
  head: () => ({ meta: [{ title: "Action card — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
  component: () => <AdminGate><AdminSessionGate><Shell /></AdminSessionGate></AdminGate>,
});

const INTENT: Record<string, string> = { committed: "Ready to sponsor seats", curious: "Wants details first", exploring: "Just exploring" };
const COVERAGE = ["ifc", "panhellenic", "both", "other"] as const;

function ago(iso: string | null | undefined): string {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(mins)) return "";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return days <= 7 ? `${days} day${days === 1 ? "" : "s"} ago` : new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const card: React.CSSProperties = { background: "rgba(245,239,230,0.05)", border: "1px solid rgba(245,239,230,0.14)", borderRadius: 16, padding: 16 };
const muted: React.CSSProperties = { color: "var(--text-muted)" };
const primary = "rounded-xl px-4 text-[14px] font-black disabled:opacity-40";
const quiet: React.CSSProperties = { minHeight: 42, background: "rgba(245,239,230,0.1)", color: "var(--brand-cream)" };

function Shell() {
  useNavyDocument();
  const { ref } = Route.useParams();
  const n = Number(ref);
  return (
    <div style={{ ...frameThemeVars(DEFAULT_FRAME_THEME), background: "var(--brand-navy)", color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY, minHeight: "100vh" }}>
      <SiteHeader />
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "0 20px 60px", width: "100%", fontFamily: BRAND_SANS }}>
        {ref === "preview" ? <PreviewPanel /> : Number.isInteger(n) && n > 0 ? <Card ref={n} /> : <p className="pt-10">That is not a ref.</p>}
      </main>
    </div>
  );
}

// ---- the card --------------------------------------------------------------------------------
function Card({ ref }: { ref: number }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["x", ref], queryFn: () => getActionCard({ data: { ref } }) });
  const reload = () => void qc.invalidateQueries({ queryKey: ["x", ref] });

  if (q.isLoading) return <p className="pt-10 text-[14px]">Loading #{ref}…</p>;
  if (!q.data) return <p className="pt-10 text-[14px]">Couldn't load #{ref}.</p>;
  if (!q.data.ok) return <p className="pt-10 text-[14px]">{q.data.error}</p>;
  const c = q.data.card;
  const title = c.claim ? `${c.claim.name}, ${c.claim.letters} ${c.claim.schoolName}` : c.rep ? `${c.rep.name}, campus rep${c.rep.campusName ? ` at ${c.rep.campusName}` : ""}` : c.subject ?? c.phonePretty;

  return (
    <>
      <header className="pt-8 pb-4">
        <div className="text-[13px] font-bold" style={muted}>#{ref} · {c.kind}{c.campusName ? ` · ${c.campusName}` : ""} · {c.status}</div>
        <h1 className="text-[26px] font-black leading-tight" style={{ fontFamily: BRAND_DISPLAY }}>{title}</h1>
        <div className="text-[14px]" style={muted}>{c.phonePretty} · last activity {ago(c.lastMessageAt)}</div>
        {c.schemaGap && (
          <p className="mt-2 rounded-lg px-3 py-2 text-[12.5px]" style={{ background: "rgba(252,163,17,0.15)", color: "#FCA311" }}>
            Migration 20260902_1500 is not applied: thread labels, calls and voicemails are not being stored.
          </p>
        )}
      </header>

      <Actions c={c} />
      {c.claim && <ClaimBlock c={c} reload={reload} />}
      {c.rep && <RepBlock c={c} reload={reload} />}
      <Thread c={c} />
    </>
  );
}

function Actions({ c }: { c: ActionCard }) {
  const bridge = useMutation({ mutationFn: () => startBridgeCall({ data: { ref: c.ref } }) });
  const smsHref = `sms:${c.mainLine}?&body=${encodeURIComponent(`#${c.ref} `)}`;
  return (
    <section style={card} className="mb-4">
      <h2 className="mb-3 text-[15px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>Call or text back as {c.mainLinePretty}</h2>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => bridge.mutate()} disabled={!c.voice.bridge || bridge.isPending} className={primary} style={{ minHeight: 42, background: "var(--accent)", color: "#0B1220" }}>
          {bridge.isPending ? "Ringing your phone…" : `Call my phone${c.voice.leeCellPretty ? ` (${c.voice.leeCellPretty})` : ""}, then them`}
        </button>
        <BrowserDialer to={c.phone} label={c.phonePretty} enabled={c.voice.browser} />
        <a href={smsHref} className={`${primary} inline-flex items-center`} style={quiet}>Text back (from your phone)</a>
      </div>
      {bridge.data && (
        <p className="mt-2 text-[13px]" style={{ color: bridge.data.ok ? "#3BF5A0" : "#FCA311" }}>
          {bridge.data.ok ? "Your phone is ringing. Answer it and you'll be connected." : bridge.data.error}
        </p>
      )}
      {!c.voice.bridge && <p className="mt-2 text-[12.5px]" style={muted}>Bridge calling needs Twilio credentials and FOUNDER_ALERT_PHONE on the server.</p>}
      <p className="mt-3 text-[12.5px]" style={muted}>
        Or text <b>{c.mainLinePretty}</b> from your cell starting with <b>#{c.ref}</b> — it relays to them. Or call that number and key <b>{c.ref}#</b> to be connected as the main line.
      </p>
    </section>
  );
}

function ClaimBlock({ c, reload }: { c: ActionCard; reload: () => void }) {
  const cl = c.claim!;
  const decide = useMutation({
    mutationFn: (decision: "approved" | "rejected") => decideClaimFromCard({ data: { claimId: cl.id, decision } }),
    onSuccess: reload,
  });
  const pending = cl.status === "pending";
  return (
    <section style={card} className="mb-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>Chapter claim · {cl.status}</h2>
          <div className="text-[14px]">{cl.chapterName} at {cl.schoolName}</div>
          <div className="text-[14px]">{cl.name} · {cl.position}</div>
          <div className="text-[13px]" style={muted}>{cl.email} · {cl.phone} · submitted {ago(cl.createdAt)}</div>
        </div>
        <div className="text-right text-[13px]">
          <div className="font-black" style={{ color: cl.intent === "committed" ? "#3BF5A0" : "var(--brand-cream)" }}>{cl.intent ? INTENT[cl.intent] : "Intent not recorded"}</div>
          <div style={muted}>{cl.membersAtClaim} member{cl.membersAtClaim === 1 ? "" : "s"} banked at claim</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {pending && (
          <>
            <button onClick={() => decide.mutate("approved")} disabled={decide.isPending} className={primary} style={{ minHeight: 42, background: "#3BF5A0", color: "#0B1220" }}>Approve</button>
            <button onClick={() => { if (confirm("Decline this claim? The chapter goes back to unclaimed.")) decide.mutate("rejected"); }} disabled={decide.isPending} className={primary} style={{ minHeight: 42, background: "rgba(206,17,38,0.85)", color: "#fff" }}>Decline</button>
          </>
        )}
        {cl.goUrl && <a href={cl.goUrl} target="_blank" rel="noreferrer" className={`${primary} inline-flex items-center`} style={quiet}>Chapter page</a>}
        <Link to="/outreach/greek-claims" search={{ claim: cl.id }} className={`${primary} inline-flex items-center`} style={quiet}>Claims queue</Link>
      </div>
      {decide.data && !decide.data.ok && <p className="mt-2 text-[13px]" style={{ color: "#FCA311" }}>{decide.data.error}</p>}
      {decide.data?.ok && <p className="mt-2 text-[13px]" style={{ color: "#3BF5A0" }}>Done. They've been told by email and text.</p>}
    </section>
  );
}

function RepBlock({ c, reload }: { c: ActionCard; reload: () => void }) {
  const r = c.rep!;
  const [coverage, setCoverage] = useState<(typeof COVERAGE)[number] | "">(r.coverage as never ?? "");
  const review = useMutation({
    mutationFn: (decision: "approve" | "waitlist" | "decline") => adminReviewApplication({ data: { partnerId: r.id, decision, coverage: coverage || null, callNotes: null } }),
    onSuccess: reload,
  });
  const submitted = r.applicationStatus === "submitted";
  const facts = [
    r.graduationYear ? `Class of ${r.graduationYear}` : null,
    r.ownChapter ? `in ${r.ownChapter}` : r.submittedAt ? "not Greek" : null,
    r.submittedAt ? `can reach ${r.reachCount} chapter${r.reachCount === 1 ? "" : "s"}` : null,
    r.courseStatus ? ({ taking_now: "taking the course now", taken: "has taken it", not_yet: "hasn't taken it yet" } as Record<string, string>)[r.courseStatus] : null,
    ...r.roles,
  ].filter(Boolean).join(" · ");
  return (
    <section style={card} className="mb-4">
      <h2 className="text-[15px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>
        Campus rep · {r.applicationStatus ?? "setup"}{r.isTest ? " · TEST" : ""}
      </h2>
      <div className="text-[14px]">{r.name}{r.campusName ? ` · ${r.campusName}` : ""}</div>
      <div className="text-[13px]" style={muted}>{[r.email, r.phone].filter(Boolean).join(" · ")} · {r.phoneVerified ? "phone verified" : "phone not verified"} · signed up {ago(r.createdAt)}{r.submittedAt ? ` · applied ${ago(r.submittedAt)}` : ""}</div>
      {facts && <div className="mt-2 text-[14px]">{facts}</div>}
      {r.pitch && <blockquote className="mt-2 text-[14px]" style={{ borderLeft: "3px solid rgba(245,239,230,0.25)", paddingLeft: 10 }}>{r.pitch}</blockquote>}
      {!r.submittedAt && <p className="mt-2 text-[13px]" style={muted}>Signed up but hasn't submitted the application yet. You'll get another alert when they do.</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {submitted && (
          <>
            <select value={coverage} onChange={(e) => setCoverage(e.target.value as never)} className="rounded-xl px-3 text-[14px]" style={{ minHeight: 42, background: "rgba(245,239,230,0.08)", color: "var(--brand-cream)", border: "1px solid rgba(245,239,230,0.16)" }}>
              <option value="">Coverage…</option>
              {COVERAGE.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <button onClick={() => review.mutate("approve")} disabled={review.isPending || !coverage} className={primary} style={{ minHeight: 42, background: "#3BF5A0", color: "#0B1220" }}>Approve</button>
            <button onClick={() => review.mutate("waitlist")} disabled={review.isPending} className={primary} style={quiet}>Waitlist</button>
            <button onClick={() => { if (confirm("Decline this application? They get the decline note.")) review.mutate("decline"); }} disabled={review.isPending} className={primary} style={{ minHeight: 42, background: "rgba(206,17,38,0.85)", color: "#fff" }}>Decline</button>
          </>
        )}
        <Link to={r.rosterUrl} className={`${primary} inline-flex items-center`} style={quiet}>Rep roster</Link>
        <a href={r.viewAsUrl} className={`${primary} inline-flex items-center`} style={quiet}>View as rep</a>
      </div>
      {review.data && !review.data.ok && <p className="mt-2 text-[13px]" style={{ color: "#FCA311" }}>{review.data.error}</p>}
      {review.data?.ok && <p className="mt-2 text-[13px]" style={{ color: "#3BF5A0" }}>Recorded{review.data.assignedCount != null ? ` · ${review.data.assignedCount} chapters assigned` : ""}.</p>}
    </section>
  );
}

function Thread({ c }: { c: ActionCard }) {
  return (
    <section style={card}>
      <h2 className="mb-2 text-[15px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>Thread</h2>
      {!c.messages.length && <p className="text-[13px]" style={muted}>Nothing yet. A text, a call or a voicemail will show here.</p>}
      <ul className="space-y-2">
        {c.messages.map((m) => (
          <li key={m.id} className="rounded-xl px-3 py-2 text-[14px]" style={{ background: m.direction === "in" ? "rgba(245,239,230,0.07)" : "rgba(59,245,160,0.08)", marginLeft: m.direction === "out" ? 24 : 0, marginRight: m.direction === "in" ? 24 : 0 }}>
            <div className="text-[11.5px] font-bold uppercase" style={muted}>{m.direction === "in" ? (m.kind === "sms" ? "them" : m.kind) : (m.author === "lee" ? "you" : "auto")} · {ago(m.createdAt)}</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
            {m.kind === "voicemail" && m.recordingSid && (
              <div className="mt-1">
                <audio controls preload="none" src={`/api/voice/recording/${m.recordingSid}`} style={{ width: "100%", maxWidth: 420 }} />
                {m.transcriptStatus === "pending" && <div className="text-[12px]" style={muted}>Transcript on its way.</div>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---- previews --------------------------------------------------------------------------------
function PreviewPanel() {
  const q = useQuery({ queryKey: ["x-previews"], queryFn: () => renderAlertPreviews() });
  const [picked, setPicked] = useState<PreviewKind[]>([...PREVIEW_KINDS]);
  const send = useMutation({ mutationFn: () => sendAlertPreviews({ data: { kinds: picked } }) });
  const toggle = (k: PreviewKind) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  return (
    <>
      <header className="pt-8 pb-4">
        <h1 className="text-[26px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>Alert previews</h1>
        <p className="text-[14px]" style={muted}>Real sends to your founder email and phone, prefixed [PREVIEW]. Sample data; nothing goes to a student.</p>
      </header>
      <div className="space-y-3">
        {(q.data ?? []).map((p) => (
          <label key={p.kind} style={card} className="block cursor-pointer">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={picked.includes(p.kind)} onChange={() => toggle(p.kind)} />
              <span className="text-[14px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>{p.kind}</span>
            </div>
            <div className="mt-2 text-[12px] font-bold" style={muted}>SMS</div>
            <pre className="whitespace-pre-wrap text-[13.5px]" style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{p.sms}</pre>
            <div className="mt-2 text-[12px] font-bold" style={muted}>Email subject</div>
            <div className="text-[13.5px]">{p.subject}</div>
          </label>
        ))}
      </div>
      <button onClick={() => send.mutate()} disabled={send.isPending || !picked.length} className={`${primary} mt-4`} style={{ minHeight: 44, background: "var(--accent)", color: "#0B1220" }}>
        {send.isPending ? "Sending…" : `Send ${picked.length} preview${picked.length === 1 ? "" : "s"} to me`}
      </button>
      {send.data && (
        <ul className="mt-3 text-[13px]">
          {send.data.results.map((r) => <li key={r.kind}>{r.kind}: email {r.email}, sms {r.sms}</li>)}
        </ul>
      )}
    </>
  );
}
