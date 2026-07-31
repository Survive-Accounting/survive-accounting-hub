# Render worker (Fly.io)

A tiny Bun + ffmpeg service that renders the CEQ publish stitch (and, next, the
reversed-tail brand intro and music bed) server-side. The app talks to it via
`src/lib/render-worker.functions.ts`; when its env vars are unset the app falls
back to the legacy Mux multi-input concat, so nothing breaks before deploy.

## Why Fly (vs Railway)

- Config is **in the repo** (`fly.toml` + `Dockerfile`) — deploys are `fly deploy`,
  reproducible, and only happen when you run them. Railway's GitHub integration
  wants to redeploy on every push of this hot branch (or needs dashboard-side
  root-dir/branch config to stop it).
- **Exit-when-idle economics**: Fly's proxy auto-stop is OFF (it can't see a
  background ffmpeg and would kill a machine mid-render whenever no HTTP
  connection is open at a check instant). Instead the worker **exits itself**
  after 5 idle minutes with no active jobs; a clean exit stops the machine
  (≈$0 idle) and `auto_start` boots it on the next request. A running render
  can never be interrupted by the platform.
- Secrets are one CLI command.

## Deploy (one-time, ~5 minutes)

```bash
# 1) install flyctl (Windows PowerShell):
#    pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"
fly auth login

# 2) from this directory:
cd worker
fly launch --no-deploy --copy-config --name sa-render-worker   # accepts fly.toml as-is
fly secrets set WORKER_TOKEN=$(openssl rand -hex 32)           # or any long random string
fly deploy

# 3) smoke test:
curl https://sa-render-worker.fly.dev/healthz                  # → { ok: true, ffmpeg: "ffmpeg version ..." }
```

## App env (Vercel → Project → Settings → Environment Variables)

- `RENDER_WORKER_URL` = `https://sa-render-worker.fly.dev`
- `RENDER_WORKER_TOKEN` = the same token you set with `fly secrets set`

Redeploy the app after adding them. The Publish panel's preflight shows a
"Render worker" row: healthy → publishes render on the worker; env unset → the
row notes the legacy Mux fallback; configured-but-unreachable → the combo blocks
(fix the worker or unset the env — never a silent fallback).

## API

- `POST /render` (Bearer auth) — `{ v:1, inputs:[{id,url}], stages:[...], output:{putUrl} }` → `202 { jobId }`
- `GET /jobs/:id` (Bearer auth) — `{ state: queued|downloading|rendering|uploading|done|error, note, error }`
- `GET /healthz` — `{ ok, ffmpeg }`

## Pipeline stages

A job is an ordered list of stages; each consumes named files, emits one file;
the last output is uploaded to the app's signed Supabase URL. Implemented:
`concat` (normalize → splice, configurable crossfade; hard cut at 0). Registered
and queued (fail loud until built): `reversed_tail` (brand intro), `music_bed`.
All tunables live in **`src/config.ts`** — one place.

## Notes

- Jobs are in-memory: if the machine crashes mid-render (OOM, deploy) the app's
  poll gets a 404 and the publish fails loud — re-run it. Platform-initiated
  stops can't happen mid-job (auto-stop is off; the worker only exits itself
  when idle with zero active jobs).
- The app waits up to 60 min per render; the worker's own per-op ceilings
  (5 min/clip download, 45 min/stage, 15 min upload) live in `src/config.ts`.
- Audio is padded/trimmed per clip to its probed duration so the audio
  crossfades land exactly on the video seams (no cumulative lip-sync drift);
  an audio-less clip is spliced as silence rather than failing the render.
- ffmpeg filter chains are planned in `src/stages.ts` (pure, unit-tested from
  the repo root by `bun test`).
