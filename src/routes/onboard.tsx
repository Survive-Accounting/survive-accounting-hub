// /onboard — web entry point for the onboarding wizard.
// Creates a fresh sms_conversations row and redirects to /o/{short_ref},
// so web and SMS visitors share the same DB-backed 3-step flow.
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createWebOnboarding } from "@/lib/onboarding.functions";

export const Route = createFileRoute("/onboard")({
  head: () => ({
    meta: [
      { title: "Get Started — Survive Accounting" },
      {
        name: "description",
        content:
          "Tell us about your course in about 2 minutes. Premium 1-on-1 accounting tutoring with Lee.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async () => {
    const { shortRef } = await createWebOnboarding();
    throw redirect({
      to: "/o/$shortRef",
      params: { shortRef: String(shortRef) },
      replace: true,
    });
  },
  component: () => null,
});
