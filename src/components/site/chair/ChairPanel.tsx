// THE CHAIR SHARE PANEL (Build 2, sections 2 · 4 · 5). Floats over /learn when a chair or council
// exec arrives on the platform. The FIRST ASK IS THE SHARE (section 2): one link, ready to send.
// Everything else — explore, tour, claim, kit — is offered around it, never in front of it.
//
// NOT A FULL-SCREEN GATE. The card is bottom-anchored and the platform stays visible and tappable
// behind it, because "explore" has to read as a real choice and not a trap (section 2). Dismissing
// leaves a persistent floating button so she can get back to sharing from anywhere (section 2).
//
// Portals to <body>, so it is immune to /learn's stacking context. It carries its own brand CSS
// vars because the reused claim form (ChapterAccessForm) is written against them and body is
// outside /learn's var scope.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Check, X, ArrowRight, Users, Download, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { ChairTestimonial } from "@/components/site/chair/ChairTestimonial";
import { ChairTour } from "@/components/site/chair/ChairTour";
import { ChapterAccessForm } from "@/components/site/ChapterAccessForm";
import { getGoChapter, goPath, logGreekEvent } from "@/lib/greek-go.functions";
import { listGoChapters } from "@/lib/greek-go.functions";
import { listCampusIntroCodes } from "@/lib/default-map.functions";
import { councilBySlug, councilMatches } from "@/lib/greek-councils.functions";
import { schoolBySlug } from "@/lib/schools";
import { chapterShortName } from "@/components/site/ChapterShare";
import { councilPortalPost, LEE_SIGNOFF } from "@/lib/partners";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { currentContactRef, withRef } from "@/lib/contact-ref";
import { nbspCode } from "@/lib/course-code";
import type { ChairContext } from "@/lib/chair-landing";

const ORIGIN = "https://surviveaccounting.com";

const NAVY = "#0F1A2E";
const CARD = "#101B31";
const CREAM = "#F5F1E8";
const MUTED = "#8B97BD";
const AMBER = "#F5A623";
const RED = "#CE1126";

// Brand vars the reused ChapterAccessForm reads. Set on the portal root so that form renders
// correctly outside /learn's own var scope.
const BRAND_VARS: React.CSSProperties = {
  ["--brand-cream" as string]: CREAM,
  ["--border-default" as string]: "rgba(245,239,230,0.16)",
  ["--bg-input" as string]: "rgba(0,0,0,0.24)",
  ["--text-secondary" as string]: "#AAB4C8",
  ["--text-muted" as string]: MUTED,
  ["--accent" as string]: AMBER,
  ["--bg-overlay" as string]: "rgba(0,0,0,0.24)",
};

type View = "share" | "tour" | "claim" | "min";

/** Data the panel needs, resolved from the chair context. */
type Resolved = {
  audienceLabel: string;   // "your chapter" / "Alpha Chi Omega" / "your council"
  headline: string;        // panel title
  sub: string;             // one line under it
  courseLabel: string;     // "AC 210" or a neutral fallback
  shareMessage: string;    // the whole pasteable message
  chapterCtx: { schoolSlug: string; chapterSlug: string; chapterName: string; shortName: string } | null;
  kitUrl: string | null;   // the branded kit ZIP
  missingLine: string | null; // council-only "missing a chapter?" note
};

