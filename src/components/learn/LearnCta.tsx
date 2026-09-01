// THE GREEK CTA BAR (learn-share-flow, Phase 2) — the one persistent, adaptive ask on /learn.
//
// Replaces both the flag-off ChairPanel and the GreekDoor billboard. Fixed at the bottom,
// dismissable, ONE primary action, and the action adapts to who the visitor probably is:
//
//   A  organic (no chapter picked)      →  "Pick your chapter"       (share path)
//   B  council contact (Phase 3)        →  "Pick your chapter"       (chair copy)
//   C  chapter picked, unclaimed        →  "Set up <chapter>"        (claim)
//   D  chapter picked, claimed          →  "<chapter> · N members · Join"  (free membership)
//   F  already a member                 →  no ask, just "you're in"
//
// FREE MEMBERSHIP ≠ PAID SEATS. Join records a greek_chapter_members row (instant, free, no
// approval, deduped by the sa_anon device id) — it never writes an entitlement, so nothing here
// touches the greek_seat path. Paid seats (Exams 2/3/Final) are a later screen a chapter buys.
//
// The member COUNT ("47 members already using this") is the number that sells a chapter, and it
// comes straight from getGoChapter (public, unauth, count only — no names).
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, Check, X, ArrowRight, Share2 } from "lucide-react";

import { NEON } from "@/components/canvas/theme";
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { SearchPicker } from "@/components/site/SearchPicker";
import { ChapterAccessForm } from "@/components/site/ChapterAccessForm";
import { ChapterShareSheet } from "@/components/learn/ChapterShareSheet";
import { getGoChapter, listGoChapters, tagChapterMember } from "@/lib/greek-go.functions";
import { deviceAnonId } from "@/lib/device-id";

const AMBER = NEON.yellow;

// ── local memory (per browser) ────────────────────────────────────────────────────────────────
// The picked chapter and "I joined" live in localStorage so a return visit resumes where they were
// and the bar doesn't re-ask. Guarded — a private window that throws just falls back to the bar.
const kPick = (campus: string) => `sa-cta-chapter-${campus}`;
const kMember = (campus: string, chapter: string) => `sa-cta-member-${campus}-${chapter}`;
const kDismiss = (campus: string) => `sa-cta-dismissed-${campus}`;
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

type CtaState = "A" | "B" | "C" | "D" | "F";

/** ?test=A|B|C|D|F renders a state from a fixture, no DB reads or writes — mirrors /learn?demo=1.
 *  Returns the forced state + a fixture chapter, or null when not testing. */
function testFixture(test: string | undefined): { state: CtaState; chapter: string; name: string; members: number } | null {
  if (!test) return null;
  const s = test.toUpperCase();
  if (s === "A" || s === "B") return { state: s as CtaState, chapter: "", name: "", members: 0 };
  if (s === "C") return { state: "C", chapter: "chi-omega", name: "Chi Omega", members: 0 };
  if (s === "D") return { state: "D", chapter: "chi-omega", name: "Chi Omega", members: 47 };
  if (s === "F") return { state: "F", chapter: "chi-omega", name: "Chi Omega", members: 47 };
  return null;
}

