// GREEK LETTERS FOR SMS — turn "Sigma Chi" into "ΣX" without leaving GSM-7.
//
// WHY THE LOOKALIKES. An SMS is one 160-character segment only while every character is in the
// GSM-7 basic set. That set contains exactly ten Greek capitals (Δ Φ Γ Λ Ω Π Ψ Σ Θ Ξ). The other
// fourteen capitals are pixel-identical to Latin letters on every phone (Α=A, Β=B, Ε=E, Ζ=Z, Η=H,
// Ι=I, Κ=K, Μ=M, Ν=N, Ο=O, Ρ=P, Τ=T, Υ=Y, Χ=X), so we emit the Latin letter for those and the
// real Greek letter for the ten. The reader sees Greek; Twilio bills one segment. A single real
// "Α" (U+0391) would flip the whole message to UCS-2 and cap it at 70 characters.
//
// Client-safe: pure functions, no env, no imports.

/** Greek word → the GSM-7-safe capital. Latin lookalikes where the Greek glyph is not in GSM-7. */
export const GREEK_WORD_TO_GSM: Readonly<Record<string, string>> = {
  alpha: "A", beta: "B", gamma: "Γ", delta: "Δ", epsilon: "E", zeta: "Z", eta: "H", theta: "Θ",
  iota: "I", kappa: "K", lambda: "Λ", mu: "M", nu: "N", xi: "Ξ", omicron: "O", pi: "Π", rho: "P",
  sigma: "Σ", tau: "T", upsilon: "Y", phi: "Φ", chi: "X", psi: "Ψ", omega: "Ω",
};

/** The letters of an organization name, GSM-7-safe. Non-Greek words ("Order", "Sorority,
 *  Incorporated") are skipped, so "Kappa Alpha Order" → "KA" and "Alpha Epsilon Phi Sorority
 *  Incorporated" → "AEΦ". Null when the name carries no Greek word at all (FarmHouse, Acacia) —
 *  callers then fall back to the roster's Latin shorthand or the name itself. */
export function greekLettersForSms(orgName: string | null | undefined): string | null {
  if (!orgName) return null;
  const out: string[] = [];
  for (const raw of orgName.toLowerCase().split(/[^a-z]+/)) {
    const l = GREEK_WORD_TO_GSM[raw];
    if (l) out.push(l);
  }
  return out.length ? out.join("") : null;
}

/** Best short label for a chapter in an SMS: Greek letters from the org name, else the roster's
 *  Latin shorthand ("ATO"), else the name itself hard-capped so one segment stays guaranteed. */
export function chapterSmsLabel(orgName: string | null | undefined, latinLetters?: string | null): string {
  const g = greekLettersForSms(orgName);
  if (g) return g;
  const latin = (latinLetters ?? "").trim();
  if (latin && isGsm7(latin)) return latin;
  const n = (orgName ?? "").trim() || "chapter";
  return n.length > 26 ? n.slice(0, 26).trimEnd() : n;
}

// GSM 03.38 basic set + the extension table (the extension characters cost two septets each).
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "\f^{}\\[~]|€";
const BASIC = new Set(GSM7_BASIC);
const EXT = new Set(GSM7_EXT);

/** True when every character is representable in GSM-7 (so the message bills as 160/153). */
export function isGsm7(text: string): boolean {
  for (const ch of text) if (!BASIC.has(ch) && !EXT.has(ch)) return false;
  return true;
}

/** The first character that would force UCS-2, for a useful error message. */
export function firstNonGsm7(text: string): string | null {
  for (const ch of text) if (!BASIC.has(ch) && !EXT.has(ch)) return ch;
  return null;
}

/** Force a body into GSM-7: flatten the punctuation autocorrect and transcripts carry (curly quotes,
 *  em/en dashes, ellipsis, bullets, non-breaking spaces), then DROP anything still outside the set.
 *  The ten Greek capitals survive because they are in the set. Used as the last step on founder
 *  SMS bodies, where a stranger's name or a transcript could otherwise double the bill. */
export function toGsm7(input: string): string {
  const flat = input
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[–—‐‑]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[•·]/g, "-")
    .normalize("NFKD");
  let out = "";
  for (const ch of flat) {
    if (BASIC.has(ch) || EXT.has(ch)) out += ch;
    // combining marks from NFKD (é → e + ◌́) are dropped, leaving the base letter
  }
  return out;
}

/** How many segments Twilio will bill for this body. GSM-7: 160 in one, 153 each after; UCS-2:
 *  70 in one, 67 each after. Extension characters count double in GSM-7. */
export function smsSegments(text: string): { encoding: "GSM-7" | "UCS-2"; units: number; segments: number } {
  if (isGsm7(text)) {
    let units = 0;
    for (const ch of text) units += EXT.has(ch) ? 2 : 1;
    return { encoding: "GSM-7", units, segments: units <= 160 ? 1 : Math.ceil(units / 153) };
  }
  // UCS-2 counts UTF-16 code units; astral characters (emoji) cost two.
  const units = text.length;
  return { encoding: "UCS-2", units, segments: units <= 70 ? 1 : Math.ceil(units / 67) };
}
