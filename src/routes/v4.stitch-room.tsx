// /v4/stitch-room — the popout punch-in stitches open in (components/v4/stitch-room/StitchRoom.tsx): videos being
// stitched, live; every stitched video to watch, trim, download and queue; the post queue; stats and the ledger.
import { createFileRoute } from "@tanstack/react-router";

import { AdminGate } from "@/components/AdminGate";
import { StitchRoom } from "@/components/v4/stitch-room/StitchRoom";

export const Route = createFileRoute("/v4/stitch-room")({
  validateSearch: (s: Record<string, unknown>): { v?: string } => (typeof s.v === "string" && s.v ? { v: s.v } : {}),
  component: StitchRoomPage,
  head: () => ({ meta: [{ title: "⚡ Stitch Room — v4" }, { name: "robots", content: "noindex" }] }),
});

function StitchRoomPage() {
  const { v } = Route.useSearch();
  return <AdminGate><StitchRoom initialKey={v} /></AdminGate>;
}
