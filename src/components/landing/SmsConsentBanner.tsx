// Compliance banner displayed for A2P 10DLC campaign review.
// Shows the texting number plus the regulatory consent disclosure.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatPhonePretty } from "@/lib/outreach-api";

export function SmsConsentBanner() {
  const [phone, setPhone] = useState<string | null>(null);

  useEffect(() => {
    (supabase.from("campus_phone_numbers" as never) as any)
      .select("phone_e164,campus_id")
      .is("campus_id", null)
      .limit(1)
      .then(({ data }: { data: { phone_e164: string }[] | null }) => {
        if (data && data[0]?.phone_e164) setPhone(data[0].phone_e164);
      });
  }, []);

  if (!phone) return null;

  return (
    <div
      style={{
        background: "#FFFFFF",
        padding: "10px 16px 8px",
        textAlign: "center",
        fontFamily: "Inter, sans-serif",
        fontSize: 14,
        color: "#1f2937",
        borderBottom: "1px solid #E5E7EB",
      }}
    >
      📱 Need help in your course? Text Lee:{" "}
      <a
        href={`sms:${phone}`}
        style={{ fontWeight: 700, color: "#14213D", textDecoration: "underline" }}
      >
        {formatPhonePretty(phone)}
      </a>
      <div style={{ marginTop: 4, fontSize: 10.5, color: "#6B7280", lineHeight: 1.4 }}>
        By texting, you agree to receive replies about your inquiry. Msg frequency varies.
        Msg &amp; data rates may apply. Reply STOP to opt out, HELP for help.{" "}
        <a href="/privacy" style={{ color: "#6B7280", textDecoration: "underline" }}>Privacy</a> ·{" "}
        <a href="/terms" style={{ color: "#6B7280", textDecoration: "underline" }}>Terms</a>
      </div>
    </div>
  );
}

export default SmsConsentBanner;

/** INLINE CONSENT NOTE — the A2P 10DLC disclosure that must sit beside EVERY phone field at the
 *  point of capture (spec §2): what they'll get, how often, cost line, STOP/HELP, policy links.
 *  Rendering this beside the field is what makes a submitted phone number a consented one
 *  (the intake stores consent_sms_at). `tone` matches the surrounding surface. */
export function SmsConsentNote({ tone = "dark", className = "", compact = false }: { tone?: "dark" | "light"; className?: string; compact?: boolean }) {
  const color = tone === "dark" ? "rgba(245,239,230,0.62)" : "#6B7280";
  const [open, setOpen] = useState(false);
  // COMPACT (the notify modal): the consent essentials stay visible at the point of capture —
  // agreement to texts, rates, STOP — in one quiet line; the full disclosure + policy links sit
  // behind "Message terms". Nothing required is removed, it is just not the loudest thing on screen.
  if (compact) {
    return (
      <div className={className} style={{ marginTop: 6, fontSize: 10.5, lineHeight: 1.45, color }} data-sms-consent>
        <span>Phone? You agree to texts from Lee about your exam prep. Msg &amp; data rates may apply. Reply STOP to cancel.</span>{" "}
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} style={{ color, textDecoration: "underline", background: "none", border: 0, padding: 0, font: "inherit", cursor: "pointer" }}>
          {open ? "Hide message terms" : "Message terms"}
        </button>
        {open && (
          <p style={{ marginTop: 6 }}>
            By entering a mobile number you agree to get texts from Lee at Survive Accounting about your exam prep — a
            confirmation now, then occasional updates (typically 1–4 msgs/month). Msg &amp; data rates may apply.
            Reply STOP to cancel, HELP for help.{" "}
            <a href="/privacy" style={{ color, textDecoration: "underline" }}>Privacy</a> ·{" "}
            <a href="/terms" style={{ color, textDecoration: "underline" }}>Terms</a>
          </p>
        )}
      </div>
    );
  }
  return (
    <p className={className} style={{ marginTop: 6, fontSize: 10.5, lineHeight: 1.45, color }} data-sms-consent>
      By entering a mobile number you agree to get texts from Lee at Survive Accounting about your exam prep — a
      confirmation now, then occasional updates (typically 1–4 msgs/month). Msg &amp; data rates may apply.
      Reply STOP to cancel, HELP for help.{" "}
      <a href="/privacy" style={{ color, textDecoration: "underline" }}>Privacy</a> ·{" "}
      <a href="/terms" style={{ color, textDecoration: "underline" }}>Terms</a>
    </p>
  );
}
