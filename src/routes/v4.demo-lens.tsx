// /v4/demo-lens?src=/v4/… — a page of the app in a vertical window, zoomed and swum on camera (components/v4/DemoLens.tsx).
import { createFileRoute } from "@tanstack/react-router";

import { AdminGate } from "@/components/AdminGate";
import { DemoLens } from "@/components/v4/DemoLens";

export const Route = createFileRoute("/v4/demo-lens")({
  validateSearch: (s: Record<string, unknown>): { src?: string; w?: number; h?: number } => ({
    // same-site pages only
    ...(typeof s.src === "string" && s.src.startsWith("/") && !s.src.startsWith("//") ? { src: s.src } : {}),
    ...(Number(s.w) >= 800 && Number(s.w) <= 3000 ? { w: Number(s.w) } : {}),
    ...(Number(s.h) >= 500 && Number(s.h) <= 2000 ? { h: Number(s.h) } : {}),
  }),
  component: DemoLensPage,
  head: () => ({ meta: [{ title: "Demo — Survive" }, { name: "robots", content: "noindex" }] }),
});

function DemoLensPage() {
  const { src, w, h } = Route.useSearch();
  return <AdminGate><DemoLens src={src ?? "/v4/stitch-room"} appW={w} appH={h} /></AdminGate>;
}
