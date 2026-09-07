// THE ILLUSTRATION BRIEF — Lee brainstorms out loud, the AI preps the prompt, Lee sees a
// title and three bullets, confirms, generates. (Lee, 2026-09-05: "I'd much prefer to just
// brainstorm an idea … let the AI prep a prompt, and then summarize the prompt for me, then I
// confirm submit. I don't really need to read the full prompt, leave it in a toggle.")
//
// Pure: the messages for the micro lane and the parser for its answer. The prompt it writes
// is the SUBJECT only — the style preset (illustration.ts: survive-riso for exam content,
// survive-watercolor for the strategy shorts, since 2026-09-06) wraps it with the medium, the
// palette and the ground at generation time (composeIllustrationPrompt).
//
// A SERIES: pictures that reference each other (same character, same props, same palette)
// are one scene description carried forward. The brief for a sibling gets the anchor
// picture's subject and is told to keep the cast and change only what the idea changes; the
// generation then reuses the anchor's seed so the composition rhymes too. Since v5
// (2026-09-06) the seed is no longer trusted to carry the match on its own: the sibling's
// prompt RESTATES the anchor's cast, scale and dominant accent in words — the Internal /
// External Users pair drifted to "different cast, different scale, different palette" with
// only the seed shared (docs/ILLUSTRATION-STYLE-V5-PROPOSAL.md, "The pair rule is being
// violated").

// THE RECURRING STUDENT (2026-09-06, the v5 proposal, "On illustrating Lee"): "Don't put Lee's
// face in the illustrations. He's already on screen in the camera bubble in every video — an
// illustrated Lee competes with the real one on the same frame, and character consistency
// across generations is the single weakest thing image models do." Instead, "a recurring
// student character. Same figure across every illustration: consistent hair, consistent
// clothing, always from behind / side / cropped. Not Lee — the student." Why: "It's the
// differentiation Lee is after. Nobody in exam prep has a character"; "the audience identifies
// with the student, not the tutor"; and a character "defined by silhouette, posture, and a
// signature garment is more consistent across generations than a face ever would be."
// One fixed description, said the same way every time, edited HERE and nowhere else. The
// garment colours are the two house accents the palette controls already reach for (Survive
// gold, Survive blue), and the hair is dark, not black — the presets forbid near-black fills.
export const RECURRING_STUDENT = "the Survive student: short dark hair, a gold hoodie, a blue backpack over one shoulder, seen from behind, from the side, or cropped — never face-on";

