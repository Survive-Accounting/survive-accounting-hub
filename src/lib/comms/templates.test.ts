// Guards the comms copy contract: every template renders for sample + empty context, student SMS
// one-liners stay ONE GSM-7 segment, marketing emails carry an unsubscribe link, transactional
// ones don't claim to be marketing, and [TEST] prefixes test subjects.
import { describe, expect, test } from "bun:test";
import { ALL_TEMPLATES, categoryOf, renderTemplate, SAMPLE_CTX } from "./templates";

const GSM = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\[~\]|€]*$/;

describe("comms templates", () => {
  test("every template renders with sample and with empty context", () => {
    for (const t of ALL_TEMPLATES) {
      const r = renderTemplate(t.key, { ...SAMPLE_CTX, isTest: false });
      expect(r.subject.length).toBeGreaterThan(3);
      expect(r.html).toContain("<p");
      expect(r.text.length).toBeGreaterThan(10);
      const e = renderTemplate(t.key, {});
      expect(e.subject.length).toBeGreaterThan(3);
      if (t.hasSms) expect(r.sms).toBeTruthy();
    }
  });
  test("student SMS variants are one GSM-7 segment (≤160, no UCS-2)", () => {
    for (const t of ALL_TEMPLATES.filter((x) => x.hasSms && x.group !== "Founder alerts")) {
      const r = renderTemplate(t.key, { ...SAMPLE_CTX, isTest: false });
      expect(GSM.test(r.sms!)).toBe(true);
      expect(r.sms!.length).toBeLessThanOrEqual(160);
    }
  });
  test("founder alert SMS is one GSM-7 segment too", () => {
    const r = renderTemplate("founder_priority", { ...SAMPLE_CTX, isTest: false });
    expect(GSM.test(r.sms!)).toBe(true);
    expect(r.sms!.length).toBeLessThanOrEqual(160);
  });
  test("marketing emails carry Unsubscribe; transactional carry preferences only; founder none", () => {
    for (const t of ALL_TEMPLATES) {
      const r = renderTemplate(t.key, { ...SAMPLE_CTX, isTest: false, unsubscribeLink: "https://surviveaccounting.com/u/x?unsubscribe=1", preferencesLink: "https://surviveaccounting.com/u/x" });
      const cat = categoryOf(t.key);
      if (cat === "marketing") expect(r.html).toContain("Unsubscribe");
      if (cat === "transactional") { expect(r.html).not.toContain(">Unsubscribe<"); expect(r.html).toContain("Email preferences"); }
      if (cat === "founder") expect(r.html).not.toContain("Email preferences");
    }
  });
  test("[TEST] prefixes test subjects and SMS; never in real sends", () => {
    const t = renderTemplate("confirm_notify_exam", { ...SAMPLE_CTX, isTest: true });
    expect(t.subject.startsWith("[TEST] ")).toBe(true);
    expect(t.sms!.startsWith("[TEST] ")).toBe(true);
    const r = renderTemplate("confirm_notify_exam", { ...SAMPLE_CTX, isTest: false });
    expect(r.subject).not.toContain("[TEST]");
  });
  test("founder alert deep links are clickable in HTML", () => {
    const r = renderTemplate("founder_priority", { ...SAMPLE_CTX, isTest: false });
    expect(r.html).toContain('href="https://surviveaccounting.com/outreach/demand?lead=sample"');
    expect(r.html).toContain('href="sms:+16625550142"');
  });
});
