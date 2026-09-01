// RECORD THIS VISIT, IF IT CARRIES A REF.
//
// One hook, mounted by every surface a tagged link can land on, so "which contacts actually move"
// is answered by the same code everywhere rather than by three slightly different effects.
//
// ── WHAT IT DELIBERATELY DOES NOT DO ──────────────────────────────────────────────────────────
// No IP, no fingerprint, no third-party call. The only identifier is a random first-party anon id
// this file generates — enough to say "two visits, one person" and nothing else about someone who
// never signed up. And it never blocks or breaks a render: a failed write is a missing row, which
// is a cost worth paying to keep a share screen from erroring in someone's hand.
import { useEffect, useRef } from "react";

import { currentContactRef, rememberContactRef } from "@/lib/contact-ref";
import { deviceAnonId } from "@/lib/device-id";
import { recordContactRefVisit } from "@/lib/engaged-contacts.functions";

// The anon id moved to lib/device-id.ts (2026-08-31): the member gate de-duplicates on the
// same cookie, and two implementations of "which browser is this" would drift apart silently.

export function useRecordRefVisit(campusId?: string | null): void {
  // ONCE PER MOUNT, guarded: React 18 StrictMode runs effects twice in development, and without
  // this every local pageview would double every count.
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    const ref = currentContactRef();
    if (!ref) return;
    // Persist first: the tag must survive the next hop even if the write below fails.
    rememberContactRef(ref);

    void recordContactRefVisit({
      data: {
        ref,
        path: window.location.pathname,
        campusId: campusId ?? null,
        anonId: deviceAnonId(),
      },
    }).catch(() => { /* analytics never breaks a page */ });
  }, [campusId]);
}
