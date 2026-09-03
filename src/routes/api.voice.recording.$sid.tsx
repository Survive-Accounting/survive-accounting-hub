// GET /api/voice/recording/<RecordingSid> — plays a voicemail on the /x/ page. Admin session
// required (the same cookie every admin server function checks); Twilio's credentials stay on the
// server and the audio is streamed through.
import { createFileRoute } from "@tanstack/react-router";

async function handler({ request, params }: { request: Request; params: { sid: string } }): Promise<Response> {
  void request;
  const { adminSessionOk } = await import("@/lib/admin-session.functions");
  let ok = false;
  try { ok = (await adminSessionOk())?.ok === true; } catch { ok = false; }
  if (!ok) return new Response("Sign in as an admin first.", { status: 401 });
  const { fetchRecording } = await import("@/lib/voice/voice.server");
  return fetchRecording(params.sid);
}

export const Route = createFileRoute("/api/voice/recording/$sid")({
  server: { handlers: { GET: handler } },
} as never);
