// THE ILLUSTRATION BRIEF — Lee brainstorms out loud, the AI preps the prompt, Lee sees a
// title and three bullets, confirms, generates. (Lee, 2026-09-05: "I'd much prefer to just
// brainstorm an idea … let the AI prep a prompt, and then summarize the prompt for me, then I
// confirm submit. I don't really need to read the full prompt, leave it in a toggle.")
//
// Pure: the messages for the micro lane and the parser for its answer. The prompt it writes
// is the SUBJECT only — the Survive Dreamstate preset wraps it with the medium, the palette
// and the black ground at generation time (illustration.ts composeIllustrationPrompt).
//
// A SERIES: pictures that reference each other (same character, same props, same palette)
// are one scene description carried forward. The brief for a sibling gets the anchor
// picture's subject and is told to keep the cast and change only what the idea changes; the
// generation then reuses the anchor's seed so the composition rhymes too.

export interface BriefRequest {
  /** Lee's words, as spoken. */
  brainstorm: string;
  /** The teaching point — the slide's stem or what Lee said it's for. */
  teachingIntent: string | null;
  setName?: string | null;
  /** The picture this one should rhyme with, if any. */
  reference?: { title: string; prompt: string } | null;
  /** A previous draft Lee is revising, and what he wants changed. */
  previous?: { title: string; prompt: string } | null;
  revision?: string | null;
}

export interface IllustrationBrief {
  /** Six words or fewer — what the picture is. */
  title: string;
  /** Three lines a glance can check: the subject, what it's doing, the one label (if any). */
  bullets: string[];
  /** The subject sentence(s) handed to the preset. ≤ 70 words. */
  prompt: string;
}

export const BRIEF_SYSTEM = [
  "You turn a spoken or typed brainstorm from Lee (an accounting tutor making 9:16 Shorts) into ONE illustration brief for Recraft V4.1, in Survive's house style: a simple watercolor-and-ink illustration, real but tasteful colour, painterly but clean, read at a glance on a phone.",
  "Return ONLY a JSON object: {\"title\": str (≤ 6 words, what the picture IS), \"bullets\": [str, str, str] (what a glance should confirm: 1 the subject, 2 what it is doing / the composition, 3 the one label or the contrast device — or 'no text'), \"prompt\": str (≤ 70 words, the SUBJECT only)}.",
  "THE PROMPT'S RULES: name ONE concrete subject first (earlier words weigh most). Describe structure and action, not adjectives — a pose, a prop, a direction of looking. At most three elements in the frame. For a two-sided idea told in ONE picture (inside vs outside, ours vs theirs, before vs after) use a single clear divider — a wall, a window, a desk edge, a doorway — never two separate scenes side by side; put the contrast in WHERE the figures are and WHAT they hold, not in captions.",
  "A PAIR ACROSS TWO SLIDES is a different case from the one above: when Lee's idea is really two pictures for two different slides (an 'internal' one and an 'external' one, say), each slide gets its own full single-subject picture — there is no divider, and it is not one image. Use the REFERENCE PICTURE below, when given, to make the pair match (same rendering, same world, same cast); the SUBJECT itself still names only what's in THIS picture.",
  "PEOPLE, NEVER A DETAILED FRONT-FACING FACE: stage the person so a face is never needed — from behind, from the side, head turned away or cropped from the frame, mid-stride, climbing, at a desk seen from behind. A real, specific, recognizable place or prop beats a generic one — use the actual landmark or object if Lee names one.",
  "COLOUR MOOD: when Lee asks for a picture to feel more muted, more vivid, warmer, colder, or otherwise different from a reference or the default, put that in the prompt as plain colour words (\"in muted, desaturated tones\" / \"in warm, saturated colour\") — never leave it implied.",
  "TEXT: at most one short label of 1–3 words, only when it does real work (a sign that says OUR COMPANY, a folder that says BUDGET). Write it in the prompt as: with the words \"OUR COMPANY\" on the sign. No other text, no captions, no arrows with words.",
  "NEVER write the style, the medium, the colours, the background, or the words 'watercolor' / 'illustration' / 'ink' / 'no text' — the preset adds all of that. Never a paragraph; a sentence or two.",
  "A SERIES: when a reference picture is given, keep its cast exactly — the same person described the same way, the same props, the same room — and change only what this idea changes. Say what stays and what moves.",
  "A REVISION: when a previous draft and Lee's change note are given, apply the note and keep everything else.",
].join("\n");

export function buildBriefMessages(req: BriefRequest): { system: string; user: string } {
  const user = [
    `LEE SAID:\n${req.brainstorm.trim()}`,
    req.teachingIntent ? `THE TEACHING POINT: ${req.teachingIntent.trim()}` : "",
    req.setName ? `THE SET: ${req.setName}` : "",
    req.reference ? `REFERENCE PICTURE (keep its cast and props):\nTitle: ${req.reference.title}\nSubject: ${req.reference.prompt}` : "",
    req.previous ? `PREVIOUS DRAFT:\nTitle: ${req.previous.title}\nSubject: ${req.previous.prompt}` : "",
    req.revision ? `LEE WANTS CHANGED: ${req.revision.trim()}` : "",
  ].filter(Boolean).join("\n\n");
  return { system: BRIEF_SYSTEM, user };
}

/** The model's JSON, defended: a title, exactly three bullets (padded or trimmed), a prompt. */
export function parseBrief(text: string): IllustrationBrief | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j: { title?: unknown; bullets?: unknown; prompt?: unknown };
  try { j = JSON.parse(m[0]); } catch { return null; }
  const prompt = typeof j.prompt === "string" ? j.prompt.trim().replace(/\s+/g, " ") : "";
  if (!prompt) return null;
  const title = (typeof j.title === "string" && j.title.trim()) ? j.title.trim().slice(0, 60) : prompt.split(/[,.]/)[0].slice(0, 60);
  const raw = Array.isArray(j.bullets) ? j.bullets.filter((b): b is string => typeof b === "string" && !!b.trim()).map((b) => b.trim()) : [];
  const bullets = raw.slice(0, 3);
  while (bullets.length < 3) bullets.push(bullets.length === 0 ? prompt : bullets.length === 1 ? "one scene, read at a glance" : "no text");
  return { title, bullets, prompt: prompt.slice(0, 600) };
}

export { promptHasLabel } from "./illustration";
