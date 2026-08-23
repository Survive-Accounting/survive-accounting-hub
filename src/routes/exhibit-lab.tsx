// /exhibit-lab — THE EXHIBIT LAB ZONE (Exhibit Lab v2). Filming-side only,
// noindex, no student surface. Reached from the canvas navbar ("Exhibit Lab")
// and directly by URL. No canvas, no scene writes — safe to open any time.
import { createFileRoute } from "@tanstack/react-router";

import { ExhibitLab } from "@/components/canvas/exhibit-lab/ExhibitLab";

export const Route = createFileRoute("/exhibit-lab")({
  head: () => ({ meta: [{ title: "⚡ Exhibit Lab — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
  component: ExhibitLab,
});
