// USE ENTITLEMENTS (08-23) — the client hook the player uses to decide whether a paid tab is
// unlocked. Refreshes on auth change, on window focus, and via a manual bump (called after a
// Stripe checkout returns).
import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { listMyEntitlements, type EntitlementKind } from "@/lib/student-entitlements.functions";

export function useMyEntitlements(): { kinds: Set<EntitlementKind>; refresh: () => void; ready: boolean } {
  const [kinds, setKinds] = useState<Set<EntitlementKind>>(new Set());
  const [ready, setReady] = useState(false);
  const refresh = useCallback(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? null;
      if (!token) { setKinds(new Set()); setReady(true); return; }
      const r = await listMyEntitlements({ data: { accessToken: token } });
      setKinds(new Set(r.kinds));
      setReady(true);
    })();
  }, []);
  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => refresh());
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    // Test Mode: after a Stripe test purchase fires its webhook, the drawer can bump this.
    const onBump = () => refresh();
    window.addEventListener("sa-entitlements-bump", onBump);
    return () => { sub.subscription.unsubscribe(); window.removeEventListener("focus", onFocus); window.removeEventListener("sa-entitlements-bump", onBump); };
  }, [refresh]);
  return { kinds, refresh, ready };
}

/** Fire this after any UI action that should trigger an entitlement re-fetch (Stripe return). */
export function bumpEntitlements(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("sa-entitlements-bump"));
}

/** exam num (2/3/99) → entitlement kind ("exam_2","exam_3","final"). Exam 1 is always free. */
export function kindForExamNum(n: number): EntitlementKind | null {
  return n === 2 ? "exam_2" : n === 3 ? "exam_3" : n === 99 ? "final" : null;
}
