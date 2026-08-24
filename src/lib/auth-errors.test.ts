import { describe, expect, it } from "bun:test";

import { authEmailError, authErrorDetail } from "./auth-errors";

// The two messages testers actually hit. Both were being rendered as provider prose; these lock in
// that they map to something a person can act on, and that neither leaks GoTrue's wording.
describe("authEmailError", () => {
  it("names the rate limit as a wait, not a bad address", () => {
    const m = authEmailError({ status: 429, code: "over_email_send_rate_limit", message: "email rate limit exceeded" });
    expect(m).toContain("last hour");
    expect(m.toLowerCase()).not.toContain("rate limit exceeded");
  });

  it("treats a rate limit reported only in prose the same way", () => {
    expect(authEmailError({ message: "Email rate limit exceeded" })).toContain("last hour");
  });

  it("takes the blame for an SMTP failure instead of blaming the address", () => {
    const m = authEmailError({ status: 500, message: "Error sending confirmation email" });
    expect(m).toContain("on my end");
    expect(m).not.toContain("Error sending confirmation email");
  });

  it("maps the error_code shape GoTrue sends alongside the message", () => {
    const m = authEmailError({ code: "error_sending_confirmation_email", message: "whatever" } as never);
    expect(m).toContain("on my end");
  });

  it("asks for a correction on a validation failure", () => {
    expect(authEmailError({ status: 400, message: "Unable to validate email address" })).toContain("doesn't look right");
  });

  it("falls back to something harmless rather than the raw message", () => {
    const m = authEmailError({ status: 400, message: "pq: duplicate key value violates unique constraint" });
    expect(m).not.toContain("pq:");
    expect(m).toContain("try again");
  });

  it("never returns an empty string", () => {
    expect(authEmailError(null).length).toBeGreaterThan(0);
    expect(authEmailError(undefined).length).toBeGreaterThan(0);
    expect(authEmailError({}).length).toBeGreaterThan(0);
  });
});

describe("authErrorDetail", () => {
  it("keeps the raw facts for the log", () => {
    const d = authErrorDetail({ status: 429, code: "over_email_send_rate_limit", message: "email rate limit exceeded" });
    expect(d).toContain("429");
    expect(d).toContain("over_email_send_rate_limit");
    expect(d).toContain("email rate limit exceeded");
  });

  it("is empty for no error", () => {
    expect(authErrorDetail(null)).toBe("");
  });
});