function useResolved(ctx: ChairContext): { data: Resolved | null; loading: boolean } {
  const ref = typeof window === "undefined" ? null : currentContactRef();

  const chapterQ = useQuery({
    queryKey: ["chair-go-chapter", ctx.school, ctx.chapter],
    queryFn: () => getGoChapter({ data: { schoolSlug: ctx.school, chapterSlug: ctx.chapter! } }),
    enabled: ctx.mode === "chapter" && !!ctx.chapter,
    staleTime: 300_000,
    networkMode: "always",
  });
  const councilChaptersQ = useQuery({
    queryKey: ["chair-council-chapters", ctx.school],
    queryFn: () => listGoChapters({ data: { schoolSlug: ctx.school } }),
    enabled: ctx.mode === "council",
    staleTime: 300_000,
    networkMode: "always",
  });
  const school = schoolBySlug(ctx.school);
  const codeQ = useQuery({
    queryKey: ["chair-intro-code", school?.campusId],
    queryFn: () => listCampusIntroCodes({ data: { ids: [school!.campusId] } }),
    enabled: !!school?.campusId,
    staleTime: 600_000,
    networkMode: "always",
  });
  const code = codeQ.data?.find((c) => c.campusId === school?.campusId)?.code ?? null;
  const courseLabel = code ? nbspCode(code) : "intro accounting";

  const data = useMemo<Resolved | null>(() => {
    // ── CHAPTER ────────────────────────────────────────────────────────────────────────────────
    if (ctx.mode === "chapter") {
      const ch = chapterQ.data;
      if (!ch) return null;
      const short = (ch.letters ?? "").trim() || chapterShortName(ch.chapterName, ch.letters, ch.nickname);
      const plain = `${ORIGIN}${goPath(ch.schoolSlug, ch.chapterSlug)}`;
      const tagged = withRef(plain, ref);
      const shareMessage = [
        `Free prep for ${code ? nbspCode(code) : "intro accounting"} — the entire first exam is free.`,
        `Videos, practice questions, full walkthroughs.`,
        tagged,
        ``,
        LEE_SIGNOFF,
      ].join("\n");
      return {
        audienceLabel: short || "your chapter",
        headline: "Share with your chapter",
        sub: "One link, ready to send.",
        courseLabel,
        shareMessage,
        chapterCtx: { schoolSlug: ch.schoolSlug, chapterSlug: ch.chapterSlug, chapterName: ch.chapterName, shortName: short },
        kitUrl: `/api/chapter-kit/${ch.schoolSlug}/${ch.chapterSlug}`,
        missingLine: null,
      };
    }
    // ── COUNCIL ──────────────────────────────────────────────────────────────────────────────
    const council = ctx.council ? councilBySlug(ctx.council) : null;
    const all = councilChaptersQ.data ?? [];
    const chapters = council ? all.filter((c) => councilMatches(council, c.council)) : all;
    const portalUrl = withRef(`${ORIGIN}/s/${ctx.school}`, ref);
    const shareMessage = councilPortalPost({ courseCode: code, schoolName: school?.name ?? ctx.school, portalUrl });
    const kitUrl = council ? `/api/partner-kit/${ctx.school}/${council.slug}` : null;
    return {
      audienceLabel: council ? `${council.name} at ${school?.name ?? ctx.school}` : "your council",
      headline: council ? `Share with your ${council.name} chapters` : "Share with your chapters",
      sub: "One link. Every chapter finds its own page.",
      courseLabel,
      shareMessage,
      chapterCtx: null,
      // The missing-chapters line lives on the council path only (Build 1). Shown once chapters load.
      missingLine: councilChaptersQ.isLoading
        ? null
        : `${chapters.length} chapter${chapters.length === 1 ? "" : "s"} listed. Missing one? Text Lee and it's added.`,
      kitUrl,
    };
  }, [ctx, chapterQ.data, councilChaptersQ.data, councilChaptersQ.isLoading, code, courseLabel, ref, school?.name, school?.campusId]);

  const loading =
    (ctx.mode === "chapter" ? chapterQ.isLoading : councilChaptersQ.isLoading) || (!!school?.campusId && codeQ.isLoading);
  return { data, loading };
}

