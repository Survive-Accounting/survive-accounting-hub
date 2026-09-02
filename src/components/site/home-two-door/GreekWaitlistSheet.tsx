// GREEK WAITLIST — "Find your chapter →" from the homepage's right door.
//
// ── WHAT CHANGED ON 2026-08-29, AND WHY ───────────────────────────────────────────────────────
// It used to ask three questions: a school step that offered exactly ONE school (the flagship,
// from HOME_CAMPUS) with "More campuses are coming" underneath, then a scrolling list of national
// Greek orgs, then an email. That was written when the roster was one campus deep. It no longer
// is — every seeded campus has real chapters — so a member at any other school met a page that
// told them, politely, that they didn't count. The org list had the same problem from the other
// side: "ΑΔΠ" is a national organisation, not a chapter, so two people from different campuses
// landed in the same undifferentiated bucket.
//
// It now uses THE SAME TWO CONTROLS /chapters uses — SearchPicker over every school (each row
// wearing its own bolt and its verified course code), then that campus's real chapters, searchable
// by nickname or Greek letters. Lee on the /chapters form: "The UI/UX on this form is great."
// One page, both answers, no step counter.
//
// WHY IT IS STILL A WAITLIST AND NOT A REDIRECT. /chapters navigates to the chapter's live /go
// page, because that page's job is delivery. This door's job is the SEPTEMBER 1 LAUNCH: the
// homepage promises Exam 1 when Exam 1 exists, and sending someone to a live page from a door
// that said "waitlist" would be a different promise than the one they clicked.
//
// Submission goes through the SAME store every landing capture uses — submitNotify → unified
// intake → campus_waitlist. That path has no `source` column, so the tag rides in topic
// ("Greek waitlist · Alpha Chi Omega") and note ("source:greek_waitlist · org:… · campus:…"),
// exactly how the demo page's claim tags work. Deliberately NOT a parallel table. What is new is
// that campusId and campusName are now the CHOSEN campus rather than the flagship constant, so
// the waitlist can finally be read per school.
//
// Resubmit guard: the same email+chapter from this browser doesn't insert twice — the confirmation
// simply shows again (localStorage key below).
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Bolt, BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { SearchPicker } from "@/components/site/SearchPicker";
import { listCampusIntroCodes } from "@/lib/default-map.functions";
import { listGoChapters } from "@/lib/greek-go.functions";
import { ALL_SCHOOLS, boltForSlug, orderedSchoolsForPicker, schoolBySlug } from "@/lib/schools";
import { EXAM1_LAUNCH_LABEL } from "@/lib/launch";
import { submitNotify } from "@/lib/syllabus.functions";
import { readTestSession } from "@/lib/test-mode";

const DONE_KEY = "sa-greek-waitlist";

