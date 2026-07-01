// Editable copy for the /order (Custom Study Pack request) flow. A flat map of
// key -> string, with hardcoded DEFAULTS so /order always renders even before any
// override is saved. getOrderCopy merges stored overrides over the defaults;
// updateOrderCopy (admin) persists the singleton row. Service-role only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type OrderCopy = Record<string, string>;

export const DEFAULT_ORDER_COPY: OrderCopy = {
  // Global
  headerPill: "Free to request · Preview before payment · Pay only to unlock",
  footerPrefix: "Questions? Text me anytime at",

  // Step 1 · School
  step1Title: "Where do you go?",
  step1Subtitle: "So I can match your course, professor, and textbook.",

  // Step 2 · Course
  step2Title: "Which accounting course is this for?",
  step2Subtitle: "I’ll use your course to build a study pack that matches what you’re actually learning.",
  step2Box: "Tell me your course first. Then I’ll ask what’s on your test or what topic you’re stuck on.",

  // Step 3 · Professor
  step3Title: "Who’s your professor?",
  step3Subtitle: "This helps me match your class as closely as possible.",

  // Step 4 · Request
  step4Title: "What do you want help with?",
  step4Subtitle: "Tell me what to build. You can be specific, or just send what you have.",
  scopeTopicLabel: "One topic I’m stuck on",
  scopeTopicHelper: "Best for one confusing concept or homework area.",
  scopeChapterLabel: "One chapter",
  scopeChapterHelper: "Best if your test is focused on a specific chapter.",
  scopeExamLabel: "Everything on my next exam",
  scopeExamHelper: "Best for a broader exam review pack.",
  scopeNotSureLabel: "I’m not sure — I’ll send what I have",
  scopeNotSureHelper: "Upload or describe your review sheet, syllabus, or homework.",
  notesLabel: "What topics, chapters, or questions should I focus on?",
  notesPlaceholder: "Example: adjusting entries, bonds, leases, statement of cash flows, job-order costing, CVP, or “I uploaded my review sheet.”",
  groupCheckbox: "I have classmates in the same class who may want this too.",

  // Step 5 · Exam
  step5Title: "When’s your exam?",
  step5Subtitle: "So I know whether there’s enough time to make something useful.",
  previewDatedPrefix: "Estimated preview: before",
  previewWeek: "I’ll confirm timing by text before I build the full pack.",
  previewNotSure: "No problem — I’ll use this to help prioritize your request.",

  // Step 6 · Summary
  step6Title: "Your Custom Study Pack Request",
  step6Subtitle: "Nothing is due today. I’ll text you a preview when it’s ready.",
  summaryNextStep: "Next step: I make a preview.",
  summaryPayment: "Payment: only if you unlock the full pack.",
  summaryEstimate: "Estimated price: usually $30–$100 depending on scope.",
  trustLine1: "From Lee — Ole Miss accounting alum, 10+ years tutoring.",
  trustLine2: "Free to request. Preview before payment. Pay only to unlock.",
  cta: "Send my request to Lee →",

  // Confirmation
  confHeading: "Request received",
  confBody: "Your request is in. I’ll review what you sent and text you a preview when it’s ready.",
  confStep1: "I review your course, professor, exam timing, and request.",
  confStep2: "I make a preview of the Custom Study Pack.",
  confStep3: "I text you the preview link.",
  confStep4: "You pay only if you want to unlock the full pack.",
  confTutoring: "Need live tutoring instead?",

  // FAQ
  faq1Q: "What’s in a Custom Study Pack?",
  faq1A: "Short videos, practice exam-style questions, answer explanations, and a simple study plan for the topics you request. Each pack is made or reviewed by Lee to supplement your studying.",
  faq2Q: "When do I pay?",
  faq2A: "Nothing is due when you submit a request. I’ll text you a preview first. You only pay if you want to unlock the full pack.",
  faq3Q: "How fast?",
  faq3A: "Usually 1–2 days for a small pack. Bigger exam packs or rush requests depend on your exam date and what you need covered. I’ll confirm timing by text.",
  faq4Q: "Does this replace studying?",
  faq4A: "No. This is meant to help you study faster and practice better. You should still use your class notes, homework, textbook, and professor’s materials.",
};

