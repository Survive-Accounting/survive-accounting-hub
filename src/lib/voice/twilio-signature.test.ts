import { describe, expect, it } from "bun:test";

import { twilioSignatureFor, twilioSignatureValid } from "./twilio-signature";

// The worked example from Twilio's webhook-security docs: this token, URL and parameter set must
// produce exactly this signature. If the sort or concatenation ever drifts, this catches it.
const TOKEN = "12345";
const URL = "https://mycompany.com/myapp.php?foo=1&bar=2";
const PARAMS = {
  CallSid: "CA1234567890ABCDE",
  Caller: "+12349013030",
  Digits: "1234",
  From: "+12349013030",
  To: "+18005551212",
};
const EXPECTED = "0/KCTR6DLpKmkAf8muzZqo1nDgQ=";

describe("twilio signature", () => {
  it("reproduces Twilio's documented example", () => {
    expect(twilioSignatureFor(TOKEN, URL, PARAMS)).toBe(EXPECTED);
  });

  it("passes when any candidate URL matches, fails otherwise", () => {
    expect(twilioSignatureValid(TOKEN, EXPECTED, ["https://internal.host/myapp.php?foo=1&bar=2", URL], PARAMS)).toBe(true);
    expect(twilioSignatureValid(TOKEN, EXPECTED, ["https://internal.host/myapp.php?foo=1&bar=2"], PARAMS)).toBe(false);
    expect(twilioSignatureValid(TOKEN, null, [URL], PARAMS)).toBe(false);
    expect(twilioSignatureValid(TOKEN, EXPECTED, [URL], { ...PARAMS, Digits: "9999" })).toBe(false);
  });
});
