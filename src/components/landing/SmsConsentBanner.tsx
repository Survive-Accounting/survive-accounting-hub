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
