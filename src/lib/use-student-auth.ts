// STUDENT AUTH (shared, 08-21) — the one magic-link session hook. Lifted out of /learn so the
// homepage/campus player's "Save my progress" uses the SAME Supabase session (no parallel
// account system). Never a password anywhere.
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export interface StudentAuth { userId: string | null; email: string | null; ready: boolean; signOut: () => void }

export function useStudentAuth(): StudentAuth {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => { if (!active) return; setUserId(data.session?.user?.id ?? null); setEmail(data.session?.user?.email ?? null); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { setUserId(session?.user?.id ?? null); setEmail(session?.user?.email ?? null); setReady(true); });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);
  return { userId, email, ready, signOut: () => void supabase.auth.signOut() };
}
