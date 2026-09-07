// THE CALLOUT NODE (2026-09-07) — the detour look, exactly the Editor's kinds: the chip above
// the navy box, the title as the key phrase, the text and bullets under it. The same SetCard
// callout mode the insert frames use (frame-view.tsx's INSERT_CALLOUT mapping), so a cheat
// code on the map is the cheat code on a slide.
import { INSERT_CALLOUT } from "../../plan";
import { SetCard } from "../../SetCard";
import type { ResolvedView } from "../cluster-models";
import { setCardScaleFor } from "./CeqNode";

type View = Extract<ResolvedView, { kind: "callout" }>;

export function CalloutNode({ id, w, view, live }: { id: string; w: number; view: View; live: boolean }) {
  const kind = INSERT_CALLOUT[view.calloutKind] ?? "cheat-code";
  const extra = [...(view.text ? [view.text] : []), ...view.bullets];
  return <SetCard id={id} stem={view.title} scale={setCardScaleFor(w)} live={live} callout={{ kind, detour: true, ...(extra.length ? { extraStems: extra } : {}) }} />;
}
