// THE EMAIL LINK BOUNDARY (2026-08-31).
//
// The bug being pinned is invisible on a desktop: `mailto:` works fine there, so a regression
// that reintroduces it would pass every manual check and fail only on the phone of the person
// trying to reach Lee. These tests are the thing that notices.
import { describe, expect, test } from "bun:test";

import { EMAIL_SUBJECT, LEE_EMAIL, emailLinkProps, gmailComposeUrl } from "./email-link";

describe("it never emits a mailto:", () => {
  test("the built URL is https and points at Gmail", () => {
    const url = gmailComposeUrl({ subject: "hi" });
    expect(url).toStartWith("https://mail.google.com/mail/");
    expect(url).not.toInclude("mailto:");
  });

  test("emailLinkProps opens a new tab and severs window.opener", () => {
    const p = emailLinkProps(EMAIL_SUBJECT.footer);
    expect(p.target).toBe("_blank");
    expect(p.rel).toBe("noopener noreferrer");
    expect(p.href).not.toInclude("mailto:");
  });
});

describe("the recipient and subject actually arrive", () => {
  test("Lee is the default recipient", () => {
    expect(gmailComposeUrl()).toInclude(`to=${encodeURIComponent(LEE_EMAIL)}`);
  });

  test("a subject containing & survives instead of truncating the URL", () => {
    // The failure this pins: an unencoded & ends the su= parameter, so Gmail opens with the
    // subject cut in half and the remainder read as a junk query key.
    const url = gmailComposeUrl({ subject: "Fraternities & Sororities" });
    expect(url).toInclude("su=Fraternities%20%26%20Sororities");
    expect(url.split("&").length).toBe(5); // view, fs, tf, to, su — nothing extra split off
  });

  test("no subject means no empty su= parameter", () => {
    expect(gmailComposeUrl({})).not.toInclude("su=");
  });
});

describe("the subjects say where the visitor was", () => {
  test("a campus page names its course", () => {
    expect(EMAIL_SUBJECT.campus("ACCT 200")).toBe("ACCT 200 question");
  });

  test("a campus page with no course still says something useful", () => {
    expect(EMAIL_SUBJECT.campus(null)).toBe("AC 210 question");
  });

  test("a chapter page names the chapter", () => {
    expect(EMAIL_SUBJECT.chapter("Alpha Chi Omega")).toBe("Chapter question — Alpha Chi Omega");
  });

  test("a chapter with no name does not produce a dangling dash", () => {
    expect(EMAIL_SUBJECT.chapter("  ")).toBe("Chapter question");
  });
});
