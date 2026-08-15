// OBS BRIDGE (T1) — obs-websocket v5, straight from the browser.
//
// VERIFIED 2026-08-15 against the live https origin: ws://localhost IS
// permitted (localhost is potentially-trustworthy, so mixed-content blocking
// doesn't apply — a probe logged a plain connection failure, identical to a
// dead control port, NOT Chrome's "Mixed Content … blocked"). Nothing here
// depends on that holding forever: every consumer degrades to the folder scan.
//
// Handshake (v5): server Hello(op 0) → we Identify(op 1) with rpcVersion 1 and,
// when auth is on, base64(sha256(base64(sha256(password+salt)) + challenge)) →
// server Identified(op 2). Events arrive as op 5; we care about
// RecordStateChanged (outputActive + outputPath).
//
// This module owns NO React and NO UI — the hook layer wraps it.

export const OBS_DEFAULT_ADDRESS = "ws://localhost:4455";

/** obs-websocket v5 auth string. Pure (given crypto.subtle) — known-answer tested. */
export async function obsAuthString(password: string, salt: string, challenge: string): Promise<string> {
  const sha256b64 = async (s: string): Promise<string> => {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    let bin = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  };
  const secret = await sha256b64(password + salt);
  return sha256b64(secret + challenge);
}

export type ObsRecordEvent =
  | { kind: "started" }
  | { kind: "stopped"; path?: string }
  | { kind: "other" };

/** Read a RecordStateChanged payload. OBS reports the final file path on STOP
 *  (the STOPPING tick has no path yet — treated as "other" so we never bank a
 *  take twice). Pure. */
export function parseRecordEvent(msg: unknown): ObsRecordEvent {
  const m = msg as { op?: number; d?: { eventType?: string; eventData?: { outputActive?: boolean; outputState?: string; outputPath?: string } } } | null;
  if (!m || m.op !== 5 || m.d?.eventType !== "RecordStateChanged") return { kind: "other" };
  const d = m.d.eventData ?? {};
  const state = String(d.outputState ?? "");
  if (state === "OBS_WEBSOCKET_OUTPUT_STARTED" || (d.outputActive === true && state !== "OBS_WEBSOCKET_OUTPUT_STARTING")) return { kind: "started" };
  if (state === "OBS_WEBSOCKET_OUTPUT_STOPPED") return { kind: "stopped", path: d.outputPath };
  return { kind: "other" };
}

/** The basename of an OBS output path (Windows or POSIX separators). */
export const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p;

export type ObsStatus = "off" | "connecting" | "connected" | "error";

export interface ObsBridgeHandlers {
  onStatus: (s: ObsStatus, detail?: string) => void;
  onRecord: (e: ObsRecordEvent) => void;
}

/** Connect and stay connected (auto-retry with backoff). Returns a disposer.
 *  Never throws into the caller — status flows through onStatus. */
export function connectObs(address: string, password: string, h: ObsBridgeHandlers): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry = 0;
  let timer: number | undefined;

  const open = () => {
    if (closed) return;
    h.onStatus("connecting");
    let sock: WebSocket;
    try { sock = new WebSocket(address); } catch (e) { h.onStatus("error", e instanceof Error ? e.message : String(e)); schedule(); return; }
    ws = sock;
    sock.onmessage = async (ev) => {
      let msg: { op?: number; d?: Record<string, unknown> };
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      if (msg.op === 0) {
        // Hello → Identify. `authentication` present ⇒ the server wants the challenge.
        const auth = msg.d?.authentication as { challenge?: string; salt?: string } | undefined;
        const identify: Record<string, unknown> = { rpcVersion: 1 };
        if (auth?.challenge && auth?.salt) {
          if (!password) { h.onStatus("error", "OBS requires a password — set it in the OBS panel."); try { sock.close(); } catch { /* ignore */ } return; }
          identify.authentication = await obsAuthString(password, auth.salt, auth.challenge);
        }
        sock.send(JSON.stringify({ op: 1, d: identify }));
        return;
      }
      if (msg.op === 2) { retry = 0; h.onStatus("connected"); return; }
      const rec = parseRecordEvent(msg);
      if (rec.kind !== "other") h.onRecord(rec);
    };
    sock.onerror = () => { h.onStatus("error", "connection failed — is OBS running with Tools ▸ WebSocket Server enabled?"); };
    sock.onclose = () => { if (!closed) { h.onStatus("off"); schedule(); } };
  };
  const schedule = () => {
    if (closed) return;
    const wait = Math.min(30_000, 1500 * 2 ** Math.min(retry++, 4));
    timer = window.setTimeout(open, wait);
  };

  open();
  return () => {
    closed = true;
    if (timer != null) window.clearTimeout(timer);
    try { ws?.close(); } catch { /* ignore */ }
  };
}
