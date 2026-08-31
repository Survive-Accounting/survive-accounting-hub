// REP WORKSPACE VIEW — the one operating surface a campus rep uses, and the SAME component the
// admin's read-only "View as" renders (readOnly prop). Mobile-first: chapter rows are large tap
// targets, the chapter drawer is a full-screen sheet on phones, share actions use the native
// composers (sms:, mailto:, navigator.share).
//
// The design states the job in the rep's order of operations and nothing else:
//   FIND THE RIGHT PEOPLE → SHARE FREE EXAM 1 → GET IT INTO THE CHAPTER HOUSE
import { useCallback, useEffect, useMemo, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS, Bolt } from "@/components/canvas/brand";
import { boltForSlug } from "@/lib/schools";
import { formatCents } from "@/lib/referral-shared";
import {
  CONTACT_ROLES, DM_PACE_NOTE, dmMessage, fmtMs, mailtoHref, smsHref, CHAPTER_STATE_LABEL,
  type AssignedChapter, type ChapterState, type RepChapterRow, type RepWorkspace, type ShareKit,
} from "@/lib/rep-shared";
import {
  getShareKit, logRepShare, markDmCopied, markDmReplied, setHousePosted, submitRepContact, updateRepVenmoSession,
} from "@/lib/rep-workspace.functions";

// ── tiny shared bits ─────────────────────────────────────────────────────────────────────────
const FIELD: React.CSSProperties = {
  width: "100%", minHeight: 46, borderRadius: 10, padding: "0 12px",
  background: "var(--bg-input, rgba(0,0,0,0.22))", border: "1px solid var(--border-default)",
  color: "var(--brand-cream)", fontSize: 16, outline: "none",
};
const LABEL: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-secondary, #AAB4C8)", marginBottom: 4 };

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback((key: string, text: string) => {
    void (async () => { try { await navigator.clipboard.writeText(text); setCopied(key); window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600); } catch { /* blocked */ } })();
  }, []);
  return { copied, copy };
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl px-2.5 py-2.5 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
      <p className="text-[19px] font-black leading-none" style={{ color: accent ? "var(--accent)" : "var(--brand-cream)", fontFamily: BRAND_DISPLAY }}>{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase leading-tight" style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>{label}</p>
    </div>
  );
}

const STATE_STYLE: Record<ChapterState, { bg: string; fg: string }> = {
  available:        { bg: "rgba(139,151,189,0.14)", fg: "#AAB4C8" },
  reserved_other:   { bg: "rgba(139,151,189,0.10)", fg: "#7583A6" },
  assigned:         { bg: "rgba(252,163,17,0.16)",  fg: "var(--accent)" },
  contact_verified: { bg: "rgba(82,146,255,0.16)",  fg: "#9DBEFF" },
  kit_shared:       { bg: "rgba(82,146,255,0.20)",  fg: "#BBD2FF" },
  flyer_posted:     { bg: "rgba(52,168,83,0.16)",   fg: "#8BE28B" },
  engaged:          { bg: "rgba(52,168,83,0.24)",   fg: "#A5F0A5" },
  claimed:          { bg: "rgba(245,166,35,0.22)",  fg: "#FFD588" },
};

function StateChip({ state }: { state: ChapterState }) {
  const s = STATE_STYLE[state];
  return <span className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-black uppercase" style={{ background: s.bg, color: s.fg, letterSpacing: "0.05em" }}>{CHAPTER_STATE_LABEL[state]}</span>;
}

