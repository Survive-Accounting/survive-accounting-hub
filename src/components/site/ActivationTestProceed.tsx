// TEST RUN ONLY — the "proceed" step after a scholarship chair presses Activate dashboard.
//
// Lee (2026-09-13): "If he requests to claim a dashboard … give him a button on his test page to
// just proceed. Or like a popup that, normally, Lee will contact the exec first to introduce
// himself, sell them on the platform, etc, then he will manually approve. Eventually, we will
// delegate this task to a campus rep to do for us."
//
// So a tester is TOLD what happens in real life, then gets one button that does Lee's approval on
// the fixture chapter (testApproveFixtureClaim — refuses anything that is not the fixture, and
// refuses outright unless TEST_MODE_ENABLED is set) and opens the dashboard.
//
// Renders nothing outside a test session on the test campus, so a real chair never sees it.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { readTestSession, TEST_CAMPUS_SLUG } from "@/lib/test-mode";
import { testApproveFixtureClaim } from "@/lib/test-mode.functions";

export function ActivationTestProceed({ schoolSlug, tone = "site" }: { schoolSlug: string; tone?: "site" | "navy" }) {
  const [on, setOn] = useState(false);
  useEffect(() => { setOn(!!readTestSession() && schoolSlug === TEST_CAMPUS_SLUG); }, [schoolSlug]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!on) return null;

  const proceed = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await testApproveFixtureClaim();
      if (!r.ok) { setErr(r.error ?? "Couldn't approve."); setBusy(false); return; }
      window.location.href = "/chapters/dashboard";
    } catch { setErr("Couldn't reach the server."); setBusy(false); }
  };

  const border = tone === "navy" ? "1px dashed rgba(255,217,194,0.55)" : "1px dashed #C2571F";
  return (
    <div role="note" style={{ marginTop: 12, padding: "12px 12px 10px", borderRadius: 10, border, background: "rgba(122,46,18,0.28)", color: "#FFE9D6", textAlign: "left", fontSize: 12.5, lineHeight: 1.5, position: "relative", zIndex: 1 }}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>Test mode — what happens next</div>
      <p style={{ margin: "5px 0 0" }}>
        In a real activation, Lee texts the chair first: introduces himself, answers questions, and walks
        them through getting members on. Then he approves the dashboard by hand. Later a campus rep will
        do this step.
      </p>
      <button type="button" onClick={() => void proceed()} disabled={busy} style={{ marginTop: 9, width: "100%", minHeight: 40, borderRadius: 8, border: 0, background: "#FFE9D6", color: "#7A2E12", fontWeight: 900, fontSize: 13.5, cursor: busy ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Skip ahead: approve it and open the dashboard →"}
      </button>
      {err && <p role="alert" style={{ margin: "6px 0 0", color: "#FFD9C2" }}>{err}</p>}
    </div>
  );
}
