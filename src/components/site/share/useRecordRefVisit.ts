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
import { recordContactRefVisit } from "@/lib/engaged-contacts.functions";

const ANON_COOKIE = "sa_anon";
const ANON_MAX_AGE = 60 * 60 * 24 * 365;

/** A stable random id for this browser. Not derived from anything about the person. */
function anonId(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${ANON_COOKIE}=([^;]*)`));
  if (m) return decodeURIComponent(m[1]);
  const id = (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ANON_COOKIE}=${encodeURIComponent(id)}; Path=/; Max-Age=${ANON_MAX_AGE}; SameSite=Lax${secure}`;
  return id;
}

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
        anonId: anonId(),
      },
    }).catch(() => { /* analytics never breaks a page */ });
  }, [campusId]);
}
