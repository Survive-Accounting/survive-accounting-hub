// /admin/dm-v2 — OUTREACH V2 (2026-09-14): campuses in priority order, three councils and their
// chapters, three Instagram slots each, copy DM / copy link / sent. Its own page, apart from the
// growth dashboard (components/growth/OutreachV2.tsx).
import { createFileRoute } from "@tanstack/react-router";

import { AdminGate } from "@/components/AdminGate";
import { AdminSessionGate } from "@/components/AdminSessionGate";
import { OutreachV2 } from "@/components/growth/OutreachV2";
import { useAdminDarkDocument } from "@/components/growth/v2";

export const Route = createFileRoute("/admin/dm-v2")({
  head: () => ({ meta: [{ title: "Outreach V2 — Survive Accounting" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Page,
});

function Page() {
  useAdminDarkDocument();
  return (
    <AdminGate>
      <AdminSessionGate>
        <div className="min-h-screen bg-background text-foreground"><OutreachV2 /></div>
      </AdminSessionGate>
    </AdminGate>
  );
}
