// POST /api/voice/dial-through — Lee keyed a ref from his own cell; connect him as the main line.
import { createFileRoute } from "@tanstack/react-router";

async function handler({ request }: { request: Request }): Promise<Response> {
  const { handleDialThrough } = await import("@/lib/voice/voice.server");
  return handleDialThrough(request);
}

export const Route = createFileRoute("/api/voice/dial-through")({
  server: { handlers: { POST: handler } },
} as never);
