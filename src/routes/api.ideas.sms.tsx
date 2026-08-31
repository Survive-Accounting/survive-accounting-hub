// POST /api/ideas/sms — Twilio inbound webhook. Lee texts an idea; it lands in
// the vault before he has put the phone down.
//
//   Lee texts:  "billboard rail should rotate slower, 8s not 4s"
//   Replies:    "Saved. Reply with a category or ignore."
//   Lee texts:  "ui"
//   Replies:    "Tagged UI/UX. 8 ideas open."
//
// THE ALLOWLIST IS THE SECURITY MODEL. This URL is public because Twilio has to
// reach it, so an unknown number gets an empty TwiML response — no reply, no
// row, no hint that anything is here. Numbers live in env, never in the repo.
//
// A short reply that is ENTIRELY category words tags the sender's most recent
// idea instead of creating a new one. Anything else is a new idea, uncategorised
// — which is fine. Nothing here guesses a category from prose.
import { createFileRoute } from "@tanstack/react-router";

import { captureInboundIdea, tagLatestIdea } from "@/lib/ideas-inbound.functions";
import { identifyPhone, looksLikeCategoryReply, parseCategoryReply, savedReply, taggedReply, twiml } from "@/lib/ideas-inbound";

const xml = (body: string): Response =>
  new Response(body, { status: 200, headers: { "content-type": "text/xml; charset=utf-8" } });

/** Twilio posts form-encoded. MMS arrives as MediaUrl0..N with MediaContentType0..N. */
async function handleSms({ request }: { request: Request }): Promise<Response> {
  let form: FormData;
  try { form = await request.formData(); } catch { return xml(twiml()); }

  const from = String(form.get("From") ?? "");
  const who = identifyPhone(from);
  // Silence is the correct response to a stranger.
  if (!who) return xml(twiml());

  const body = String(form.get("Body") ?? "").trim();

  const media: { url: string; mime: string }[] = [];
  const count = Number(form.get("NumMedia") ?? 0);
  for (let i = 0; i < Math.min(count, 10); i++) {
    const url = String(form.get(`MediaUrl${i}`) ?? "");
    const mime = String(form.get(`MediaContentType${i}`) ?? "");
    if (url) media.push({ url, mime });
  }

  try {
    // A bare category word tags what was just saved rather than starting over.
    if (body && !media.length && looksLikeCategoryReply(body)) {
      const cats = parseCategoryReply(body);
      const r = await tagLatestIdea({ data: { who, categories: cats } });
      if (r.tagged) return xml(twiml(taggedReply(cats, r.openCount)));
      // Nothing recent to tag — treat it as an idea after all rather than
      // swallowing it.
    }

    await captureInboundIdea({
      data: { who, source: "sms", text: body, media, subject: "" },
    });
    return xml(twiml(savedReply()));
  } catch (err) {
    // Never leave Lee thinking it saved when it did not.
    console.error("[ideas/sms] capture failed:", err);
    return xml(twiml("Could not save that one — try again or use the app."));
  }
}

export const Route = createFileRoute("/api/ideas/sms")({
  server: { handlers: { POST: handleSms } },
} as never);
