// SIGN-IN STATE + WHAT HAPPENS THE MOMENT A CHAPTER MEMBER RETURNS.
//
// The magic link brings them back to the chapter page they started on. Three things have to happen
// on that return, and they have to happen in this order:
//
//   1. tag them to THIS chapter, now WITH a user_id — the anonymous row a click made earlier
//      cannot hold a seat, and the exec roster is blank without a real identity;
//   2. reconcile seat grants — a chapter that paid in August has seats parked against members who
//      had no account; this is what converts one the instant they sign in;
//   3. unlock the player.
//
// Both writes are fire-and-forget. A failed tag must never stand between a signed-in student and
// the exam they just proved they wanted.
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { tagChapterMember } from "@/lib/greek-go.functions";
import { reconcileSeatGrants } from "@/lib/greek-seats.functions";

export type ChapterMemberState = {
  /** null while the session is still being read — render neither the gate nor the player yet. */
  signedIn: boolean | null;
  userId: string | null;
};

export function useChapterMember(schoolSlug: string, chapterSlug: string): ChapterMemberState {
  const [state, setState] = useState<ChapterMemberState>({ signedIn: null, userId: null });

  useEffect(() => {
    let live = true;

    const apply = (userId: string | null) => {
      if (!live) return;
      setState({ signedIn: !!userId, userId });
      if (!userId) return;
      // Tag with the account, then convert any seat waiting on it.
      void tagChapterMember({ data: { schoolSlug, chapterSlug, userId, source: "link" } })
        .then(() => reconcileSeatGrants({ data: { userId } }))
        .catch(() => {});
    };

    void supabase.auth.getSession().then(({ data }) => apply(data.session?.user?.id ?? null)).catch(() => {
      if (live) setState({ signedIn: false, userId: null });
    });

    // The magic-link return can resolve AFTER first paint, so the player must unlock on the auth
    // event rather than only on the initial read.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => apply(session?.user?.id ?? null));
    return () => { live = false; sub?.subscription?.unsubscribe?.(); };
  }, [schoolSlug, chapterSlug]);

  return state;
}