export function GreekWaitlistSheet({ onClose, initialSchoolSlug }: {
  onClose: () => void;
  /** The campus the page already resolved. A visitor whose school the site has been naming in the
   *  headline for the whole scroll should not be asked to find it in a dropdown. */
  initialSchoolSlug?: string | null;
}) {
  const [school, setSchool] = useState<string>(() =>
    initialSchoolSlug && ALL_SCHOOLS.some((s) => s.slug === initialSchoolSlug) ? initialSchoolSlug : "");
  const [chapter, setChapter] = useState<string>("");
  // The write-in, for a house we genuinely don't have on that campus yet. Kept because an empty
  // dropdown is otherwise a dead end, and the people it strands are exactly the ones worth hearing
  // from: a chapter we have never scraped.
  const [freeChapter, setFreeChapter] = useState("");
  const [showFree, setShowFree] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Same query keys and staleTimes the /chapters finder uses, so this sheet reads a cache the page
  // has usually already warmed and the rows never appear without their course codes.
  const codesQ = useQuery({
    queryKey: ["campus-intro-codes"],
    queryFn: () => listCampusIntroCodes({ data: { ids: ALL_SCHOOLS.map((s) => s.campusId) } }),
    staleTime: 600_000, networkMode: "always",
  });
  const chaptersQ = useQuery({
    queryKey: ["go-chapters", school],
    queryFn: () => listGoChapters({ data: { schoolSlug: school } }),
    enabled: !!school, networkMode: "always", staleTime: 300_000,
  });
  const chapters = useMemo(() => chaptersQ.data ?? [], [chaptersQ.data]);

  const schoolItems = useMemo(() => {
    const codeByCampus = new Map((codesQ.data ?? []).map((r) => [r.campusId, r.code]));
    return orderedSchoolsForPicker().map((s) => ({
      value: s.slug,
      label: s.name,
      meta: codeByCampus.get(s.campusId) ?? "",
      group: s.conference,
      icon: <span className="block shrink-0" style={{ width: 15 }} aria-hidden><Bolt {...boltForSlug(s.slug)} /></span>,
    }));
  }, [codesQ.data]);

  const chapterItems = useMemo(() => chapters.map((c) => ({
    value: c.slug,
    label: c.name,
    // Searched, never shown: a student types "ADPi", "Alpha Chi" or the Greek letters and still
    // lands on the one canonical row. Same rule as the /chapters finder.
    aliases: [c.nickname, c.letters].filter(Boolean) as string[],
  })), [chapters]);

  const schoolRow = school ? ALL_SCHOOLS.find((s) => s.slug === school) : null;
  const chapterName = chapters.find((c) => c.slug === chapter)?.name ?? (showFree ? freeChapter.trim() : "");
  const ready = !!schoolRow && !!chapterName && emailOk;

  const send = async () => {
    if (!ready || busy || !schoolRow) return;
    setBusy(true); setErr(null);
    try {
      const dupeKey = `${email.trim().toLowerCase()}|${schoolRow.slug}|${chapterName}`;
      let already = false;
      try { already = localStorage.getItem(DONE_KEY) === dupeKey; } catch { /* private mode */ }
      if (!already) {
        await submitNotify({ data: {
          contact: email.trim(),
          topic: `Greek waitlist · ${chapterName}`,
          // THE CHOSEN CAMPUS, not the flagship constant. This is the whole point of the rewrite:
          // a waitlist that cannot say which campus a row belongs to cannot be used to decide
          // which campus to open next.
          campusId: schoolBySlug(schoolRow.slug)?.campusId ?? null,
          campusName: schoolRow.name,
          professorName: null,
          want: null,
          examNum: null,
          courseCode: null,
          note: `source:greek_waitlist · org:${chapterName} · campus:${schoolRow.id}${chapter ? "" : " · write-in"}`,
          isTest: !!readTestSession(),
        } });
        try { localStorage.setItem(DONE_KEY, dupeKey); } catch { /* ignore */ }
      }
      setDone(chapterName);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't send — try again?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[240] flex items-end justify-center overflow-y-auto sm:items-center sm:px-4" style={{ background: "rgba(5,8,16,0.72)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Find your chapter"
        className="w-full max-w-[420px] rounded-t-2xl p-5 sm:rounded-2xl"
        style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-default)", boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)", paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))", fontFamily: BRAND_SANS }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-[17px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Find your chapter</h3>
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/10" style={{ color: "var(--brand-cream)", background: "none", border: 0, cursor: "pointer" }} aria-label="Close">×</button>
        </div>

        {done ? (
          <p className="py-4 text-center text-[15px] font-bold leading-relaxed" style={{ color: "var(--brand-cream)" }}>
            You&apos;re on the list. When {done} opens, you&apos;re first to know.
          </p>
        ) : (
          <div className="flex w-full flex-col gap-2">
            <p className="text-[13px] leading-snug" style={{ color: "var(--text-muted)" }}>
              Exam 1 opens {EXAM1_LAUNCH_LABEL.toLowerCase()}. Tell me where you are and you&apos;re first to know.
            </p>

            <SearchPicker
              items={schoolItems}
              value={school || null}
              placeholder="Pick your school to start"
              searchPlaceholder={`Search ${ALL_SCHOOLS.length} schools…`}
              collapsibleGroup="Other"
              ariaLabel="Your school"
              onPick={(v) => { setSchool(v); setChapter(""); setShowFree(false); setFreeChapter(""); }}
            />

            {/* The control stays mounted and in place while its options load — only its label
                changes. Before a school exists it says so, rather than claiming there are no
                chapters. */}
            {!showFree ? (
              <SearchPicker
                items={chapterItems}
                value={chapter || null}
                placeholder={!school ? "Pick your school first" : chaptersQ.isLoading ? "Loading chapters…" : chapters.length ? "Your chapter…" : "No chapters listed yet"}
                searchPlaceholder={`Search ${chapters.length} chapters…`}
                disabled={!school || chaptersQ.isLoading}
                disabledHint={school ? undefined : "Pick your school first"}
                ariaLabel="Your chapter"
                onPick={setChapter}
              />
            ) : (
              <input
                autoFocus
                value={freeChapter}
                onChange={(e) => setFreeChapter(e.target.value)}
                placeholder="Your fraternity or sorority"
                aria-label="Your fraternity or sorority"
                className="w-full rounded-xl px-3 outline-none"
                style={{ fontSize: 16, minHeight: 48, background: "rgba(0,0,0,0.35)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}
              />
            )}

            {/* An empty list is stated, not hidden: a campus whose roster we don't have yet is a
                real answer, and a silently empty dropdown reads as the page being broken. */}
            {school && !chaptersQ.isLoading && !chapters.length && !showFree && (
              <p className="text-[13px] leading-snug" style={{ color: "var(--text-muted)" }}>
                I don&apos;t have chapters listed for that school yet — type yours below and I&apos;ll add it.
              </p>
            )}

            <button
              type="button"
              onClick={() => { setShowFree((v) => !v); setChapter(""); }}
              className="self-center px-1 text-[12.5px] underline underline-offset-4"
              style={{ color: "var(--text-muted)", background: "none", border: 0, minHeight: 40, cursor: "pointer" }}
            >
              {showFree ? "Pick from the list instead" : "Don't see your chapter?"}
            </button>

            <input
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErr(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
              type="email" inputMode="email" autoComplete="email" placeholder="you@school.edu"
              aria-label="Email for the chapter waitlist"
              className="w-full rounded-xl px-3 outline-none"
              style={{ fontSize: 16, minHeight: 48, background: "rgba(0,0,0,0.35)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}
            />

            {err && <p className="text-[12.5px]" role="alert" style={{ color: "#F3C6CC" }}>{err}</p>}

            <button
              type="button"
              onClick={() => void send()}
              disabled={!ready || busy}
              className="w-full rounded-xl text-[14.5px] font-black transition-opacity disabled:opacity-45"
              style={{ minHeight: 50, background: "var(--accent)", color: "#0B1220", border: 0, cursor: "pointer" }}
            >
              {busy ? "Sending…" : "Join the waitlist →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