// Editor metadata — drives the "Edit Student Flow" form, grouped in flow order.
export type CopyField = { key: string; group: string; label: string; multiline?: boolean };
export const COPY_FIELDS: CopyField[] = [
  { key: "headerPill", group: "Global", label: "Header pill" },
  { key: "footerPrefix", group: "Global", label: "Footer (before phone number)" },

  { key: "step1Title", group: "Step 1 · School", label: "Title" },
  { key: "step1Subtitle", group: "Step 1 · School", label: "Subtitle" },

  { key: "step2Title", group: "Step 2 · Course", label: "Title" },
  { key: "step2Subtitle", group: "Step 2 · Course", label: "Subtitle" },
  { key: "step2Box", group: "Step 2 · Course", label: "Explanatory box", multiline: true },

  { key: "step3Title", group: "Step 3 · Professor", label: "Title" },
  { key: "step3Subtitle", group: "Step 3 · Professor", label: "Subtitle" },

  { key: "step4Title", group: "Step 4 · Request", label: "Title" },
  { key: "step4Subtitle", group: "Step 4 · Request", label: "Subtitle" },
  { key: "scopeTopicLabel", group: "Step 4 · Request", label: "Scope 1 — label" },
  { key: "scopeTopicHelper", group: "Step 4 · Request", label: "Scope 1 — helper" },
  { key: "scopeChapterLabel", group: "Step 4 · Request", label: "Scope 2 — label" },
  { key: "scopeChapterHelper", group: "Step 4 · Request", label: "Scope 2 — helper" },
  { key: "scopeExamLabel", group: "Step 4 · Request", label: "Scope 3 — label" },
  { key: "scopeExamHelper", group: "Step 4 · Request", label: "Scope 3 — helper" },
  { key: "scopeNotSureLabel", group: "Step 4 · Request", label: "Scope 4 — label" },
  { key: "scopeNotSureHelper", group: "Step 4 · Request", label: "Scope 4 — helper" },
  { key: "notesLabel", group: "Step 4 · Request", label: "Notes field label" },
  { key: "notesPlaceholder", group: "Step 4 · Request", label: "Notes placeholder", multiline: true },
  { key: "groupCheckbox", group: "Step 4 · Request", label: "Group checkbox" },

  { key: "step5Title", group: "Step 5 · Exam", label: "Title" },
  { key: "step5Subtitle", group: "Step 5 · Exam", label: "Subtitle" },
  { key: "previewDatedPrefix", group: "Step 5 · Exam", label: "Preview (with date) — prefix" },
  { key: "previewWeek", group: "Step 5 · Exam", label: "Preview (this/next week)" },
  { key: "previewNotSure", group: "Step 5 · Exam", label: "Preview (not sure)" },

  { key: "step6Title", group: "Step 6 · Summary", label: "Title" },
  { key: "step6Subtitle", group: "Step 6 · Summary", label: "Subtitle" },
  { key: "summaryNextStep", group: "Step 6 · Summary", label: "Summary — next step" },
  { key: "summaryPayment", group: "Step 6 · Summary", label: "Summary — payment" },
  { key: "summaryEstimate", group: "Step 6 · Summary", label: "Summary — estimated price" },
  { key: "trustLine1", group: "Step 6 · Summary", label: "Trust line 1" },
  { key: "trustLine2", group: "Step 6 · Summary", label: "Trust line 2" },
  { key: "cta", group: "Step 6 · Summary", label: "Submit button" },

  { key: "confHeading", group: "Confirmation", label: "Heading" },
  { key: "confBody", group: "Confirmation", label: "Body", multiline: true },
  { key: "confStep1", group: "Confirmation", label: "What happens next — 1" },
  { key: "confStep2", group: "Confirmation", label: "What happens next — 2" },
  { key: "confStep3", group: "Confirmation", label: "What happens next — 3" },
  { key: "confStep4", group: "Confirmation", label: "What happens next — 4" },
  { key: "confTutoring", group: "Confirmation", label: "Tutoring link (before “Text Lee”)" },

  { key: "faq1Q", group: "FAQ", label: "Q1" },
  { key: "faq1A", group: "FAQ", label: "A1", multiline: true },
  { key: "faq2Q", group: "FAQ", label: "Q2" },
  { key: "faq2A", group: "FAQ", label: "A2", multiline: true },
  { key: "faq3Q", group: "FAQ", label: "Q3" },
  { key: "faq3A", group: "FAQ", label: "A3", multiline: true },
  { key: "faq4Q", group: "FAQ", label: "Q4" },
  { key: "faq4A", group: "FAQ", label: "A4", multiline: true },
];

/** Read the flow copy: stored overrides merged over the defaults. Never throws
 *  (falls back to defaults) so /order always renders. */
export const getOrderCopy = createServerFn({ method: "GET" })
  .handler(async (): Promise<OrderCopy> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await (supabaseAdmin.from("order_flow_copy" as never) as any)
        .select("copy").eq("id", 1).maybeSingle();
      const stored = (data?.copy ?? {}) as Record<string, unknown>;
      const merged: OrderCopy = { ...DEFAULT_ORDER_COPY };
      for (const k of Object.keys(DEFAULT_ORDER_COPY)) {
        const v = stored[k];
        if (typeof v === "string" && v.trim().length > 0) merged[k] = v;
      }
      return merged;
    } catch {
      return { ...DEFAULT_ORDER_COPY };
    }
  });

/** Persist the flow copy (admin). Only known keys are stored; blanks are dropped
 *  so they fall back to the default. */
export const updateOrderCopy = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ copy: z.record(z.string().max(4000)) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const clean: Record<string, string> = {};
    for (const k of Object.keys(DEFAULT_ORDER_COPY)) {
      const v = data.copy[k];
      if (typeof v === "string" && v.trim().length > 0) clean[k] = v;
    }
    const { error } = await (supabaseAdmin.from("order_flow_copy" as never) as any)
      .upsert({ id: 1, copy: clean, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
