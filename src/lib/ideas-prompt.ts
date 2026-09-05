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
import { CATEGORIES, categoryVocabulary } from "@/components/ideas/model";

import { PRODUCT_PRIMER } from "./product-primer";

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

export const IDEA_PROMPT_SECTIONS = ["## TLDR", "## Summary", "## Prompt", "## Testing checklist"] as const;

/** ORGANISE ON SAVE (Lee, 2026-09-03: "It's AI's job to get it organized and
 *  categorized and triaged"). One micro call titles, TLDRs, summarises and
 *  categorises a raw capture so the vault is clean without anyone thinking. */
/** The category vocabulary the filer reads. Built-ins by default; the server passes the
 *  live list (Lee's custom categories included) — see categoryVocabulary in the model. */
export const IDEA_CATEGORY_KEYS = CATEGORIES;

export function buildOrganizeMessages(idea: IdeaForPrompt & { existingPrompt?: string | null; intent?: string; other?: string; vocabulary?: string }): { system: string; user: string } {
  const vocabulary = idea.vocabulary || categoryVocabulary();
  const intentLine = idea.intent === "page" ? "THE AUTHOR PRESSED “IMPROVE THIS PAGE”: the idea is about the captured page; say so in the title and summary."
    : idea.intent === "todo" ? "THE AUTHOR PRESSED “TO-DO”: this is a task, not a build idea — title it as an imperative."
    : idea.intent === "other" && idea.other ? `THE AUTHOR LABELLED IT “${idea.other}”: keep that as the subcategory and let it steer the categories.`
    : "THE AUTHOR PRESSED “GENERAL IDEA”: it may be about anything; if the words name a category, use it.";
  const system = [
    "You tidy ONE raw idea from Survive Accounting's team (Lee, the founder; King, the VA) into a clean vault entry. The idea may be dictated, rambling, or a pasted Claude Code prompt. Keep every decision in it; drop filler.",
    "Return ONLY a JSON object: {\"title\": str (≤ 60 chars, specific, noun phrase — what it is, not \"idea about\"), \"tldr\": str (ONE sentence: what changes for whom), \"summary\": str (2–3 sentences, plain words, Lee's intent), \"categories\": [str] (1–2 KEYS from: " + vocabulary + " — a personal one (PERSONAL_*) only when the words are plainly not about the business), \"urgent\": bool (true only if the words say it blocks filming, launch, money, or a live bug for students)}",
  ].join("\n");
  const user = [
    `WORDS: ${idea.title}`,
    idea.body ? `BODY:\n${idea.body.slice(0, 6000)}` : "",
    idea.existingPrompt ? `A PROMPT ALREADY ATTACHED (summarise what it builds):\n${idea.existingPrompt.slice(0, 6000)}` : "",
    intentLine,
    idea.categories.length ? `CATEGORIES LAST TIME (re-decide freely; the author may name a category in the words — that wins): ${idea.categories.join(", ")}` : "",
    idea.sourcePath ? `CAPTURED FROM: ${idea.sourcePath}${idea.pageTitle ? ` — “${idea.pageTitle}”` : ""}` : "",
  ].filter(Boolean).join("\n\n");
  return { system, user };
}

/** MERGE CHECK (Lee, 2026-09-03: "every time I submit a new idea, the AI will
 *  explore current ideas and combine them where it makes sense … reduce
 *  clutter … use less Claude Code sessions"). One micro call decides whether
 *  the new idea is the SAME ask as an open one (duplicate), ADDS detail to
 *  one (extends), or stands alone. Conservative on purpose: a wrong merge
 *  hides an idea; a missed one is just two rows. */
