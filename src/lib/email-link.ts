// EVERY EMAIL LINK ON THE PUBLIC SITE IS BUILT HERE.
//
// ── THE BUG THIS EXISTS TO FIX ────────────────────────────────────────────────────────────────
// `mailto:` does not open an email app. It opens whatever the DEVICE has registered as the
// handler for the mailto: scheme, and on a phone with no mail account configured that can be
// almost anything — on Lee's phone it opened inDrive. The visitor taps "Email Lee", a rideshare
// app launches, and the contact never happens. There is no fallback and no error; it just fails
// silently in the one direction we can't measure.
//
// So public email links go to Gmail's compose URL instead. It is a plain https:// link, so it
// opens in the browser (or the Gmail app, which claims the domain on both iOS and Android), the
// address and subject are already filled in, and a visitor without Gmail still lands on a page
// that shows them the address rather than a broken scheme handler.
//
// ── WHY ONE HELPER AND NOT A CONSTANT ─────────────────────────────────────────────────────────
// The subject is the point. A message from a chapter page should arrive saying which chapter it
// came from; one from the footer should say it came from the footer. Building the URL by hand at
// each call site is how half of them end up with no subject at all — and how the next `mailto:`
// creeps back in. There is exactly one builder, and the call sites pass context.
//
// NOT COVERED HERE, deliberately: the outreach admin and the council campaign builder compose
// mail TO SOMEONE ELSE (a chapter president, a prospect). Those are a different job — the sender
// picks a recipient — and rewriting them to Gmail would force Lee's own workflow through a
// specific webmail client. This helper is for "reach Lee", the visitor-facing direction.

/** The one public address. Imported rather than retyped so a change lands everywhere. */
export const LEE_EMAIL = "lee@surviveaccounting.com";

/** Gmail's compose endpoint. `view=cm` is compose, `fs=1` is full-screen (not the corner popup,
 *  which is unusable on a phone). `tf=1` is the older alias for the same thing and is included
 *  because some Gmail app builds still key off it. */
const GMAIL_COMPOSE = "https://mail.google.com/mail/?view=cm&fs=1&tf=1";

/** Build a Gmail compose link. Every component is encoded — an unencoded `&` in a subject would
 *  otherwise truncate it and silently drop the rest. */
export function gmailComposeUrl({ to = LEE_EMAIL, subject, body }: {
  to?: string;
  subject?: string;
  body?: string;
} = {}): string {
  let url = `${GMAIL_COMPOSE}&to=${encodeURIComponent(to)}`;
  if (subject) url += `&su=${encodeURIComponent(subject)}`;
  if (body) url += `&body=${encodeURIComponent(body)}`;
  return url;
}

/** THE SUBJECT LINES, named. Kept together so the inbox stays sortable: every message that
 *  arrives from the site says where on the site it came from, and adding a surface means adding
 *  a line here rather than inventing a subject at a call site. */
export const EMAIL_SUBJECT = {
  /** The global footer — no page context to offer. */
  footer: "Question about Survive",
  /** Anywhere inside the student app. */
  learn: "Question about Survive",
  /** A campus page. `AC 210 question`, per the spec. */
  campus: (courseCode?: string | null) => `${courseCode?.trim() || "AC 210"} question`,
  /** A chapter page — the chapter's own name rides along so the reply has context. */
  chapter: (chapterName?: string | null) =>
    chapterName?.trim() ? `Chapter question — ${chapterName.trim()}` : "Chapter question",
  /** A council / share surface. */
  council: (councilName?: string | null) =>
    councilName?.trim() ? `Council question — ${councilName.trim()}` : "Council question",
  /** The campus-rep funnel. */
  rep: "Campus rep question",
} as const;

/** The props every email link needs, so no call site forgets `rel` on a `target="_blank"`.
 *
 *  `noopener` is not decoration here: without it the opened tab gets a live `window.opener`
 *  handle back into this page. */
export function emailLinkProps(subject: string, to: string = LEE_EMAIL): {
  href: string;
  target: "_blank";
  rel: "noopener noreferrer";
} {
  return { href: gmailComposeUrl({ to, subject }), target: "_blank", rel: "noopener noreferrer" };
}
