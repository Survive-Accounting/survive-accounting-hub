// THE FRAME SCHEMA — one Zod object, imported by BOTH server fns that read or write a
// Blast Off plan (blastoff.functions.ts saves/loads it; blastoff-sync.functions.ts sends it
// to film). It used to be hand-copied into each, and the copies drifted: the spine kinds
// were once added to the type and not the schema, and every set with a real spine failed
// to load (docs/V3-PRODUCTION-HANDOFF.md). Now `kind` and `ad` are derived from their
// tuples, and there is exactly one place a new field is added.
//
// ZOD 3 STRIPS UNKNOWN KEYS SILENTLY. A field that exists on BlastFrame but not here is
// dropped on save, on load and on send-to-film with no error — so the round-trip test
// beside this file feeds a fully-populated frame through and asserts deep equality.
//
// Kept OUT of plan.ts on purpose: plan.ts is client-shipped and "no React, no network";
// zod belongs to the server fns.
import { z } from "zod";

import { AD_KINDS } from "@/components/blastoff/ad-kinds";
import { BLAST_FRAME_KINDS } from "@/components/blastoff/plan";

export const frameSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(BLAST_FRAME_KINDS),
  ceqId: z.string().max(130).optional(),
  text: z.string().max(4000).optional(),
  title: z.string().max(400).optional(),
  body: z.string().max(4000).optional(),
  exhibitRef: z.string().max(60).optional(),
  bankItemId: z.string().max(130).optional(),
  // THE REVIEW STEP (2026-09-03): a skipped card, and the teleprompter lines
  // Lee kept for the slide. Additive; old plans have neither.
  skipped: z.boolean().optional(),
  prompter: z.array(z.string().max(600)).max(40).optional(),
  bullets: z.array(z.string().max(300)).max(12).optional(),
  backdrop: z.enum(["zoom", "off"]).optional(),
  variant: z.string().max(20).optional(),
  psych: z.number().min(0).max(1).optional(),
  banner: z.enum(["on", "off"]).optional(),
  ad: z.enum(AD_KINDS).optional(),
  url: z.string().max(120).optional(),
  portrait: z.enum(["on", "off"]).optional(),
  cam: z.enum(["home", "corner", "hero", "top", "free", "off"]).optional(),
  camPos: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
  camSize: z.number().min(0.05).max(1).optional(),
});

export type FrameRow = z.infer<typeof frameSchema>;
