// ACCOUNTING PONG — /play/pong. Behind the workshop password (PongGate) while
// testers try it; noindex. The same block also renders at the bottom of /learn
// behind ?pong=1 (PongOnLearn), which is where it will live once Lee signs off.
//
// `?school=<slug>` previews the cabinet in a campus's colours (on /learn the
// school comes from the page itself).
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AccountingPong } from "@/components/play/AccountingPong";
import { PongGate } from "@/components/play/PongGate";
import { BRAND_SANS } from "@/components/canvas/brand";
import { schoolBySlug, type School } from "@/lib/schools";

export const Route = createFileRoute("/play/pong")({
  head: () => ({
    meta: [
      { title: "Accounting Pong — Survive Games" },
      { name: "description", content: "Pick the right cups before time runs out." },
      { name: "robots", content: "noindex" },
      { name: "theme-color", content: "#0D1730" },
    ],
  }),
  component: PlayPongPage,
});

function PlayPongPage() {
  const [school, setSchool] = useState<School | null>(null);
  useEffect(() => {
    try { setSchool(schoolBySlug(new URLSearchParams(window.location.search).get("school"))); } catch { /* private window */ }
  }, []);
  return (
    <div style={{ minHeight: "100dvh", background: "#0D1730", fontFamily: BRAND_SANS, padding: "16px 16px 40px", color: "#F7F0E6" }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <PongGate>
          <AccountingPong
            courseCode={school?.courseCode ?? null}
            campusName={school?.name ?? null}
            bolt={school?.c1 && school?.c2 ? { c1: school.c1, c2: school.c2 } : null}
          />
        </PongGate>
      </div>
    </div>
  );
}