export function buildMergeMessages(
  idea: { title: string; body: string; tldr?: string; sourcePath: string },
  candidates: readonly { id: string; title: string; tldr: string; page: string }[],
): { system: string; user: string } {
  const system = [
    "You decide whether a NEW idea from Survive Accounting's team belongs inside an EXISTING open idea. Merge only when a builder would clearly do them as ONE change:",
    "- \"duplicate\": the same ask, said again (maybe with new words).",
    "- \"extends\": adds a detail, a case or a refinement to the SAME feature on the SAME surface.",
    "- \"none\": anything else — a related-but-separate feature stays separate. When in doubt, \"none\".",
    "Return ONLY JSON: {\"relation\": \"duplicate\"|\"extends\"|\"none\", \"id\": str|null, \"why\": str (one sentence)}",
  ].join("\n");
  const user = [
    `NEW IDEA: ${idea.title}${idea.tldr ? ` — ${idea.tldr}` : ""}\nWORDS: ${idea.body.slice(0, 2500)}\nPAGE: ${idea.sourcePath}`,
    `EXISTING OPEN IDEAS:\n${candidates.map((c) => `- id=${c.id} · ${c.title}${c.tldr ? ` — ${c.tldr}` : ""} · page ${c.page}`).join("\n")}`,
  ].join("\n\n");
  return { system, user };
}

/** THE SPLITTER (build queue, 2026-09-03). Both failed builds were research-
 *  project prompts; every success was one feature. Before a build starts,
 *  one micro call decides whether the prompt is ONE buildable feature or
 *  several — and if several, cuts it into 2–6 single-feature slices, each a
 *  complete, testable change on its own, in build order. */
export function buildSplitMessages(idea: { title: string; body: string; promptMd: string | null }): { system: string; user: string } {
  const system = [
    "You prepare work for an unattended Claude Code build in the Survive Accounting repo. A build succeeds when it is ONE feature that fits in about 30 minutes; it fails when it is a research project, a list of features, or a vision.",
    PRODUCT_PRIMER,
    "Decide: is this prompt ONE buildable feature (a single screen or behaviour a tester can check in a few clicks)? If yes: {\"single\": true}. If not: split it into 2–6 slices, in build order, each a complete testable change on its own that does not depend on a later slice. Drop anything that is a question, a musing, or 'defer to later' — say so in \"dropped\".",
    "SPLIT RULES (learned 2026-09-03): a slice is something a tester can SEE — never a 'verify', 'document', 'investigate' or 'confirm schema' slice. Never split symmetric halves (Current/Proposed, left/right, add/remove) into separate slices — one builder does both sides together. Never split a screen from the route that shows it. 2–3 slices is normal; 6 is the ceiling. Every slice must work for every $topic/$set, never one set.",
    "Each slice: {\"title\": str (≤ 60 chars, specific), \"spec\": str (the Claude Code prompt for just this slice — CONTEXT naming the real files and routes from the primer, WHAT TO BUILD numbered and concrete, WHERE, ACCEPTANCE, OUT OF SCOPE; 150–350 words; keep the author's decisions and wording; never invent features)}",
    "THE HANDS-ON GATE (Lee, 2026-09-03: 'a warning that hey, you should monitor this one'). Some ideas should NOT be built unattended even in slices: a new product surface or editor with many interacting behaviours; anything that needs Lee's taste or design decisions along the way; a vision that would take more than 3 slices; anything touching a protected zone. For those answer {\"handsOn\": true, \"why\": str (one plain sentence for Lee), \"slices\": [ … ]} — still give the slices, as the suggested plan for a person building it with Claude Code by hand.",
    "Return ONLY JSON: {\"single\": bool, \"handsOn\": bool, \"why\": str, \"slices\": [ … ], \"dropped\": [str]}",
  ].join("\n");
  const user = [
    `TITLE: ${idea.title}`,
    idea.promptMd?.trim() ? `PROMPT:\n${idea.promptMd.trim().slice(0, 9000)}` : "",
    idea.body?.trim() ? `THE AUTHOR'S WORDS:\n${idea.body.trim().slice(0, 4000)}` : "",
  ].filter(Boolean).join("\n\n");
  return { system, user };
}

/** THE PROJECTS — plain names for the Claude Code sessions Lee pins (2026-09-03:
 *  "give me a natural language term for the session … more about the tasks
 *  and the projects I'm working on"). Each maps to a worktree, kept separate
 *  so the git detail is there when a session needs it and invisible when not. */
