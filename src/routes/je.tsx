// /je → /study — permanent (301) redirect. The Journal Entry study surface moved to
// /study; this route future-proofs old bookmarks and any surprise external references.
// The ?mode=build|present share param is carried through so old shared links still land
// on the right view. The /je/* splat is handled by je.$.tsx.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/je")({
  validateSearch: (s: Record<string, unknown>): { mode?: "build" | "present" } => ({
    mode: s.mode === "build" ? "build" : s.mode === "present" ? "present" : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/study", search, statusCode: 301 });
  },
});
