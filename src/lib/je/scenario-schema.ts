// Zod schema for the FULL ScenarioDoc v2 — the single validation gate used by both the
// importer (scripts/import-scenarios.ts) and the /je admin raw editor. Structural rules
// that used to live only in prose (≥1 debit and ≥1 credit per entry, conditions must
// reference declared axes, unique ids) are enforced here so bad docs fail loud BEFORE
// they reach je_scenarios.
//
// The TypeScript source of truth for the shape stays `ScenarioDoc` in je-engine.ts;
// the compile-time check at the bottom keeps this schema from drifting away from it.

import { z } from "zod";

import type { ScenarioDoc } from "@/lib/je-engine";
import { KNOWN_MISCONCEPTION_IDS, type MisconceptionId } from "@/lib/je/misconceptions";
import { PANEL_KEYS, type PanelKey } from "@/lib/je/panel-settings";

const slotRef = z.string().min(1); // "param:face" | "issuePrice" | "schedule:1:interestExpense" | arithmetic expr

const engineLineSchema = z.object({
  id: z.string().min(1),
  account: z.string().min(1),
  side: z.enum(["debit", "credit"]),
  // JeLine requires both (label is the amount placeholder, e.g. "???"); default them so
  // hand-written docs may omit them and still produce a valid EngineLine.
  label: z.string().default(""),
  tooltip: z.string().default(""),
  why: z.string().optional(),
  trap: z.string().optional(),
  conceptIds: z.array(z.string()).optional(),
  principleKeys: z.array(z.string()).optional(),
  amount: z.number().nullable().optional(),
  amountSlotKey: slotRef.optional(),
});

const entrySchema = z
  .object({
    id: z.string().min(1),
    caption: z.string().optional(),
    lines: z.array(engineLineSchema).min(2),
  })
  .superRefine((entry, ctx) => {
    if (!entry.lines.some((l) => l.side === "debit"))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `entry "${entry.id}" needs at least one debit` });
    if (!entry.lines.some((l) => l.side === "credit"))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `entry "${entry.id}" needs at least one credit` });
    const ids = new Set<string>();
    for (const l of entry.lines) {
      if (ids.has(l.id))
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `entry "${entry.id}" has duplicate line id "${l.id}"` });
      ids.add(l.id);
    }
  });

const computationPathSchema = z.object({
  id: z.string().min(1),
  appliesWhen: z.record(z.string()).optional(),
  narration: z.string().min(1),
  steps: z
    .array(z.object({ label: z.string(), formulaText: z.string().optional(), resultSlotKey: slotRef.optional() }))
    .optional(),
});

const variantSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().optional(),
    conditions: z.record(z.string()),
    // A variant is EITHER an entry scenario (entries non-empty; every per-entry rule applies)
    // OR a computation scenario (no entries + computationPaths non-empty).
    entries: z.array(entrySchema).optional(),
    computationPaths: z.array(computationPathSchema).optional(),
  })
  .superRefine((v, ctx) => {
    const hasEntries = (v.entries?.length ?? 0) > 0;
    const hasPaths = (v.computationPaths?.length ?? 0) > 0;
    if (!hasEntries && !hasPaths) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `variant "${v.id}" must have either entries or computationPaths`,
      });
    }
  });

const axisSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  options: z.array(z.object({ value: z.string().min(1), label: z.string().min(1) })).min(1),
});

const bondParamsSchema = z.object({
  face: z.number().positive(),
  statedRateAnnual: z.number().min(0).max(1),
  marketRateAnnual: z.number().min(0).max(1),
  termYears: z.number().int().positive(),
  paymentsPerYear: z.number().int().positive().optional(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "issueDate must be YYYY-MM-DD"),
  fiscalYearEnd: z
    .string()
    .regex(/^\d{2}-\d{2}$/, 'fiscalYearEnd must be "MM-DD"')
    .optional(),
});

const paramsSpecSchema = z.object({
  kind: z.literal("bond"),
  defaults: bondParamsSchema,
  ranges: z
    .object({
      faceMin: z.number().positive().optional(),
      faceMax: z.number().positive().optional(),
      termYearsMin: z.number().int().positive().optional(),
      termYearsMax: z.number().int().positive().optional(),
    })
    .optional(),
  defaultSeed: z.number().int().optional(),
});

const memorizeItemSchema = z.object({
  kind: z.enum(["formula", "mnemonic", "tip", "watchout"]),
  body: z.string().min(1),
  traceRefs: z.array(slotRef).optional(),
});

const misconceptionIdSchema = z.enum(
  KNOWN_MISCONCEPTION_IDS as [MisconceptionId, ...MisconceptionId[]],
);

const questionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  answerExpr: slotRef,
  distractors: z
    .array(
      z.object({
        expr: slotRef,
        misconceptionId: misconceptionIdSchema,
        feedback: z.string().optional(),
      }),
    )
    .min(1),
});

const traceGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  refs: z.array(slotRef).min(1),
});

const buildSpecSchema = z.object({
  accountBank: z.array(z.object({ account: z.string().min(1), decoy: z.literal(true).optional() })).min(2),
  scaffold: z.string().optional(),
});

