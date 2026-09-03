// THE PRODUCT PRIMER — what any AI touching this codebase must know first.
//
// Lee (2026-09-03), watching the first unattended builds: "Has it studied our
// code and app? It doesn't seem to know what a CEQ is … it's only working on
// the exact route for internal vs external users … we want this to be how
// ALL results routes are handled." Nobody had told it. This is the telling.
//
// Read by: the prompt drafter (ideas-prompt.ts), the splitter, and the build
// queue runner's prompt. Keep it short enough to read and true enough to trust.

export const PRODUCT_PRIMER = `SURVIVE ACCOUNTING — THE PRODUCT PRIMER (read before anything else)

WHAT IT IS. surviveaccounting.com teaches intro accounting (ACCY 201 and its siblings) with short videos, practice and cheat sheets. Lee Ingram is the teacher and founder; King is the VA. Students are the users; Lee and King are the only admins.

CEQ = a Cram Exam Question: ONE multiple-choice question card — a stem, choices (exactly one correct), optional feedback per choice. Some CEQs are "note-only" cards (an intro or outro with no choices). CEQs live in SETS; sets live in TOPICS. Example: topic "Easy Points" → set "Internal vs. external users" → 8 CEQs. The whole tree comes from loadBoothBank() in src/lib/talkthrough.functions.ts (types BoothTopic / BoothSetInfo / BoothCeq).

BLAST OFF = a short vertical video filmed over one set: intro → the set's cards in order → bio → outro, with "detour" cards Lee inserts between them: cheat code, memorize this, deeper idea, visual. The running order (the "plan"/"spine") is src/components/blastoff/plan.ts; the editor is src/components/blastoff/BlastOffEditor.tsx; the card itself renders through src/components/blastoff/SetCard.tsx (the canvas's own CeqPreviewNode).

THE PRODUCTION LINE lives under /v3 and is a menu, not a workspace:
  /v3                                  the queue — every set, its status, three step icons
  /v3/$topic/$set                      what are you making?
  /v3/$topic/$set/blast-off            which step?
  /v3/$topic/$set/blast-off/talkthrough   Step 1
  /v3/$topic/$set/blast-off/results       Step 2
  /v3/$topic/$set/blast-off/arrange       Step 3 (then /film for in-page capture)
ROUTES ARE PARAMETERISED. $topic and $set are slugs of names (slugOf in src/components/v3/use-bank.ts; useV3Set resolves them). NEVER hardcode one set such as internal-vs-external-users — a build that only works for one set is a failed build. Everything must work for every $topic/$set.

TALKTHROUGH (Step 1, src/components/talkthrough/Booth.tsx): Lee records himself talking about each CEQ and STAMPS moments — cheat_code, memorize_this, deeper_idea, visual, phrase, plus edit stamps reword / revise_choices. Each transcript segment carries focusedCeqId / focusedCeqLabel, so his words are already aligned with the CEQ he was looking at. A stamp opens a context window; the words inside it belong to that stamp. Store: src/components/canvas/talkthrough.ts (types TalkSession, TalkSegment, TalkTag, BoardItem), local-first sync in talkthrough-sync.ts. Sessions belong to a set.

RESULTS (Step 2): the AI review board for one session — the script (talking points), CEQ edits (current vs proposed), and ideas (suggested slides by kind). Everything is SUGGESTED; nothing auto-applies; Lee approves, edits, archives. Code: src/components/canvas/ReviewBoard.tsx (ReviewBoardV2, ScriptCard, CeqEditCard, IdeaCard, ItemShell), src/components/talkthrough/SessionView.tsx, route src/routes/v3.$topic.$set.blast-off.results.tsx. The pass that generates it: src/components/canvas/talkthrough-pass.ts (LEE'S LAW lives there: proofread, don't invent).

THE IDEA BANK (/admin/ideas — src/routes/admin.ideas.tsx, src/lib/ideas.functions.ts, src/components/ideas/): Ctrl+I captures an idea from any page; AI titles, files and drafts it; the build queue (scripts/build-queue.ts) builds armed ideas unattended on branches named queue/…; Obsidian mirrors it all.

DATA. Supabase (Postgres + storage). Server functions are createServerFn in src/lib/*.functions.ts. Migrations are additive files under migration/supabase-migrations/, never run by a build. The talkthrough store is local-first (localStorage → Supabase).

HOUSE RULES. Additive only. Fail loud. Never weaken a test. Protected zones (element/frame parent membership, scene serialization internals, command bus, space walk) are off limits. Lee is the teacher: AI proofreads his words, never invents content. Reuse what exists — grep before creating a parallel route, store or component.

BEFORE BUILDING: read docs/V3-PRODUCTION-HANDOFF.md and docs/TWO-MACHINES.md, open the files named above for the surface you are changing, and look at how a neighbouring feature does it.`;
