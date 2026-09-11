// POST-PRODUCTION — everything between "the take is finished" and "it's posted", in order.
//
// Lee, 2026-09-09: "Where do I upload the video file? Where can I add captions? I want to do this
// from the post point. It's post-filming / post production to me. So somewhere in /post. Explain
// how this process can work and in the most streamlined way. I'm a bit confused the order of
// operations once I have a finished video file."
//
// He was right to be confused: the caption copy lived on the row, the cover lived in another
// sheet, and the subtitles lived in a command line on a machine he doesn't post from. Three
// tools, no line. This is the line.
//
// THE TAKE IS PICKED ONCE, AT THE TOP. Every step reads that same File — the transcript strips
// ~2MB of audio out of it locally, the cover grabs a frame out of it locally — and, since he
// asked ("I actually don't have the video file on this computer… Can we add a way for me to
// upload the file in the web app?"), the bytes also go up to canvas-media in the background so
// the renderer can reach them. Direct to storage with a signed upload: a 400MB file never
// passes through Vercel.
//
// A BROWSER CANNOT RE-ENCODE a 300MB video, and Lee posts from a laptop with no repo, no ffmpeg
// and no font — so the burn runs on the Fly worker (sa-render-worker), which already has ffmpeg
// and already re-encodes his video. All the intelligence still happens here: the cards, the
// karaoke timings and the rail geometry are written into the .ass by lib/captions.ts, the same
// file the CLI uses, so the server burn and the local one produce the same picture. Step 3 keeps
// the .srt and the ffmpeg command folded away underneath as the fallback.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { TakeFrame } from "@/components/v3/TakeFrame";
import { downloadText, storedTranscript, transcribeTakeFile } from "@/components/v3/take-transcript";
import { assName, burnCommand, burnedName, shortCaptionFiles, srtName, transcriptFromWords, whisperCostUsd, type Word } from "@/lib/short-captions";
// Imported up front (2026-09-11), not on demand: a deploy mid-session 404'd the lazy chunk.
import { burnCaptions, downloadUrlAs, uploadAss, uploadTake, type BurnProgress } from "@/components/v3/take-burn";
import { takeFileProblem } from "@/lib/take-frame";
import { copyToClipboard } from "@/lib/copy-to-clipboard";

const MINT = "#3BF5A0";

/** Where Rubik Black has to be for libass to find it. The CLI downloads its own copy; on a
 *  laptop with no repo, installing the font for the user is the one-time step. */
const FONT_URL = "https://github.com/googlefonts/rubik/raw/main/fonts/ttf/Rubik-Black.ttf";

const small: React.CSSProperties = { font: "inherit", fontSize: 11.5, fontWeight: 700, padding: "5px 11px", borderRadius: 8, border: `1px solid ${V3_EDGE}`, background: "transparent", color: V3_CREAM, cursor: "pointer", whiteSpace: "nowrap" };
const primary: React.CSSProperties = { ...small, fontSize: 12.5, padding: "7px 14px", border: `1.5px solid ${V3_GOLD}`, background: "rgba(252,163,17,0.12)" };

/** One numbered step. Open by default until it's done, then it folds itself away — the panel
 *  should read as a checklist that shortens, not a wall. */
function Step({ n, title, hint, done, children }: {
  n: number; title: string; hint?: string; done?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  useEffect(() => { if (done) setOpen(false); }, [done]);
  return (
    <section style={{ border: `1px solid ${done ? `${MINT}44` : V3_EDGE}`, borderRadius: 12, padding: "11px 14px", marginTop: 10 }}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "baseline", gap: 9, width: "100%" }}>
        <span style={{ fontSize: 11, fontWeight: 900, color: done ? MINT : V3_GOLD, fontVariantNumeric: "tabular-nums" }}>{done ? "✓" : n}</span>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: V3_CREAM }}>{title}</span>
        {hint && <span style={{ fontSize: 11.5, color: V3_MUTED }}>{hint}</span>}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: V3_MUTED }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && <div style={{ marginTop: 10 }}>{children}</div>}
    </section>
  );
}

