// TEST MODE — client half. Session detection, the tester's identity, and the lifecycle script.
//
// WHAT IT IS FOR. A tester (Lee first, other people later) walks the REAL product end to end —
// join a chapter, claim it as an exec, land on the dashboard, pull the share materials — as many
// times as they like, against fixtures they are free to destroy, with nothing they do touching a
// real count, a real roster or a real inbox.
//
// TWO LOCKS, BOTH REQUIRED. A URL flag alone must never enable it: the server also has to have
// TEST_MODE_ENABLED set, which is what lets the whole thing be switched off without a deploy. The
// client half here can only ever *propose* test mode; testModeStatus() on the server decides.
//
// SESSION ONLY. The tester's email lives in sessionStorage and nowhere else. It is the only
// address test notifications may be sent to — the send route takes the address from the session
// record, never from its caller, so this can never become an open relay.
//
// THE STEP SCRIPT below is the lifecycle itself: each step names what to do, where, and what
// should happen. It is what makes a run repeatable and what makes another tester's report legible
// ("step 4 broke" rather than "the chapter thing didn't work").

export const TEST_SESSION_KEY = "sa-test-session";

export type TestSession = {
  /** Tester's display name, from ?t= */
  name: string;
  /** THE only address test mail may go to. From ?email=, stored in session. */
  email: string;
  /** Which run this is — bumped by "Start over" so records from separate runs are separable. */
  run: number;
  startedAt: string;
  /** Step index the tester has reached, so a reload does not lose their place. */
  step: number;
};

/** Parse the tester URL: ?feedback=1&t=Lee&email=lee@…&testmode=1
 *  Every flag is required; a partial URL is not test mode. */
export function parseTestParams(search: string): { name: string; email: string } | null {
  try {
    const q = new URLSearchParams(search);
    if (q.get("testmode") !== "1") return null;
    if (q.get("feedback") !== "1") return null;
    const email = (q.get("email") ?? "").trim().toLowerCase();
    const name = (q.get("t") ?? "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
    return { name: name || email.split("@")[0], email };
  } catch { return null; }
}

export function readTestSession(): TestSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(TEST_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as TestSession;
    return s?.email ? s : null;
  } catch { return null; }
}

export function writeTestSession(s: TestSession): void {
  try { sessionStorage.setItem(TEST_SESSION_KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

export function startTestSession(name: string, email: string): TestSession {
  const prior = readTestSession();
  const s: TestSession = {
    name, email,
    run: prior && prior.email === email ? prior.run : 1,
    startedAt: new Date().toISOString(),
    step: 0,
  };
  writeTestSession(s);
  return s;
}

/** "Start over" — same tester, next run, back to step one. The previous run's records stay (they
 *  are is_test and the purge removes them); what changes is that a new run is not mixed in with
 *  the last one when reading the activity log. */
export function restartTestRun(): TestSession | null {
  const s = readTestSession();
  if (!s) return null;
  const next: TestSession = { ...s, run: s.run + 1, startedAt: new Date().toISOString(), step: 0 };
  writeTestSession(next);
  return next;
}

export function endTestSession(): void {
  try { sessionStorage.removeItem(TEST_SESSION_KEY); } catch { /* ignore */ }
}

/** RETIRED — the student in-player guided-run (Test Mode Phase A/B) tracked steps as a student
 *  used the player. That system was superseded by the Greek-lifecycle Test Mode in this file, so
 *  markStep is now a no-op: the player's former call sites (PracticeStage, SaveProgress, landing)
 *  still import and call it, they just record nothing. Removing the calls would be churn for zero
 *  behaviour change; a no-op export keeps this module the single Test Mode surface. */
export const markStep = (_step: string, _meta?: unknown): void => {};

// ── the fixtures ───────────────────────────────────────────────────────────────────────────────
/** The dedicated campus and chapter testers transact against. Real pages, real code paths, but
 *  rows nobody minds destroying — and excluded from every picker, ticker, sitemap and count. */
export const TEST_CAMPUS_SLUG = "test-university";
export const TEST_CAMPUS_NAME = "Test University";
export const TEST_COURSE_CODE = "TEST 101";
export const TEST_CHAPTER_SLUG = "test-chapter";
export const TEST_CHAPTER_NAME = "Test Chapter";
export const TEST_CAMPUS_URL = `/${TEST_CAMPUS_SLUG}`;
export const TEST_CHAPTER_URL = `/go/${TEST_CAMPUS_SLUG}/${TEST_CHAPTER_SLUG}`;

// ── the lifecycle script ───────────────────────────────────────────────────────────────────────
export type TestStep = {
  id: string;
  /** What the tester is playing at this point — the same words the product uses. */
  role: "Student" | "Member" | "Exec" | "Admin";
  title: string;
  /** What to do, in one instruction. */
  todo: string;
  /** What should happen — so a tester can tell "worked" from "looked like it worked". */
  expect: string;
  /** Where to do it. Filled with the fixture URLs. */
  href?: string;
};

/** GREEK LIFECYCLE — the first run Lee asked for: claim a chapter page, get into the dashboard,
 *  pull the share materials. Ordered exactly as a real chapter would live it. */
export const GREEK_LIFECYCLE: TestStep[] = [
  {
    id: "chapter-page",
    role: "Member",
    title: "Land on the chapter page",
    todo: "Open the test chapter's page the way a member would — from a group-chat link.",
    expect: "The hero names the chapter and TEST 101 at Test University, and Exam 1 is offered free.",
    href: TEST_CHAPTER_URL,
  },
  {
    id: "join",
    role: "Member",
    title: "Join as a member",
    todo: "Enter your name and your tester email to unlock Exam 1.",
    expect: "You get the unlock email at your tester address, subject prefixed [TEST], and the video area opens.",
  },
  {
    id: "claim",
    role: "Exec",
    title: "Claim the chapter",
    todo: "Scroll to Chapter access → step 02 and submit the claim form as an exec.",
    expect: "The claim is recorded as pending, you get a [TEST] confirmation, and Lee gets a [TEST] founder alert.",
  },
  {
    id: "approve",
    role: "Admin",
    title: "Approve the claim",
    todo: "Approve it from the test panel (or ask Lee to approve it in outreach).",
    expect: "The chapter flips to claimed and the dashboard becomes reachable.",
  },
  {
    id: "dashboard",
    role: "Exec",
    title: "Open the chapter dashboard",
    todo: "Sign in with the magic link and open the dashboard.",
    expect: "You see the roster, the aggregate numbers, the chapter link — and the seat offer with the presale note.",
    href: "/chapters/dashboard",
  },
  {
    id: "share-kit",
    role: "Exec",
    title: "Pull the share materials",
    todo: "Open 'Not ready? Get what you need to pitch it' and copy the treasurer email and the group-chat line; open the flyer.",
    expect: "Every piece already says Test Chapter, TEST 101 and the current term with its expiry date.",
  },
  {
    id: "seats",
    role: "Exec",
    title: "Choose seats",
    todo: "Choose a seat pack and a term. Stop before paying if checkout is not switched on yet.",
    expect: "The screen names the term and the exact date access ends, and shows the presale disclosure.",
  },
  {
    id: "assign",
    role: "Exec",
    title: "Assign a seat",
    todo: "Once seats are active, assign one to the member you joined as in step 2.",
    expect: "The count moves (1 of N assigned) and that member shows the courtesy line.",
  },
  {
    id: "restart",
    role: "Admin",
    title: "Start over",
    todo: "Press Start over to run it again, or Purge test data to wipe every record this run made.",
    expect: "The fixture is back to a clean chapter with no members, no claim and no seats.",
  },
];
