// ONE REF NUMBER FOR EVERYONE (server-only — import dynamically from *.functions.ts handlers).
//
// The SMS webhook already gives every student who texts the main line a short_ref, and Lee replies
// to any of them by texting "#241 …" to that same line. Chapter claims, rep applications and phone
// calls had no ref, so Lee could not text them back the same way and every alert needed its own
// set of links. This finds-or-creates the same sms_conversations row for those people, so:
//
//   * the alert carries "#241" and Lee's "#241 hey Jordan" relays with ZERO webhook changes;
//   * the action page is /x/241 for a claim, a rep, a voicemail or a plain text — one link.
//
// Requires migration 20260902_1500 (kind + subject columns). Without it the insert is retried
// bare and the gap is logged LOUDLY — the ref still gets minted, the label just stays empty.
import { ORIGIN } from "@/lib/comms/templates";

type DB = { from: (t: string) => any };

export type ConversationKind = "student" | "claim" | "rep" | "caller";

/** The main line's E.164 number: the campus_phone_numbers row with no campus. The literal
 *  fallback is the number printed across the site, so a missing row degrades to the truth. */
export async function mainLineNumber(db: DB): Promise<string> {
  try {
    const { data } = await db.from("campus_phone_numbers").select("phone_e164").is("campus_id", null).limit(1).maybeSingle();
    if (data?.phone_e164) return data.phone_e164 as string;
  } catch { /* fall through */ }
  return process.env.MAIN_LINE_E164 || "+16625658818";
}

export interface EnsuredRef {
  conversationId: string;
  shortRef: number;
  mainLine: string;
  /** False when the kind/subject columns are missing (migration not applied). */
  labeled: boolean;
  created: boolean;
}

/** Find-or-create the conversation for this phone on the main line and return its ref. `subject`
 *  overwrites the label each time (a claim after a text upgrades the thread's name); `kind` is set
 *  on creation and upgraded from 'student'/'caller' to a richer kind, never downgraded. */
export async function ensureConversationRef(db: DB, i: {
  phone: string; campusId?: string | null; kind: ConversationKind; subject?: string | null; isTest?: boolean;
}): Promise<EnsuredRef | null> {
  const mainLine = await mainLineNumber(db);
  // select("*"), not a column list: naming `kind` here before the migration is applied makes the
  // READ fail, which looked like "no row" and produced a duplicate-key insert on every call.
  const { data: existing, error: readErr } = await db.from("sms_conversations").select("*")
    .eq("student_phone", i.phone).eq("campus_number", mainLine).maybeSingle();
  if (readErr) { console.warn("[refs] conversation lookup failed:", readErr.message); return null; }

  if (existing?.id) {
    const patch: Record<string, unknown> = { last_message_at: new Date().toISOString() };
    if (existing.status !== "opted_out") patch.status = "active";
    if (i.subject) patch.subject = i.subject;
    const weak = !existing.kind || existing.kind === "student" || existing.kind === "caller";
    if (weak && i.kind !== "student") patch.kind = i.kind;
    if (i.campusId) patch.campus_id = i.campusId;
    let { error } = await db.from("sms_conversations").update(patch).eq("id", existing.id);
    let labeled = !error;
    if (error) {
      console.warn(`[refs] label update failed (${error.message}) — retrying without kind/subject. If this names "kind" or "subject", migration 20260902_1500 has not been applied.`);
      delete patch.subject; delete patch.kind;
      ({ error } = await db.from("sms_conversations").update(patch).eq("id", existing.id));
      labeled = false;
    }
    return { conversationId: existing.id as string, shortRef: existing.short_ref as number, mainLine, labeled, created: false };
  }

  // No is_tester here: that column is written by the SMS webhook for tester phones and is not
  // guaranteed to exist (the live schema lacked it on 2026-09-03, which made every insert fail).
  // A test-mode claim is already marked on its own rows; the thread does not need the flag.
  void i.isTest;
  const base: Record<string, unknown> = {
    student_phone: i.phone, campus_number: mainLine, campus_id: i.campusId ?? null, status: "active",
  };
  let { data: created, error } = await db.from("sms_conversations")
    .insert({ ...base, kind: i.kind, subject: i.subject ?? null }).select("id,short_ref").single();
  let labeled = !error;
  if (error) {
    console.warn(`[refs] insert with kind/subject failed (${error.message}) — retrying bare. If this names "kind" or "subject", migration 20260902_1500 has not been applied.`);
    ({ data: created, error } = await db.from("sms_conversations").insert(base).select("id,short_ref").single());
    labeled = false;
  }
  if (error || !created?.id) { console.warn("[refs] could not create conversation:", error?.message); return null; }
  return { conversationId: created.id as string, shortRef: created.short_ref as number, mainLine, labeled, created: true };
}

/** Append a non-SMS event (a call, a voicemail, an outbound call Lee placed) to the thread. Falls
 *  back to a plain body row when the kind/recording columns are missing, and says so. */
export async function logThreadEvent(db: DB, i: {
  conversationId: string; direction: "in" | "out"; author: "student" | "lee" | "auto"; body: string;
  kind: "sms" | "call" | "voicemail"; callSid?: string | null; recordingSid?: string | null; recordingUrl?: string | null;
  durationSeconds?: number | null; transcriptStatus?: string | null;
}): Promise<{ id: string | null; logged: boolean }> {
  const base = { conversation_id: i.conversationId, direction: i.direction, author: i.author, body: i.body };
  const rich = {
    ...base, kind: i.kind, call_sid: i.callSid ?? null, recording_sid: i.recordingSid ?? null,
    recording_url: i.recordingUrl ?? null, duration_seconds: i.durationSeconds ?? null, transcript_status: i.transcriptStatus ?? null,
  };
  let { data, error } = await db.from("sms_messages").insert(rich).select("id").single();
  if (error) {
    console.warn(`[refs] thread event insert failed (${error.message}) — retrying bare. Migration 20260902_1500 missing?`);
    ({ data, error } = await db.from("sms_messages").insert(base).select("id").single());
  }
  if (!error) await db.from("sms_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", i.conversationId).then(() => undefined, () => undefined);
  return { id: (data?.id as string) ?? null, logged: !error };
}

export const actionLink = (ref: number | null | undefined): string | null => (ref == null ? null : `${ORIGIN}/x/${ref}`);
/** The SMS form: no scheme, so it stays short and still taps as a link on every phone. */
export const actionLinkShort = (ref: number | null | undefined): string | null => (ref == null ? null : `surviveaccounting.com/x/${ref}`);

/** "(662) 555-0142" for a US E.164 number; the raw string otherwise. */
export function prettyPhone(e164: string | null | undefined): string {
  const d = (e164 ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return e164 ?? "";
}
