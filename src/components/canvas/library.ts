// Library adapter — flattens the imported scenario docs into spawnable PREPARED cards.
// Every entry, computationPath, memorize item, and question becomes one palette item.
// Spawning deep-clones into node data: prepared cards are COPIES, never references.
import { resolveSlot } from "@/lib/je/slot-resolver";
import { chapterLabel as formatChapterLabel, courseLabel as formatCourseLabel, type JeBrowserTree } from "@/lib/je-api";
import type { ScenarioDoc } from "@/lib/je-engine";
import { amountOf, sideOf, textMemoOf } from "./je-logic";
import { cardId, type CardData, type CardKind, type JeCard, type JeLine } from "./types";

export interface LibraryItem {
  key: string;
  kind: CardKind;
  label: string; // shown in the palette
  scenarioTitle: string;
  /** je_scenarios row id — the JE↔scenario mapping (stamped on spawned cards). */
  scenarioId: string;
  courseLabel: string;
  courseKey: string;
  chapterId: string | null;
  chapterLabel: string;
  /** Content-reset lifecycle (0087). undefined = migration not applied — the
   *  canvas fails loud on that instead of guessing. */
  status?: "active" | "archived";
  source?: "authored" | "imported";
  sortOrder: number;
  make: () => CardData; // fresh copy per spawn
}

/** Try to show a literal expr as a number; refs (schedule:… / param:…) fall back to raw text. */
function exprText(expr: string): string {
  try {
    return resolveSlot(expr, null).value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  } catch {
    return expr;
  }
}

function jeLinesFrom(doc: ScenarioDoc, entry: NonNullable<ScenarioDoc["variants"][number]["entries"]>[number]): JeLine[] {
  return entry.lines.map((l) => ({
    id: cardId("l"),
    account: l.account,
    dr: l.side === "debit" ? (typeof l.amount === "number" ? l.amount : null) : null,
    cr: l.side === "credit" ? (typeof l.amount === "number" ? l.amount : null) : null,
    label: l.label || undefined,
    // Docs carry the trap as a SENTENCE (why the tempting wrong move is wrong) — the flip
    // shows the line styled red + this feedback. Alternate wrong values can be typed in.
    trap: l.trap ? { feedback: l.trap } : undefined,
  }));
}

export function buildLibrary(tree: JeBrowserTree): LibraryItem[] {
  const items: LibraryItem[] = [];

  for (const course of tree.courses) {
    const courseLabel = course.id ? formatCourseLabel({ code: course.code, course_name: course.course_name }) : "Unassigned";
    const courseKey = course.id ?? "unassigned";
    for (const ch of course.chapters) {
      const chapterLabel =
        ch.chapter_number != null
          ? formatChapterLabel({ number: ch.chapter_number, name: ch.chapter_name, status: ch.status })
          : (ch.chapter_name ?? "Unassigned");
      for (const s of ch.scenarios) {
        const doc = s.doc;
        const bank = (doc.build?.accountBank ?? []).map((b) => b.account);
        const base = {
          scenarioTitle: s.title,
          scenarioId: s.id,
          courseLabel,
          courseKey,
          chapterId: ch.id === "__unassigned__" ? null : ch.id,
          chapterLabel,
          status: s.status,
          source: s.source,
          sortOrder: typeof s.sort_order === "number" ? s.sort_order : 9999,
        };

        // Entries → JE cards
        for (const variant of doc.variants) {
          for (const entry of variant.entries ?? []) {
            const caption = entry.caption || s.title;
            items.push({
              ...base,
              key: `${s.slug}:${variant.id}:${entry.id}`,
              kind: "je",
              label: caption,
              make: () => {
                // prepared cards carry the ANSWER KEY too — reveal-correct + the
                // flip Hint read solution; lines arrive solved (Lee hides via `h`).
                // scenarioId = the JE↔scenario mapping (re-save offers update).
                const lines = jeLinesFrom(doc, entry);
                return {
                  kind: "je",
                  title: s.title,
                  caption,
                  lines,
                  solution: jeLinesFrom(doc, entry),
                  accountBank: bank,
                  scenarioId: s.id,
                };
              },
            });
          }
          // Computation paths → Computation cards
          for (const p of variant.computationPaths ?? []) {
            items.push({
              ...base,
              key: `${s.slug}:${variant.id}:${p.id}`,
              kind: "computation",
              label: `${s.title} — ${p.id}`,
              make: () => ({
                kind: "computation",
                title: s.title,
                narration: p.narration,
                steps: (p.steps ?? []).map((st) => ({ id: cardId("s"), label: st.label, formulaText: st.formulaText ?? "", value: "" })),
              }),
            });
          }
        }

        // Memorize items → Memorize cards
        (doc.memorize ?? []).forEach((m, i) => {
          items.push({
            ...base,
            key: `${s.slug}:mem:${i}`,
            kind: "memorize",
            label: m.body.slice(0, 60),
            make: () => ({ kind: "memorize", title: s.title, itemKind: m.kind, body: m.body }),
          });
        });

        // Questions → CEQ cards
        (doc.questions ?? []).forEach((q) => {
          items.push({
            ...base,
            key: `${s.slug}:q:${q.id}`,
            kind: "ceq",
            label: q.prompt.slice(0, 60),
            make: () => ({
              kind: "ceq",
              title: s.title,
              prompt: q.prompt,
              choices: [
                { id: cardId("ch"), text: exprText(q.answerExpr), correct: true },
                ...q.distractors.map((dd) => ({ id: cardId("ch"), text: exprText(dd.expr), feedback: dd.feedback ?? "" })),
              ],
            }),
          });
        });
      }
    }
  }
  return sortLibrary(items);
}

function sortLibrary(items: LibraryItem[]): LibraryItem[] {
  // AUTHORED ORDER: course → chapter → sort_order → label (0087 content reset)
  items.sort(
    (a, b) =>
      a.courseLabel.localeCompare(b.courseLabel) ||
      a.chapterLabel.localeCompare(b.chapterLabel) ||
      a.sortOrder - b.sortOrder ||
      a.label.localeCompare(b.label),
  );
  return items;
}

/** AUTHOR FROM CANVAS: a JE card → a minimal authored ScenarioDoc. The answer
 *  key (solution) is the truth when present; caption, amounts, TEXT memos
 *  (doc.lines[].label — read via textMemoOf so the PROMPT A memos array and
 *  legacy label both round-trip), and trap feedback all map through the same
 *  fields jeLinesFrom reads. Calc memos stay canvas-only for now — the doc
 *  schema gains them when Solve-It starts generating them (roadmap).
 *  slug/title are injected server-side to stay consistent with the row. */
export function docFromJeCard(card: JeCard, title: string): ScenarioDoc {
  const key = card.solution?.length ? card.solution : card.lines;
  return {
    slug: "pending",
    title,
    event: card.caption || title,
    axes: [],
    variants: [
      {
        id: "base",
        conditions: {},
        entries: [
          {
            id: "e1",
            caption: card.caption || title,
            lines: key.map((l, i) => ({
              id: `l${i + 1}`,
              account: l.account,
              side: sideOf(l) === "cr" ? "credit" : "debit",
              amount: amountOf(l),
              label: textMemoOf(l),
              trap: l.trap?.feedback || undefined,
            })),
          },
        ],
      },
    ],
    ...(card.accountBank?.length ? { build: { accountBank: card.accountBank.map((a) => ({ account: a })) } } : {}),
  } as unknown as ScenarioDoc;
}
