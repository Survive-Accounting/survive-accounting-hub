// POST /api/voice/inbound — the main line's Voice URL (set on the Twilio number). Everyone hears
// the greeting and can leave a voicemail; Lee gets a "calling now" text; Lee's own cell gets the
// dial-through prompt instead. Signature-verified. Logic lives in src/lib/voice/voice.server.ts.
import { createFileRoute } from "@tanstack/react-router";

async function handler({ request }: { request: Request }): Promise<Response> {
  const { handleInbound } = await import("@/lib/voice/voice.server");
  return handleInbound(request);
}

export const Route = createFileRoute("/api/voice/inbound")({
  server: { handlers: { POST: handler } },
} as never);
