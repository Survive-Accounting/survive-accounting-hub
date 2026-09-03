// IDEA → CLAUDE CODE PROMPT — the messages, in one place.
//
// Used by the app (/admin/ideas "Draft prompt with AI") and by the Obsidian
// sync on the build machine (scripts/obsidian-sync.ts --draft), so a prompt
// drafted either way has the same three sections Lee asked for:
//   ## Summary            — what and why, in plain words
//   ## Prompt             — the Claude Code prompt itself
//   ## Testing checklist  — what he ticks on the laptop after the deploy
//
// Pure: no network, no React. The caller runs it through runAiTask.

export interface IdeaForPrompt {
  title: string;
  body: string;
  categories: readonly string[];
  subcategory: string;
  sourcePath: string;
  /** document.title where it was captured — names the exact screen. */
  pageTitle?: string;
  notes?: string;
}

export const IDEA_PROMPT_SECTIONS = ["## Summary", "## Prompt", "## Testing checklist"] as const;

/** True when a prompt already has the three sections — the Obsidian note can
 *  embed it as-is; an older hand-written .md gets wrapped instead. */
export const hasPromptSections = (md: string): boolean =>
  IDEA_PROMPT_SECTIONS.every((h) => md.includes(h));

export function buildIdeaPromptMessages(idea: IdeaForPrompt): { system: string; user: string } {
  const system = [
    "You turn ONE product idea into ONE Claude Code prompt for the Survive Accounting repo (survive-accounting-hub): TanStack Start + React 19 + TypeScript, Supabase (Postgres, storage), Bun tests, deployed on Vercel from main. Lee is the sole developer-owner; Claude Code sessions do the building on his build machine; he tests on his filming laptop after the deploy.",
    "House rules the prompt MUST carry: additive changes only (new fields, new routes, new tables via numbered additive migrations listed under 'SQL LEE MUST RUN', never auto-run); fail loud, no silent fallbacks; never weaken or delete a passing test; nothing that changes what students see unless the idea says so; protected zones (element/frame parent membership, scene serialization internals, command bus, space walk) are off limits — if the idea needs them, the prompt says STOP and report.",
    "Format, in markdown, EXACTLY these three H2 sections and nothing before the first:",
    "## Summary — 2 to 3 sentences: what this builds and why Lee wants it, in plain words.",
    "## Prompt — the Claude Code prompt: a one-line title; CONTEXT (where in the app, from the source path and Lee's words); WHAT TO BUILD (numbered, concrete, the smallest complete version); WHERE (likely routes/files only when the idea names a surface — otherwise say 'find'); ACCEPTANCE; OUT OF SCOPE; REPORT (per-item pass/fail/stubbed · SQL LEE MUST RUN · anything ambiguous you decided and how).",
    "## Testing checklist — 5 to 8 lines, each `- [ ] …`, each one screen or one action Lee can do on the laptop after the deploy to confirm it works. Name the route when there is one.",
    "Keep Lee's voice and intent; quote his words where they carry a decision. Do not invent features he did not mention. Under 700 words total.",
  ].join("\n");
  const user = [
    `IDEA: ${idea.title}`,
    idea.body ? `LEE'S WORDS (verbatim):\n${idea.body}` : "",
    idea.categories.length ? `CATEGORIES: ${idea.categories.join(", ")}${idea.subcategory ? ` · ${idea.subcategory}` : ""}` : "",
    idea.sourcePath ? `CAPTURED FROM: ${idea.sourcePath}${idea.pageTitle ? ` — page titled "${idea.pageTitle}"` : ""} (the idea is about THIS page unless Lee says otherwise; name it in CONTEXT and WHERE)` : "",
    idea.notes ? `EXTRA NOTES: ${idea.notes}` : "",
  ].filter(Boolean).join("\n\n");
  return { system, user };
}