// BANNED SUBJECTS (2026-09-06, the v5 proposal, answer 4): "these are what a model reaches for
// by default and they are the exact opposite of remarkable." An explicit reject list; when
// Lee's words lean on one, the brief finds the specific real-world thing behind the idea.
export const BANNED_SUBJECTS: readonly string[] = ["money piles", "handshakes", "lightbulbs", "gears", "target with arrow", "ladder of success", "jigsaw pieces"];

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
  // 2026-09-06: style-agnostic — two presets exist now (riso for exam content, watercolor for the
  // strategy shorts) and the preset, not this brief, supplies the medium.
  "You turn a spoken or typed brainstorm from Lee (an accounting tutor making 9:16 Shorts) into ONE illustration brief for Recraft V4.1, in Survive's house style; the preset adds the medium. What you write is a simple picture with real but tasteful colour, clean, read at a glance on a phone.",
  "Return ONLY a JSON object: {\"title\": str (≤ 6 words, what the picture IS), \"bullets\": [str, str, str] (what a glance should confirm: 1 the subject, 2 what it is doing / the composition, 3 the one label or the contrast device — or 'no text'), \"prompt\": str (≤ 70 words, the SUBJECT only)}.",
  "THE PROMPT'S RULES: name ONE concrete subject first (earlier words weigh most). Describe structure and action, not adjectives — a pose, a prop, a direction of looking. At most three elements in the frame. For a two-sided idea told in ONE picture (inside vs outside, ours vs theirs, before vs after) use a single clear divider — a wall, a window, a desk edge, a doorway — never two separate scenes side by side; put the contrast in WHERE the figures are and WHAT they hold, not in captions.",
  // 2026-09-06 (v5): the pair rule is ENFORCED in words, not left to the seed — the Internal /
  // External pair drifted to different cast, scale and palette with only the seed shared.
  "A PAIR ACROSS TWO SLIDES is a different case from the one above: when Lee's idea is really two pictures for two different slides (an 'internal' one and an 'external' one, say), each slide gets its own full single-subject picture — there is no divider, and it is not one image. When a REFERENCE PICTURE is given below, the pair must actually match: RESTATE the reference's cast, its scale (a figure at human scale stays at human scale; a building exterior stays a building exterior) and its dominant accent colour explicitly, in words, in THIS prompt — never rely on the shared seed to carry them — and the three bullets must name what stayed the same. The SUBJECT itself still names only what's in THIS picture.",
  "PEOPLE, NEVER A DETAILED FRONT-FACING FACE: stage the person so a face is never needed — from behind, from the side, head turned away or cropped from the frame, mid-stride, climbing, at a desk seen from behind. A real, specific, recognizable place or prop beats a generic one — use the actual landmark or object if Lee names one.",
  "HOW OLD (2026-09-05): unless the idea specifically needs someone senior or experienced (a board, an executive, a veteran of the room), a person defaults to reading YOUNG — entry-level, early-career, the age of who's about to graduate — since that's who Survive is teaching, not a generic older professional. Say so structurally (build, posture, a junior-looking role) rather than naming an age.",
  // 2026-09-06 (v5): one character, never Lee. The description is RECURRING_STUDENT above.
  `THE RECURRING STUDENT: every people-bearing subject uses the same one character — ${RECURRING_STUDENT}. Describe them with exactly those words every time so the figure stays the same picture to picture; they are never Lee (Lee is already on camera in every video). The HOW OLD exception above still applies: a board member, an executive or a veteran of the room is not the student and is described as themselves.`,
  // 2026-09-06 (v5): "The stated goal (dreamy, surreal) is nowhere in the system" — the suffix is
  // tuned for literal clarity, so surreality has to come from the subject. The paragraph is the
  // proposal's, verbatim; the usage note is its "maybe one illustration in three".
  "SURREALITY ALLOWANCE: Scale and space may be pushed: an object much larger than life, a figure standing on or inside something that couldn't hold them, an ordinary thing floating or repeating. Use this to make the idea strange enough to remember, never to make it unclear — the one clear subject rule still governs. Reach for it on roughly one picture in three so it stays a surprise, and never when the teaching point needs a literal scene.",
  "COLOUR MOOD: when Lee asks for a picture to feel more muted, more vivid, warmer, colder, or otherwise different from a reference or the default, put that in the prompt as plain colour words (\"in muted, desaturated tones\" / \"in warm, saturated colour\") — never leave it implied.",
  "TEXT: at most one short label of 1–3 words, only when it does real work (a sign that says OUR COMPANY, a folder that says BUDGET). Write it in the prompt as: with the words \"OUR COMPANY\" on the sign. No other text, no captions, no arrows with words.",
  // 2026-09-06 (v5): the reject list is BANNED_SUBJECTS above.
  `BANNED SUBJECTS, never in a prompt: ${BANNED_SUBJECTS.join(", ")}. They are what a model reaches for by default and the exact opposite of remarkable. If Lee's words lean on one, find the specific real-world thing behind the idea instead — the actual counter, ledger, door, desk or machine that idea lives in — and draw that.`,
  "NEVER write the style, the medium, the colours, the background, or the words 'watercolor' / 'risograph' / 'riso' / 'illustration' / 'ink' / 'no text' — the preset adds all of that. Never a paragraph; a sentence or two.",
  "A SERIES: when a reference picture is given, keep its cast exactly — the same person described the same way, the same props, the same room — restated in words in this prompt (cast, scale, dominant accent colour), never left to the seed, and change only what this idea changes. Say what stays and what moves; the bullets name what stayed the same.",
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