export function LearnCta({
  campusSlug,
  campusName,
  ref,
  sharerIsCouncil,
  test,
}: {
  campusSlug: string;
  campusName: string;
  /** The contact who brought them (recipient). Kept for attribution on join; the sharer banner is
   *  Phase 3. */
  ref?: string | null;
  /** The resolved sharer/recipient sits on a council → state B ("get this to your chapter"). */
  sharerIsCouncil?: boolean;
  /** ?test letter — forces a state from a fixture, client-only. */
  test?: string;
}) {
  const fixture = testFixture(test);
  const testing = !!fixture;

  const [dismissed, setDismissed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [view, setView] = useState<"bar" | "pick" | "setup" | "share">("bar");
  const [joinBusy, setJoinBusy] = useState(false);
  const [justJoined, setJustJoined] = useState(false);

  // Hydrate from localStorage in an effect (never during render — avoids a hydration mismatch).
  useEffect(() => {
    if (testing) return;
    setDismissed(ls.get(kDismiss(campusSlug)) === "1");
    setPicked(ls.get(kPick(campusSlug)));
  }, [campusSlug, testing]);

  const chapterSlug = fixture?.chapter || picked;

  // The one public read: claim status + member count for the picked chapter (no names). Skipped in
  // test mode (the fixture supplies both).
  const chapterQ = useQuery({
    queryKey: ["cta-go-chapter", campusSlug, chapterSlug],
    queryFn: () => getGoChapter({ data: { schoolSlug: campusSlug, chapterSlug: chapterSlug! } }),
    enabled: !testing && !!chapterSlug,
    staleTime: 120_000,
    networkMode: "always",
  });

  const chaptersQ = useQuery({
    queryKey: ["cta-chapters", campusSlug],
    queryFn: () => listGoChapters({ data: { schoolSlug: campusSlug } }),
    enabled: !testing && view === "pick",
    staleTime: 300_000,
    networkMode: "always",
  });

  const isMember = useMemo(() => {
    if (fixture) return fixture.state === "F";
    if (justJoined) return true;
    if (!chapterSlug) return false;
    return ls.get(kMember(campusSlug, chapterSlug)) === "1";
  }, [fixture, justJoined, campusSlug, chapterSlug]);

  const chapterName = fixture?.name || chapterQ.data?.chapterName || "";
  const members = fixture?.members ?? chapterQ.data?.members ?? 0;
  const claimed = fixture ? fixture.state === "D" || fixture.state === "F" : chapterQ.data?.claimStatus === "claimed";

  // ── the state ────────────────────────────────────────────────────────────────────────────────
  const state: CtaState = useMemo(() => {
    if (fixture) return fixture.state;
    if (!chapterSlug) return sharerIsCouncil ? "B" : "A";
    if (isMember) return "F";
    return claimed ? "D" : "C";
  }, [fixture, chapterSlug, isMember, claimed, sharerIsCouncil]);

  const join = async () => {
    if (!chapterSlug || joinBusy) return;
    setJoinBusy(true);
    try {
      if (!testing) {
        await tagChapterMember({ data: { schoolSlug: campusSlug, chapterSlug, deviceId: deviceAnonId(), source: "link" } });
        ls.set(kMember(campusSlug, chapterSlug), "1");
      }
      setJustJoined(true);
    } finally {
      setJoinBusy(false);
    }
  };

  const pick = (slug: string) => {
    setPicked(slug);
    if (!testing) ls.set(kPick(campusSlug), slug);
    // Picking a chapter is the chair's path to the deliverable: go straight to the share sheet
    // (what-you-get + the link), not back to the bar.
    setView("share");
  };

  const dismiss = () => {
    setDismissed(true);
    if (!testing) ls.set(kDismiss(campusSlug), "1");
  };
  const reopen = () => {
    setDismissed(false);
    if (!testing) ls.del(kDismiss(campusSlug));
  };

  // ── dismissed → a small reopen tab ────────────────────────────────────────────────────────────
  if (dismissed) {
    return (
      <button
        onClick={reopen}
        className="fixed bottom-3 right-3 z-[90] flex items-center gap-1.5 rounded-full px-3.5 py-2 shadow-xl"
        style={{ background: AMBER, color: "#0B1220", fontFamily: BRAND_SANS }}
      >
        <Users size={15} /> <span className="text-[12.5px] font-black">Your chapter</span>
      </button>
    );
  }

  return (
    <>
      {/* TEST MARKER — nothing here is real (brief §9). */}
      {testing && (
        <div className="fixed left-1/2 top-2 z-[95] -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest shadow"
          style={{ background: "#7A2E12", color: "#FFE3C7", fontFamily: BRAND_SANS }}>
          Test mode · state {state}
        </div>
      )}

      {/* THE BAR */}
      <div className="fixed inset-x-0 bottom-0 z-[90] px-3 pb-3" style={{ fontFamily: BRAND_SANS }}>
        <div className="mx-auto flex w-full max-w-[560px] items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl"
          style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}` }}>
          <div className="min-w-0 flex-1">
            {state === "A" && <BarCopy title="In a fraternity or sorority?" sub="Get this for your whole chapter." />}
            {state === "B" && <BarCopy title="Get this to your chapter." sub="Pick yours — a link to send in about 30 seconds." />}
            {state === "C" && <BarCopy title={`${chapterName} hasn't set this up yet.`} sub="Want the whole chapter to have it?" />}
            {state === "D" && (
              <BarCopy
                title={`${chapterName} is on Survive.`}
                sub={<span className="inline-flex items-center gap-1"><Users size={12} style={{ color: AMBER }} />{members} member{members === 1 ? "" : "s"} already using it.</span>}
              />
            )}
            {state === "F" && (
              <BarCopy
                title={<span className="inline-flex items-center gap-1.5"><Check size={15} style={{ color: NEON.green }} /> You're in with {chapterName}.</span>}
                sub={`${members} member${members === 1 ? "" : "s"} · study Exam 1 free, right now.`}
              />
            )}
          </div>

          {/* PRIMARY ACTION */}
          <div className="shrink-0">
            {(state === "A" || state === "B") && <Primary onClick={() => setView("pick")}>Pick your chapter →</Primary>}
            {state === "C" && <Primary onClick={() => setView("setup")}>Set up {chapterName} →</Primary>}
            {state === "D" && <Primary onClick={() => void join()} busy={joinBusy}>{joinBusy ? "Joining…" : "Join →"}</Primary>}
            {state === "F" && (
              <button onClick={() => setView("share")} className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-[13px] font-bold"
                style={{ background: "rgba(255,255,255,0.06)", color: NEON.text }}>
                <Share2 size={14} /> Share
              </button>
            )}
          </div>

          <button onClick={dismiss} className="grid h-7 w-7 shrink-0 place-items-center rounded-full" style={{ background: "rgba(255,255,255,0.05)", color: NEON.muted }} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>

        {/* A quiet share link under the bar for a chair on a known chapter (states C/D). */}
        {(state === "C" || state === "D") && chapterSlug && (
          <div className="mx-auto mt-1.5 w-full max-w-[560px] text-center">
            <button onClick={() => setView("share")} className="text-[12px] font-bold underline underline-offset-4" style={{ color: NEON.muted }}>
              Just want to share {chapterName} with your members? →
            </button>
          </div>
        )}
      </div>

      {/* PICK YOUR CHAPTER — one screen, one field (brief §5). */}
      {view === "pick" && (
        <Sheet onClose={() => setView("bar")} title="Pick your chapter">
          <SearchPicker
            items={(chaptersQ.data ?? fixtureChapters(testing)).map((c) => ({ value: c.slug, label: c.name, aliases: [c.nickname, c.letters].filter(Boolean) as string[] }))}
            value={null}
            placeholder={chaptersQ.isLoading ? "Loading chapters…" : "Find your chapter"}
            searchPlaceholder={`Search ${campusName} chapters…`}
            disabled={!testing && chaptersQ.isLoading}
            ariaLabel="Your chapter"
            onPick={pick}
          />
          <p className="mt-3 text-center text-[12px]" style={{ color: NEON.muted }}>No account, no email — just pick yours.</p>
        </Sheet>
      )}

      {/* SET UP (claim) — reuses the existing claim form, bare. */}
      {view === "setup" && chapterSlug && (
        <Sheet onClose={() => setView("bar")} title={`Set up ${chapterName}`}>
          <p className="mb-3 text-[12.5px]" style={{ color: NEON.muted }}>Free — it gives the page an admin so you can see who signs up.</p>
          {testing ? (
            <p className="text-[12.5px]" style={{ color: NEON.muted }}>(Claim form — hidden in test mode.)</p>
          ) : (
            <ChapterAccessForm schoolSlug={campusSlug} chapterSlug={chapterSlug} chapterName={chapterName} onClose={() => setView("bar")} bare />
          )}
        </Sheet>
      )}

      {/* THE SHARE SHEET — the deliverable: what-you-get + the link + the ask (§6-7). */}
      {view === "share" && chapterSlug && (
        <ChapterShareSheet
          campusSlug={campusSlug}
          campusName={campusName}
          chapterName={chapterName || "your chapter"}
          ref={ref}
          testing={testing}
          onClose={() => setView("bar")}
        />
      )}
    </>
  );
}

function BarCopy({ title, sub }: { title: React.ReactNode; sub: React.ReactNode }) {
  return (
    <>
      <div className="text-[14px] font-black leading-tight" style={{ color: NEON.text, fontFamily: BRAND_DISPLAY }}>{title}</div>
      <div className="mt-0.5 text-[12px] leading-snug" style={{ color: NEON.muted }}>{sub}</div>
    </>
  );
}

function Primary({ children, onClick, busy }: { children: React.ReactNode; onClick: () => void; busy?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13.5px] font-black disabled:opacity-70"
      style={{ background: AMBER, color: "#0B1220" }}>
      {children}
    </button>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[96] flex items-end justify-center sm:items-center" style={{ background: "rgba(4,7,14,0.66)" }} onClick={onClose}>
      <div className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl px-4 pb-5 pt-4 sm:max-w-[420px] sm:rounded-2xl"
        style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}`, fontFamily: BRAND_SANS }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[16px] font-black" style={{ color: NEON.text, fontFamily: BRAND_DISPLAY }}>{title}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: NEON.muted }} aria-label="Close"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function fixtureChapters(testing: boolean): Array<{ slug: string; name: string; nickname: string | null; letters: string | null }> {
  return testing ? [{ slug: "chi-omega", name: "Chi Omega", nickname: "Chi O", letters: "ΧΩ" }] : [];
}
