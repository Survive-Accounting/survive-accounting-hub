// THE FAST TRACK BRIEF — Lee, 2026-09-05: "make fast track work similar to illustration. Just
// talk in plain language about what you want. Add screenshots. It will convert it into a
// prompt to send claude code. Only for UI/UX changes." Same shape as the SHIPPED illustrator's
// brief (illustration-brief.ts): say it in your own words, the AI preps a title, three bullets
// and the actual Claude Code prompt, you confirm or say what to change.
//
// THE ONE HARD RULE: UI/UX only — copy, layout, color, spacing, sizing, a label, a small visual
// tweak. A request that needs data, auth, payments, a migration or new backend logic is flagged
// out of scope and refused here, before it ever reaches Claude Code — fast track's own
// FAST_TRACK_RULES are the enforcement INSIDE a build; this is the enforcement before one starts.
//
// Pure: the messages for the micro lane and the parser for its answer.

export interface FastTrackBriefRequest {
  /** Lee's or King's words, as spoken or typed. */
  brainstorm: string;
  path: string;
  pageTitle: string;
  hasScreenshot: boolean;
  /** A previous draft being revised, and what to change. */
  previous?: { title: string; prompt: string } | null;
  revision?: string | null;
}

export interface FastTrackBrief {
  /** Six words or fewer — what changes. */
  title: string;
  /** Two or three lines a glance can check: what changes, where, what it looks like after. */
  bullets: string[];
  /** The actual instruction handed to Claude Code. Empty when outOfScope. */
  prompt: string;
  /** True when this needs more than a UI/UX change — fast track refuses these. */
  outOfScope: boolean;
  outOfScopeReason: string | null;
}

export const FAST_TRACK_BRIEF_SYSTEM = [
  "You turn a spoken request from Lee or King (Survive Accounting) into ONE fast-track brief for an unattended Claude Code build. FAST TRACK IS UI/UX ONLY: copy, a label, a color, spacing, layout, sizing something bigger or smaller, moving something on screen, a small self-contained visual tool. It is NEVER data, sign-in, payments, texting or emailing students, a database change, or backend/business logic.",
  "Return ONLY a JSON object: {\"title\": str (≤ 6 words, what changes), \"bullets\": [str, str] or [str, str, str] (what changes, where on the page, what it should look like after — skip a bullet only if the request has nothing to say for it), \"prompt\": str (the actual instruction for Claude Code — see below), \"outOfScope\": bool, \"outOfScopeReason\": str or null (one plain sentence, only when outOfScope is true)}.",
  "OUT OF SCOPE: if the request needs a database migration, touches student data, sign-in, payments, or sending anything to a student, or is really a new feature / backend logic rather than a visual change — set outOfScope true, outOfScopeReason to one sentence saying what makes it too big for fast track, and prompt to \"\".",
  "IN SCOPE (the normal case): set outOfScope false, outOfScopeReason null, and write prompt as a short, specific instruction — name the exact page or component from the PAGE given below, say exactly what to change and to what (a size, a color, wording), and nothing else. Do not add scope the request did not ask for.",
  "A screenshot may be attached — when the request says \"this\", \"bigger\", \"like this\", \"over here\" or similar, the prompt should say \"per the attached screenshot\" so whoever builds it knows to look at the picture rather than guess.",
  "A REVISION: when a previous draft and a change note are given, apply the note and keep everything else about the prompt the same.",
].join("\n");

export function buildFastTrackBriefMessages(req: FastTrackBriefRequest): { system: string; user: string } {
  const user = [
    `THE REQUEST:\n${req.brainstorm.trim()}`,
    `PAGE: ${req.path || "(unknown)"}${req.pageTitle ? ` — "${req.pageTitle}"` : ""}`,
    req.hasScreenshot ? "A SCREENSHOT IS ATTACHED — reference it in the prompt if the request points at something visual (\"this\", \"bigger\", \"like this\")." : "",
    req.previous ? `PREVIOUS DRAFT:\nTitle: ${req.previous.title}\nPrompt: ${req.previous.prompt}` : "",
    req.revision ? `CHANGE REQUESTED: ${req.revision.trim()}` : "",
  ].filter(Boolean).join("\n\n");
  return { system: FAST_TRACK_BRIEF_SYSTEM, user };
}

/** The model's JSON, defended: a title, 2–3 bullets, and either a prompt or a refusal reason. */
export function parseFastTrackBrief(text: string): FastTrackBrief | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j: { title?: unknown; bullets?: unknown; prompt?: unknown; outOfScope?: unknown; outOfScopeReason?: unknown };
  try { j = JSON.parse(m[0]); } catch { return null; }
  const outOfScope = j.outOfScope === true;
  const prompt = typeof j.prompt === "string" ? j.prompt.trim() : "";
  if (!outOfScope && !prompt) return null;
  const title = (typeof j.title === "string" && j.title.trim()) ? j.title.trim().slice(0, 60) : (prompt || "Fast track request").split(/[,.]/)[0].slice(0, 60);
  const bullets = (Array.isArray(j.bullets) ? j.bullets.filter((b): b is string => typeof b === "string" && !!b.trim()).map((b) => b.trim()) : []).slice(0, 3);
  const outOfScopeReason = outOfScope ? (typeof j.outOfScopeReason === "string" && j.outOfScopeReason.trim() ? j.outOfScopeReason.trim() : "This needs more than a UI/UX change.") : null;
  return { title, bullets, prompt: outOfScope ? "" : prompt.slice(0, 2000), outOfScope, outOfScopeReason };
}
