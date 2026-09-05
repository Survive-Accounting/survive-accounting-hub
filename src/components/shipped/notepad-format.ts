// THE SHIPPED NOTEPAD — pure helpers. The editor itself is a contentEditable div driven by
// document.execCommand (bold/italic/underline/fontSize) — deprecated but still universal in
// Chrome, and this is explicitly Lee's own internal tool, not a cross-browser product. What
// lives here is the one thing that has to be careful: cleaning the saved HTML down to a small
// allowlist before it can ever reach a PUBLIC page (an entry's notes, when marked public).
//
// V1 formatting is intentionally just what the brief asks for: bold, italic, underline, and a
// font-size step up/down applied as inline `font-size` on a <span>. Nothing else is meant to
// exist in this field — the only writer is Lee's own authenticated Notepad, never a public
// form — so a REGEX allowlist over that small, known shape is enough, and it runs the same on
// the client (before save) and the server (rendering a public entry), with no DOM required.

const ALLOWED_TAG = /^(b|strong|i|em|u|span|br|div|p)$/i;
/** One HTML tag, captured for its name and (if a span) a `style="font-size:...px"` to keep. */
const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
const FONT_SIZE_RE = /font-size\s*:\s*(\d+(?:\.\d+)?)px/i;

/** Strip everything but the allowlisted tags, and on a `<span>` keep only a numeric inline
 *  `font-size` — no other attribute, no script, no event handler, no href. Every entity is left
 *  as-is (text content is never touched, only tags). Safe to render afterward. */
export function sanitizeNotesHtml(html: string): string {
  return html.replace(TAG_RE, (whole, rawName: string) => {
    const name = rawName.toLowerCase();
    if (!ALLOWED_TAG.test(name)) return "";
    const closing = whole.startsWith("</");
    if (closing) return `</${name}>`;
    if (name === "br") return "<br>";
    if (name === "span") {
      const m = whole.match(FONT_SIZE_RE);
      return m ? `<span style="font-size:${m[1]}px">` : "<span>";
    }
    return `<${name}>`;
  });
}

/** The font-size ladder Shift+> / Shift+< step through — legacy execCommand sizes (1–7), the
 *  simplest thing that is genuinely cross-browser for a contentEditable region. */
export const NOTEPAD_FONT_SIZES = [1, 2, 3, 4, 5, 6, 7] as const;
export const NOTEPAD_DEFAULT_SIZE = 3;

export function stepFontSize(current: number, dir: 1 | -1): number {
  const next = current + dir;
  return Math.min(7, Math.max(1, next));
}
