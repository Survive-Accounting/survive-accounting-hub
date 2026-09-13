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
  /** THE TESTER'S REP PHONE (2026-09-07): a 555 number minted once per run, pre-filled on the
   *  rep apply form and named in the run sheet, so nobody has to invent one. */
  repPhone?: string;
};

/** The rep flow's tester phone for this session — minted on first ask, kept for the run. A 555
 *  number is unroutable, so a test rep can never collide with a real person's phone. */
export function testerRepPhone(): string {
  const s = readTestSession();
  if (s?.repPhone) return s.repPhone;
  const phone = `555000${String(Math.floor(1000 + Math.random() * 9000))}`;
  if (s) writeTestSession({ ...s, repPhone: phone });
  return phone;
}

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
  role: "Student" | "Member" | "Exec" | "Admin" | "Applicant" | "Lee" | "Council chair" | "Chapter chair";
  title: string;
  /** What to do, in one instruction. */
  todo: string;
  /** What should happen — so a tester can tell "worked" from "looked like it worked". */
  expect: string;
  /** Where to do it. Filled with the fixture URLs. */
  href?: string;
};

export const TEST_REP_JOIN_URL = `/rep/join/${TEST_CAMPUS_SLUG}`;

/** REP LIFECYCLE (2026-09-07) — the run sheet the Test Mode bar shows on every /rep page: apply,
 *  onboard, then play Lee with the links. Every value a tester has to type is named here, so the
 *  instructions on screen are the instructions. The tester phone is pre-filled on the form. */
export const REP_LIFECYCLE: TestStep[] = [
  {
    id: "rep-apply",
    role: "Applicant",
    title: "Apply as a rep",
    todo: "Open the apply page. Your tester phone is already filled in — put anything real-looking in the rest and tap Apply.",
    expect: "The page says Represent Survive at Test U, and after Apply you land on Verify your number.",
    href: TEST_REP_JOIN_URL,
  },
  {
    id: "rep-code",
    role: "Applicant",
    title: "Enter the code 000000",
    todo: "Type 000000 as the code (no text is sent to a test phone).",
    expect: "\"Your application is pending\" with a Start the onboarding button.",
  },
  {
    id: "rep-onboarding",
    role: "Applicant",
    title: "Do the six onboarding steps",
    todo: "Go through all six. Somewhere in the middle, close the tab and reopen /rep/onboarding.",
    expect: "It resumes at the step you left. Step 4 shows both pay tables; step 5 has More info; step 6 lists the Test chapter.",
    href: "/rep/onboarding",
  },
  {
    id: "rep-submit",
    role: "Applicant",
    title: "Send it to Lee",
    todo: "Skip the résumé (or attach any file) and tap Send to Lee.",
    expect: "The screen shows the text Lee would get — your answers, then an Invite to a call link and a Deny link.",
  },
  {
    id: "rep-invite",
    role: "Lee",
    title: "Invite to a call",
    todo: "Tap Invite to a call, then Send the call text.",
    expect: "The applicant's \"read your application and I like it\" text appears, with Approve and Deny links under it. Test reps never text a real phone.",
  },
  {
    id: "rep-approve",
    role: "Lee",
    title: "Approve",
    todo: "Tap Approve, then Approve — text them.",
    expect: "Rep #900-something, the Test chapter assigned, and the approval text shown on screen.",
  },
  {
    id: "rep-dashboard",
    role: "Applicant",
    title: "Open the dashboard",
    todo: "Open /rep/dashboard. Then tap the old Deny link from step 4.",
    expect: "The workspace shows the Test chapter with Copy DM and a Screenshot button; the old Deny link says already decided.",
    href: "/rep/dashboard",
  },
  {
    id: "rep-beta",
    role: "Applicant",
    title: "Send a beta note",
    todo: "On any screen, tap \"what was confusing here?\", write one line, Send.",
    expect: "It says Sent. (Suppressed for test reps; a real applicant's note texts Lee.)",
  },
];

/** THE CHAIR FUNNEL, END TO END (2026-09-13) — King's run sheet. Lee: "I want King to have an
 *  extensive end to end testing of the funnel" … "We want king to arrive there from the council.
 *  He's testing the full flow." One tester plays every role in order: the council's scholarship
 *  chair, a chapter's scholarship chair, two members, then the chair again on the dashboard. Every
 *  page is the real one, on the fixture campus (Test University · IFC · Test Chapter, letters ΤΕΣΤ).
 *
 *  THE ROLES' EMAILS: the tester's own inbox, with Gmail's +alias so each role is its own address
 *  and every message still lands in one inbox. All test mail is routed to the tester anyway.
 *  (Kept as GREEK_LIFECYCLE — the name the bar imports.) */
export const TEST_COUNCIL_URL = `/go/${TEST_CAMPUS_SLUG}/council/ifc`;
export const TEST_PORTAL_URL = `/chapters?school=${TEST_CAMPUS_SLUG}&c=ifc`;
export const TEST_MEMBERS_URL = `/learn/${TEST_CAMPUS_SLUG}/${TEST_CHAPTER_SLUG}`;
export const TEST_LEARN_URL = `/learn/${TEST_CAMPUS_SLUG}`;

