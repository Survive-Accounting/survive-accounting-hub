// POST /api/ideas/email — inbound email → an idea.
//
// The cheapest possible path for forwarding something from anywhere, and it
// handles PDFs with no upload UI at all: subject becomes the title, body the
// content, attachments attach.
//
// Provider-agnostic on purpose. It accepts either JSON (Resend / Postmark /
// SendGrid inbound-parse webhooks) or multipart form-data, and reads the
// handful of field names those providers actually use. Whichever inbox routing
// Lee wires up, this endpoint already speaks it.
//
// SAME ALLOWLIST as SMS: an unrecognised sender gets a 200 and nothing is
// stored. 200 rather than 403 because bouncing tells a stranger the address is
// real, and because providers retry non-2xx forever.
import { createFileRoute } from "@tanstack/react-router";

import { captureInboundIdea } from "@/lib/ideas-inbound.functions";
import { identifyEmail } from "@/lib/ideas-inbound";

const ok = (body: unknown = { ok: true }): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

type Parsed = { from: string; subject: string; text: string; media: { url: string; mime: string }[] };

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Pull the fields out of whatever shape the provider sent. */
function fromJson(j: Record<string, unknown>): Parsed {
  const from = str(j.from) || str(j.sender) || str((j.envelope as Record<string, unknown> | undefined)?.from);
  const subject = str(j.subject);
  const text = str(j.text) || str(j.plain) || str(j["body-plain"]) || str(j.html).replace(/<[^>]+>/g, " ");
  const raw = (Array.isArray(j.attachments) ? j.attachments : []) as Record<string, unknown>[];
  const media = raw
    .map((a) => ({ url: str(a.url) || str(a.Url) || str(a.content_url), mime: str(a.content_type) || str(a.contentType) || str(a.type) }))
    .filter((m) => m.url);
  return { from, subject, text, media };
}

async function handleEmail({ request }: { request: Request }): Promise<Response> {
  let p: Parsed;
  try {
    const ctype = request.headers.get("content-type") ?? "";
    if (ctype.includes("application/json")) {
      p = fromJson((await request.json()) as Record<string, unknown>);
    } else {
      const f = await request.formData();
      const obj: Record<string, unknown> = {};
      for (const [k, v] of f.entries()) if (typeof v === "string") obj[k] = v;
      p = fromJson(obj);
    }
  } catch {
    return ok({ ok: false, reason: "unparseable" });
  }

  const who = identifyEmail(p.from);
  // Unknown sender: accept and discard. Never bounce, never confirm.
  if (!who) return ok({ ok: true });

  try {
    await captureInboundIdea({
      data: { who, source: "email", text: p.text.trim(), subject: p.subject.trim(), media: p.media },
    });
    return ok();
  } catch (err) {
    console.error("[ideas/email] capture failed:", err);
    // 200 anyway: a retry storm from the provider would not fix a bad row.
    return ok({ ok: false });
  }
}

export const Route = createFileRoute("/api/ideas/email")({
  server: { handlers: { POST: handleEmail } },
} as never);
