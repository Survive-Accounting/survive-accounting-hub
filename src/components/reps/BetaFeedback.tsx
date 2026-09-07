// BETA MODE (spec §7): "for the first 3 reps, a feedback affordance on every screen — 'what was
// confusing here?' — straight to my phone. Toggle off before wide launch."
//
// Mounted at the bottom of every screen in the apply → onboarding flow while
// site_settings.settings.repBetaMode !== false. One tap opens a one-line box; Send texts Lee
// with the screen name. Nothing is stored — it is a text, not a ticket.
import { useState } from "react";

import { BRAND_SANS } from "@/components/canvas/brand";
import { sendRepBetaFeedback } from "@/lib/rep-pre-onboarding.functions";

export function BetaFeedback({ screen, who, legacyToken, isTest }: { screen: string; who?: string | null; legacyToken?: string | null; isTest?: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const send = async () => {
    if (text.trim().length < 2 || busy) return;
    setBusy(true);
    try {
      const r = await sendRepBetaFeedback({ data: { screen, text: text.trim(), who: who ?? null, legacyToken: legacyToken ?? null, isTest: !!isTest } });
      setDone(r.ok ? "Sent to Lee. Thanks — this is exactly the kind of thing that helps." : (r.error ?? "Couldn't send that."));
      if (r.ok) { setText(""); setTimeout(() => { setOpen(false); setDone(null); }, 2500); }
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-8" style={{ fontFamily: BRAND_SANS }} data-beta-feedback={screen}>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="w-full rounded-xl px-3 py-2.5 text-left text-[12.5px] font-bold"
          style={{ background: "transparent", border: "1px dashed var(--border-default)", color: "var(--text-muted)" }}>
          🧪 Beta — what was confusing here? <span style={{ color: "var(--accent)" }}>Tell Lee →</span>
        </button>
      ) : (
        <div className="rounded-xl p-3" style={{ background: "var(--bg-surface)", border: "1px dashed var(--border-default)" }}>
          <p className="text-[12px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.12em" }}>Beta · {screen}</p>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>What was confusing on this screen? It goes straight to Lee's phone.</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} autoFocus placeholder="e.g. I didn't know what 'chapter closes' meant"
            className="sa-field mt-2 w-full" style={{ borderRadius: 10, padding: "10px 12px", background: "var(--bg-input, rgba(0,0,0,0.22))", border: "1px solid var(--border-default)", color: "var(--brand-cream)", fontSize: 15, outline: "none" }} />
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={() => void send()} disabled={busy || text.trim().length < 2} className="rounded-lg px-4 text-[13px] font-black disabled:opacity-40" style={{ minHeight: 40, background: "var(--accent)", color: "#0B1220" }}>{busy ? "Sending…" : "Send"}</button>
            <button type="button" onClick={() => { setOpen(false); setDone(null); }} className="text-[12.5px] font-bold underline underline-offset-4" style={{ color: "var(--text-muted)" }}>Cancel</button>
            {done && <span className="text-[12px]" style={{ color: "var(--brand-cream)" }}>{done}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
