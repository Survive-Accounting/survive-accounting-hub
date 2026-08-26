// /admin/reps/view/<partnerId> — READ-ONLY "View as <rep>". Renders the EXACT workspace component
// the rep sees, against the same builder — but resolved by partner_id through an admin-gated
// server function, never the rep's own token. Every open is audited (rep_activity: admin_view_as),
// a banner names who you're viewing, and every mutating control is disabled (readOnly).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { DEFAULT_FRAME_THEME, frameThemeVars } from "@/components/frames";
import { BRAND_DISPLAY } from "@/components/canvas/brand";
import { RepWorkspaceView } from "@/components/reps/RepWorkspaceView";
import { adminGetRepWorkspace } from "@/lib/rep-admin.functions";

export const Route = createFileRoute("/admin/reps/view/$partnerId")({
  component: ViewAsPage,
});

function ViewAsPage() {
  const { partnerId } = Route.useParams();
  const q = useQuery({ queryKey: ["admin-view-as", partnerId], queryFn: () => adminGetRepWorkspace({ data: { partnerId } }) });

  return (
    <div className="rounded-2xl" style={{ ...frameThemeVars(DEFAULT_FRAME_THEME), background: "var(--bg-page)", color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY, padding: "0 20px 40px", overflow: "hidden" }}>
      {q.isLoading && <p className="py-10 text-center text-sm"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" />Loading rep workspace…</p>}
      {q.data && !q.data.ok && (
        <div className="py-10 text-center">
          <p className="text-sm">{q.data.error}</p>
          <Link to="/admin/reps/roster" className="mt-3 inline-block text-sm font-bold underline">← Back to roster</Link>
        </div>
      )}
      {q.data?.ok && (
        <RepWorkspaceView
          d={q.data}
          readOnly
          viewingAs={{ name: (q.data as { viewingAs?: { name: string; campus: string | null } }).viewingAs?.name ?? q.data.name, campus: q.data.campusName, exitTo: "/admin/reps/roster" }}
          reload={() => void q.refetch()}
        />
      )}
    </div>
  );
}