export const GREEK_LIFECYCLE: TestStep[] = [
  {
    id: "council-page",
    role: "Council chair",
    title: "Open the IFC page",
    todo: "You are Test University's IFC scholarship chair and just got Lee's DM. Open the council page.",
    expect: "\"Boost every chapter's GPA in TEST 101.\" Two doors: See what chapters get, and Share with chapter chairs.",
    href: TEST_COUNCIL_URL,
  },
  {
    id: "council-share",
    role: "Council chair",
    title: "Share with chapter chairs",
    todo: "Tap Share with chapter chairs. Copy the link for chapter chairs, copy the GroupMe post, and download the council meeting slide.",
    expect: "The link is surviveaccounting.com/chapters?school=test-university&c=ifc, and the post ends with it. The slide's QR opens the same page. A [TEST] \"Council chair click\" email arrives.",
  },
  {
    id: "portal",
    role: "Chapter chair",
    title: "Pick your chapter",
    todo: "Now you are a chapter's scholarship chair who got that link. Open it (paste it into this tab) and pick Test Chapter.",
    expect: "\"For scholarship chairs · IFC · Test University\", the school already filled in, only IFC chapters listed. Picking one opens Test Chapter's chair page.",
    href: TEST_PORTAL_URL,
  },
  {
    id: "chapter-share",
    role: "Chapter chair",
    title: "Share with members",
    todo: "Tap Share with members. Try all five: copy share link, copy GroupMe post, print flyer, download flyer image, meeting slide.",
    expect: "The link is surviveaccounting.com/learn/test-university/test-chapter. The flyer image saves as a PNG (a share sheet on a phone). A [TEST] \"Chapter chair click\" email says it came from the IFC link.",
  },
  {
    id: "join",
    role: "Member",
    title: "Join from the chair's link",
    todo: "On your PHONE, open the members' link (or scan the flyer QR). Join with jking.cim+member1@gmail.com.",
    expect: "Before the page, \"Join ΤΕΣΤ's page\" asks for an email, with the member count and \"… can fund everyone's access\". After joining: straight into Exam 1, no second email ask, and a [TEST] welcome email.",
    href: TEST_MEMBERS_URL,
  },
  {
    id: "organic",
    role: "Student",
    title: "Find the chapter on your own",
    todo: "On your LAPTOP, open the campus page (not the chapter link). Tap \"In a fraternity or sorority?\", pick IFC → Test Chapter → Continue. Join with jking.cim+member2@gmail.com.",
    expect: "Picking the chapter brings up the same \"Join ΤΕΣΤ's page\" ask. After joining, the chapter card says 2 members joined.",
    href: TEST_LEARN_URL,
  },
  {
    id: "return",
    role: "Member",
    title: "Come back on another device",
    todo: "Still on the laptop, tap Forget this device (test panel), then open the members' link and enter jking.cim+member1@gmail.com again.",
    expect: "The ask appears (new device), you're straight back in, and the count stays at 2 — the same email is never counted twice.",
    href: TEST_MEMBERS_URL,
  },
  {
    id: "claim",
    role: "Chapter chair",
    title: "Activate the dashboard",
    todo: "Open Test Chapter's chair page and tap \"Activate your chapter dashboard\". Fill it in; your email is already there.",
    expect: "\"Activation received — Lee will text you shortly.\" A test-mode note explains Lee texts the chair first. A [TEST] activation email arrives (the one Lee and King get for a real chapter).",
    href: TEST_CHAPTER_URL,
  },
  {
    id: "approve",
    role: "Lee",
    title: "Skip ahead past Lee's call",
    todo: "Tap \"Skip ahead: approve it and open the dashboard\".",
    expect: "You land on the dashboard's sign-in, and a [TEST] \"your dashboard is live\" email arrives.",
  },
  {
    id: "dashboard",
    role: "Chapter chair",
    title: "Sign in to the dashboard",
    todo: "Tap Email me a sign-in link, open the email on this device, and follow the link.",
    expect: "Test Chapter's dashboard: the members' link, Members joined 2, and Who joined listing both member emails.",
    href: "/chapters/dashboard",
  },
  {
    id: "steps",
    role: "Chapter chair",
    title: "Mark the three steps done",
    todo: "Use each step's button (copy post, download slide, print flyer), then Mark done on all three.",
    expect: "Each turns green with today's date, \"3 of 3 done\", and one [TEST] email per step.",
  },
  {
    id: "seats",
    role: "Chapter chair",
    title: "Request seats",
    todo: "Set 20 seats and tap Request 20 seats.",
    expect: "\"Request sent — 20 seats. Lee will reach out.\" A [TEST] seat request email arrives. No charge, no checkout.",
  },
  {
    id: "restart",
    role: "Admin",
    title: "Start over",
    todo: "Press Reset fixture, then Start over, to run it again on the other device.",
    expect: "The test chapter is back to no members, no activation, no steps, no seat request.",
  },
];

/** FORGET THIS DEVICE — the test run's "come back on another device": clears what this browser
 *  remembers about joining a chapter and passing the Exam 1 email gate, so the same laptop can play
 *  a second member. Local keys only; the server's rows stay until Reset fixture. */
export function forgetTestDevice(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i) ?? "";
      if (k.startsWith("sa-joined:") || k === "sa-learn-unlocked" || k.startsWith("sa-cta-chapter-")) localStorage.removeItem(k);
    }
  } catch { /* storage off */ }
}