export function ChairPanel({ ctx }: { ctx: ChairContext }) {
  const { data, loading } = useResolved(ctx);
  const minKey = `sa-chair-min-${ctx.mode}-${ctx.chapter ?? ctx.council ?? ctx.school}`;
  const [view, setView] = useState<View>("share");
  // `shared` advances the flow (claim / defer appear); `copied` confirms an ACTUAL clipboard write;
  // `copyFailed` reveals the message to copy by hand. Separated so a browser that blocks the
  // clipboard is never a dead end — she still reaches claim, and still gets the text (mirrors the
  // council share screen). "Copied ✓" is never shown for a write that didn't happen.
  const [shared, setShared] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  // Returning within the session after minimizing: come back to the floating button, not the card.
  useEffect(() => {
    try { if (localStorage.getItem(minKey) === "1") setView("min"); } catch { /* ignore */ }
  }, [minKey]);

  const minimize = () => {
    setView("min");
    try { localStorage.setItem(minKey, "1"); } catch { /* ignore */ }
  };
  const reopen = () => {
    setView("share");
    try { localStorage.removeItem(minKey); } catch { /* ignore */ }
  };

  const copy = async () => {
    if (!data) return;
    const ok = await copyToClipboard(data.shareMessage);
    // Advance regardless: a blocked clipboard must not trap her before claim. The manual-copy box
    // (below) carries the message when the write failed.
    setShared(true);
    setCopied(ok);
    setCopyFailed(!ok);
    if (ok) {
      void logGreekEvent({ data: { schoolSlug: ctx.school, chapterSlug: ctx.chapter ?? "council", kind: "copy_message" } }).catch(() => {});
      window.setTimeout(() => setCopied(false), 2600);
    }
  };

  if (typeof document === "undefined") return null;

  const body = (
    <div style={{ ...BRAND_VARS, fontFamily: BRAND_SANS }}>
      {/* FLOATING REOPEN BUTTON — present whenever the card is not the share view, so sharing is
          reachable from anywhere on the platform (section 2). */}
      {view !== "share" && view !== "claim" && (
        <button
          onClick={reopen}
          className="fixed bottom-4 right-4 z-[130] flex items-center gap-2 rounded-full px-4 py-3 shadow-2xl"
          style={{ background: AMBER, color: "#0B1220" }}
        >
          <Zap size={16} fill="#0B1220" />
          <span className="text-[13px] font-black">Share with your {ctx.mode === "council" ? "chapters" : "chapter"}</span>
        </button>
      )}

      {/* THE QUICK TOUR — shown when she chooses to explore first. Floats above the reopen button. */}
      {view === "tour" && data && (
        <div className="fixed inset-x-0 bottom-20 z-[131] flex justify-center px-3 sm:inset-x-auto sm:right-4 sm:justify-end">
          <ChairTour
            audienceLabel={data.audienceLabel}
            courseLabel={data.courseLabel}
            onClose={minimize}
            onInterested={() => { void logGreekEvent({ data: { schoolSlug: ctx.school, chapterSlug: ctx.chapter ?? "council", kind: "demo_claim" } }).catch(() => {}); }}
          />
        </div>
      )}

      {/* THE CLAIM FORM — a light scrim for focus, but still dismissible (section 4). */}
      {view === "claim" && data?.chapterCtx && (
        <div className="fixed inset-0 z-[132] flex items-end justify-center sm:items-center" style={{ background: "rgba(4,7,14,0.6)" }}>
          <div
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl px-4 pb-5 pt-4 sm:max-w-[420px] sm:rounded-2xl"
            style={{ background: CARD, border: "1px solid rgba(245,239,230,0.14)" }}
          >
            {/* No hero: the form is above the fold at 375px (section 4 / the audit). */}
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[16px] font-black" style={{ color: CREAM, fontFamily: BRAND_DISPLAY }}>Claim your chapter's page</h3>
              <button onClick={() => setView("share")} className="grid h-8 w-8 place-items-center rounded-full" style={{ background: "rgba(245,239,230,0.06)", color: MUTED }} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <p className="mb-3 text-[12.5px]" style={{ color: MUTED }}>See who signs up. Free — it just gives the page an admin.</p>
            <ChapterAccessForm
              schoolSlug={data.chapterCtx.schoolSlug}
              chapterSlug={data.chapterCtx.chapterSlug}
              chapterName={data.chapterCtx.chapterName}
              shortName={data.chapterCtx.shortName}
              onClose={() => setView("share")}
              onDone={() => { /* stays open on its own success card */ }}
              bare
            />
          </div>
        </div>
      )}

      {/* THE SHARE-FIRST CARD — the default, and the first thing she sees. */}
      {view === "share" && (
        <div className="fixed inset-x-0 bottom-0 z-[130] flex justify-center px-3 pb-3 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:px-0">
          <div
            className="w-full max-w-[420px] overflow-hidden rounded-2xl shadow-2xl"
            style={{ background: CARD, border: "1px solid rgba(245,239,230,0.16)" }}
          >
            <div className="flex items-start gap-2 px-4 pt-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-[18px] font-black leading-tight" style={{ color: CREAM, fontFamily: BRAND_DISPLAY }}>
                  {loading ? "Share with your chapter" : data?.headline}
                </h2>
                <p className="mt-0.5 text-[13px]" style={{ color: MUTED }}>{loading ? "One link, ready to send." : data?.sub}</p>
              </div>
              <button onClick={minimize} className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "rgba(245,239,230,0.06)", color: MUTED }} aria-label="Minimize">
                <X size={16} />
              </button>
            </div>

            <div className="px-4 pb-4 pt-3">
              {/* PRIMARY: copy the link. */}
              <button
                onClick={() => void copy()}
                disabled={loading || !data}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-black disabled:opacity-60"
                style={{ background: copied ? "#1E9E5A" : AMBER, color: copied ? "#EAFBF1" : "#0B1220" }}
              >
                {copied ? <><Check size={18} /> Copied — paste it in your group chat</> : <><Copy size={17} /> Copy it</>}
              </button>

              {/* MANUAL-COPY FALLBACK — shown only when the browser blocked the clipboard, so a
                  chair in an in-app browser can still select the message by hand instead of walking
                  away with nothing (the same guard the council share screen makes). */}
              {copyFailed && data && (
                <div className="mt-2 w-full text-left">
                  <p role="alert" className="mb-1 text-[12px] font-bold" style={{ color: "#F3C6CC" }}>
                    This browser blocked the copy — select the message below and copy it by hand.
                  </p>
                  <pre
                    className="w-full overflow-y-auto whitespace-pre-wrap break-words rounded-xl px-3 py-2.5 text-[12px] leading-relaxed"
                    style={{ maxHeight: 180, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(245,239,230,0.16)", color: CREAM }}
                  >
                    {data.shareMessage}
                  </pre>
                </div>
              )}

              {/* ONE TESTIMONIAL, directly beneath the copy button (section 2). */}
              <ChairTestimonial />

              {/* AFTER COPY — the claim offer (section 4) / council defer (section 5). */}
              {shared && data?.chapterCtx && (
                <button
                  onClick={() => setView("claim")}
                  className="mt-3 flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-left"
                  style={{ background: "rgba(245,166,35,0.1)", border: `1px solid ${AMBER}` }}
                >
                  <span className="flex items-center gap-2 text-[13px] font-bold" style={{ color: CREAM }}>
                    <Users size={16} style={{ color: AMBER }} /> Want to see who signs up? Claim your page
                  </span>
                  <ArrowRight size={16} style={{ color: AMBER }} />
                </button>
              )}
              {shared && !data?.chapterCtx && (
                <p className="mt-3 text-center text-[12px]" style={{ color: MUTED }}>
                  Getting the link shared matters most. You can claim the page later — no rush.
                </p>
              )}

              {/* SECONDARY ACTIONS: kit download + explore. */}
              <div className="mt-3 flex flex-col gap-2">
                {data?.kitUrl && (
                  <a
                    href={data.kitUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => { void logGreekEvent({ data: { schoolSlug: ctx.school, chapterSlug: ctx.chapter ?? "council", kind: "flyer_download" } }).catch(() => {}); }}
                    className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold"
                    style={{ background: "rgba(245,239,230,0.06)", color: CREAM }}
                  >
                    <Download size={15} /> Download the chapter kit
                  </a>
                )}
                <button
                  onClick={() => setView("tour")}
                  className="w-full rounded-xl py-2.5 text-[13px] font-bold"
                  style={{ color: MUTED }}
                >
                  Just looking? Explore first →
                </button>
              </div>

              {data?.missingLine && (
                <p className="mt-2 text-center text-[11.5px]" style={{ color: MUTED }}>{data.missingLine}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(body, document.body);
}
