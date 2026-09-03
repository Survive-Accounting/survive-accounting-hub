// POST /api/voice/bridge?c=<conversationId> — Lee answered the bridge call; dial the person.
import { createFileRoute } from "@tanstack/react-router";

async function handler({ request }: { request: Request }): Promise<Response> {
  const { handleBridge } = await import("@/lib/voice/voice.server");
  return handleBridge(request);
}

export const Route = createFileRoute("/api/voice/bridge")({
  server: { handlers: { POST: handler } },
} as never);