// ── the component ────────────────────────────────────────────────────────────────────────────
export function RepWorkspaceView({ d, readOnly = false, viewingAs, legacyToken, reload, onLogout }: {
  d: RepWorkspace;
  readOnly?: boolean;
  viewingAs?: { name: string; campus: string | null; exitTo: string } | null;
  legacyToken?: string | null;
  reload: () => void;
  onLogout?: () => void;
}) {
  const { copied, copy } = useCopy();
  const [drawer, setDrawer] = useState<string | null>(null);      // chapter id
  const [filter, setFilter] = useState<string>("all");
  const [sort, setSort] = useState<string>("largest");

  const chapter = useMemo(() => d.chapters.find((c) => c.id === drawer) ?? null, [d.chapters, drawer]);
  const first = d.name.split(" ")[0];

  const filtered = useMemo(() => {
    let rows = d.chapters;
    if (filter === "ifc") rows = rows.filter((c) => c.council === "IFC");
    else if (filter === "panhellenic") rows = rows.filter((c) => c.council === "Panhellenic");
    else if (filter === "nphc") rows = rows.filter((c) => c.council === "NPHC");
    else if (filter === "mgc") rows = rows.filter((c) => c.council === "MGC");
    else if (filter === "available") rows = rows.filter((c) => c.state === "available");
    else if (filter === "mine") rows = rows.filter((c) => c.myAssignment !== null);
    else if (filter === "notstarted") rows = rows.filter((c) => c.state === "available" || c.state === "reserved_other");
    const sorted = [...rows];
    if (sort === "largest") sorted.sort((a, b) => (b.memberCount ?? -1) - (a.memberCount ?? -1) || a.orgName.localeCompare(b.orgName));
    else if (sort === "clicks") sorted.sort((a, b) => b.clicks - a.clicks || a.orgName.localeCompare(b.orgName));
    else if (sort === "signups") sorted.sort((a, b) => b.signups - a.signups || a.orgName.localeCompare(b.orgName));
    else if (sort === "notstarted") sorted.sort((a, b) => Number(a.myAssignment !== null || a.state !== "available") - Number(b.myAssignment !== null || b.state !== "available") || (b.memberCount ?? -1) - (a.memberCount ?? -1));
    return sorted;
  }, [d.chapters, filter, sort]);

  const FILTERS: Array<[string, string]> = [["all", "All"], ["ifc", "IFC"], ["panhellenic", "Panhellenic"], ["nphc", "NPHC"], ["mgc", "MGC"], ["available", "Available"], ["mine", "Mine"], ["notstarted", "Not started"]];

  return (
    <div style={{ fontFamily: BRAND_SANS }}>
      {viewingAs && (
        <div className="sticky top-0 z-40 -mx-5 flex items-center justify-between gap-3 px-5 py-2.5" style={{ background: "#7A2E12", color: "#FFE1CC" }}>
          <p className="text-[13px] font-black">Viewing as {viewingAs.name}{viewingAs.campus ? ` · ${viewingAs.campus}` : ""} — read only</p>
          <a href={viewingAs.exitTo} className="rounded-lg px-3 py-1.5 text-[12.5px] font-black" style={{ background: "rgba(0,0,0,0.25)", color: "#FFE1CC" }}>Exit</a>
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-wrap items-end justify-between gap-2 pt-6">
        <div>
          <p className="flex items-center gap-2 text-[11.5px] font-black uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.14em" }}>
            {d.campusSlug && <span className="block" style={{ width: 15 }} aria-hidden><Bolt {...boltForSlug(d.campusSlug)} /></span>}
            SURVIVE{d.campusName ? ` · ${d.campusName}` : ""}<span style={{ opacity: 0.6 }}> — {d.termLabel}</span>
          </p>
          <h1 className="mt-1 text-[26px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Hi {first} ⚡</h1>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--text-muted)" }}>Find the right people → share free Exam 1 → get it in the house.</p>
        </div>
        <div className="flex items-center gap-2">
          {d.isTest && <span className="rounded-full px-2.5 py-1 text-[11px] font-black uppercase" style={{ background: "rgba(122,46,18,0.22)", color: "#FFC9A3", letterSpacing: "0.08em" }}>Test rep</span>}
          {!readOnly && onLogout && <button type="button" onClick={onLogout} className="rounded-lg px-3 py-1.5 text-[12px] font-bold" style={{ background: "transparent", border: "1px solid var(--border-default)", color: "var(--text-muted)" }}>Sign out</button>}
        </div>
      </div>

      <Onboarding videoUrl={d.onboardingVideoUrl} repId={d.repId} />

      {/* YOUR IMPACT */}
      <section className="mt-5">
        <h2 className="text-[12px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.12em" }}>Your impact</h2>
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
          <Stat label="Chapters sourced" value={String(d.impact.chaptersReserved + d.impact.chaptersQualified)} />
          <Stat label="Contacts added" value={String(d.impact.contactsSubmitted)} />
          <Stat label="Clicks" value={String(d.impact.clicks)} />
          <Stat label="Visitors" value={String(d.impact.uniqueVisitors)} />
          <Stat label="Signups" value={String(d.impact.signups)} />
          <Stat label="Revenue" value={formatCents(d.impact.revenueCents)} accent />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
          <span>Commission — pending <b style={{ color: "var(--brand-cream)" }}>{formatCents(d.impact.commissionPendingCents)}</b></span>
          <span>approved <b style={{ color: "var(--brand-cream)" }}>{formatCents(d.impact.commissionApprovedCents)}</b></span>
          <span>paid <b style={{ color: "var(--brand-cream)" }}>{formatCents(d.impact.commissionPaidCents)}</b></span>
          <span>· you earn {d.ruleLabel} of revenue you generate</span>
        </div>
      </section>

      {/* CAMPUS ACTIVITY — explicitly campus-wide, not the rep's own numbers. */}
      <section className="mt-5">
        <h2 className="text-[12px] font-black uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.12em" }}>Campus activity — last 7 days (all of {d.campusName ?? "campus"}, not just you)</h2>
        <div className="mt-2 grid grid-cols-4 gap-2">
          <Stat label="Students" value={String(d.campus.students)} />
          <Stat label="Identified" value={String(d.campus.identified)} />
          <Stat label="Questions" value={String(d.campus.questionsAnswered)} />
          <Stat label="Est. study time" value={fmtMs(d.campus.studyMs)} />
        </div>
      </section>

      {/* MAIN LINK */}
      {d.mainLink && (
        <section className="mt-5 rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.1em" }}>Your campus link</p>
              <p className="truncate text-[14.5px] font-black" style={{ color: "var(--brand-cream)" }}>{d.mainLink.shortUrl.replace("https://", "")}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={readOnly} onClick={() => { copy("main", d.mainLink!.shortUrl); void logRepShare({ data: { legacyToken, method: "copy" } }); }} className="rounded-lg px-3.5 text-[13px] font-black disabled:opacity-40" style={{ minHeight: 42, background: "var(--accent)", color: "#0B1220" }}>{copied === "main" ? "Copied ⚡" : "Copy"}</button>
              <a aria-disabled={readOnly} href={readOnly ? undefined : `/api/flyer/${d.campusSlug}/campus?ref=${d.mainLink.code}`} onClick={() => !readOnly && void logRepShare({ data: { legacyToken, method: "flyer" } })} className="inline-flex items-center rounded-lg px-3.5 text-[13px] font-black" style={{ minHeight: 42, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)", opacity: readOnly ? 0.4 : 1 }}>Campus flyer</a>
            </div>
          </div>
          <p className="mt-1.5 text-[12px]" style={{ color: "var(--text-muted)" }}>Have access to a printer? Put a few campus flyers up around campus — the QR is yours.</p>
        </section>
      )}

      {/* YOUR CHAPTERS (V2) — the assigned working list. We supply the handles; the rep DMs
          from their own account, at a sane pace. */}
      {d.assigned.length > 0 && (
        <AssignedSection d={d} readOnly={readOnly} legacyToken={legacyToken} reload={reload} copied={copied} copy={copy} openDrawer={(id) => setDrawer(id)} />
      )}

      {/* CHAPTER LEADERBOARD — the full campus picture. */}
      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[17px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>{d.assigned.length > 0 ? `All chapters at ${d.campusName ?? "your campus"}` : `Chapters at ${d.campusName ?? "your campus"}`}</h2>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg px-2 text-[12.5px] font-bold" style={{ minHeight: 38, background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }} aria-label="Sort chapters">
            <option value="largest">Largest first</option>
            <option value="clicks">Most clicks</option>
            <option value="signups">Most signups</option>
            <option value="notstarted">Not started first</option>
          </select>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setFilter(key)} className="rounded-full px-3 py-1.5 text-[12px] font-black" style={filter === key ? { background: "var(--accent)", color: "#0B1220" } : { background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--text-muted)" }}>
              {label}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-2">
          {filtered.length === 0 && <p className="rounded-xl px-4 py-6 text-center text-[13px]" style={{ background: "var(--bg-surface)", border: "1px dashed var(--border-default)", color: "var(--text-muted)" }}>No chapters match that filter.</p>}
          {filtered.map((c) => (
            <button key={c.id} type="button" onClick={() => setDrawer(c.id)} className="rounded-xl px-3.5 py-3 text-left" style={{ background: "var(--bg-surface)", border: `1px solid ${c.myAssignment ? "var(--accent)" : "var(--border-default)"}`, minHeight: 64 }}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[14.5px] font-black" style={{ color: "var(--brand-cream)" }}>
                    {c.letters && <span style={{ color: "var(--accent)", marginRight: 6 }}>{c.letters}</span>}
                    {c.nickname || c.orgName}
                  </p>
                  <p className="mt-0.5 truncate text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                    {c.council}{c.memberCount != null ? ` · ${c.memberCount} members` : " · — members"}
                    {c.contactsTotal > 0 && ` · ${c.contactsTotal} contact${c.contactsTotal === 1 ? "" : "s"}`}
                    {c.clicks > 0 && ` · ${c.clicks} clicks`}
                    {c.signups > 0 && ` · ${c.signups} signups`}
                  </p>
                </div>
                <StateChip state={c.state} />
              </div>
            </button>
          ))}
        </div>
      </section>

      {!readOnly && <PayoutCard d={d} legacyToken={legacyToken} reload={reload} />}

      {chapter && (
        <ChapterDrawer
          key={chapter.id} c={chapter} d={d} readOnly={readOnly} legacyToken={legacyToken}
          onClose={() => setDrawer(null)} reload={reload} copied={copied} copy={copy}
        />
      )}
    </div>
  );
}

