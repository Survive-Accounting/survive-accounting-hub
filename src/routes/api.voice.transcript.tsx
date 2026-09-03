// POST /api/voice/transcript — Twilio's transcribeCallback: fill in the voicemail text, email Lee.
import { createFileRoute } from "@tanstack/react-router";

async function handler({ request }: { request: Request }): Promise<Response> {
  const { handleTranscript } = await import("@/lib/voice/voice.server");
  return handleTranscript(request);
}

export const Route = createFileRoute("/api/voice/transcript")({
  server: { handlers: { POST: handler } },
} as never);
