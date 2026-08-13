// /c/<slug> — a Greek chapter's shareable free-Exam-1 link. Renders the normal player pre-selected to
// the chapter's school with a "courtesy of [Chapter]" banner + claim. Never gates: an invalid/expired
// slug (or one still loading) just falls through to the standard free player.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { getChapterBySlug } from "@/lib/greek-chapters.functions";
import { LandingPage } from "./landing";

export const Route = createFileRoute("/c/$slug")({
  head: () => ({ meta: [{ title: "⚡ Survive Accounting — Free Exam 1" }, { name: "robots", content: "noindex" }] }),
  component: ChapterRedeem,
});

function ChapterRedeem() {
  const { slug } = Route.useParams();
  const chQ = useQuery({ queryKey: ["chapter-slug", slug], queryFn: () => getChapterBySlug({ data: { slug } }), networkMode: "always", staleTime: 300_000 });
  const ch = chQ.data ?? null;
  return <LandingPage initialCampusId={ch?.campusId ?? undefined} chapterBanner={ch?.chapterName ?? undefined} chapterSlug={ch ? slug : undefined} />;
}
