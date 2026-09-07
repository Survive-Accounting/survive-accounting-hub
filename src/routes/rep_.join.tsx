// /rep/join — become a campus rep, with no campus in the URL: the campus is a searchable
// dropdown and everything else is the same application as /rep/join/<campus>.
//
//   FORM → VERIFY PHONE (Twilio OTP) → PENDING → /rep/onboarding (pre-onboarding, before review)
//
// The self-verify shortcut to the dashboard is gone (spec 2026-09-06): a verified phone opens
// the onboarding, not the workspace; the workspace opens when Lee approves.
import { createFileRoute } from "@tanstack/react-router";

import { RepApply } from "@/components/reps/RepApply";
import { ogMeta } from "@/lib/og";

export const Route = createFileRoute("/rep_/join")({
  head: () => ({ meta: ogMeta({ title: "Become a Survive campus rep.", description: "Help Greek chapters at your school get exam prep for their accounting courses, and earn commission on every chapter you bring on.", path: "/rep/join" }) }),
  component: () => <RepApply campusKey={null} />,
});
