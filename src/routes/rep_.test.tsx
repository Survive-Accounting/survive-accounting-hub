// /rep/test — THE ONE LINK a tester needs (Lee, 2026-09-07: "I want it to be very very simple").
//
//   /rep/test              → King (king@surviveaccounting.com)
//   /rep/test?who=lee      → Lee
//   /rep/test?email=you@x.com&t=You   → anyone on TEST_MODE_EMAILS
//
// It only builds the tester URL the Test Mode bar already understands and sends the browser to
// the test campus's apply page. From there the bar shows the rep run sheet with every value to
// type, and the apply form has the tester phone filled in.
import { createFileRoute, redirect } from "@tanstack/react-router";

import { TEST_REP_JOIN_URL } from "@/lib/test-mode";

const TESTERS: Record<string, { t: string; email: string }> = {
  king: { t: "King", email: "king@surviveaccounting.com" },
  lee: { t: "Lee", email: "lee@surviveaccounting.com" },
};

export const Route = createFileRoute("/rep_/test")({
  validateSearch: (s: Record<string, unknown>): { who?: string; email?: string; t?: string } => ({
    ...(typeof s.who === "string" ? { who: s.who } : {}),
    ...(typeof s.email === "string" ? { email: s.email } : {}),
    ...(typeof s.t === "string" ? { t: s.t } : {}),
  }),
  beforeLoad: ({ search }) => {
    const preset = TESTERS[(search.who ?? "").toLowerCase()] ?? (search.email ? { t: search.t || search.email.split("@")[0], email: search.email } : TESTERS.king);
    const q = new URLSearchParams({ feedback: "1", testmode: "1", t: preset.t, email: preset.email });
    throw redirect({ href: `${TEST_REP_JOIN_URL}?${q.toString()}` });
  },
  component: () => null,
});