export const scenarioDocV2Schema = z
  .object({
    slug: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/, "slug must be kebab-case"),
    title: z.string().min(1),
    event: z.string().min(1),
    courseFamilies: z.array(z.string()).optional(),
    conceptIds: z.array(z.string()).optional(),
    principleKeys: z.array(z.string()).optional(),
    axes: z.array(axisSchema).min(0),
    variants: z.array(variantSchema).min(1),
    isSequence: z.boolean().optional(),
    sequenceGroup: z.string().optional(),
    hasMemorizationGrid: z.boolean().optional(),
    params: paramsSpecSchema.optional(),
    memorize: z.array(memorizeItemSchema).optional(),
    questions: z.array(questionSchema).optional(),
    traces: z.array(traceGroupSchema).optional(),
    build: buildSpecSchema.optional(),
    ui: z
      .object({ panels: z.array(z.enum([...PANEL_KEYS] as [PanelKey, ...PanelKey[]])).optional() })
      .optional(),
    group: z.string().optional(),
    videoUrl: z.string().optional(),
  })
  .superRefine((doc, ctx) => {
    // axis keys unique; every variant/computationPath condition key must name a declared axis
    const axisKeys = new Set<string>();
    for (const a of doc.axes) {
      if (axisKeys.has(a.key))
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate axis key "${a.key}"` });
      axisKeys.add(a.key);
    }
    const axisValues = new Map<string, Set<string>>(
      doc.axes.map((a) => [a.key, new Set(a.options.map((o) => o.value))]),
    );
    const checkConditions = (where: string, conditions: Record<string, string>) => {
      for (const [k, v] of Object.entries(conditions)) {
        if (!axisValues.has(k)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${where}: condition key "${k}" is not a declared axis` });
        } else if (!axisValues.get(k)!.has(v)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${where}: "${k}=${v}" is not an option of that axis` });
        }
      }
    };
    const variantIds = new Set<string>();
    for (const variant of doc.variants) {
      if (variantIds.has(variant.id))
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate variant id "${variant.id}"` });
      variantIds.add(variant.id);
      checkConditions(`variant "${variant.id}"`, variant.conditions);
      for (const p of variant.computationPaths ?? [])
        if (p.appliesWhen) checkConditions(`variant "${variant.id}" path "${p.id}"`, p.appliesWhen);
    }
  });

/**
 * The on-disk file format for data/scenarios/*.json: the doc itself plus an optional
 * importer directive saying which chapter to link (stripped before upsert — chapter
 * linkage lives in je_scenarios.chapter_id, not inside the doc).
 */
export const scenarioFileSchema = z.object({
  chapter: z
    .object({
      /** Course selector: family key preferred ("intermediate_2"); slug/code as fallbacks. */
      courseFamily: z.string().optional(),
      courseSlug: z.string().optional(),
      number: z.number(),
      /** Used only when the chapter row has to be created. */
      name: z.string().optional(),
    })
    .optional(),
  doc: scenarioDocV2Schema,
});

export type ScenarioFile = z.infer<typeof scenarioFileSchema>;

/**
 * Normalize a raw doc to the canonical shape BEFORE validation, tolerating a looser
 * authoring style some batches use: (1) fill missing stable `id`s on variants/entries/
 * lines/computationPaths/questions from their array index, and (2) coerce
 * build.accountBank entries authored as bare strings into `{ account }` objects.
 * Idempotent — existing ids/objects are preserved, so it is safe for every doc.
 */
export function normalizeScenarioDoc(doc: any): any {
  if (!doc || typeof doc !== "object") return doc;
  const d = { ...doc };

  if (Array.isArray(d.variants)) {
    d.variants = d.variants.map((v: any, vi: number) => {
      const nv = { ...v, id: v?.id ?? `v${vi + 1}` };
      if (Array.isArray(v?.entries)) {
        nv.entries = v.entries.map((e: any, ei: number) => ({
          ...e,
          id: e?.id ?? `e${ei + 1}`,
          lines: Array.isArray(e?.lines) ? e.lines.map((l: any, li: number) => ({ ...l, id: l?.id ?? `l${li + 1}` })) : e?.lines,
        }));
      }
      if (Array.isArray(v?.computationPaths)) {
        nv.computationPaths = v.computationPaths.map((p: any, pi: number) => ({ ...p, id: p?.id ?? `p${pi + 1}` }));
      }
      return nv;
    });
  }
  if (Array.isArray(d.questions)) {
    d.questions = d.questions.map((q: any, qi: number) => ({ ...q, id: q?.id ?? `q${qi + 1}` }));
  }
  if (d.build && Array.isArray(d.build.accountBank)) {
    d.build = {
      ...d.build,
      accountBank: d.build.accountBank.map((a: any) => (typeof a === "string" ? { account: a } : a)),
    };
  }
  return d;
}

// ---- compile-time drift guard: everything the schema accepts must BE a ScenarioDoc.
// (If je-engine.ts's type and this schema diverge, this line stops the build.)
type _SchemaOutput = z.infer<typeof scenarioDocV2Schema>;
const _assertAssignable = (d: _SchemaOutput): ScenarioDoc => d;
void _assertAssignable;
