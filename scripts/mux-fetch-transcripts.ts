/**
 * Poll Mux for assets that have finished processing and backfill
 * duration/playback-id and the auto-generated transcript into video_archive.
 *
 *   bun scripts/mux-fetch-transcripts.ts [--limit N]
 *
 * Picks rows with a mux_asset_id that are still missing a duration or a
 * transcript, asks Mux for the asset, and — when ready — stores duration_sec,
 * mux_playback_id, and (if Vimeo didn't already provide one) the Mux-generated
 * English transcript. Sets status to 'transcribed' once a transcript lands.
 *
 * Run this on a schedule (or manually) after vimeo-to-mux.ts, since Mux
 * generates subtitles asynchronously. Alternative to a Mux webhook.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  try {
    const txt = readFileSync(path.join(process.cwd(), ".env"), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      if (!(k in process.env)) process.env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env */
  }
}
loadEnv();

const { getAsset, getGeneratedTranscriptVtt } = await import("../src/lib/mux.server");
const { vttToPlainText } = await import("../src/lib/vimeo.server");

const argv = process.argv.slice(2);
const limitIdx = argv.indexOf("--limit");
const limit = limitIdx >= 0 ? Number(argv[limitIdx + 1]) : 500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function sb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function main() {
  const supabase = sb();
  const { data, error } = await supabase
    .from("video_archive")
    .select("id,mux_asset_id,mux_playback_id,duration_sec,transcript_text,transcript_source,status")
    .not("mux_asset_id", "is", null)
    .or("transcript_text.is.null,duration_sec.is.null")
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];
  console.log(`Checking ${rows.length} asset(s)…`);

  let ready = 0;
  let transcripts = 0;
  for (const r of rows) {
    let asset;
    try {
      asset = await getAsset(r.mux_asset_id);
    } catch (e) {
      console.log(`• ${r.mux_asset_id}: fetch error ${(e as Error).message}`);
      await sleep(1000);
      continue;
    }
    if (asset.status !== "ready") {
      console.log(`• ${r.mux_asset_id}: ${asset.status}`);
      await sleep(1000);
      continue;
    }
    ready++;

    const patch: Record<string, unknown> = {};
    const playbackId = r.mux_playback_id ?? asset.playback_ids?.[0]?.id ?? null;
    if (!r.mux_playback_id && playbackId) patch.mux_playback_id = playbackId;
    if (r.duration_sec == null && asset.duration != null) patch.duration_sec = Math.round(asset.duration);

    if (!r.transcript_text && playbackId) {
      try {
        const vtt = await getGeneratedTranscriptVtt(playbackId, asset.tracks);
        if (vtt) {
          patch.transcript_text = vttToPlainText(vtt);
          patch.transcript_source = "mux";
          patch.status = r.status === "assigned" ? "assigned" : "transcribed";
          transcripts++;
        }
      } catch (e) {
        console.log(`• ${r.mux_asset_id}: transcript fetch error ${(e as Error).message}`);
      }
    }

    if (Object.keys(patch).length > 0) {
      const { error: uerr } = await supabase.from("video_archive").update(patch).eq("id", r.id);
      console.log(`• ${r.mux_asset_id}: ${uerr ? "update failed " + uerr.message : "updated " + Object.keys(patch).join(",")}`);
    } else {
      console.log(`• ${r.mux_asset_id}: ready, nothing to backfill`);
    }
    await sleep(1000);
  }

  console.log(`\nReady: ${ready}/${rows.length} · transcripts stored: ${transcripts}`);
}

main().catch((e) => {
  console.error("mux-fetch-transcripts failed:", (e as Error).message);
  process.exit(1);
});