export const PROJECTS = [
  { key: "filming", label: "Filming & talkthrough", worktree: "sa-film-camera (branch film/free-camera-pinned-ceq)", match: /^\/(v3|talkthrough|blast-off|blastoff-demo|study|callout-demo|intro-outro)/ },
  { key: "exhibits", label: "Exhibits", worktree: "sa-exhibit-lab", match: /^\/(exhibit-lab|exhibit-demo)/ },
  { key: "ideas", label: "Idea Bank & Obsidian", worktree: "sa-film-camera (branch film/free-camera-pinned-ceq)", match: /^\/admin\/ideas/ },
  { key: "growth", label: "Growth & outreach", worktree: "sa-growth-dashboard (main)", match: /^\/(admin\/growth|outreach|admin\/reps|go\/|chapters|greek|rep\/)/ },
  { key: "learn", label: "Learn & share links", worktree: "sa-learn-share", match: /^\/(learn|s\/)/ },
  { key: "homepage", label: "Homepage", worktree: "sa-homepage-two-door", match: /^\/$|^\/(landing|preview)/ },
] as const;
export type ProjectKey = (typeof PROJECTS)[number]["key"];

export function suggestProject(sourcePath: string, categories: readonly string[]): { key: ProjectKey; label: string; worktree: string } {
  const p = sourcePath || "";
  const byPath = PROJECTS.find((x) => x.match.test(p));
  const pick = byPath
    ?? (categories.some((c) => c === "CAMPUS_REPS" || c === "SCHOLARSHIP_CHAIRS" || c === "GREEKINTEL" || c === "INSTAGRAM") ? PROJECTS.find((x) => x.key === "growth")
      : categories.some((c) => c === "YOUTUBE" || c === "TIKTOK" || c === "BUILD_IN_PUBLIC" || c === "NONTRADITIONAL") ? PROJECTS.find((x) => x.key === "filming")
      : categories.includes("LEARN_DASHBOARD") ? PROJECTS.find((x) => x.key === "learn")
      : PROJECTS.find((x) => x.key === "growth"))!;
  return { key: pick.key, label: pick.label, worktree: pick.worktree };
}

/** Kept for older callers: the project's plain name. */
export function suggestSession(sourcePath: string, categories: readonly string[]): string {
  return suggestProject(sourcePath, categories).label;
}

/** WHICH PAGE, in words — "Talkthrough · Internal vs external users", not a
 *  URL. Used as the `page` field and the page filter in Obsidian. */