export function PostProduction({ pubKey, title, topicName, defaultHookLine, onTranscript, onOpenCopy, onClose, hidden = false, copyDone = false }: {
  /** The publish key for THIS video — the set's id, or "<setId>#N" for a split. */
  pubKey: string;
  /** What this video is called: the set's name, or the split's. */
  title: string;
  topicName: string;
  /** This video's first question — the cover's default hook. */
  defaultHookLine: string;
  /** Handed up so the caption sheet writes from what he actually said on camera. */
  onTranscript: (text: string) => void;
  /** Opens step 4 — the caption sheet, seeded with the transcript. */
  onOpenCopy: () => void;
  onClose: () => void;
  /** ONE MODAL AT A TIME (2026-09-09). While the caption sheet is up, the panel steps aside —
   *  but stays mounted, because the picked take, its upload and the burned file are all state
   *  in here, and unmounting to make room for the sheet would throw a 300MB upload away. The
   *  route flips this back off when the sheet closes and the panel is where he left it. */
  hidden?: boolean;
  /** Step 4 is done when the captions are saved on the row — the route knows, this doesn't. */
  copyDone?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [words, setWords] = useState<Word[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // A transcript already run for this video comes straight back — it is stored by publish key,
  // so re-opening the panel is free and never re-bills.
  useEffect(() => {
    let alive = true;
    storedTranscript(pubKey)
      .then((row) => { if (alive && row?.words?.length) { setWords(row.words); setNote("Transcribed earlier — reusing it."); } })
      .catch(() => { /* no row, or the table isn't there — step 2 will say so when he asks */ });
    return () => { alive = false; };
  }, [pubKey]);

  const text = useMemo(() => (words ? transcriptFromWords(words) : ""), [words]);
  useEffect(() => { if (text) onTranscript(text); }, [text, onTranscript]);
  const files = useMemo(() => (words ? shortCaptionFiles(words) : null), [words]);

  const run = useCallback(async (force: boolean) => {
    if (!file) { setErr("Pick the take first."); return; }
    setBusy(true); setErr(null);
    try {
      const row = await transcribeTakeFile(pubKey, file, setNote, force);
      setWords(row.words ?? []);
      setNote(`${(row.words ?? []).length} words${row.duration_s ? ` from ${Math.round(row.duration_s)}s` : ""}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setNote(null);
    } finally { setBusy(false); }
  }, [file, pubKey]);

  const cmd = file ? burnCommand(file.name) : "";
  const copyCmd = async () => { setCopied(await copyToClipboard(cmd)); window.setTimeout(() => setCopied(false), 1800); };

  // THE UPLOAD. Starts the moment he picks the take and runs in the background while he does
  // step 2 — by the time the transcript is back the bytes are usually already there. Direct to
  // storage, so a 400MB file is not a body-limit problem.
  const [upFrac, setUpFrac] = useState<number | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [upErr, setUpErr] = useState<string | null>(null);

  const pick = (picked: File | null) => {
    const problem = takeFileProblem(picked);
    if (problem || !picked) { setErr(problem); return; }
    setErr(null); setFile(picked);
    setVideoUrl(null); setUpErr(null); setUpFrac(0);
    void (async () => {
      try {
        setVideoUrl(await uploadTake(picked, setUpFrac));
        setUpFrac(1);
      } catch (e) {
        setUpErr(e instanceof Error ? e.message : String(e));
        setUpFrac(null);
      }
    })();
  };

  // THE BURN, on the Fly worker — because he posts from a laptop with no ffmpeg.
  const [burning, setBurning] = useState<BurnProgress | null>(null);
  const [burnUrl, setBurnUrl] = useState<string | null>(null);
  const [burnErr, setBurnErr] = useState<string | null>(null);

  const burn = useCallback(async () => {
    if (!file || !files || !videoUrl) return;
    setBurning({ phase: "uploading", frac: null, note: "Sending the subtitles…" });
    setBurnErr(null); setBurnUrl(null);
    try {
      const assUrl = await uploadAss(file.name, files.ass);
      setBurnUrl(await burnCaptions(videoUrl, assUrl, setBurning));
    } catch (e) {
      setBurnErr(e instanceof Error ? e.message : String(e));
      setBurning(null);
    }
  }, [file, files, videoUrl]);

  const saveBurned = async () => {
    if (!burnUrl || !file) return;
    try {
      await downloadUrlAs(burnUrl, burnedName(file.name));
    } catch (e) { setBurnErr(e instanceof Error ? e.message : String(e)); }
  };

  // ESCAPE CLOSES — the same capture-phase handler the caption sheet has (routes/v3.post.tsx),
  // and off while the sheet is up so one Escape closes one modal, not both.
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    if (hidden) return;
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeRef.current(); } };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [hidden]);

  if (hidden) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label={`Post-production — ${title}`} onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 2147482800, background: "rgba(5,8,16,0.62)", display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 820, maxHeight: "92vh", overflowY: "auto", background: "#0B0F1E", color: V3_CREAM, border: `1px solid ${V3_GOLD}66`, borderRadius: 16, padding: 18, boxShadow: "0 24px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontFamily: V3_DISPLAY, fontSize: 20, fontWeight: 900, letterSpacing: "-0.01em" }}>Post-production</div>
          <div style={{ fontSize: 12.5, color: V3_MUTED }}>{title} · {topicName}</div>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={{ ...small, color: V3_MUTED }}>close</button>
        </div>
        {/* HONEST about where the bytes go (2026-09-09): the take DOES upload now — that is
            what lets the worker burn it — so the old "never uploads" line was a lie the moment
            the upload shipped. Three clauses, one per thing that moves. */}
        <div style={{ marginTop: 8, fontSize: 12.5, color: V3_MUTED, lineHeight: 1.5 }}>
          The take goes to our storage so the renderer can reach it; the transcript sends about 2 MB of audio; the cover is read on this machine.
        </div>

        {err && <div style={{ marginTop: 10, fontSize: 12.5, color: "#FF8B7E" }}>{err}</div>}

        {/* ── 1 ─────────────────────────────────────────────────────────────────────────────── */}
        <Step n={1} title="The take" hint={file ? file.name : "the finished .mp4 from OBS"} done={!!videoUrl}>
          <div style={{ fontSize: 12.5, color: V3_MUTED, lineHeight: 1.5 }}>
            Pick it from whichever machine you're on — the name doesn't matter, it reads whatever
            OBS wrote. It uploads in the background while you do step 2.
          </div>
          <label style={{ ...primary, display: "inline-block", marginTop: 8, color: V3_GOLD }}>
            {file ? "Pick a different take" : "Pick the take file"}
            <input type="file" accept="video/*,.mp4,.mov,.m4v,.webm" onChange={(e) => pick(e.target.files?.[0] ?? null)} style={{ display: "none" }} />
          </label>
          {file && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: V3_MUTED }}>
              {file.size < 1048576 ? "<1MB" : `${(file.size / 1048576).toFixed(0)}MB`} ·{" "}
              {upErr ? <span style={{ color: "#FF8B7E" }}>upload failed — {upErr}</span>
                : videoUrl ? <span style={{ color: MINT }}>uploaded</span>
                : <span style={{ color: V3_GOLD }}>uploading… {upFrac != null ? `${Math.round(upFrac * 100)}%` : ""}</span>}
            </div>
          )}
          {file && !videoUrl && !upErr && (
            <div style={{ marginTop: 6, height: 4, borderRadius: 3, background: "rgba(244,239,230,0.10)", overflow: "hidden" }}>
              <div style={{ width: `${Math.round((upFrac ?? 0) * 100)}%`, height: "100%", background: V3_GOLD, transition: "width 200ms linear" }} />
            </div>
          )}
        </Step>

        {/* ── 2 ─────────────────────────────────────────────────────────────────────────────── */}
        <Step n={2} title="The transcript" hint={words ? `${words.length} words` : "what you actually said"} done={!!words?.length}>
          <div style={{ fontSize: 12.5, color: V3_MUTED, lineHeight: 1.5 }}>
            The audio alone goes out — about 2MB a minute, well under Whisper's cap — and the words
            come back timed. Everything below is written from them.
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" disabled={!file || busy} onClick={() => void run(false)} style={{ ...primary, opacity: !file || busy ? 0.5 : 1 }}>
              {busy ? "Working…" : words ? "Transcribed" : "Get the transcript"}
            </button>
            {words && !busy && <button type="button" onClick={() => void run(true)} style={small} title="Run Whisper again and overwrite the stored words">re-run</button>}
            <span style={{ fontSize: 11.5, color: V3_MUTED }}>~${whisperCostUsd(files?.seconds || 180).toFixed(3)}</span>
            {note && <span style={{ fontSize: 11.5, color: busy ? V3_GOLD : MINT }}>{note}</span>}
          </div>
          {text && (
            <textarea readOnly value={text} rows={4}
              style={{ width: "100%", boxSizing: "border-box", font: "inherit", fontSize: 12, lineHeight: 1.5, marginTop: 8, padding: "7px 10px", borderRadius: 8, border: `1px solid ${V3_EDGE}`, background: "rgba(244,239,230,0.05)", color: V3_CREAM, outline: "none", resize: "vertical" }} />
          )}
        </Step>

        {/* ── 3 ─────────────────────────────────────────────────────────────────────────────── */}
        <Step n={3} title="Burn the captions in" hint={burnUrl ? "ready to download" : files ? `${files.cards} cards` : "needs the transcript"} done={!!burnUrl}>
          {!files || !file ? (
            <div style={{ fontSize: 12.5, color: V3_MUTED }}>Do steps 1 and 2 first.</div>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: V3_MUTED, lineHeight: 1.5 }}>
                Rubik Black, the spoken word in gold, sitting in the same rail Review reserves. The
                render happens on our own server — nothing to install here — and hands back{" "}
                <b style={{ color: V3_CREAM }}>{burnedName(file.name)}</b> with your original untouched.
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  disabled={!videoUrl || (!!burning && !burnUrl)}
                  onClick={() => void burn()}
                  style={{ ...primary, opacity: !videoUrl || (!!burning && !burnUrl) ? 0.5 : 1 }}
                >
                  {burning && !burnUrl ? "Burning…" : burnUrl ? "Burn it again" : "Burn the captions in"}
                </button>
                {burnUrl && (
                  <button type="button" onClick={() => void saveBurned()} style={{ ...primary, border: `1.5px solid ${MINT}`, background: "rgba(59,245,160,0.12)", color: V3_CREAM }}>
                    Download {burnedName(file.name)}
                  </button>
                )}
                {!videoUrl && !upErr && <span style={{ fontSize: 11.5, color: V3_MUTED }}>waiting for the upload to finish…</span>}
                {burning && !burnUrl && <span style={{ fontSize: 11.5, color: V3_GOLD }}>{burning.note}</span>}
                {burnErr && <span style={{ fontSize: 12, color: "#FF8B7E" }}>{burnErr}</span>}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: V3_MUTED }}>
                A three-minute short takes a few minutes; the renderer sleeps when idle, so the
                first few seconds are it waking up.
              </div>

              {/* THE SIDECAR, and the command — for the times the renderer is down, or he wants the
                  plain caption track on YouTube instead of pixels. Folded away by default: this is
                  the fallback, not the path. */}
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontSize: 11.5, color: V3_MUTED }}>Or do it yourself — the .srt, or ffmpeg on this machine</summary>
                <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => downloadText(srtName(file.name), files.srt, "application/x-subrip")} style={small} title="YouTube reads this as a caption track on upload — no burning">Save the .srt</button>
                  <button type="button" onClick={() => downloadText(assName(file.name), files.ass)} style={small}>Save the .ass</button>
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: V3_MUTED }}>With both files beside the take, in that folder:</div>
                <pre style={{ margin: "5px 0 0", padding: "9px 11px", borderRadius: 8, border: `1px solid ${V3_EDGE}`, background: "rgba(244,239,230,0.05)", color: V3_CREAM, fontSize: 11, lineHeight: 1.5, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{cmd}</pre>
                <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button type="button" onClick={() => void copyCmd()} style={{ ...small, color: copied ? MINT : V3_CREAM }}>{copied ? "copied" : "Copy the command"}</button>
                  <span style={{ fontSize: 11, color: V3_MUTED }}>
                    Needs <code style={{ color: V3_CREAM }}>winget install Gyan.FFmpeg</code> and{" "}
                    <a href={FONT_URL} style={{ color: V3_GOLD }}>Rubik Black</a> installed.
                  </span>
                </div>
              </details>
            </>
          )}
        </Step>

        {/* ── 4 ─────────────────────────────────────────────────────────────────────────────── */}
        <Step n={4} title="The copy" hint={copyDone ? "saved on the row" : "title, description, hashtags"} done={copyDone}>
          <div style={{ fontSize: 12.5, color: V3_MUTED, lineHeight: 1.5 }}>
            {text
              ? "Written from the transcript — what you said on camera outranks everything else. Talk over it if you want to steer the angle."
              : "Get the transcript first and this writes itself from it; without one it falls back to your kept prompter lines."}
          </div>
          <button type="button" onClick={onOpenCopy} style={{ ...primary, marginTop: 8 }}>Write the copy</button>
        </Step>

        {/* ── 5 ─────────────────────────────────────────────────────────────────────────────── */}
        <Step n={5} title="The cover" hint="a frame of the take, or the card">
          {/* The picker inside the frame picker is the SAME door as step 1's: a take chosen here
              starts the upload too. It used to be plain setFile, so a take picked at step 5 never
              went up and Burn waited on an upload that had never started. */}
          <TakeFrame name={title} file={file} onFile={pick} />
          <div style={{ marginTop: 10, fontSize: 11.5, color: V3_MUTED }}>
            Prefer the drawn card? Its hook is{" "}
            <b style={{ color: V3_CREAM }}>{defaultHookLine ? `"${defaultHookLine.slice(0, 60)}"` : "this video's first question"}</b> — the 🖼 button on the row.
          </div>
        </Step>

        {/* ── 6 ─────────────────────────────────────────────────────────────────────────────── */}
        <Step n={6} title="Post it" hint="by hand, then tick it off">
          <div style={{ fontSize: 12.5, color: V3_MUTED, lineHeight: 1.6 }}>
            Upload <b style={{ color: V3_CREAM }}>{file ? burnedName(file.name) : "the captioned file"}</b> — the one step 3 gave you — to YouTube, Instagram and
            TikTok yourself, pasting the copy from step 4 and the cover from step 5. Then close this
            and tick each destination on the row — that's what the queue counts.
          </div>
        </Step>
      </div>
    </div>
  );
}
