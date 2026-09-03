// POST /api/voice/recorded — <Record> action: the voicemail exists; save it, text Lee.
import { createFileRoute } from "@tanstack/react-router";

async function handler({ request }: { request: Request }): Promise<Response> {
  const { handleRecorded } = await import("@/lib/voice/voice.server");
  return handleRecorded(request);
}

export const Route = createFileRoute("/api/voice/recorded")({
  server: { handlers: { POST: handler } },
} as never);
