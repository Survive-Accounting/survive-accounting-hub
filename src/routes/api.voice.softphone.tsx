// POST /api/voice/softphone — the TwiML App's Voice URL: a browser softphone call, dialled out as the
// main line. Set this URL on the TwiML App whose SID is TWILIO_TWIML_APP_SID.
import { createFileRoute } from "@tanstack/react-router";

async function handler({ request }: { request: Request }): Promise<Response> {
  const { handleClient } = await import("@/lib/voice/voice.server");
  return handleClient(request);
}

export const Route = createFileRoute("/api/voice/softphone")({
  server: { handlers: { POST: handler } },
} as never);
