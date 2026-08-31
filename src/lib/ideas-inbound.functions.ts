// INBOUND CAPTURE — the server half. Turns a text message or an email into a
// row in the vault, with its attachments pulled into our own storage.
//
// WHY IT FETCHES THE MEDIA: Twilio media URLs expire and sit behind Twilio
// auth; a mail provider's attachment links do too. An idea whose photo 404s in
// a month is not captured, it is a broken promise — so the bytes come to the
// canvas-media bucket at capture time.
//
// Voice memos texted in transcribe through the SAME path as Talk Box, with the
// same hallucination blocklist: an idea that transcribes as "thanks for
// watching" is worse than no idea.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { PEOPLE } from "@/components/ideas/model";

const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any; storage: { from: (b: string) => any } };
};

const newId = (): string => `idea-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const extFor = (mime: string): string =>
  mime.includes("pdf") ? "pdf"
  : mime.includes("markdown") ? "md"
  : mime.startsWith("image/") ? (mime.split("/")[1] || "jpg").replace(/[^a-z0-9]/g, "").slice(0, 5)
  : mime.startsWith("audio/") ? "m4a"
  : mime.startsWith("video/") ? "mp4"
  : "bin";

/** Twilio media needs basic auth; everything else is a plain fetch. */
function authHeaders(url: string): Record<string, string> {
  if (!/api\.twilio\.com/i.test(url)) return {};
  const sid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const tok = process.env.TWILIO_AUTH_TOKEN ?? "";
  if (!sid || !tok) return {};
  return { authorization: `Basic ${Buffer.from(`${sid}:${tok}`).toString("base64")}` };
}

/** Pull a remote file into our bucket. Returns null on failure — a lost photo
 *  must never cost us the idea's text. */
async function ingest(url: string, mime: string, i: number): Promise<{
  id: string; name: string; mime: string; size: number; path: string; url: string;
} | null> {
  try {
    const res = await fetch(url, { headers: authHeaders(url) });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const type = res.headers.get("content-type")?.split(";")[0] || mime || "application/octet-stream";
    const path = `idea-inbound/${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}.${extFor(type)}`;
    const db = await admin();
    const up = await db.storage.from("canvas-media").upload(path, buf, { contentType: type, upsert: false });
    if (up.error) return null;
    const { data: pub } = db.storage.from("canvas-media").getPublicUrl(path);
    return { id: path, name: path.split("/").pop()!, mime: type, size: buf.byteLength, path, url: pub.publicUrl };
  } catch { return null; }
}

const inboundInput = z.object({
  who: z.enum(PEOPLE),
  source: z.enum(["sms", "email"]),
  text: z.string().max(20_000).default(""),
  subject: z.string().max(400).default(""),
  media: z.array(z.object({ url: z.string().url(), mime: z.string().max(120).default("") })).max(10).default([]),
});

export const captureInboundIdea = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inboundInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; id: string }> => {
    const db = await admin();

    const attachments = [];
    let audioPath: string | null = null;
    let transcriptStatus: string | null = null;
    let transcribed = "";

    for (let i = 0; i < data.media.length; i++) {
      const m = data.media[i];
      const got = await ingest(m.url, m.mime, i);
      if (!got) continue;
      attachments.push(got);

      // A voice memo texted in is an idea spoken aloud — transcribe the first one.
      if (got.mime.startsWith("audio/") && !audioPath) {
        audioPath = got.path;
        try {
          const { transcribeTake } = await import("@/lib/transcribe.functions");
          const row = await transcribeTake({ data: { path: got.path, url: got.url, name: got.name } });
          const { isWhisperHallucination } = await import("@/components/canvas/talkthrough-audio");
          const raw = (row.text ?? "").trim();
          if (!raw) transcriptStatus = "empty";
          else if (isWhisperHallucination(raw, "")) transcriptStatus = "rejected";
          else { transcribed = raw; transcriptStatus = "ok"; }
        } catch { transcriptStatus = "failed"; }
      }
    }

    // Subject leads for email; the transcript joins the body for voice.
    const bodyParts = [data.text.trim(), transcribed].filter(Boolean);
    const body = bodyParts.join("\n\n");
    const firstLine = (data.subject.trim() || body.split("\n").find((l) => l.trim()) || "").trim();
    const title = firstLine.length > 72 ? `${firstLine.slice(0, 71)}…` : firstLine
      || (audioPath ? "Voice note" : attachments.length ? attachments[0].name : "(no text)");

    const id = newId();
    const now = new Date().toISOString();
    const { error } = await db.from("ideas").insert({
      id, title, body,
      categories: [],              // uncategorised is fine; nothing is guessed
      subcategory: "", status: "IDEA",
      source_path: data.source === "sms" ? "sms" : "email",
      context: {}, prompt_md: null, prompt_filename: null,
      created_by: data.who, source_kind: data.source,
      attachments, audio_path: audioPath, transcript_status: transcriptStatus,
      created_at: now, updated_at: now,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const, id };
  });

/** The "ui" follow-up: tag the sender's most recent idea. Only ever touches
 *  something captured in the last hour, so a stray word tomorrow cannot
 *  relabel yesterday's thought. */
export const tagLatestIdea = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    who: z.enum(PEOPLE),
    categories: z.array(z.string().max(30)).max(7),
  }).parse(d))
  .handler(async ({ data }): Promise<{ tagged: boolean; openCount: number }> => {
    const db = await admin();
    const cutoff = new Date(Date.now() - 60 * 60_000).toISOString();
    const { data: rows, error } = await db.from("ideas")
      .select("id,categories,created_at")
      .eq("created_by", data.who)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);

    const open = await db.from("ideas").select("id", { count: "exact", head: true }).in("status", ["IDEA", "DRAFTED"]);
    const openCount = open.count ?? 0;

    const row = (rows as { id: string; categories: string[] | null }[])[0];
    if (!row || !data.categories.length) return { tagged: false, openCount };

    const merged = [...new Set([...(row.categories ?? []), ...data.categories])];
    const up = await db.from("ideas").update({ categories: merged, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (up.error) throw new Error(up.error.message);
    return { tagged: true, openCount };
  });
