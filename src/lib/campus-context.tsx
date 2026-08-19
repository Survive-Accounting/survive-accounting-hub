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
//   1. account   — the signed-in user's school (an explicit, durable statement)
//   2. session   — picked in this session (picker, ticker); beats the URL because it is the more
//                  recent deliberate act: a student on a chapter page who picks a different school
//                  in the player means it
//   3. url       — /go/<school>/<chapter> implies the school
//   4. stored    — a previous visit's preference
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

const STORE_KEY = "sa-landing-school";

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
};

const Ctx = createContext<CampusContextValue | null>(null);

export function CampusProvider({ urlSchoolSlug, accountCampusId, initialCode, children }: {
  /** Course code already resolved on the server (route loader). Used until the client query
   *  answers, so a server-rendered headline never gains its course code a beat later. */
  initialCode?: string | null;
  urlSchoolSlug?: string | null;
  accountCampusId?: string | null;
  children: React.ReactNode;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [storedId, setStoredId] = useState<string | null>(null);

  // Read storage in an EFFECT, never during render: this route is server-rendered, and a server
  // that knows nothing about localStorage would disagree with the client on the first paint.
  useEffect(() => {
    try {
      const v = localStorage.getItem(STORE_KEY);
      if (v && v !== "__notlisted__") setStoredId(v);
    } catch { /* private mode */ }
  }, []);

  const setSessionSchool = useCallback((id: string | null) => {
    setSessionId(id);
    try {
      if (id) localStorage.setItem(STORE_KEY, id);
    } catch { /* private mode */ }
  }, []);

  const resolved = useMemo<{ school: SecSchool | null; source: CampusSource }>(() => {
    const account = schoolByCampusId(accountCampusId);
    if (account) return { school: account, source: "account" };
    const session = schoolById(sessionId);
    if (session) return { school: session, source: "session" };
    const url = schoolBySlug(urlSchoolSlug);
    if (url) return { school: url, source: "url" };
    const stored = schoolById(storedId);
    if (stored) return { school: stored, source: "stored" };
    return { school: null, source: null };
  }, [accountCampusId, sessionId, urlSchoolSlug, storedId]);

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
  }), [resolved.school, resolved.source, code, setSessionSchool]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Read campus context. Safe outside a provider — returns UNKNOWN rather than throwing, so a
 *  component can be dropped onto a page that has no provider and still render generic copy. */
export function useCampus(): CampusContextValue {
  return useContext(Ctx) ?? {
    school: null, source: null, known: false, code: null,
    courseLabel: "your accounting course", setSessionSchool: () => {},
  };
}
