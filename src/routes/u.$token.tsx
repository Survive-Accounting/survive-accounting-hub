// /u/<token> — EMAIL PREFERENCES / UNSUBSCRIBE (CAN-SPAM). Every marketing email carries this
// link; transactional ones carry it as "Email preferences". One toggle, no account, no password.
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { getPreferences, setPreferences } from "@/lib/comms.functions";

export const Route = createFileRoute("/u/$token")({
  validateSearch: (s: Record<string, unknown>): { unsubscribe?: boolean } => ({ unsubscribe: s.unsubscribe === 1 || s.unsubscribe === "1" || s.unsubscribe === true ? true : undefined }),
  head: () => ({ meta: [{ title: "Email preferences — Survive Accounting" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: PreferencesPage,
});

function PreferencesPage() {
  const { token } = Route.useParams();
  const { unsubscribe } = Route.useSearch();
  const [state, setState] = useState<{ ok: boolean; email?: string; unsubscribed?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void (async () => {
      const p = await getPreferences({ data: { token } });
      // A one-click unsubscribe link does the deed on arrival, then shows the state.
      if (p.ok && unsubscribe && !p.unsubscribed) { await setPreferences({ data: { token, unsubscribe: true } }); setState({ ...p, unsubscribed: true }); }
      else setState(p);
    })();
  }, [token, unsubscribe]);
  const toggle = async () => {
    if (!state?.ok) return;
    setBusy(true);
    try { await setPreferences({ data: { token, unsubscribe: !state.unsubscribed } }); setState({ ...state, unsubscribed: !state.unsubscribed }); } finally { setBusy(false); }
  };
  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", color: "#1a1a1a", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "56px 20px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 12px" }}>Email preferences</h1>
        {!state && <p>One sec…</p>}
        {state && !state.ok && <p>That link doesn't match anyone. If you got here from an email, reply to it and I'll sort it out by hand. — Lee</p>}
        {state?.ok && (
          <>
            <p style={{ fontSize: 16, lineHeight: 1.55 }}>
              {state.unsubscribed
                ? <>You're <b>unsubscribed</b>. {state.email} won't get any more emails from me except direct replies to things you send. No hard feelings.</>
                : <>{state.email} gets occasional emails from me — a confirmation when you sign up for something, the day your exam's videos go live, and the odd exam-week note. Never more than two a week.</>}
            </p>
            <button onClick={() => void toggle()} disabled={busy} style={{ marginTop: 16, background: state.unsubscribed ? "#14213D" : "#FFFFFF", color: state.unsubscribed ? "#FFFFFF" : "#14213D", border: "2px solid #14213D", borderRadius: 8, padding: "10px 16px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              {busy ? "…" : state.unsubscribed ? "Turn emails back on" : "Unsubscribe me"}
            </button>
            <p style={{ marginTop: 28, fontSize: 13, color: "#666" }}>Texts are separate: reply STOP to any text to stop those. Questions — reply to any email, I read every one. — Lee</p>
          </>
        )}
      </div>
    </div>
  );
}
