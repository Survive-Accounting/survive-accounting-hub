// CAMPUS CONTEXT — one answer to "whose school is this?", for the whole app.
//
// THE BUG THIS EXISTS TO KILL: /go/university-of-mississippi/sigma-chi rendered a banner saying
// Sigma Chi at Ole Miss while the hero cycled through other schools' colourways beside it. Nothing
// was wrong with either piece on its own; they simply never asked each other. Every component
// decided independently what school it was showing, so they disagreed, and any per-component fix
// would have drifted apart again within a pass or two.
//
// So campus is resolved ONCE, here, and read everywhere. No component may decide for itself what
// course code or colourway to display.
//
// PRIORITY, most trustworthy first:
//   1. url      — /<school> and /go/<school>/<chapter> NAME a campus. The page is about that
//                 campus, so nothing may override it: a visitor who last used Arizona and then
//                 opens an Ole Miss page is on an Ole Miss page.
//   2. session  — picked in this session (picker, ticker), on a page whose URL names no campus.
//   3. account  — the signed-in user's school.
//   4. stored   — LAST USED, not "current". A previous visit's campus is a good default for a
//                 generic page and never an answer on a page that already has one.
//
// The url rung moved to the top on 2026-08-21. It used to sit third, under account and session,
// which made a remembered campus authoritative everywhere — the bug this ordering exists to kill.
// None of the above ⇒ UNKNOWN, and the app uses cycling/generic copy exactly as it does today.
//
// COURSE CODES come from campuses.course_family_codes_json.intro_1 via the same server fn the
// picker uses. A school with no verified code yields `code: null`, and callers must fall back to
// generic copy ("your accounting course"). Never a placeholder, and never another school's code —
// that substitution is the whole failure mode being fixed.
import { useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { ALL_SCHOOLS, schoolByCampusId, schoolById, schoolBySlug, type SecSchool } from "@/lib/schools";
import { listCampusIntroCodes } from "@/lib/default-map.functions";
import { readStoredCampus, rememberCampus, SKIPPED, NOT_LISTED } from "@/lib/campus-prefs";

export type CampusSource = "account" | "session" | "url" | "stored" | null;

export type CampusContextValue = {
  /** The resolved school, or null when campus is UNKNOWN. */
  school: SecSchool | null;
  /** Which rule resolved it — useful for debugging a wrong answer. */
  source: CampusSource;
  known: boolean;
  /** Verified intro-1 course code, or null. NEVER a guess and never another school's. */
  code: string | null;
  /** Course reference for student-facing copy: the code when known, generic prose otherwise. */
  courseLabel: string;
  /** Set the session-level school (picker, ticker). Pass null to clear back to lower priorities. */
  setSessionSchool: (id: string | null) => void;
  /** FORGET THE SCHOOL EVERYWHERE this tab can reach: session pick, stored pick and the storage
   *  key behind it. Only account and URL sources survive, because neither is a choice the visitor
   *  made here. Player "Reset" calls this so the hero, bolt and copy fall back to generic together
   *  with the player instead of the page staying branded for a school the visitor just rejected. */
  clearSchool: () => void;
};

const Ctx = createContext<CampusContextValue | null>(null);

export function CampusProvider({ urlSchoolSlug, accountCampusId, initialCode, initialStoredId, children }: {
  /** The stored campus as read from the request COOKIE by the route loader. Seeds the stored
   *  rung so the server render and the first client paint agree on a returning visitor's campus
   *  (the client effect below still re-reads storage for pre-cookie visitors). */
  initialStoredId?: string | null;
  /** Course code already resolved on the server (route loader). Used until the client query
   *  answers, so a server-rendered headline never gains its course code a beat later. */
  initialCode?: string | null;
  urlSchoolSlug?: string | null;
  accountCampusId?: string | null;
  children: React.ReactNode;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const isSchoolId = (v: string | null | undefined) => !!v && v !== SKIPPED && v !== NOT_LISTED;
  const [storedId, setStoredId] = useState<string | null>(() => (isSchoolId(initialStoredId) ? initialStoredId! : null));

  // Re-read storage in an EFFECT, never during render: a visitor from before the cookie existed
  // has only localStorage, which the server cannot see; picking it up after mount is the one case
  // where the first paint is allowed to be generic.
  useEffect(() => {
    const v = readStoredCampus();
    if (isSchoolId(v)) setStoredId(v);
  }, []);

  const setSessionSchool = useCallback((id: string | null) => {
    setSessionId(id);
    if (id) rememberCampus(id);
  }, []);

  const clearSchool = useCallback(() => {
    setSessionId(null);
    setStoredId(null);
    rememberCampus(null);
  }, []);

  const resolved = useMemo<{ school: SecSchool | null; source: CampusSource }>(() => {
    const url = schoolBySlug(urlSchoolSlug);
    if (url) return { school: url, source: "url" };
    const session = schoolById(sessionId);
    if (session) return { school: session, source: "session" };
    const account = schoolByCampusId(accountCampusId);
    if (account) return { school: account, source: "account" };
    const stored = schoolById(storedId);
    if (stored) return { school: stored, source: "stored" };
    return { school: null, source: null };
  }, [accountCampusId, sessionId, urlSchoolSlug, storedId]);

  // A CAMPUS THE URL NAMED IS REMEMBERED EXACTLY LIKE A PICKED ONE. Landing on /<school> or
  // /go/<school>/<chapter> is as clear a statement of "my school" as the picker, and before this
  // the logo, the nav and every generic route forgot it one click later. Written on every resolve
  // from a url/session source so the cookie always holds the most recent campus.
  useEffect(() => {
    if (!resolved.school) return;
    // "account" included: the campus and /go/ routes hand their loader campus in as accountCampusId.
    if (resolved.source !== "stored") rememberCampus(resolved.school.id);
  }, [resolved.school, resolved.source]);

  // One query for all sixteen, cached: the resolved campus can change (picker, navigation) without
  // refetching, and the codes are the same list the picker already loads.
  const codesQ = useQuery({
    queryKey: ["campus-intro-codes"],
    queryFn: () => listCampusIntroCodes({ data: { ids: ALL_SCHOOLS.map((s) => s.campusId) } }),
    staleTime: 600_000,
    networkMode: "always",
  });

  const code = useMemo(() => {
    if (!resolved.school) return null;
    const hit = (codesQ.data ?? []).find((r) => r.campusId === resolved.school!.campusId);
    const c = (hit?.code ?? "").trim();
    // Server value first, and only while the query has nothing — once the query answers it is
    // authoritative, so an edited code still takes effect without a deploy.
    if (c) return c;
    return (initialCode ?? "").trim() || null;
  }, [codesQ.data, resolved.school, initialCode]);

  const value = useMemo<CampusContextValue>(() => ({
    school: resolved.school,
    source: resolved.source,
    known: !!resolved.school,
    code,
    // The fallback is deliberately vague prose, not a placeholder like "ACCT 101". A student who
    // sees a plausible-looking wrong code trusts it; one who sees "your accounting course" simply
    // reads past it.
    courseLabel: code ?? "your accounting course",
    setSessionSchool,
    clearSchool,
  }), [resolved.school, resolved.source, code, setSessionSchool, clearSchool]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Read campus context. Safe outside a provider — returns UNKNOWN rather than throwing, so a
 *  component can be dropped onto a page that has no provider and still render generic copy. */
export function useCampus(): CampusContextValue {
  return useContext(Ctx) ?? {
    school: null, source: null, known: false, code: null,
    courseLabel: "your accounting course", setSessionSchool: () => {}, clearSchool: () => {},
  };
}
