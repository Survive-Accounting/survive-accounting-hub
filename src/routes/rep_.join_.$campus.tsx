// /rep/join/<campus> — the campus-specific application (spec §1). A SIBLING of /rep/join (the
// trailing underscore on join_): nested under it, the parent — which has no <Outlet/> — would
// render instead and the campus would never load. When Lee recruits a specific
// person he sends their campus link and everything is preloaded: campus preselected (still
// editable), that school's Greek list, that school's intro course code, the campus name in the
// copy. Accepts the picker id ("mississippi-state") or the campus slug — these links get typed
// and forwarded. An unknown campus still renders the page with the picker open, never a 404.
import { createFileRoute } from "@tanstack/react-router";

import { RepApply } from "@/components/reps/RepApply";
import { schoolByAny } from "@/lib/schools";
import { ogMeta } from "@/lib/og";

export const Route = createFileRoute("/rep_/join_/$campus")({
  head: ({ params }) => {
    const s = schoolByAny(params.campus);
    const name = s?.name ?? "your campus";
    return { meta: ogMeta({ title: `Represent Survive at ${name}.`, description: "Help Greek chapters at your school get exam prep for their accounting courses, and earn commission on every chapter you bring on.", path: `/rep/join/${params.campus}` }) };
  },
  component: () => {
    const { campus } = Route.useParams();
    return <RepApply campusKey={campus} />;
  },
});