export function pageLabel(sourcePath: string): string {
  const p = (sourcePath || "").split("?")[0];
  if (!p || p === "/") return "Homepage";
  const nice = (s: string) => s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const v3 = p.match(/^\/v3\/([^/]+)\/([^/]+)\/blast-off\/?(talkthrough|results|arrange|film)?/);
  if (v3) return `${v3[3] ? nice(v3[3]) : "Blast Off"} · ${nice(v3[2])}`;
  const v3set = p.match(/^\/v3\/([^/]+)\/([^/]+)\/?$/);
  if (v3set) return `Set menu · ${nice(v3set[2])}`;
  const v3topic = p.match(/^\/v3\/([^/]+)\/?$/);
  if (v3topic) return `Topic · ${nice(v3topic[1])}`;
  if (p === "/v3" || p === "/v3/") return "The Queue (/v3)";
  const known: [RegExp, string][] = [
    [/^\/admin\/ideas/, "Idea Bank"], [/^\/admin\/growth\/coldoutreach/, "Cold outreach"], [/^\/admin\/growth/, "Growth dashboard"],
    [/^\/admin\/reps/, "Reps admin"], [/^\/outreach/, "Outreach"], [/^\/talkthrough/, "Talkthrough studio"], [/^\/blast-off/, "Blast Off (old)"],
    [/^\/exhibit-lab/, "Exhibit Lab"], [/^\/study\/canvas/, "Canvas"], [/^\/learn/, "Learn"], [/^\/chapters/, "Chapters"], [/^\/leeportal/, "Lee's portal"],
  ];
  for (const [re, label] of known) if (re.test(p)) return label;
  return nice(p.replace(/^\//, "").replace(/\//g, " › "));
}

/** Replace the ## Prompt section's body inside a drafted markdown (or the
 *  whole text when it has no sections) — the vault's editable prompt box. */
export function replacePromptSection(md: string, prompt: string): string {
  if (!hasPromptSections(md)) return prompt;
  const i = md.indexOf("## Prompt");
  const after = md.slice(i + "## Prompt".length);
  const next = after.search(/\n## /);
  const tail = next < 0 ? "" : after.slice(next);
  return `${md.slice(0, i)}## Prompt\n\n${prompt.trim()}\n${tail}`;
}

/** True when a prompt has the drafted shape (TLDR is optional — the first
 *  drafts had three sections) — the Obsidian note and the email can embed it
 *  as-is; an older hand-written .md gets wrapped instead. */
export const hasPromptSections = (md: string): boolean =>
  ["## Summary", "## Prompt", "## Testing checklist"].every((h) => md.includes(h));

/** One H2 section's body out of a drafted prompt, or "" when absent. */
export function promptSection(md: string, heading: (typeof IDEA_PROMPT_SECTIONS)[number]): string {
  const i = md.indexOf(heading);
  if (i < 0) return "";
  const rest = md.slice(i + heading.length);
  const next = rest.search(/\n## /);
  return (next < 0 ? rest : rest.slice(0, next)).trim();
}

/** The email/update body Lee asked for (2026-09-02): "the TLDR, then the
 *  summary, prompt, etc." Plain text; the same order in Obsidian. */
export function ideaUpdateText(idea: IdeaForPrompt & { promptMd: string | null; createdBy?: string; appUrl?: string }): string {
  const md = idea.promptMd ?? "";
  const drafted = hasPromptSections(md);
  const tldr = drafted ? promptSection(md, "## TLDR") : "";
  const summary = drafted ? promptSection(md, "## Summary") : "";
  const prompt = drafted ? promptSection(md, "## Prompt") : md;
  const checklist = drafted ? promptSection(md, "## Testing checklist") : "";
  return [
    `IDEA: ${idea.title}${idea.createdBy ? ` — from ${idea.createdBy}` : ""}`,
    idea.sourcePath ? `Captured from ${idea.sourcePath}${idea.pageTitle ? ` (“${idea.pageTitle}”)` : ""}` : "",
    idea.categories.length ? `Categories: ${idea.categories.join(", ")}${idea.subcategory ? ` · ${idea.subcategory}` : ""}` : "",
    "",
    "TLDR", tldr || idea.title, "",
    "SUMMARY", summary || idea.body || "(no summary)", "",
    "IN LEE'S WORDS", idea.body || "(voice note only)", "",
    "PROMPT", prompt || "(not drafted yet)", "",
    "TESTING CHECKLIST", checklist || "(drafted with the prompt)", "",
    idea.appUrl ? `Vault: ${idea.appUrl}` : "",
  ].filter((l) => l !== undefined).join("\n").trim();
}

export function buildIdeaPromptMessages(idea: IdeaForPrompt): { system: string; user: string } {
  const system = [
    "You turn ONE product idea into ONE Claude Code prompt for the Survive Accounting repo (survive-accounting-hub): TanStack Start + React 19 + TypeScript, Supabase (Postgres, storage), Bun tests, deployed on Vercel from main. Lee is the sole developer-owner; Claude Code sessions do the building on his build machine; he tests on his filming laptop after the deploy.",
    PRODUCT_PRIMER,
    "USE THE PRIMER: name the real routes (parameterised — $topic/$set, never one set), the real components and stores, and the real words (CEQ, set, topic, stamp, session, board). If the idea mentions a page, the prompt's WHERE names the file behind it. A prompt that would only work for one set is wrong.",
    "House rules the prompt MUST carry: additive changes only (new fields, new routes, new tables via numbered additive migrations listed under 'SQL LEE MUST RUN', never auto-run); fail loud, no silent fallbacks; never weaken or delete a passing test; nothing that changes what students see unless the idea says so; protected zones (element/frame parent membership, scene serialization internals, command bus, space walk) are off limits — if the idea needs them, the prompt says STOP and report.",
    "Format, in markdown, EXACTLY these four H2 sections and nothing before the first:",
    "## TLDR — ONE sentence a teammate can read in a glance: what changes for whom.",
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
