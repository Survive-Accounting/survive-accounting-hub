import { describe, expect, it } from "bun:test";

import { isGsm7, smsSegments } from "@/lib/greek-letters";
import { renderTemplate, type TemplateCtx } from "./templates";

// THE CONTRACT FOR EVERY ALERT LEE GETS: one GSM-7 segment, the ref first, the /x/ link last, and
// a filterable email subject. These use the LONGEST plausible values, not the sample ones — a
// message that fits "Ole Miss" and not "University of Southern Mississippi" is not one segment.

const CLAIM: TemplateCtx = {
  kind: "greek_claim", ref: 241, actionLink: "https://surviveaccounting.com/x/241",
  adminLink: "https://surviveaccounting.com/outreach/greek-claims?claim=abc",
  chapterLink: "https://surviveaccounting.com/go/university-of-mississippi/sigma-chi",
  name: "Jordan Alexander Ellis-Whitworth", role: "Academic / Scholarship Chair",
  chapter: "Sigma Chi", letters: "ΣX", school: "University of Southern Mississippi",
  intent: "committed", members: 84, email: "jordan@go.olemiss.edu", phone: "+16625550142",
};

describe("founder_priority / chapter claim", () => {
  it("is one GSM-7 segment with the ref first and the action link last", () => {
    const r = renderTemplate("founder_priority", CLAIM);
    expect(r.sms).toBeDefined();
    expect(isGsm7(r.sms!)).toBe(true);
    expect(smsSegments(r.sms!).segments).toBe(1);
    expect(r.sms!.startsWith("#241 CLAIM ΣX ")).toBe(true);
    expect(r.sms!.endsWith("surviveaccounting.com/x/241")).toBe(true);
    expect(r.sms).toContain("READY TO SPONSOR (84 banked)");
  });

  it("tags the email subject for a mail filter and carries every link in the body", () => {
    const r = renderTemplate("founder_priority", CLAIM);
    expect(r.subject.startsWith("[SA CLAIM] ΣX University of Southern Mississippi - ")).toBe(true);
    expect(r.subject).toContain("READY TO SPONSOR");
    expect(r.text).toContain("Open: https://surviveaccounting.com/x/241");
    expect(r.text).toContain("Queue: https://surviveaccounting.com/outreach/greek-claims?claim=abc");
    expect(r.text).toContain("Chapter page: https://surviveaccounting.com/go/");
    expect(r.html).toContain('href="tel:+16625550142"');
    expect(r.html).toContain('href="sms:+16625550142"');
  });

  it("reports the held count and survives a missing ref", () => {
    const r = renderTemplate("founder_priority", { ...CLAIM, ref: null, actionLink: null, heldCount: 2, intent: "curious", members: null });
    expect(r.sms!.startsWith("CLAIM ΣX ")).toBe(true);
    expect(r.sms).toContain("(+2 held)");
    expect(r.sms).toContain("WANTS DETAILS");
    expect(r.sms!.endsWith("surviveaccounting.com/outreach/greek-claims?claim=abc")).toBe(true);
    expect(smsSegments(r.sms!).segments).toBe(1);
  });

  it("marks a preview send without pretending it is a test", () => {
    const r = renderTemplate("founder_priority", { ...CLAIM, preview: true });
    expect(r.subject.startsWith("[PREVIEW] [SA CLAIM]")).toBe(true);
    expect(r.sms!.startsWith("[PREVIEW] #241 CLAIM")).toBe(true);
    expect(r.text).not.toContain("[TEST");
  });
});

describe("founder_priority / campus rep", () => {
  const REP: TemplateCtx = {
    kind: "rep", ref: 242, actionLink: "https://surviveaccounting.com/x/242", repStage: "applied",
    name: "Jordan Alexander Ellis-Whitworth", school: "University of Southern Mississippi",
    detail: "Class of 2028, in Sigma Chi, can reach 6 chapters, Scholarship Chair", email: "j@x.edu", phone: "+16625550142",
    applicationLink: "https://surviveaccounting.com/admin/reps/roster",
    note: "I know every house on the row and I'm in ACCY 201 right now.",
  };
  it("is one segment, names the stage, and links the action page", () => {
    const r = renderTemplate("founder_priority", REP);
    expect(isGsm7(r.sms!)).toBe(true);
    expect(smsSegments(r.sms!).segments).toBe(1);
    expect(r.sms!.startsWith("#242 REP APPLIED ")).toBe(true);
    expect(r.sms!.endsWith("surviveaccounting.com/x/242")).toBe(true);
    expect(r.subject.startsWith("[SA REP] University of Southern Mississippi - ")).toBe(true);
    expect(r.subject).toContain("applied, needs review");
    expect(r.text).toContain("Application: https://surviveaccounting.com/admin/reps/roster");
    expect(r.text).toContain(REP.note!);
  });
  it("distinguishes the four-field signup from the full application", () => {
    const r = renderTemplate("founder_priority", { ...REP, repStage: "signup", detail: null, note: null });
    expect(r.sms!.startsWith("#242 REP SIGNUP ")).toBe(true);
    expect(r.subject).toContain("signed up");
  });
});

describe("founder_call + founder_voicemail", () => {
  const CALL: TemplateCtx = { ref: 241, actionLink: "https://surviveaccounting.com/x/241", callerLabel: "Jordan Ellis, ΣX claim", school: "Ole Miss", phone: "+16625550142" };
  it("says who is calling now, in one segment", () => {
    const r = renderTemplate("founder_call", CALL);
    expect(isGsm7(r.sms!)).toBe(true);
    expect(smsSegments(r.sms!).segments).toBe(1);
    expect(r.sms!.startsWith("#241 CALLING NOW Jordan Ellis, ΣX claim Ole Miss")).toBe(true);
    expect(r.sms).toContain("(662) 555-0142");
    expect(r.subject).toBe("[SA CALL] Jordan Ellis, ΣX claim - Ole Miss is calling now");
  });
  it("falls back to the number when the caller is unknown", () => {
    const r = renderTemplate("founder_call", { ref: 243, actionLink: "https://surviveaccounting.com/x/243", callerLabel: null, phone: "+16625550142" });
    expect(r.sms!.startsWith("#243 CALLING NOW unknown number")).toBe(true);
    expect(r.sms!.endsWith("surviveaccounting.com/x/243")).toBe(true);
  });
  it("quotes the transcript, flattened to GSM-7, and stays one segment", () => {
    const r = renderTemplate("founder_voicemail", { ...CALL, durationSeconds: 42, transcript: "Hey Lee, it’s Jordan — we’re ready to sponsor seats for the fall, call me back when you can, I’ve got the treasurer with me and we want to get this done this week if possible." });
    expect(isGsm7(r.sms!)).toBe(true);
    expect(smsSegments(r.sms!).segments).toBe(1);
    expect(r.sms!.startsWith("#241 VOICEMAIL 0:42 Jordan Ellis, ΣX claim")).toBe(true);
    expect(r.sms).toContain("\"Hey Lee, it's Jordan - we're ready");
    expect(r.subject).toBe("[SA VOICEMAIL] Jordan Ellis, ΣX claim - Ole Miss - 0:42");
    expect(r.text).toContain("Open: https://surviveaccounting.com/x/241");
  });
  it("still sends when there is no transcript yet", () => {
    const r = renderTemplate("founder_voicemail", { ...CALL, durationSeconds: 7, transcript: null });
    expect(r.sms).toContain("(no transcript yet)");
    expect(r.text).toContain("Transcript not ready yet");
  });
});
