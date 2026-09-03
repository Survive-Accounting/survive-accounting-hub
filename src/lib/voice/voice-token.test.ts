import { describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";

import { decodeJwtPayload, voiceAccessToken } from "./voice-token";

const INPUT = {
  accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  apiKeySid: "SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  apiKeySecret: "secret-that-stays-on-the-server",
  twimlAppSid: "APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  identity: "lee",
  now: 1_756_800_000_000,
};

describe("voiceAccessToken", () => {
  it("carries the Twilio content type, issuer, subject and an outgoing-only voice grant", () => {
    const t = voiceAccessToken(INPUT);
    const [h, , s] = t.split(".");
    const header = JSON.parse(Buffer.from(h, "base64").toString("utf8"));
    expect(header).toEqual({ cty: "twilio-fpa;v=1", typ: "JWT", alg: "HS256" });
    const p = decodeJwtPayload(t) as { iss: string; sub: string; exp: number; nbf: number; grants: { identity: string; voice: Record<string, unknown> } };
    expect(p.iss).toBe(INPUT.apiKeySid);
    expect(p.sub).toBe(INPUT.accountSid);
    expect(p.exp - p.nbf).toBe(3600);
    expect(p.grants.identity).toBe("lee");
    expect(p.grants.voice).toEqual({ outgoing: { application_sid: INPUT.twimlAppSid } });
    expect(s.length).toBeGreaterThan(20);
  });

  it("is signed with the API key secret (HS256 over header.payload)", () => {
    const t = voiceAccessToken(INPUT);
    const [h, p, s] = t.split(".");
    const want = createHmac("sha256", INPUT.apiKeySecret).update(`${h}.${p}`).digest("base64")
      .replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    expect(s).toBe(want);
  });
});
