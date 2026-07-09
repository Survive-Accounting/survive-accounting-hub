/**
 * Migrate the Vimeo archive to Mux + capture transcripts.
 *
 *   bun scripts/vimeo-to-mux.ts [--limit N] [--dry-run]
 *
 * For each Vimeo video (paginated 100/page): pick the highest-quality source
 * download, POST it to Mux as a URL input with signed playback + auto-generated
 * English subtitles (1080p tier), grab Vimeo's own transcript if present, and
 * insert a video_archive row. Sequential with a 1s throttle to respect both APIs.
 *
 *   --limit N    only process the first N videos (use 3 for a test run)
 *   --dry-run    list + estimate only; no Mux assets created, no rows written
 *
 * Env (.env / process.env): VIMEO_ACCESS_TOKEN, MUX_TOKEN_ID, MUX_TOKEN_SECRET,
 * SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Optional MUX_STORAGE_RATE_PER_MIN_MONTH
 * (defaults 0.003) for the cost estimate.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// Load .env into process.env BEFORE importing helpers that read it at call time.
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

const { listAllVideos, pickBestDownload, getTranscriptVtt, vttToPlainText, vimeoIdFromUri } = await import(
  "../src/lib/vimeo.server"
);
const { createAssetFromUrl } = await import("../src/lib/mux.server");

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const limitIdx = argv.indexOf("--limit");
const limit = limitIdx >= 0 ? Number(argv[limitIdx + 1]) : Infinity;
const STORAGE_RATE = Number(process.env.MUX_STORAGE_RATE_PER_MIN_MONTH || "0.003");

function sb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const supabase = sb();
  console.log("Listing Vimeo videos…");
  const videos = await listAllVideos();
  console.log(`Found ${videos.length} Vimeo videos.${Number.isFinite(limit) ? ` Processing up to ${limit}.` : ""}`);

  // Whole-archive totals for the cost estimate (independent of --limit).
  const totalArchiveDurationSec = videos.reduce((a, v) => a + (v.duration ?? 0), 0);

  let processed = 0;
  let created = 0;
  let withTranscript = 0;
  const targets = Number.isFinite(limit) ? videos.slice(0, limit) : videos;

  for (const v of targets) {
    const id = vimeoIdFromUri(v.uri);
    processed++;

    // Skip if already imported.
    const { data: existing } = await supabase
      .from("video_archive")
      .select("id")
      .eq("source", "vimeo")
      .eq("source_video_id", id)
      .maybeSingle();
    if (existing) {
      console.log(`• ${id} "${v.name ?? ""}" — already imported, skipping`);
      continue;
    }

    const best = pickBestDownload(v.download);
    let transcriptText: string | null = null;
    let transcriptSource: string | null = null;
    try {
      const t = await getTranscriptVtt(id);
      if (t) {
        transcriptText = vttToPlainText(t.vtt);
        transcriptSource = "vimeo";
        withTranscript++;
      }
    } catch {
      /* transcript optional */
    }

    let muxAssetId: string | null = null;
    let muxPlaybackId: string | null = null;
    let notes: string | null = null;

    if (!best) {
      notes = "No downloadable source file (check video_files scope / video privacy).";
    } else if (!dryRun) {
      try {
        const asset = await createAssetFromUrl(best.link);
        muxAssetId = asset.id;
        muxPlaybackId = asset.playback_ids?.[0]?.id ?? null;
      } catch (e) {
        notes = `Mux create failed: ${(e as Error).message}`;
      }
    }

    if (!dryRun) {
      const row = {
        source: "vimeo",
        source_video_id: id,
        title: v.name ?? null,
        description: v.description ?? null,
        duration_sec: v.duration ?? null,
        created_at_source: v.created_time ?? null,
        mux_asset_id: muxAssetId,
        mux_playback_id: muxPlaybackId,
        transcript_text: transcriptText,
        transcript_source: transcriptSource,
        status: transcriptText ? "transcribed" : "imported",
        notes,
      };
      const { error } = await supabase.from("video_archive").insert(row);
      if (error) {
        console.error(`• ${id} insert failed: ${error.message}`);
      } else {
        created++;
        console.log(`• ${id} "${v.name ?? ""}" — ${muxAssetId ? `mux ${muxAssetId}` : "no mux"}${transcriptText ? " +transcript" : ""}${notes ? ` (${notes})` : ""}`);
      }
    } else {
      console.log(`• ${id} "${v.name ?? ""}" — DRY: best=${best ? best.quality || "n/a" : "none"}${transcriptText ? " +transcript" : ""}`);
    }

    await sleep(1000); // throttle both APIs
  }

  const totalMin = totalArchiveDurationSec / 60;
  const monthlyCost = totalMin * STORAGE_RATE;
  console.log("\n=== SUMMARY ===");
  console.log(`Vimeo videos total:      ${videos.length}`);
  console.log(`Processed this run:      ${processed}`);
  console.log(`Rows created:            ${created}${dryRun ? " (dry-run: 0)" : ""}`);
  console.log(`With transcript:         ${withTranscript}`);
  console.log(`Whole-archive duration:  ${totalMin.toFixed(1)} min (${(totalMin / 60).toFixed(1)} hr) over ${videos.length} videos`);
  console.log(`Est. Mux storage cost:   $${monthlyCost.toFixed(2)}/mo  (@ $${STORAGE_RATE}/min/mo — adjust MUX_STORAGE_RATE_PER_MIN_MONTH)`);
  console.log("Note: storage only; Mux encoding is one-time and delivery is billed per minute streamed.");
}

main().catch((e) => {
  console.error("vimeo-to-mux failed:", (e as Error).message);
  process.exit(1);
});
