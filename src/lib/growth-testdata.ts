// TEST-DATA PREDICATE — one definition of "this row is not a real student".
//
// Some rows carry is_test correctly; some do not (a waitlist signup from
// lee+waitlisttest@surviveaccounting.com was stored with is_test = false and showed up
// as real demand at Ole Miss). The dashboard must never count those, so every
// first-party metric filters through here — independent of whether the cleanup
// migration (20260826_1000) has been run yet.
//
// Client-safe: pure functions, no imports.

const TEST_EMAIL_PATTERNS: RegExp[] = [
  // ANY plus-tag containing "test" — not just a tag that STARTS with it. The row that
  // slipped through and showed as real demand at Ole Miss was lee+waitlisttest@…, where
  // the tag is "waitlisttest": a /\+test/ pattern misses it entirely.
  /\+[^@]*test/i,
  /@testchapter\.example$/i,
  /@example\.(com|org|test)$/i,
  /^test[-_.@]/i, // test-ignore@…, test_foo@…
  // Our own domains are internal by definition — never a customer signal.
  /@(surviveaccounting|survivestudios)\.com$/i,
];

export function isTestEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  if (!e) return false;
  return TEST_EMAIL_PATTERNS.some((re) => re.test(e));
}

/** True when a first-party row should be excluded from every dashboard metric. */
export function isTestRow(row: { is_test?: boolean | null; email?: string | null }): boolean {
  if (row.is_test === true) return true;
  return isTestEmail(row.email ?? null);
}
