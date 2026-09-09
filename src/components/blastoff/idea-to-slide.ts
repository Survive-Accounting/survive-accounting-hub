// AN IDEA FROM THE BOARD → A SLIDE ON THE DRAFT. One builder, used by the Editor's board and
// by the Suggestions page, so a slide added from either is the same slide.
//
// THE BUG THIS FIXES (Lee, 2026-09-08): "When I added slide it also made cheat codes as a
// batch. I want an individual cheat code slide for each… I guess actually, they just ended up
// all in the title. Not the list part."
//
// He read it exactly right. The old call site was one line in the results route:
//
//     addSlide(frameKind, frameKind === "cheat" ? { title: text } : { text })
//
// where `text` was the board item's `payload.body` — the whole multi-line explanation the pass
// wrote for one stamp window. So the entire blob became the bold heading, `body` and `bullets`
// were never set, and `frameBullets` returned [] — one giant title over an empty list. The
// item's own `title`, which is the short rule the model already wrote and the obvious heading,
// was thrown away.
//
// So: the TITLE is the title, and the BODY becomes the lines under it. That is the shape the
// strategy pipeline has always produced (lib/strategy.functions.ts builds `{ title, bullets:
// lines }`) — this just brings the board's own ＋ slide in line with it.
//
// ONE SLIDE, NOT A BATCH — and why. The "batch" is upstream, not here: the brainstorm pass
// drafts ONE board card per stamp window (canvas/talkthrough-pass.ts), so a window in which Lee
// said four cheat codes arrives as one item whose body holds all four, and one ＋ slide makes
// one slide. Splitting that into four is a judgement call about whether the lines are four
// codes or one code's four steps, and this file will not guess — it puts each line on its own
// bullet, where Lee can see them and split the slide himself. Making the pass emit one card per
// code is the real fix and belongs where the drafting happens.
import { insertFrame, newFrameId, type BlastFrame, type BlastFrameKind } from "./plan";
import { frameKindForStamp } from "./prompter";
import { emptyIllustration } from "./illustration";

export interface BoardIdea {
  /** The stamp kind the board item carries ("cheat_code", "memorize_this", "illustration"…). */
  kind: string;
  /** The item's body — the explanation, often several lines. */
  text: string;
  /** The board row's id, so the slide remembers where it came from. */
  itemId: string;
  /** The item's own short heading, when it has one. This is the slide's title. */
  title?: string;
}

/** Split a body into the lines that become bullets. Blank lines go; a leading "- " or "• " is
 *  the bullet marker the model wrote and is not part of the words. */
export function ideaLines(body: string | undefined): string[] {
  return (body ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-•*]\s+/, "").trim())
    .filter(Boolean);
}

/** The frame an idea becomes — the fields, not the placement. Exported for the tests and for
 *  anything that wants the shape without committing it to a plan. */
export function frameForIdea(idea: BoardIdea): BlastFrame {
  const lines = ideaLines(idea.text);
  const title = (idea.title ?? "").trim();

  // AN ILLUSTRATION IDEA is not a callout at all: it becomes a bare slide carrying the banked
  // brief, and the Editor's Generate button is where it (maybe) becomes a picture.
  if (idea.kind === "illustration") {
    return { id: newFrameId("blank"), kind: "blank", bankItemId: idea.itemId, illustration: emptyIllustration({ prompt: idea.text, teachingIntent: null }) };
  }

  const kind: BlastFrameKind = frameKindForStamp(idea.kind);

  // THE HEADING is the item's own title when it wrote one; failing that, the first line of the
  // body — because a callout with no heading and four bullets reads as orphaned, and the first
  // line is nearly always the rule. Whatever becomes the heading does not repeat as a bullet.
  const heading = title || lines[0] || "";
  const rest = title ? lines : lines.slice(1);

  const base = { id: newFrameId(kind), kind, bankItemId: idea.itemId, ...(rest.length ? { bullets: rest } : {}) };
  // A cheat code's heading is `title`; every other callout's is `text`. (plan.ts's insertStem
  // reads the two differently — that split is the card's, not this file's, to re-decide.)
  return kind === "cheat" ? { ...base, title: heading } : { ...base, text: heading };
}

/** Put the idea's slide on the draft, after `afterId` (or at the end when it is null or gone).
 *  Pure: hands back a new frame list. */
export function addSlideFromIdea(frames: readonly BlastFrame[], afterId: string | null, idea: BoardIdea): BlastFrame[] {
  const at = afterId ? frames.findIndex((f) => f.id === afterId) : -1;
  // "The end" is AHEAD of the sign-off — a slide after the outro's "Start cramming free" is a
  // slide nobody sees (the same rule plan.ts cloneFrameToEnd follows).
  let end = frames.length - 1;
  while (end >= 0 && (frames[end].kind === "outro" || frames[end].kind === "bio")) end -= 1;
  return insertFrame(frames, frameForIdea(idea), at < 0 ? end : at);
}

/** THE ANCHOR (2026-09-09). Lee: "when I stamp in for memorize this, I wanna be more clear:
 *  this can go in between this question and this question." He never has to say it: the booth
 *  records which card he was on when he stamped (BoardItem.ceqIds), so a cheat code stamped on
 *  Q3 is a cheat code AFTER Q3. This finds the frame to put it after — the LAST frame that
 *  already follows that card (its earlier inserts included), so three codes from one window land
 *  in the order he said them rather than each cutting in front of the last. Null when the card
 *  is not on this draft (skipped, or another set's) — the caller then appends. */
export function afterFrameForCeq(frames: readonly BlastFrame[], ceqId: string | null | undefined): string | null {
  if (!ceqId) return null;
  const i = frames.findIndex((f) => f.kind === "ceq" && f.ceqId === ceqId);
  if (i < 0) return null;
  let j = i;
  while (j + 1 < frames.length && frames[j + 1].kind !== "ceq" && !["open", "intro", "bio", "outro"].includes(frames[j + 1].kind)) j += 1;
  return frames[j].id;
}

/** BUILD THE DRAFT (2026-09-09). Lee: "It should just have suggested slides and put them IN
 *  THEIR PLACE already. I mentioned I wanted a cheat code HERE. In between this and this." Every
 *  idea, placed at its anchor, in one pass — so the Editor is finishing touches, not
 *  construction. Ideas with no anchor on this draft go to the end, in order. Pure. */
export function buildDraftFromIdeas(frames: readonly BlastFrame[], ideas: readonly (BoardIdea & { anchorCeqId?: string | null })[]): BlastFrame[] {
  let next: BlastFrame[] = [...frames];
  for (const idea of ideas) next = addSlideFromIdea(next, afterFrameForCeq(next, idea.anchorCeqId), idea);
  return next;
}
