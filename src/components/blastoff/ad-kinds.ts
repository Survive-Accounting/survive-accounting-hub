// THE THREE ADS — the ids, on their own so the canvas's ad element can import
// them without dragging plan.ts (and its helpers) onto the canvas render path
// (the TDZ ratchet in canvas/tdz-graph.test.ts). Function declarations only.
export const AD_KINDS = ["greek", "rep", "send"] as const;
export type AdKind = (typeof AD_KINDS)[number];
export function isAdKind(v: unknown): v is AdKind { return typeof v === "string" && (AD_KINDS as readonly string[]).includes(v); }
