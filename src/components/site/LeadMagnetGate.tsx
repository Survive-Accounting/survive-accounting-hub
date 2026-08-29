// LEAD MAGNET GATE — the email-for-artifact exchange, built generic on purpose
// (D5.4): today it serves the practice pack; cheat sheets and exhibit packs
// later reuse the same trigger-icon + one-field flow with different copy and a
// different request fn. We EMAIL the link rather than direct-download — the
// email is the point.
//
// The TRIGGER is a subtle icon the host surface positions; `spotlight` makes
// it glow once (the existing celebration treatment: a soft pulse, never a
// modal) at the host's chosen moment — e.g. "completed a set or answered 5".
import { useEffect, useRef, useState } from "react";
import { Loader2, Printer } from "lucide-react";

const C = { text: "#E8ECF5", muted: "#93A0B4", yellow: "#FCA311", green: "#3BF5A0", red: "#FF5C6E", border: "rgba(148,163,190,0.16)" };

export function LeadMagnetGate({ tooltip, prompt, cta, sentCopy, spotlight, onRequest }: {
  /** Icon tooltip — "Printable pack". */
  tooltip: string;
  /** The one line above the email field. */
  prompt: string;
  /** "Email me the pack →" */
  cta: string;
  /** "Sent. Go check your email — then keep going." */
  sentCopy: string;
  /** Pulse the icon once (host decides the moment; re-pulses are the host's call). */
  spotlight: boolean;
  onRequest: (email: string) => Promise<{ ok: true; already: boolean } | { ok: false; error: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "sent" | "already" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown); document.addEventListener("touchstart", onDown);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("touchstart", onDown); };
  }, [open]);

  const submit = async () => {
    if (busy || !/.+@.+\..+/.test(email)) return;
    setBusy(true); setError(null);
    try {
      const r = await onRequest(email.trim());
      if (r.ok) setState(r.already ? "already" : "sent");
      else { setState("error"); setError(r.error); }
    } catch (e) {
      setState("error"); setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        aria-label={tooltip}
        title={tooltip}
        onClick={() => setOpen((v) => !v)}
        className="grid place-items-center rounded-full"
        style={{
          minHeight: 28, minWidth: 28, color: spotlight && !open ? C.yellow : C.muted,
          border: `1px solid ${spotlight && !open ? "rgba(252,163,17,0.55)" : "transparent"}`,
          boxShadow: spotlight && !open ? "0 0 12px rgba(252,163,17,0.45)" : undefined,
          transition: "color 200ms ease, box-shadow 300ms ease, border-color 300ms ease",
        }}
      >
        <Printer className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div role="dialog" aria-label={tooltip} className="absolute right-0 top-full z-40 mt-2 w-64 rounded-xl p-3" style={{ background: "#0b1020", border: `1px solid ${C.border}`, boxShadow: "0 16px 40px -20px rgba(0,0,0,0.8)" }}>
          {state === "sent" || state === "already" ? (
            <p className="text-[12px] font-semibold" style={{ color: C.green }}>{state === "already" ? "Already on its way — check your inbox." : sentCopy}</p>
          ) : (
            <>
              <p className="text-[11.5px] font-semibold" style={{ color: C.text }}>{prompt}</p>
              <input
                type="email"
                value={email}
                placeholder="you@school.edu"
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
                className="mt-2 w-full rounded-lg px-2.5 py-2 text-[12px]"
                style={{ background: "rgba(9,14,26,0.8)", border: `1px solid ${C.border}`, color: C.text }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void submit()}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11.5px] font-black uppercase tracking-wide"
                style={{ background: C.yellow, color: "#0B1322", opacity: busy ? 0.7 : 1 }}
              >
                {busy && <Loader2 className="h-3 w-3 animate-spin" />} {cta}
              </button>
              {error && <p className="mt-1.5 text-[10.5px]" style={{ color: C.red }}>{error}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
