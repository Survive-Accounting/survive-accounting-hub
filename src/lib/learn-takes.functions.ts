// THE SPLITS OF EVERY LIVE CRAM SET, for a student surface (/v3/learn).
//
// /v3/learn draws one card per cram VIDEO, and a set with cuts is several videos — so the page
// needs each live set's splits (name + head frame id) to draw the cards and to hang each
// offshoot under the right one. listBlastPlanSetIds (blastoff.functions.ts) has exactly that,
// but it is admin-only (it also returns frame counts, timestamps and CEQ ids that are Lee's
// business). This is the student-safe slice: names and head ids of LIVE, unparked decks only —
// the same visibility gate fetchStudentTree applies, and no more than the set names loadBoothBank
// already serves without auth.
//
// The take computation mirrors listBlastPlanSetIds's (skipped frames are not filmed; a cut ends a
// run) and deliberately skips Zod for the same reason it does: a malformed plan still means
// someone reviewed, and this must not throw on one bad frame.
import { createServerFn } from "@tanstack/react-start";

export interface CramTake { headId: string; name: string }
export interface CramTakesRow { setId: string; takes: CramTake[] }

export const listCramTakes = createServerFn({ method: "GET" }).handler(async (): Promise<CramTakesRow[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { loadDecksDeduped, liveDecks } = await import("@/lib/student.functions");
  const owned = await loadDecksDeduped(supabaseAdmin as never);
  type Raw = { id?: unknown; cutAfter?: unknown; takeName?: unknown; skipped?: unknown };
  const out: CramTakesRow[] = [];
  for (const o of liveDecks(owned)) {
    const raw = (o.deck as { blastOff?: { frames?: unknown[] } }).blastOff;
    const list = Array.isArray(raw?.frames) ? (raw.frames as Raw[]) : [];
    if (list.length === 0) continue;
    const takes: CramTake[] = [];
    let run: Raw[] = [];
    const push = () => {
      const head = run[0];
      takes.push({
        name: typeof head?.takeName === "string" ? head.takeName.trim().slice(0, 80) : "",
        headId: typeof head?.id === "string" ? head.id : "",
      });
      run = [];
    };
    for (const fr of list) {
      if (fr?.skipped === true) continue;
      run.push(fr);
      if (fr?.cutAfter === true) push();
    }
    if (run.length || !takes.length) push();
    out.push({ setId: o.deck.id, takes });
  }
  return out;
});