// ── YOUR CHAPTERS (V2): the assigned list + DM workflow ──────────────────────────────────────
function AssignedSection({ d, readOnly, legacyToken, reload, copied, copy, openDrawer }: {
  d: RepWorkspace; readOnly: boolean; legacyToken?: string | null; reload: () => void;
  copied: string | null; copy: (k: string, t: string) => void; openDrawer: (chapterId: string) => void;
}) {
  const [template, setTemplate] = useState<string | null>(null); // null = default message
  const [editing, setEditing] = useState(false);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [busy, setBusy] = useState(false);

  const messageFor = (c: AssignedChapter): string => {
    const link = c.shortUrl ?? d.mainLink?.shortUrl ?? "";
    if (template != null) return template.replaceAll("{chapter}", c.name).replaceAll("{link}", link);
    return dmMessage({ chapterName: c.name, courseCode: d.courseCode, shortUrl: link });
  };
  const copyDm = (c: AssignedChapter) => {
    if (readOnly) return;
    copy(`dm-${c.chapterId}`, messageFor(c));
    void markDmCopied({ data: { legacyToken, chapterId: c.chapterId } }).then(reload);
  };
  const saveReply = (c: AssignedChapter) => {
    if (readOnly || replyText.trim().length < 2 || busy) return;
    setBusy(true);
    void markDmReplied({ data: { legacyToken, chapterId: c.chapterId, replyText: replyText.trim() } })
      .then(() => { setReplyFor(null); setReplyText(""); reload(); })
      .finally(() => setBusy(false));
  };

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[17px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Your chapters · {d.assigned.length} assigned</h2>
        <button type="button" onClick={() => { setEditing((v) => !v); if (template == null) setTemplate(dmMessage({ chapterName: "{chapter}", courseCode: d.courseCode, shortUrl: "{link}" })); }}
          className="rounded-lg px-3 py-1.5 text-[12px] font-bold" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--text-muted)" }}>
          {editing ? "Done editing" : "Edit DM message"}
        </button>
      </div>
      {editing && (
        <div className="mt-2 rounded-xl p-3" style={{ background: "var(--bg-surface)", border: "1px dashed var(--border-default)" }}>
          <textarea value={template ?? ""} onChange={(e) => setTemplate(e.target.value)} rows={4}
            className="sa-field w-full" style={{ width: "100%", borderRadius: 10, padding: "10px 12px", background: "var(--bg-input, rgba(0,0,0,0.22))", border: "1px solid var(--border-default)", color: "var(--brand-cream)", fontSize: 14.5, outline: "none" }} />
          <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}><code>{"{chapter}"}</code> and <code>{"{link}"}</code> fill in per chapter — keep <code>{"{link}"}</code> in there; it's your tracked link (it's how you get paid).</p>
        </div>
      )}
      <div className="mt-2.5 grid gap-1.5">
        {d.assigned.map((c) => (
          <div key={c.chapterId} className="rounded-xl px-3.5 py-2.5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={() => openDrawer(c.chapterId)} className="min-w-0 text-left">
                <p className="truncate text-[14px] font-black" style={{ color: "var(--brand-cream)" }}>
                  {c.letters && <span style={{ color: "var(--accent)", marginRight: 6 }}>{c.letters}</span>}{c.name}
                  {c.igHandle && <span className="ml-2 text-[12px] font-bold" style={{ color: "var(--text-muted)" }}>{c.igHandle}</span>}
                </p>
                <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                  {c.claimed ? "✓ page claimed"
                    : c.dmStatus === "replied" ? `● replied${c.repliedAt ? ` ${new Date(c.repliedAt).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}` : ""}`
                    : c.dmStatus === "dm_sent" ? `● DM sent${c.dmSentAt ? ` ${new Date(c.dmSentAt).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}` : ""}`
                    : "○ not contacted"}
                  {!c.igHandle && " · no IG handle on file — use the kit in the drawer"}
                </p>
              </button>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {c.igUrl && <a href={readOnly ? undefined : c.igUrl} target="_blank" rel="noreferrer" aria-disabled={readOnly} className="inline-flex items-center rounded-lg px-2.5 text-[12px] font-black" style={{ minHeight: 38, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)", opacity: readOnly ? 0.4 : 1 }}>Open IG</a>}
                <button type="button" disabled={readOnly} onClick={() => copyDm(c)} className="rounded-lg px-2.5 text-[12px] font-black disabled:opacity-40" style={{ minHeight: 38, background: "rgba(252,163,17,0.14)", color: "var(--accent)" }}>{copied === `dm-${c.chapterId}` ? "Copied ⚡" : "Copy DM"}</button>
                {c.dmStatus === "dm_sent" && !c.claimed && (
                  <button type="button" disabled={readOnly} onClick={() => { setReplyFor(replyFor === c.chapterId ? null : c.chapterId); setReplyText(""); }} className="rounded-lg px-2.5 text-[12px] font-black disabled:opacity-40" style={{ minHeight: 38, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}>Mark replied</button>
                )}
              </div>
            </div>
            {replyFor === c.chapterId && (
              <div className="mt-2 flex gap-2">
                <input value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="What did they say? (required)"
                  className="sa-field flex-1" style={{ minHeight: 40, borderRadius: 10, padding: "0 12px", background: "var(--bg-input, rgba(0,0,0,0.22))", border: "1px solid var(--border-default)", color: "var(--brand-cream)", fontSize: 14, outline: "none" }}
                  onKeyDown={(e) => e.key === "Enter" && saveReply(c)} />
                <button type="button" onClick={() => saveReply(c)} disabled={replyText.trim().length < 2 || busy} className="rounded-lg px-3 text-[12.5px] font-black disabled:opacity-40" style={{ minHeight: 40, background: "var(--accent)", color: "#0B1220" }}>Save</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-muted)" }}>{DM_PACE_NOTE} Tap a chapter for its flyer, QR and full kit.</p>
    </section>
  );
}

// ── onboarding (3 lines + optional video; dismissable) ───────────────────────────────────────
function Onboarding({ videoUrl, repId }: { videoUrl: string | null; repId: string }) {
  const key = `sa-rep-onboarded-${repId}`;
  const [hidden, setHidden] = useState(true);
  useEffect(() => { try { setHidden(localStorage.getItem(key) === "1"); } catch { setHidden(false); } }, [key]);
  if (hidden) return null;
  return (
    <section className="mt-5 rounded-2xl p-4" style={{ background: "rgba(252,163,17,0.08)", border: "1px solid rgba(252,163,17,0.35)" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.12em" }}>Welcome to Survive — your job</p>
          <ol className="mt-2 grid gap-1 text-[13.5px] font-bold" style={{ color: "var(--brand-cream)" }}>
            <li>1. Find a useful chapter contact.</li>
            <li>2. Send them the free Exam 1 share kit.</li>
            <li>3. Get the flyer in the house if you can.</li>
          </ol>
          <p className="mt-1.5 text-[12px]" style={{ color: "var(--text-muted)" }}>That's it. Lee handles all follow-up after your intro.</p>
          {videoUrl && <a href={videoUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center rounded-lg px-3 py-2 text-[12.5px] font-black" style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}>▶ How it works (2 min)</a>}
        </div>
        <button type="button" onClick={() => { try { localStorage.setItem(key, "1"); } catch { /* private mode */ } setHidden(true); }} className="shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-bold" style={{ color: "var(--text-muted)" }} aria-label="Dismiss">✕</button>
      </div>
    </section>
  );
}

// ── payout + venmo ───────────────────────────────────────────────────────────────────────────
function PayoutCard({ d, legacyToken, reload }: { d: RepWorkspace; legacyToken?: string | null; reload: () => void }) {
  const [venmo, setVenmo] = useState(d.venmo ?? "");
  const [saved, setSaved] = useState<"idle" | "saving" | "done">("idle");
  const save = () => { setSaved("saving"); void updateRepVenmoSession({ data: { legacyToken, venmo } }).then(() => { setSaved("done"); reload(); window.setTimeout(() => setSaved("idle"), 1500); }).catch(() => setSaved("idle")); };
  return (
    <section className="mt-6 rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: `1px solid ${d.venmo ? "var(--border-default)" : "rgba(252,163,17,0.45)"}` }}>
      {/* Venmo left OUT of signup on purpose — this is where it gets collected, before it matters. */}
      {!d.venmo && (
        <p className="mb-2 text-[11px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.1em" }}>Getting paid — add your Venmo before your first payout</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13.5px] font-black" style={{ color: "var(--brand-cream)" }}>Next payout · {d.payout.nextLabel} — {formatCents(d.payout.dueCents)} due</p>
        <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>Venmo, on the 1st (Oct–Jan). Purchases are confirmed first.</p>
      </div>
      {(d.impact.commissionPendingCents + d.impact.commissionApprovedCents) > 0 && (
        <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--text-muted)" }}>Your first payout needs a quick W-9 (you're an independent contractor) — Lee sends it before paying out. Nothing to do right now.</p>
      )}
      <div className="mt-2.5 flex flex-wrap items-end gap-2">
        <div className="flex-1" style={{ minWidth: 180 }}>
          <label style={LABEL}>Venmo — where you get paid</label>
          <input value={venmo} onChange={(e) => setVenmo(e.target.value)} placeholder="@your-venmo" className="sa-field w-full" style={FIELD} />
        </div>
        <button type="button" onClick={save} className="rounded-lg px-3.5 text-[13px] font-black" style={{ minHeight: 46, background: d.venmo ? "var(--bg-overlay)" : "var(--accent)", border: d.venmo ? "1px solid var(--border-default)" : "none", color: d.venmo ? "var(--brand-cream)" : "#0B1220" }}>{saved === "done" ? "Saved ⚡" : saved === "saving" ? "Saving…" : d.venmo ? "Save" : "Add Venmo"}</button>
      </div>
    </section>
  );
}

// ── THE CHAPTER DRAWER (full sheet on mobile) ────────────────────────────────────────────────
function ChapterDrawer({ c, d, readOnly, legacyToken, onClose, reload, copied, copy }: {
  c: RepChapterRow; d: RepWorkspace; readOnly: boolean; legacyToken?: string | null;
  onClose: () => void; reload: () => void; copied: string | null; copy: (k: string, t: string) => void;
}) {
  const mine = c.myAssignment === "reserved" || c.myAssignment === "qualified";
  const [kit, setKit] = useState<ShareKit | null>(null);
  const [kitErr, setKitErr] = useState<string | null>(null);

  const loadKit = useCallback(() => {
    if (!mine) return;
    void getShareKit({ data: { legacyToken, chapterId: c.id } })
      .then((r) => { if (r.ok) setKit(r); else setKitErr(r.error); })
      .catch(() => setKitErr("Couldn't load the kit."));
  }, [mine, legacyToken, c.id]);
  useEffect(loadKit, [loadKit]);

  const stepDone = { contact: c.contactsMine > 0 || mine, kit: !!kit && (c.state === "kit_shared" || c.state === "flyer_posted" || c.state === "engaged"), house: c.housePosted };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0" style={{ background: "rgba(6,10,22,0.72)" }} />
      <div className="relative flex w-full flex-col overflow-y-auto sm:max-w-[600px] sm:rounded-2xl" style={{ background: "var(--bg-page)", border: "1px solid var(--border-default)", maxHeight: "94dvh", minHeight: "min(560px, 94dvh)", fontFamily: BRAND_SANS }}>
        {/* header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 pb-3 pt-4" style={{ background: "var(--bg-page)", borderBottom: "1px solid var(--border-default)" }}>
          <div className="min-w-0">
            <p className="truncate text-[18px] font-black" style={{ color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY }}>
              {c.letters && <span style={{ color: "var(--accent)", marginRight: 6 }}>{c.letters}</span>}{c.nickname || c.orgName}
            </p>
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-muted)" }}>{c.council}{c.memberCount != null ? ` · ${c.memberCount} members` : ""} · {d.campusName}</p>
          </div>
          <div className="flex items-center gap-2">
            <StateChip state={c.state} />
            <button type="button" onClick={onClose} className="rounded-lg px-2.5 py-1.5 text-[13px] font-black" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }} aria-label="Close drawer">✕</button>
          </div>
        </div>

        <div className="px-5 pb-8">
          {/* YOUR STEPS */}
          <div className="mt-4 rounded-xl px-4 py-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
            <p className="text-[11px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.1em" }}>Your steps</p>
            <ol className="mt-1.5 grid gap-1 text-[13.5px] font-bold" style={{ color: "var(--brand-cream)" }}>
              <li style={{ opacity: stepDone.contact ? 0.55 : 1 }}>{stepDone.contact ? "✓" : "1."} Add a useful contact</li>
              <li style={{ opacity: stepDone.kit ? 0.55 : 1 }}>{stepDone.kit ? "✓" : "2."} Share the Exam 1 kit</li>
              <li style={{ opacity: stepDone.house ? 0.55 : 1 }}>{stepDone.house ? "✓" : "3."} Get the flyer in the house</li>
            </ol>
          </div>

          {c.state === "reserved_other" && (
            <p className="mt-4 rounded-xl px-4 py-3 text-[13px]" style={{ background: "rgba(139,151,189,0.10)", color: "var(--text-muted)" }}>
              Another rep is working this chapter this term. Your contact still helps — it goes into the same review queue — but the share kit belongs to them for now.
            </p>
          )}

          {/* STEP 1 — CONTACT */}
          <ContactForm c={c} readOnly={readOnly} legacyToken={legacyToken} onSaved={() => { reload(); loadKit(); }} />

          {/* STEP 2 — SHARE KIT */}
          {mine ? (
            kit ? <KitBlock kit={kit} c={c} readOnly={readOnly} legacyToken={legacyToken} copied={copied} copy={copy} />
              : <p className="mt-4 text-[13px]" style={{ color: "var(--text-muted)" }}>{kitErr ?? "Loading your share kit…"}</p>
          ) : (
            <div className="mt-4 rounded-xl px-4 py-3" style={{ background: "var(--bg-surface)", border: "1px dashed var(--border-default)" }}>
              <p className="text-[13px] font-bold" style={{ color: "var(--brand-cream)" }}>🔒 Share kit locked</p>
              <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>Add one useful contact (email or phone) and the chapter's tracked link, QR and flyer unlock — and the chapter is yours for {d.termLabel}.</p>
            </div>
          )}

          {/* STEP 3 — HOUSE POSTED */}
          {mine && kit && (
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl px-4 py-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", opacity: readOnly ? 0.5 : 1 }}>
              <input
                type="checkbox" checked={kit.housePosted} disabled={readOnly}
                onChange={(e) => { void setHousePosted({ data: { legacyToken, chapterId: c.id, posted: e.target.checked } }).then(() => { loadKit(); reload(); }); }}
                style={{ marginTop: 3, width: 18, height: 18, accentColor: "var(--accent)" }}
              />
              <span>
                <span className="block text-[13.5px] font-black" style={{ color: "var(--brand-cream)" }}>Mark flyer posted in chapter house</span>
                <span className="block text-[11.5px]" style={{ color: "var(--text-muted)" }}>Self-reported — just so we both know where this chapter stands. Not tied to pay.</span>
              </span>
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

// ── step 1: the contact form + the rep's contacts on this chapter ────────────────────────────
function ContactForm({ c, readOnly, legacyToken, onSaved }: { c: RepChapterRow; readOnly: boolean; legacyToken?: string | null; onSaved: () => void }) {
  const [open, setOpen] = useState(c.contactsMine === 0);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [instagram, setInstagram] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = !readOnly && !busy && (email.trim().length > 3 || phone.replace(/\D/g, "").length >= 10);

  const submit = () => {
    if (!canSubmit) return;
    setBusy(true); setErr(null); setMsg(null);
    void submitRepContact({ data: { legacyToken, chapterId: c.id, name: name.trim() || null, role: role || null, email: email.trim() || null, phone: phone.trim() || null, instagram: instagram.trim() || null, notes: notes.trim() || null } })
      .then((r) => {
        if (!r.ok) { setErr(r.error ?? "Couldn't save that."); return; }
        setName(""); setRole(""); setEmail(""); setPhone(""); setInstagram(""); setNotes("");
        setMsg(r.assignment === "reserved" ? "Contact saved — this chapter is now yours for the term ⚡"
          : r.assignment === "reserved_by_other" ? "Contact saved. Another rep already holds this chapter this term — your contact still goes into review."
          : r.verifiedExisting ? "Verified — that contact was already on file; your confirmation is logged."
          : "Contact saved — it goes to review before any Survive outreach uses it.");
        setOpen(false);
        onSaved();
      })
      .catch(() => setErr("Couldn't reach the server."))
      .finally(() => setBusy(false));
  };

  return (
    <section className="mt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.1em" }}>Get a contact</h3>
        {!open && <button type="button" disabled={readOnly} onClick={() => setOpen(true)} className="rounded-lg px-3 py-1.5 text-[12.5px] font-black disabled:opacity-40" style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}>+ Add contact</button>}
      </div>
      <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>President, VP, Treasurer, academic chair — anyone useful. Email or phone required; name and role help a lot.</p>
      {msg && <p className="mt-2 rounded-lg px-3 py-2 text-[12.5px] font-bold" style={{ background: "rgba(52,168,83,0.14)", color: "#8BE28B" }}>{msg}</p>}
      {open && (
        <div className="mt-2.5 grid gap-2.5 rounded-xl p-3.5" style={{ background: "var(--bg-surface)", border: "1px dashed var(--border-default)" }}>
          <div className="grid grid-cols-2 gap-2.5">
            <div><label style={LABEL}>Name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="John Smith" className="sa-field" style={FIELD} /></div>
            <div>
              <label style={LABEL}>Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} className="sa-field w-full" style={{ ...FIELD, padding: "0 8px" }}>
                <option value="">Pick one…</option>
                {CONTACT_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div><label style={LABEL}>Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" placeholder="pres@chapter.org" className="sa-field" style={FIELD} /></div>
            <div><label style={LABEL}>Phone</label><input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" placeholder="(555) 123-4567" className="sa-field" style={FIELD} /></div>
          </div>
          <div><label style={LABEL}>Instagram <span style={{ textTransform: "none", opacity: 0.7 }}>— if useful</span></label><input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@handle" className="sa-field" style={FIELD} /></div>
          <div><label style={LABEL}>Notes</label><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How you know them, best way to reach them…" className="sa-field" style={FIELD} /></div>
          {err && <p className="text-[12.5px]" role="alert" style={{ color: "#F3C6CC" }}>{err}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={submit} disabled={!canSubmit} className="rounded-lg px-4 text-[13.5px] font-black disabled:opacity-40" style={{ minHeight: 46, background: "var(--accent)", color: "#0B1220" }}>{busy ? "Saving…" : "Save contact"}</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 text-[13px] font-bold" style={{ minHeight: 46, background: "transparent", color: "var(--text-muted)" }}>Cancel</button>
          </div>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Contacts go to Survive's review queue before any outreach — you'll see the status here.</p>
        </div>
      )}
    </section>
  );
}

// ── step 2: the unlocked share kit ───────────────────────────────────────────────────────────
function KitBlock({ kit, c, readOnly, legacyToken, copied, copy }: {
  kit: ShareKit; c: RepChapterRow; readOnly: boolean; legacyToken?: string | null;
  copied: string | null; copy: (k: string, t: string) => void;
}) {
  const log = (method: "sms_composer" | "mailto" | "web_share" | "copy" | "flyer" | "qr", contactId?: string | null) => {
    if (readOnly) return;
    void logRepShare({ data: { legacyToken, chapterId: kit.chapterId, contactId: contactId ?? null, method } });
  };
  const canWebShare = typeof navigator !== "undefined" && !!navigator.share;
  const webShare = () => {
    if (readOnly) return;
    void navigator.share({ title: `Free Exam 1 — ${kit.chapterName}`, text: kit.message }).then(() => log("web_share")).catch(() => { /* dismissed */ });
  };

  return (
    <section className="mt-4">
      <h3 className="text-[12px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.1em" }}>Share Exam 1</h3>
      <div className="mt-2 rounded-xl p-3.5" style={{ background: "var(--bg-surface)", border: "1px solid var(--accent)" }}>
        <p className="break-all text-[14px] font-black" style={{ color: "var(--brand-cream)" }}>{kit.shortUrl.replace("https://", "")}</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {canWebShare && <button type="button" disabled={readOnly} onClick={webShare} className="rounded-lg px-3.5 text-[13px] font-black disabled:opacity-40" style={{ minHeight: 44, background: "var(--accent)", color: "#0B1220" }}>Share</button>}
          <a aria-disabled={readOnly} href={readOnly ? undefined : smsHref(kit.message)} onClick={() => log("sms_composer")} className="inline-flex items-center rounded-lg px-3.5 text-[13px] font-black" style={{ minHeight: 44, background: canWebShare ? "var(--bg-overlay)" : "var(--accent)", border: canWebShare ? "1px solid var(--border-default)" : "none", color: canWebShare ? "var(--brand-cream)" : "#0B1220", opacity: readOnly ? 0.4 : 1 }}>Text</a>
          <a aria-disabled={readOnly} href={readOnly ? undefined : mailtoHref(null, kit.email.subject, kit.email.body)} onClick={() => log("mailto")} className="inline-flex items-center rounded-lg px-3.5 text-[13px] font-black" style={{ minHeight: 44, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)", opacity: readOnly ? 0.4 : 1 }}>Email</a>
          <button type="button" disabled={readOnly} onClick={() => { copy(`msg-${c.id}`, kit.message); log("copy"); }} className="rounded-lg px-3.5 text-[13px] font-black disabled:opacity-40" style={{ minHeight: 44, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}>{copied === `msg-${c.id}` ? "Copied ⚡" : "Copy message"}</button>
          <button type="button" disabled={readOnly} onClick={() => { copy(`lnk-${c.id}`, kit.shortUrl); log("copy"); }} className="rounded-lg px-3.5 text-[13px] font-black disabled:opacity-40" style={{ minHeight: 44, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}>{copied === `lnk-${c.id}` ? "Copied ⚡" : "Copy link"}</button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <a aria-disabled={readOnly} href={readOnly ? undefined : kit.flyerUrl} onClick={() => log("flyer")} className="inline-flex items-center rounded-lg px-3.5 text-[13px] font-black" style={{ minHeight: 44, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)", opacity: readOnly ? 0.4 : 1 }}>⤓ Chapter flyer (PDF)</a>
          <a aria-disabled={readOnly} href={readOnly ? undefined : kit.qrDataUri} download={`survive-${kit.campusSlug}-${kit.chapterSlug}-qr.png`} onClick={() => log("qr")} className="inline-flex items-center rounded-lg px-3.5 text-[13px] font-black" style={{ minHeight: 44, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)", opacity: readOnly ? 0.4 : 1 }}>⤓ QR code</a>
        </div>
        <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-muted)" }}>Shares are logged when you start them — we can't see whether your text or email actually sent, so numbers here mean "share initiated".</p>
      </div>

      {/* the rep's contacts on this chapter, each with one-tap kit sends */}
      {kit.contacts.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-black uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.1em" }}>Contacts</p>
          <div className="mt-1.5 grid gap-1.5">
            {kit.contacts.map((ct) => (
              <div key={ct.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2.5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold" style={{ color: "var(--brand-cream)" }}>
                    {ct.name || ct.email || ct.phone}{ct.role ? <span style={{ color: "var(--text-muted)", fontWeight: 600 }}> · {ct.role}</span> : null}
                  </p>
                  <p className="truncate text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                    {[ct.email, ct.phone].filter(Boolean).join(" · ")}
                    {ct.qcState === "approved" ? " · ✓ verified" : ct.qcState === "rejected" ? " · ✕ rejected in review" : " · in review"}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {ct.phone && <a aria-disabled={readOnly} href={readOnly ? undefined : `sms:${ct.phone}?&body=${encodeURIComponent(kit.message)}`} onClick={() => log("sms_composer", ct.id)} className="inline-flex items-center rounded-lg px-2.5 text-[12px] font-black" style={{ minHeight: 38, background: "rgba(252,163,17,0.14)", color: "var(--accent)", opacity: readOnly ? 0.4 : 1 }}>Text kit</a>}
                  {ct.email && <a aria-disabled={readOnly} href={readOnly ? undefined : mailtoHref(ct.email, kit.email.subject, kit.email.body)} onClick={() => log("mailto", ct.id)} className="inline-flex items-center rounded-lg px-2.5 text-[12px] font-black" style={{ minHeight: 38, background: "rgba(252,163,17,0.14)", color: "var(--accent)", opacity: readOnly ? 0.4 : 1 }}>Email kit</a>}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>After your intro, follow-up is handled by Survive ✓ — approved contacts flow to Lee's outreach queue.</p>
        </div>
      )}
    </section>
  );
}
