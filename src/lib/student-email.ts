// THE SOFT IDENTITY BRIDGE — one localStorage key, "sa-student-email".
//
// Ask Lee started this key (it remembered the asker's address between questions); it is now the
// shared "do we already have an email for this visitor?" state. Every student-view capture that
// collects an email (Ask Lee, the notify modal, the future-exam waitlist, the syllabus upload)
// writes it here on success, and Ask Lee reads it to decide whether to ask again.
//
// THIS IS A MAILBOX, NOT AN AUTH SYSTEM. No password, no verification, no account — the identity
// ladder stays parked. Nothing may GATE on this value beyond "skip re-asking for the address",
// and it must never be treated as proof of anything.
const KEY = "sa-student-email";

const looksLikeEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

export function readStudentEmail(): string | null {
  try {
    if (typeof window === "undefined") return null;
    const v = (localStorage.getItem(KEY) ?? "").trim();
    return looksLikeEmail(v) ? v : null;
  } catch { return null; } // private mode
}

export function rememberStudentEmail(email: string): void {
  try {
    if (typeof window === "undefined") return;
    const v = email.trim();
    if (looksLikeEmail(v)) localStorage.setItem(KEY, v);
  } catch { /* private mode — nothing to remember into */ }
}
