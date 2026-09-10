# OBS wiring — what Lee sets once, and what the app already proves

The runbook for filming into this app with OBS on the laptop. Everything here is read off the code
that exists on 2026-09-09 (`film/free-camera-pinned-ceq` = `origin/main`); the `file:line` cites are
where each rule is enforced. The V3 side of this (record-stop → Keep / Try again / Scratch → the
hopper) is designed but not built: `docs/DESIGN-OBS-KEEP-LOOP.md`.

Two worlds share one wiring:

- **Canvas studio** (`/study/canvas`, 16:9 lessons) — the loop is live today: `TakesInbox` drawer.
- **V3 Blast Off** (`/v3/…/film`, 9:16 shorts) — F4 rolls the cold open today; the socket, the
  decision and the hopper are the design.

---

## 1. OBS: the WebSocket server

OBS ▸ **Tools ▸ WebSocket Server Settings**

| Setting | Value | Why |
| --- | --- | --- |
| Enable WebSocket server | on | `connectObs` dials it (`src/components/canvas/obs-bridge.ts:74`) |
| Server port | **4455** | the app's default is `ws://localhost:4455` (`obs-bridge.ts:16`) |
| Enable authentication | on, with a password | the client does the v5 challenge (`obs-bridge.ts:19-29`, known-answer tested) |
| Show Connect Info | copy the password from here | the 4009 message tells you to (`obs-bridge.ts:58`) |

Paste the address and password into the app's OBS panel — canvas: the `OBS ○` chip in the Takes inbox
(`TakesInbox.tsx:319-338`); V3, once built: the same chip in the `/film` chrome. They are stored in the
browser as `sa-obs-addr` / `sa-obs-pass` / `sa-obs-on` (`TakesInbox.tsx:82-84`) and both surfaces read the
same three keys, so you type them once per browser.

**OBS 28 or newer** — obs-websocket v5 ships inside OBS from 28; older builds answer with close code
4011 and the app says so (`obs-bridge.ts:60`).

**`ws://localhost` from the https site works.** Verified against the live origin 2026-08-15: localhost is
"potentially trustworthy", so Chrome's mixed-content block does not apply (`obs-bridge.ts:3-7`). No
`wss://`, no certificate. If it ever stops working the symptom is close code 1006, and every consumer
degrades to a manual folder scan.

Connect / Disconnect / Retry are the only things that re-dial. Typing in the password box does not tear
the socket down mid-keystroke (`TakesInbox.tsx:100-102`); press Connect (or Retry) after editing it.

## 2. What the close codes mean (straight from `closeDiagnosis`, `obs-bridge.ts:56-65`)

| Code | The app says | Retries? | Fix |
| --- | --- | --- | --- |
| 4009 | WRONG PASSWORD — copy it from OBS ▸ Tools ▸ WebSocket Server Settings ▸ Show Connect Info | no (terminal) | paste the right one, Connect |
| 4008 | OBS rejected the handshake (session invalid) — reconnect after restarting OBS's WebSocket server | no | toggle the server off/on in OBS, Retry |
| 4011 | Unsupported RPC version — update OBS to 28+ (obs-websocket v5) | no | update OBS |
| 4010 | OBS wants a password but none was given — paste it above | no | paste it, Connect |
| 1006 | Couldn't reach OBS — check it's running, the WebSocket server is ENABLED, and the port matches | yes, backoff 1.5 s → 3 → 6 → 12 → 24 → 30 s cap (`:117`) | start OBS / enable the server / fix the port |
| other | `closed (<code>): <reason>` | yes | read the code |

"retrying in Ns…" in the panel is the backoff, not an error of its own (`:118`). A terminal code stops
the retry loop for good (`:111`) — Retry re-dials by hand.

## 3. The recordings folder — grant it once, and it must be OBS's output folder

OBS ▸ **Settings ▸ Output ▸ Recording ▸ Recording Path**: note the folder.

In the app press **Grant folder** (canvas: `TakesInbox.tsx:341`; V3: the `/film` chrome, or inside the
Keep decision) and pick **that same folder**. The browser remembers the handle in IndexedDB
(`takes-folder.ts:28-34`, id `sa-obs-takes`) and re-checks the permission silently on every load
(`:37-42`). Chrome may still ask once per browser session; that is the "Folder ✓" button turning back
into "Grant folder" — click it, no retyping.

**Why it must be the OBS folder.** On record-stop OBS reports the full path of the file it wrote; the
browser cannot open a path, so the app takes the **basename** and looks for it **inside the granted
folder** (`TakesInbox.tsx:171-177`, `obs-bridge.ts:50`). A different folder finds nothing and the panel
says `Recorded "<name>" — grant the folder to see it here.` The V3 design adds the directory-name
comparison so the message names both folders (`dirName`, design §2).

**The scan is on demand, not a watcher.** After STOPPED the app scans at 400 / 1200 / 2500 ms because
OBS finalises the file just after the event (`TakesInbox.tsx:173`). A file still locked by OBS is skipped
and picked up by the next scan (`takes-folder.ts:58`). The **Scan** button works with OBS disconnected.

**`_trash` is the bin.** The app never deletes. Trash / Scratch / Try again MOVE the file into
`<recordings>/_trash/` (`takes-folder.ts:77-89`, a real `move()`), Restore moves it back (`:92-104`), and
Lee empties `_trash` from Explorer. `takes-inbox.test.ts:77-85` counts the delete sites in the codebase and
fails if a third one appears.

**Grant it read-write.** The picker asks for `readwrite` (`takes-folder.ts:31`) because the move needs it.

## 4. Recording format

Set OBS ▸ Settings ▸ Output ▸ Recording Format to **MP4** (on OBS 30+ pick **Hybrid MP4**, which is
crash-safe like MKV). Reasons, all in code:

