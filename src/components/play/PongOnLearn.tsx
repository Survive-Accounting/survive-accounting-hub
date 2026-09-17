// ACCOUNTING PONG ON /learn — the block under the topic rows (Lee, 2026-09-16:
// "it should fit inside the /learn page … at the bottom of the page below all
// the topics, a new thing embedded into the page").
//
// WORKSHOP GATE: renders only with `?pong=1` in the address, and then behind the
// workshop password, so students never see it until Lee says so. Drop both to
// launch. Reads the address itself rather than the route's search schema so
// /learn's validated search is untouched.
import { lazy, Suspense, useEffect, useState } from "react";

import { PongGate } from "./PongGate";

const AccountingPong = lazy(() => import("./AccountingPong").then((m) => ({ default: m.AccountingPong })));

export function PongOnLearn({ narrow, courseCode = null, campusName = null, bolt = null }: { narrow: boolean; courseCode?: string | null; campusName?: string | null; bolt?: { c1: string; c2: string } | null }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    try { setOn(new URLSearchParams(window.location.search).get("pong") === "1"); } catch { setOn(false); }
  }, []);
  if (!on) return null;
  return (
    <section aria-label="Accounting Pong" style={{ marginTop: narrow ? 20 : 8 }}>
      <PongGate>
        <Suspense fallback={null}>
          <AccountingPong embedded courseCode={courseCode} campusName={campusName} bolt={bolt} />
        </Suspense>
      </PongGate>
    </section>
  );
}
