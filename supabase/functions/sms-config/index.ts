// Returns lightweight runtime config to the dashboard so you can confirm
// where summary texts are routed without exposing the secret value to
// untrusted clients. Public reads OK — these are operator-facing values.

const LEE_PHONE = (Deno.env.get("LEE_PERSONAL_PHONE") ?? "").replace(/[^+\d]/g, "");
const TESTER = (Deno.env.get("SMS_TESTER_PHONES") ?? "")
  .split(",").map((s) => s.trim().replace(/[^+\d]/g, "")).filter(Boolean);

Deno.serve(() => {
  const body = JSON.stringify({
    lee_phone: LEE_PHONE || null,
    tester_phones: TESTER,
    twilio_configured: !!Deno.env.get("TWILIO_ACCOUNT_SID"),
    anthropic_configured: !!Deno.env.get("ANTHROPIC_API_KEY"),
  });
  return new Response(body, {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
});