- the cover grab refuses `.mkv` — "Chrome can't play .mkv — remux to .mp4 first" (`src/lib/take-frame.ts:69`);
- the local transcript decodes the take's audio in the browser (`transcribe-audio.ts:26-38`); MP4/AAC is
  the container Chrome is known to decode here;
- the burn on the Fly worker is ffmpeg and handles either (`worker/src/server.ts`), so an MKV take still
  burns — it just loses the cover and the local transcript.

If you must record MKV, OBS ▸ File ▸ Remux Recordings turns one into MP4 without re-encoding.

## 5. Hotkeys — who owns which key

OBS's global hotkeys ride a low-level hook that **does not swallow the key**: the focused browser window
sees the same press (`BlastOffCapture.tsx:392-394`, `:496-501`). The app never binds OBS's own hotkeys;
these are yours to set in OBS ▸ Settings ▸ Hotkeys.

| World | Key | Owner | Does |
| --- | --- | --- | --- |
| canvas | **F9** | OBS (your binding) | start / stop recording |
| canvas | **F10** | app, window focused | Keep the latest pending take (`CeqPreviewer.tsx:2639-2640`, `:2685`) |
| canvas | **F8** | app, window focused | Trash it to `_trash` |
| canvas | **F7** | app | idea bank (moved off F8 so it never fights triage — `takes-inbox.test.ts:90-93`) |
| V3 | **F4** | OBS (your binding) + app | start / stop recording, and ROLL the cold open in whichever window has focus (`BlastOffCapture.tsx:502-507`). Design: the socket rolls it too, so it works with OBS focused |
| V3 (design) | **F10 / T / F8 / Esc** | app, main window | Keep / Try again / Scratch / leave pending on the record-stop decision |

The app's keys need the **browser window** focused (unlike OBS's global keys) — `TakesInbox.tsx:346`
says so on the panel. F10 is also Chrome's "focus the menu bar"; the app `preventDefault`s it.

## 6. The shot: what may and may not be on screen

- **Nothing status-like where OBS captures.** The canvas gates every chip, dot and countdown on
  `!recording` and renders them outside the film portal (`TakesInbox.tsx:3-7`); the V3 pop-out's client
  area IS the capture (`capture/popout.ts:18-22`), so the countdown digits draw in the **main** window
  only (`prompter-sync.ts:44-48`), and the OBS chip / decision modal are main-window only by design.
- **Capture Cursor: OFF** on the OBS window-capture source, or OBS composites the OS arrow on top of the
  drawn bolt cursor (`docs/PIPELINE-FILMING-CONTEXT.md` §5).
- **V3 capture size.** Pop out the 9:16 window (`⧉`); it snaps its client area to 1080×1920 physical
  pixels or reports the tallest exact 9:16 that fits and what to set OBS's scale to
  (`capture/popout.ts:56-64`). Window-capture that window; do not crop.
- **Audio stays OBS's** (the mic source). The in-app webcam adds 60–120 ms; set the mic's sync offset
  once in OBS ▸ Advanced Audio Properties after a clap test (`docs/V3-PRODUCTION-HANDOFF.md:641`).

## 7. What the panel's messages mean (canvas today; V3 will reuse the wording)

| Message | Meaning |
| --- | --- |
| `Take banked` / `Take banked → armed target` | the STOPPED file was found on the ladder and is Pending |
| `Recorded "<name>" — grant the folder to see it here.` | OBS said it wrote `<name>` but the granted folder does not contain it (wrong folder, or not granted) |
| `Recording stopped.` | STOPPED arrived with no path — an OBS build that does not report `outputPath`; press Scan |
| `Kept — folder not granted, upload deferred.` | the record is kept but the bytes cannot be read; grant, then retry from the row |
| `Upload FAILED: … over the Supabase upload limit …` | raise Storage ▸ Settings ▸ Upload file size limit and the `canvas-media` bucket's `file_size_limit` (`ceq-takes.ts:77-80`); the local file is untouched |
| `Moved to Recycle — restore any time.` | the file is in `_trash` |
| `N rows cleared — the file is no longer in the folder.` | a full Scan pruned rows whose file you deleted in Explorer (`takes-store.ts:104-115`) |

## 8. Server-side env the loop needs (Vercel; not inspectable from the repo)

| Var | Used by | Missing ⇒ |
| --- | --- | --- |
| `OPENAI_WHISPER` (or `OPENAI_API_KEY`) | `src/lib/transcribe.functions.ts:61-62` | transcription throws "no OpenAI key on the server" |
| `RENDER_WORKER_URL` + `RENDER_WORKER_TOKEN` (both, or neither) | `src/lib/render-worker.functions.ts:17-23` | the caption burn refuses; half-set is a hard block, not a fallback |
| `WHISPER_MODEL` (optional) | `transcribe.functions.ts:63` | defaults to `whisper-1` |

The Fly worker sleeps after 5 minutes idle and wakes on the first request (`worker/src/config.ts:85`), so
the first poll of a cold burn sits at "queued" a few seconds longer than feels right.

## 9. A ten-second smoke test at the machine

1. OBS open, WebSocket server enabled, password set. App: Connect → chip goes `●`.
2. Grant the recordings folder → `Folder ✓`.
3. F9 (canvas) / F4 (V3) → talk → F9 / F4 again.
4. Within ~3 s a Pending row (canvas) or the decision (V3, once built) names the file.
5. F10 → upload percent climbs; F8 → the file appears in `_trash` in Explorer.

If step 4 never happens: read the chip's tooltip (the close code), then check the folder is OBS's
Recording Path. Those two cover every failure seen so far.
